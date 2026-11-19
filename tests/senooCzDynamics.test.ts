import { describe, expect, it } from 'vitest';
import { simulateSenooCzDynamics } from '../src/physics/senooCzDynamics';
import { SENOO_CZ_EVOLUTION_CONVENTION, createSenooCzWaveformTemplate, type SenooCzWaveform } from '../src/physics/senooCzWaveform';

const zero = { omegaRadPerS: 0, detuningRadPerS: 0, phaseRad: 0 };
const options = { sampling: 'zero-order-hold', maxStepS: 1e-6 } as const;
type Sample = SenooCzWaveform['samples'][number];

function syntheticRecord(samples: readonly Sample[], startS: number, endS: number, interactionHz: number): SenooCzWaveform {
  const template = createSenooCzWaveformTemplate();
  return {
    ...template, sourceKind: 'synthetic', sourceRef: 'engineering-fixture://coherent-dynamics',
    evolutionConvention: SENOO_CZ_EVOLUTION_CONVENTION,
    window: { startS, endS }, samples, geometry: { ...template.geometry, interactionHz },
  };
}

function survivalAmplitude(omega: number, detuning: number, timeS: number) {
  const splitting = Math.hypot(omega, detuning);
  const cosine = Math.cos(splitting * timeS / 2);
  const weightedSine = detuning / splitting * Math.sin(splitting * timeS / 2);
  const phase = detuning * timeS / 2;
  return {
    real: Math.cos(phase) * cosine + Math.sin(phase) * weightedSine,
    imag: Math.sin(phase) * cosine - Math.cos(phase) * weightedSine,
  };
}

