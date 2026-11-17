import { describe, expect, it } from 'vitest';
import { createMachineRun, MACHINE_STAGES, machineFrame } from '../src/physics/quantumComputer';

describe('neutral atom machine demo', () => {
  it('loads deterministically, conserves atoms and fills the register through vacant sites', () => {
    const run = createMachineRun({ circuit: 'ghz', loadProbability: 0.35, seed: 171 });
    expect(createMachineRun(run.config)).toEqual(run);
    expect(run.loadedCount).toBeLessThan(run.sites.length);
    expect(run.moves.length).toBeGreaterThan(0);
    expect(run.activeQubits).toBe(3);

    const occupied = new Set(run.sites.filter(site => site.loaded).map(site => site.id));
    for (const move of run.moves) {
      expect(occupied.delete(move.from.id)).toBe(true);
      for (const [index, site] of move.path.entries()) {
        expect(occupied.has(site.id)).toBe(false);
        const previous = move.path[index - 1];
        if (previous) expect(Math.abs(previous.row - site.row) + Math.abs(previous.column - site.column)).toBe(1);
      }
      occupied.add(move.to.id);
    }
    expect(occupied.size).toBe(run.loadedCount);
    const rearrangement = MACHINE_STAGES.find(stage => stage.id === 'rearrangement')!;
    const moving = machineFrame(run, rearrangement.startMs + 0.17 * rearrangement.durationMs);
    expect(moving.atoms).toHaveLength(run.loadedCount);
    const movingAtoms = moving.atoms.filter(atom => atom.moving);
    expect(movingAtoms).toHaveLength(1);
    expect(!Number.isInteger(movingAtoms[0].row) || !Number.isInteger(movingAtoms[0].column)).toBe(true);
    const after = machineFrame(run, rearrangement.endMs);
    expect(after.stage.id).toBe('preparation');
    expect(after.activeQubits).toEqual([0, 1, 2]);
  });

  it('produces ideal Bell, GHZ and product-state measurement distributions', () => {
    const bell = createMachineRun({ circuit: 'bell', readoutError: 0, loadProbability: 1 });
    const ghz = createMachineRun({ circuit: 'ghz', readoutError: 0, loadProbability: 1 });
    const product = createMachineRun({ circuit: 'superposition', readoutError: 0, loadProbability: 1 });
    for (const [run, support] of [[bell, ['00', '11']], [ghz, ['000', '111']], [product, ['00', '01', '10', '11']]] as const) {
      for (const outcome of run.outcomes) {
        expect(outcome.idealProbability).toBeCloseTo(support.some(bits => bits === outcome.bitstring) ? 1 / support.length : 0, 12);
        expect(outcome.readoutProbability).toBeCloseTo(outcome.idealProbability, 12);
      }
      expect(run.samples.every(sample => support.some(bits => bits === sample))).toBe(true);
    }
  });

  it('convolves independent readout errors and exposes observed counts only as readout proceeds', () => {
    const run = createMachineRun({ readoutError: 0.1, loadProbability: 1, shots: 4096 });
    const expected = [0.41, 0.09, 0.09, 0.41];
    run.outcomes.forEach((outcome, index) => {
      expect(outcome.readoutProbability).toBeCloseTo(expected[index], 12);
      expect(Math.abs(outcome.count / run.completedShots - expected[index])).toBeLessThan(0.025);
    });

    const readout = MACHINE_STAGES.find(stage => stage.id === 'readout')!;
    const start = machineFrame(run, readout.startMs);
    expect(start.visibleShots).toBe(0);
    expect(start.visibleAttempts).toBe(0);
    expect(start.latestBitstring).toBeNull();
    expect(start.representativeBitstring).toBeNull();
    const halfway = machineFrame(run, readout.startMs + readout.durationMs / 2);
    expect(halfway.visibleShots).toBe(2048);
    expect(halfway.visibleAttempts).toBe(2048);
    expect(halfway.outcomeCounts.reduce((sum, count) => sum + count, 0)).toBe(2048);
    const final = machineFrame(run, run.durationMs + 20);
    expect(final.complete).toBe(true);
    expect(final.outcomeCounts).toEqual(run.outcomes.map(outcome => outcome.count));
    expect(final.latestBitstring).toBe(run.samples.at(-1));
    expect(final.representativeBitstring).toBe(run.samples[0]);
    for (const atom of final.atoms) {
      if (atom.qubit !== undefined) expect(atom.bright).toBe(final.representativeBitstring?.[atom.qubit] === '0');
    }
  });

  it('rotates each qubit to X before detection, revealing phase coherence beyond Z populations', () => {
    const analysis = MACHINE_STAGES.find(stage => stage.id === 'analysis')!;
    const cases = [
      { circuit: 'bell', expected: ['00', '11'] },
      { circuit: 'ghz', expected: ['000', '011', '101', '110'] },
      { circuit: 'superposition', expected: ['00'] },
    ] as const;
    for (const { circuit, expected } of cases) {
      const run = createMachineRun({ circuit, basis: 'X', loadProbability: 1, readoutError: 0 });
      const qubits = Array.from({ length: run.circuit.qubits }, (_, index) => index);
      expect(run.analysisGates).toEqual(qubits.map(qubit => ({ name: 'H', qubits: [qubit] })));
      expect(machineFrame(run, analysis.startMs).activeQubits).toEqual(qubits);
      for (const outcome of run.outcomes) {
        const supported = expected.some(bitstring => bitstring === outcome.bitstring);
        expect(outcome.idealProbability).toBeCloseTo(supported ? 1 / expected.length : 0, 12);
        if (!supported) expect(outcome.count).toBe(0);
      }
    }
    expect(machineFrame(createMachineRun({ basis: 'Z' }), analysis.startMs).activeQubits).toEqual([]);
  });

  it('does not apply gates or generate shots when loading is insufficient', () => {
    const run = createMachineRun({ loadProbability: 0 });
    expect(run.completedShots).toBe(0);
    expect(run.rejectedShots).toBe(run.attemptedShots);
    expect(run.lostShots).toBe(0);
    expect(run.samples).toEqual([]);
    const gates = MACHINE_STAGES.find(stage => stage.id === 'gates')!;
    expect(machineFrame(run, gates.startMs).gateIndex).toBeNull();
    expect(machineFrame(run, run.durationMs).visibleShots).toBe(0);
  });

  it('reloads and reassembles each cycle, even when the first configuration cannot execute', () => {
    const p = 0.02;
    const run = createMachineRun({ loadProbability: p, atomLossProbability: 0.2, shots: 4096 });
    const n = run.sites.length;
    const q = 1 - p;
    const expectedAssembly = 1 - q ** n - n * p * q ** (n - 1);
    expect(run.expectedAssemblyProbability).toBeCloseTo(expectedAssembly, 12);
    expect(Math.abs((run.completedShots + run.lostShots) / run.attemptedShots - expectedAssembly)).toBeLessThan(0.025);
    expect(run.attempts[0].status).toBe('assembly-failed');
    expect(run.attempts[0].loadedCount).toBe(run.loadedCount);
    expect(run.attempts[0].activeQubits).toBe(run.activeQubits);
    for (const attempt of run.attempts) {
      expect(attempt.activeQubits).toBe(Math.min(attempt.loadedCount, run.circuit.qubits));
      expect(attempt.bitstring !== null).toBe(attempt.status === 'measured');
    }
    const gates = MACHINE_STAGES.find(stage => stage.id === 'gates')!;
    expect(machineFrame(run, gates.startMs).gateIndex).toBeNull();
    const final = machineFrame(run, run.durationMs);
    expect(final.representativeReady).toBe(false);
    expect(final.representativeBitstring).toBeNull();
    expect(final.visibleShots).toBe(run.completedShots);
    expect(final.visibleShots).toBeGreaterThan(0);
    expect(final.visibleRejectedShots).toBe(run.rejectedShots);
    expect(final.visibleLostShots).toBe(run.lostShots);
    expect(final.visibleAttempts).toBe(final.visibleShots + final.visibleRejectedShots + final.visibleLostShots);
    expect(final.outcomeCounts.reduce((sum, count) => sum + count, 0)).toBe(final.visibleShots);
  });

  it('erases independently lost atoms without converting loss to a dark result', () => {
    const run = createMachineRun({ loadProbability: 0.03, atomLossProbability: 0.2, shots: 512 });
    const first = run.attempts[0];
    expect(first.status).toBe('atom-lost');
    expect(first.lostQubits).toEqual([1]);
    const gates = MACHINE_STAGES.find(stage => stage.id === 'gates')!;
    const gated = machineFrame(run, gates.startMs);
    expect(gated.gateIndex).toBe(0);
    expect(gated.atoms.filter(atom => atom.qubit !== undefined)).toHaveLength(2);
    const final = machineFrame(run, run.durationMs);
    expect(final.representativeLostQubits).toEqual([1]);
    expect(final.atoms.filter(atom => atom.qubit !== undefined).map(atom => atom.qubit)).toEqual([0]);
    expect(final.atoms.every(atom => atom.bright === undefined)).toBe(true);
    expect(final.representativeBitstring).toBeNull();
    expect(final.latestBitstring).not.toBeNull();
    expect(final.visibleLostShots).toBeGreaterThan(0);
    expect(createMachineRun({ loadProbability: 1, atomLossProbability: 1, shots: 10 }).lostShots).toBe(10);
  });
});
