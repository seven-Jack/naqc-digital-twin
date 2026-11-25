import { describe, expect, it } from 'vitest';
import { MUNIZ_DEMO_PROFILE } from '../src/data/machineProfile';
import { createMachineRun, machineExport, machineFrame } from '../src/physics/quantumComputer';
import { projectMachineScene } from '../src/scene/machineSceneFrame';

describe('synthetic Bell occupancy and one replenishment', () => {
  const config = { circuit: 'bell' as const, basis: 'Z' as const, shots: 64, seed: 171, readoutError: 0, atomLossProbability: 0 };

  it('records observations before decisions and replenishes at most once using an existing atom', () => {
    const run = createMachineRun({ ...config, loadProbability: 0.62 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    const record = run.records[0];
    expect(run.durationMs).toBe(15200);
    expect(record.observations.map(observation => observation.sites.map(site => Number(site.occupied)).join('')))
      .toEqual(['10', '11']);
    expect(record.decisions.map(decision => decision.result)).toEqual(['replenish', 'continue']);
    for (const decision of record.decisions) {
      const observation = record.observations.find(observation => observation.id === decision.observationId);
      expect(observation).toBeDefined();
      expect(decision.availableMs).toBeGreaterThan(observation!.availableMs);
    }
    for (const event of record.events) {
      for (const dependencyId of event.dependsOn) {
        const dependency = record.events.find(candidate => candidate.id === dependencyId);
        expect(dependency).toBeDefined();
        expect(dependency!.endMs).toBeLessThanOrEqual(event.startMs);
      }
    }
    expect(record.events.filter(event => event.stageId === 'replenishment')).toHaveLength(1);
    expect(record.move).not.toBeNull();
    expect(record.initialAtoms.map(atom => atom.id).sort()).toEqual(record.replenishedAtoms.map(atom => atom.id).sort());
    expect(record.initialAtoms.filter(atom => atom.qubit !== undefined)).toHaveLength(1);
    expect(record.replenishedAtoms.filter(atom => atom.qubit !== undefined)).toHaveLength(2);
    expect(record.events.find(event => event.stageId === 'gates')?.status).toBe('executed');
    expect(record.events.find(event => event.stageId === 'readout')?.status).toBe('executed');
    expect(run.outcomes.map(outcome => outcome.count)).toEqual([34, 0, 0, 30]);
    expect(run.attempts[0].bitstring).toBe('11');
  });

  it('has no source for the first sparse attempt and skips its gate and readout while counting later attempts', () => {
    const run = createMachineRun({ ...config, loadProbability: 0.02 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    const record = run.records[0];
    expect(record.move).toBeNull();
    expect(record.observations.map(observation => observation.sites.map(site => Number(site.occupied)).join('')))
      .toEqual(['10', '10']);
    expect(record.decisions.map(decision => decision.result)).toEqual(['replenish', 'skip']);
    expect(record.events.filter(event => event.stageId === 'replenishment')).toHaveLength(1);
    expect(record.events.find(event => event.stageId === 'gates')?.status).toBe('skipped');
    expect(record.events.find(event => event.stageId === 'readout')?.status).toBe('skipped');
    expect(run.attempts[0].status).toBe('assembly-failed');
    expect([run.rejectedShots, run.lostShots, run.completedShots]).toEqual([51, 0, 13]);
    expect(run.outcomes.map(outcome => outcome.count)).toEqual([10, 0, 0, 3]);
    const final = machineFrame(run, run.durationMs);
    expect(final.stageSkipped).toBe(true);
    expect(final.representativeBitstring).toBeNull();
    expect(final.visibleShots).toBe(13);
    expect(final.visibleRejectedShots).toBe(51);
    expect(final.outcomeCounts.reduce((sum, count) => sum + count, 0)).toBe(final.visibleShots);
    const projection = projectMachineScene(final, run.profile);
    expect(projection.activePath).toBeNull();
    expect(projection.fluorescence).toBeNull();
  });

  it('skips replenishment for a full register and rejects an empty source after a single attempt', () => {
    const full = createMachineRun({ ...config, loadProbability: 1 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    expect(full.records.every(record => record.move === null)).toBe(true);
    expect(full.records.every(record => record.decisions[0].result === 'continue')).toBe(true);
    expect(full.records.every(record => record.events.find(event => event.stageId === 'replenishment')?.status === 'skipped')).toBe(true);
    expect(full.completedShots).toBe(64);

    const empty = createMachineRun({ ...config, loadProbability: 0 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    expect(empty.records.every(record => record.move === null)).toBe(true);
    expect(empty.records.every(record => record.events.filter(event => event.stageId === 'replenishment').length === 1)).toBe(true);
    expect(empty.records.every(record => record.decisions.at(-1)?.result === 'skip')).toBe(true);
    expect(empty.rejectedShots).toBe(64);
    expect(empty.samples).toEqual([]);
  });

  it('reveals an ideal loss check and skipped readout together, and clears both on rewind', () => {
    const run = createMachineRun({ ...config, loadProbability: 0.62, atomLossProbability: 1 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    const readout = run.plan.timeline.stages.find(stage => stage.id === 'readout')!;
    const start = machineFrame(run, readout.startMs);
    expect(start.stageSkipped).toBe(false);
    expect(start.stageSkipReason).toBeNull();
    expect(start.representativeLostQubits).toEqual([]);
    expect(start.atoms.filter(atom => atom.qubit !== undefined)).toHaveLength(2);

    const checked = machineFrame(run, readout.startMs + readout.durationMs / run.attemptedShots + 1);
    expect(checked.stageSkipped).toBe(true);
    expect(checked.stageSkipReason).toBe('atom-lost');
    expect(checked.representativeLostQubits).toEqual([0, 1]);
    expect(checked.atoms.filter(atom => atom.qubit !== undefined)).toHaveLength(0);
    expect(checked.visibleLostShots).toBe(1);
    expect(checked.visibleShots).toBe(0);
    expect(projectMachineScene(checked, run.profile).activePath).toBeNull();
    expect(machineFrame(run, readout.startMs)).toEqual(start);
  });

  it('rewinds geometry, decisions and counts without exposing future observations, and reproduces a seeded run', () => {
    const run = createMachineRun({ ...config, loadProbability: 0.62 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    const original = machineExport(run);
    const [observation] = run.records[0].observations;
    const [decision] = run.records[0].decisions;
    expect(machineFrame(run, observation.availableMs - 1).occupancy?.observations).toHaveLength(0);
    expect(machineFrame(run, observation.availableMs).occupancy?.observations).toHaveLength(1);
    expect(machineFrame(run, decision.availableMs - 1).occupancy?.decisions).toHaveLength(0);
    expect(machineFrame(run, decision.availableMs).occupancy?.decisions).toHaveLength(1);
    const before = machineFrame(run, 4700);
    expect(before.occupancy?.observations).toEqual([]);
    expect(before.occupancy?.decisions).toEqual([]);
    expect(before.atoms.some(atom => atom.moving)).toBe(false);

    const observed = machineFrame(run, 5000);
    expect(observed.occupancy?.observations).toHaveLength(1);
    expect(observed.occupancy?.decisions).toHaveLength(0);
    expect(observed.atoms.filter(atom => atom.qubit !== undefined)).toHaveLength(1);
    const moving = machineFrame(run, 5900);
    expect(moving.atoms.filter(atom => atom.moving)).toHaveLength(1);
    expect(moving.activeMove).toEqual(run.records[0].move);
    expect(moving.activeMove?.atomId).toBe(moving.atoms.find(atom => atom.moving)?.id);
    expect(before.activeMove).toBeNull();
    expect(moving.occupancy?.replenishment).toBe('moving');

    const final = machineFrame(run, run.durationMs);
    expect(final.visibleAttempts).toBe(64);
    expect(final.outcomeCounts).toEqual([34, 0, 0, 30]);
    expect(machineFrame(run, 5000)).toEqual(observed);
    expect(machineFrame(run, 4700)).toEqual(before);
    expect(machineFrame(run, 5900)).toEqual(moving);
    expect(machineFrame(run, run.durationMs)).toEqual(final);
    expect(machineExport(run)).toEqual(original);
    expect(machineExport(createMachineRun(run.config, run.profile, 'bell-replenishment'))).toEqual(original);
  });

  it('uses the selected round for both the moving atom and its route', () => {
    const run = createMachineRun({ ...config, loadProbability: 0.09 }, MUNIZ_DEMO_PROFILE, 'bell-replenishment');
    const stage = run.plan.timeline.stages.find(item => item.id === 'rearrangement')!;
    const later = run.records.findIndex((record, index) => index > 0 && !!record.initialMoves?.length &&
      record.initialMoves[0].atomId !== run.moves[0]?.atomId);
    expect(later).toBeGreaterThan(0);
    const routes = run.records[later].initialMoves!;
    const frame = machineFrame(run, stage.startMs + stage.durationMs / routes.length / 2, later);
    expect(frame.activeMove).toEqual(routes[0]);
    expect(frame.atoms.find(atom => atom.moving)?.id).toBe(routes[0].atomId);
    expect(machineFrame(run, stage.endMs, later).activeMove).toBeNull();
  });
});