describe('Senoo coherent two-atom CZ dynamics', () => {
  it('leaves all logical inputs unchanged with both drives off', () => {
    const first = { ...zero, detuningRadPerS: +1e6 };
    const second = { ...zero, detuningRadPerS: -2e6 };
    const result = simulateSenooCzDynamics(syntheticRecord([
      { timeS: 0, first, second }, { timeS: 1e-6, first: zero, second: zero },
    ], 0, 1e-6, -1.2e6), options);
    for (const input of result.inputs) {
      expect(input.diagonal.real).toBeCloseTo(1, 13);
      expect(input.diagonal.imag).toBeCloseTo(0, 13);
      expect(input.logicalPopulation).toBeCloseTo(1, 13);
      expect(input.rydbergLeakageProbability).toBe(0);
      expect(input.normError).toBeLessThan(1e-13);
    }
    expect(result.conditionalPhaseRad).toBeCloseTo(0, 13);
    expect(result.convergence).toMatchObject({ coarseStepCount: 1, fineStepCount: 2 });
  });

  it('clips a held sample to the gate window and resolves π leakage and 2π return', () => {
    const durationS = 2e-7;
    const first = { ...zero, omegaRadPerS: Math.PI / durationS };
    const run = (multiple: number) => simulateSenooCzDynamics(syntheticRecord([
      { timeS: -durationS, first, second: zero },
      { timeS: 3 * durationS, first: zero, second: { ...zero, omegaRadPerS: 1e9 } },
    ], 0, multiple * durationS, 6e5), options);
    const pi = run(1);
    expect(pi.inputs.map(input => input.rydbergLeakageProbability)).toEqual([
      0, 0, expect.closeTo(1, 13), expect.closeTo(1, 13),
    ]);
    expect(pi.inputs[3].logicalReturnProbability).toBeCloseTo(0, 13);
    expect(pi.conditionalPhaseRad).toBeNull();
    const twoPi = run(2);
    expect(twoPi.inputs.map(input => input.diagonal.real)).toEqual([
      expect.closeTo(1, 13), expect.closeTo(1, 13), expect.closeTo(-1, 13), expect.closeTo(-1, 13),
    ]);
    expect(twoPi.inputs[2].logicalReturnProbability).toBeCloseTo(1, 13);
    expect(twoPi.conditionalPhaseRad).toBeCloseTo(0, 13);
  });

  it('preserves signed detuning and the relative phase of consecutive π pulses', () => {
    const durationS = 5e-7;
    const omegaRadPerS = Math.PI / durationS;
    const first = { ...zero, omegaRadPerS, detuningRadPerS: 3.5e6 };
    for (const sign of [1, -1]) {
      const drive = { ...first, detuningRadPerS: sign * first.detuningRadPerS };
      const result = simulateSenooCzDynamics(syntheticRecord([
        { timeS: 0, first: drive, second: zero }, { timeS: durationS, first: zero, second: zero },
      ], 0, durationS, 0), options);
      const expected = survivalAmplitude(omegaRadPerS, drive.detuningRadPerS, durationS);
      expect(result.inputs[2].diagonal.real).toBeCloseTo(expected.real, 13);
      expect(result.inputs[2].diagonal.imag).toBeCloseTo(expected.imag, 13);
    }
    const pulse = { ...zero, omegaRadPerS };
    const phasePair = simulateSenooCzDynamics(syntheticRecord([
      { timeS: 0, first: pulse, second: zero },
      { timeS: durationS, first: { ...pulse, phaseRad: Math.PI / 2 }, second: zero },
      { timeS: 2 * durationS, first: zero, second: zero },
    ], 0, 2 * durationS, 0), options);
    // |1> → −i |r0> → +i |1> using H(r0,m1)/ℏ = Ω exp(iφ)/2.
    expect(phasePair.inputs[2].diagonal.real).toBeCloseTo(0, 13);
    expect(phasePair.inputs[2].diagonal.imag).toBeCloseTo(1, 13);
  });

  it('uses the sign and 2π conversion of the interaction Hz on the double Rydberg state', () => {
    const durationS = 1e-6;
    const firstPulse = { ...zero, omegaRadPerS: Math.PI / durationS };
    const secondPulse = { ...zero, omegaRadPerS: 1e6, detuningRadPerS: 2e6 };
    const samples = [
      { timeS: 0, first: firstPulse, second: zero },
      { timeS: durationS, first: zero, second: secondPulse },
      { timeS: 2 * durationS, first: firstPulse, second: zero },
      { timeS: 3 * durationS, first: zero, second: zero },
    ];
    for (const interactionHz of [7e5, -7e5]) {
      const result = simulateSenooCzDynamics(syntheticRecord(samples, 0, 3 * durationS, interactionHz), {
        ...options, maxStepS: 1e-8,
      });
      // The first π pair produces phase −1 on the logical path. During the middle
      // pulse the first atom occupies r0, so only the second site's detuning is shifted.
      const expected = survivalAmplitude(secondPulse.omegaRadPerS, secondPulse.detuningRadPerS - 2 * Math.PI * interactionHz, durationS);
      expect(result.inputs[3].diagonal.real).toBeCloseTo(-expected.real, 5);
      expect(result.inputs[3].diagonal.imag).toBeCloseTo(-expected.imag, 5);
      expect(result.inputs[3].normError).toBeLessThan(1e-12);
    }
  });

  it('shows refinement and reproduces a site swap at finite interaction', () => {
    const durationS = 1.6e-6;
    const first = { omegaRadPerS: 1e6, detuningRadPerS: -7e5, phaseRad: 0.4 };
    const second = { omegaRadPerS: 1.4e6, detuningRadPerS: 8e5, phaseRad: -0.5 };
    const samples = [
      { timeS: 0, first, second }, { timeS: durationS, first: zero, second: zero },
    ];
    const record = syntheticRecord(samples, 0, durationS, 5e5);
    const coarse = simulateSenooCzDynamics(record, { ...options, maxStepS: 4e-7 });
    const fine = simulateSenooCzDynamics(record, { ...options, maxStepS: 2e-7 });
    expect(coarse.convergence.maxDiagonalAbsChange).toBeGreaterThan(1e-6);
    expect(fine.convergence.maxDiagonalAbsChange).toBeLessThan(coarse.convergence.maxDiagonalAbsChange / 3);
    expect(fine.convergence.maxLeakageAbsChange).toBeLessThan(coarse.convergence.maxLeakageAbsChange / 3);
    expect(fine.inputs.every(input => input.normError < 1e-12)).toBe(true);
    const swappedRecord = syntheticRecord(samples.map(sample => ({ ...sample, first: sample.second, second: sample.first })),
      0, durationS, 5e5);
    const swap = simulateSenooCzDynamics(swappedRecord, { ...options, maxStepS: 2e-7 });
    for (const [index, opposite] of [0, 2, 1, 3].entries()) {
      expect(swap.inputs[index].diagonal.real).toBeCloseTo(fine.inputs[opposite].diagonal.real, 12);
      expect(swap.inputs[index].diagonal.imag).toBeCloseTo(fine.inputs[opposite].diagonal.imag, 12);
    }
    expect(swap.conditionalPhaseRad).toBeCloseTo(fine.conditionalPhaseRad!, 12);
  });

  it('requires explicit sign convention, gate coverage and a bounded numerical budget', () => {
    const record = syntheticRecord([
      { timeS: 0, first: zero, second: zero }, { timeS: 1e-6, first: zero, second: zero },
    ], 0, 1e-6, 0);
    expect(() => simulateSenooCzDynamics({ ...record, evolutionConvention: null }, options)).toThrow(/evolutionConvention/);
    expect(() => simulateSenooCzDynamics({ ...record, window: { startS: -1e-6, endS: 1e-6 } }, options)).toThrow(/覆盖/);
    expect(() => simulateSenooCzDynamics(record, { ...options, maxStepS: 0 })).toThrow(/步长/);
    expect(() => simulateSenooCzDynamics(record, { ...options, maxStepS: 1e-9, maxTotalSteps: 3 })).toThrow(/预算/);
    expect(() => simulateSenooCzDynamics({ ...record, geometry: { ...record.geometry, interactionHz: null } }, options))
      .toThrow(/相互作用频移/);
  });
});
