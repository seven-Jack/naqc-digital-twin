import { describe, expect, it } from 'vitest';
import { assessSenooCzWaveform, createSenooCzWaveformTemplate, parseSenooCzWaveform } from '../src/physics/senooCzWaveform';

const first = { omegaRadPerS: 0, detuningRadPerS: -2300, phaseRad: -2 };
const second = { omegaRadPerS: 20_000, detuningRadPerS: 0, phaseRad: 4 };
const samples = [
  { timeS: -2e-7, first, second },
  { timeS: 0, first, second },
  { timeS: 8e-7, first, second },
];

// Type-shaped test input for parser/readiness only.
const candidate = {
  ...createSenooCzWaveformTemplate(),
  sourceKind: 'measured', sourceRef: 'engineering-fixture://waveform',
  apparatusVersion: 'test-v1', gateVersion: 'cz-test-1', acquisitionRunId: 'test-run', workingPoint: 'point-a',
  isotope: 171, driveWavelengthM: 302e-9, clockId: 'test-clock', timeOriginRef: 'engineering-fixture://trigger',
  phaseReference: 'test-phase', detuningReference: 'test-transition', siteIds: ['A-01', 'A-02'],
  window: { startS: -1e-7, endS: 8e-7 }, samples,
  geometry: {
    distanceM: 2.4e-6, angleToMagneticFieldRad: 0, magneticFieldT: 0.0001,
    electricFieldVPerM: 0, interactionHz: -1e6, sourceRef: 'engineering-fixture://geometry',
  },
  driveCalibrationRef: 'engineering-fixture://rabi-calibration',
} as const;

const parse = (value: unknown) => parseSenooCzWaveform(JSON.stringify(value));

describe('Senoo CZ waveform input', () => {
  it('round-trips a blank template and reports missing evidence without filling in actual values', () => {
    const template = createSenooCzWaveformTemplate();
    expect(parse(template)).toEqual(template);
    expect(parse({ kind: template.kind, schemaVersion: template.schemaVersion })).toEqual(template);
    const assessment = assessSenooCzWaveform(template);
    expect(assessment.coverage).toEqual({ startS: null, endS: null, count: 0, coversWindow: false });
    expect(assessment.readyForModelInput).toBe(false);
    expect(assessment.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'sourceKind', kind: 'waveform' }),
      expect.objectContaining({ field: 'samples', kind: 'waveform' }),
      expect.objectContaining({ field: 'geometry.interactionHz', kind: 'conditions' }),
      expect.objectContaining({ field: 'responseDataRef', kind: 'evidence' }),
    ]));
  });

  it('retains the site order, signed values and zero samples in SI without adding points', () => {
    const record = parse(candidate);
    expect(record).toEqual(candidate);
    const state = assessSenooCzWaveform(record);
    expect(state.coverage).toEqual({ startS: -2e-7, endS: 8e-7, count: 3, coversWindow: true });
    expect(state.readyForModelInput).toBe(true);
    expect(state.issues.map(issue => issue.field)).toEqual([
      'trapTimingRef', 'erasureTimingRef', 'ionizationTimingRef', 'zCompensationRef', 'responseDataRef',
    ]);
  });

  it('checks coverage and distinguishes sources without treating the declaration as validation', () => {
    const partial = assessSenooCzWaveform(parse({ ...candidate, samples: samples.slice(0, 2) }));
    expect(partial.coverage).toEqual({ startS: -2e-7, endS: 0, count: 2, coversWindow: false });
    expect(partial.readyForModelInput).toBe(false);
    for (const sourceKind of ['control-setpoint', 'synthetic']) {
      const state = assessSenooCzWaveform(parse({ ...candidate, sourceKind }));
      expect(state.coverage.coversWindow).toBe(true);
      expect(state.readyForModelInput).toBe(false);
      expect(state.issues).toContainEqual(expect.objectContaining({ field: 'sourceKind' }));
    }
    const relabeled = assessSenooCzWaveform(parse({ ...candidate, sourceRef: 'synthetic://waveform' }));
    expect(relabeled.readyForModelInput).toBe(false);
    expect(relabeled.issues).toContainEqual(expect.objectContaining({ field: 'sourceRef', kind: 'waveform' }));
  });

  it('rejects invalid schema, timing, unit values and pair structure', () => {
    expect(() => parseSenooCzWaveform('{')).toThrow(/JSON/);
    expect(() => parse({ ...candidate, schemaVersion: 2 })).toThrow(/v1/);
    expect(() => parse({ ...candidate, sourceKind: 'curated' })).toThrow(/sourceKind/);
    expect(() => parse({ ...candidate, siteIds: ['A-01', 'A-01 '] })).toThrow(/不同/);
    expect(() => parse({ ...candidate, window: { startS: 1, endS: 1 } })).toThrow(/window/);
    expect(() => parse({ ...candidate, samples: [samples[1], samples[0]] })).toThrow(/timeS.*严格递增/);
    expect(() => parse({ ...candidate, samples: [samples[0], samples[0]] })).toThrow(/timeS.*严格递增/);
    expect(() => parse({ ...candidate, samples: [{ ...samples[0], first: { ...first, omegaRadPerS: -1 } }] }))
      .toThrow(/first.omegaRadPerS/);
    expect(() => parse({ ...candidate, samples: [{ ...samples[0], second: { ...second, phaseRad: '0' } }] }))
      .toThrow(/second.phaseRad/);
    expect(() => parse({ ...candidate, geometry: { distanceM: 0 } })).toThrow(/geometry.distanceM/);
  });
});
