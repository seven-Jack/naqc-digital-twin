import { describe, expect, it } from 'vitest';
import {
  createSenooCzResponseTemplate,
  parseSenooCzResponse,
  SENOO_CZ_RESPONSE_OUTCOMES,
} from '../src/physics/senooCzResponse';

const ref = 'engineering-fixture://cz-response';
const attempts = [
  { attemptId: 'gate-01', input: '01', prep: 'accepted', outcome: 'unavailable', sourceRef: `${ref}/01` },
  { attemptId: 'gate-02', input: '10', prep: 'rejected', outcome: null, sourceRef: `${ref}/02` },
];
const candidate = {
  ...createSenooCzResponseTemplate(), sourceKind: 'measured', sourceRef: ref, waveformSha256: 'AB'.repeat(32),
  apparatusVersion: 'fixture-v1', gateVersion: 'fixture-cz', workingPoint: 'fixture-A', acquisitionRunId: 'independent-fixture-run',
  clockId: 'fixture-clock', timeOriginRef: `${ref}/trigger`, expectedAttempts: attempts.length,
  readoutCalibrationRef: `${ref}/readout`, screeningRef: `${ref}/prep`, observationProtocolRef: `${ref}/protocol`,
  independenceRef: `${ref}/independence`, confidenceLevel: 0.95, siteIds: ['B', 'A'], attempts,
};

const parse = (value: unknown) => parseSenooCzResponse(JSON.stringify(value));

describe('Senoo CZ response input', () => {
  it('creates a blank template without experimental values and imports complete sourced input in original order', () => {
    expect(createSenooCzResponseTemplate()).toMatchObject({ waveformSha256: null, expectedAttempts: null, attempts: [], phase: null });
    expect(() => parse(createSenooCzResponseTemplate())).toThrow(/sourceKind/);
    expect(parse(candidate)).toEqual({ ...candidate, waveformSha256: candidate.waveformSha256.toLowerCase() });
  });

  it('keeps leakage, classified loss and unresolved readout as distinct outcomes', () => {
    const allOutcomes = SENOO_CZ_RESPONSE_OUTCOMES.map((outcome, index) => ({
      ...attempts[0], attemptId: `gate-${index}`, outcome,
    }));
    const record = parse({ ...candidate, expectedAttempts: allOutcomes.length, attempts: allOutcomes });
    expect(record.attempts.map(attempt => attempt.outcome)).toEqual(SENOO_CZ_RESPONSE_OUTCOMES);
  });

  it('preserves the declared phase scope and rejects unsupported uncertainty', () => {
    const phase = {
      estimateRad: -Math.PI + 0.02, halfWidthRad: Math.PI, confidenceLevel: 0.9,
      sourceRef: `${ref}/phase-fit`, phaseReference: 'fixture-frame',
    };
    expect(parse({ ...candidate, phase }).phase).toEqual(phase);
    expect(() => parse({ ...candidate, phase: { ...phase, halfWidthRad: Math.PI + 0.01 } })).toThrow(/halfWidthRad/);
    expect(() => parse({ ...candidate, phase: { ...phase, confidenceLevel: 1 } })).toThrow(/phase.confidenceLevel/);
    expect(() => parse({ ...candidate, confidenceLevel: 0 })).toThrow(/confidenceLevel/);
  });

  it('rejects mismatched counts or identity, unknown preparation, and outcomes incompatible with the pre-gate cohort', () => {
    expect(() => parseSenooCzResponse('{')).toThrow(/JSON/);
    expect(() => parse({ ...candidate, schemaVersion: 2 })).toThrow(/v1/);
    expect(() => parse({ ...candidate, waveformSha256: 'not-a-digest' })).toThrow(/waveformSha256/);
    expect(() => parse({ ...candidate, siteIds: ['A', ' A '] })).toThrow(/互异/);
    expect(() => parse({ ...candidate, expectedAttempts: 1.5 })).toThrow(/expectedAttempts/);
    expect(() => parse({ ...candidate, expectedAttempts: 3 })).toThrow(/全部尝试/);
    expect(() => parse({ ...candidate, attempts: [attempts[0], { ...attempts[1], attemptId: 'gate-01 ' }] })).toThrow(/重复/);
    expect(() => parse({ ...candidate, attempts: [{ ...attempts[0], prep: 'unknown' }, attempts[1]] })).toThrow(/\.prep/);
    expect(() => parse({ ...candidate, attempts: [{ ...attempts[0], outcome: null }, attempts[1]] })).toThrow(/\.outcome/);
    expect(() => parse({ ...candidate, attempts: [attempts[0], { ...attempts[1], outcome: 'returned' }] })).toThrow(/\.outcome/);
  });

  it('checks the evidence label for batch, protocol and attempt sources', () => {
    expect(() => parse({ ...candidate, sourceRef: 'SyNthetic://simulated' })).toThrow(/sourceRef.*冲突/);
    expect(() => parse({ ...candidate, independenceRef: ' ' })).toThrow(/independenceRef/);
    expect(() => parse({ ...candidate, readoutCalibrationRef: 'literature://table-1' })).toThrow(/readoutCalibrationRef.*冲突/);
    const withSyntheticAttempt = { ...candidate, attempts: [{ ...attempts[0], sourceRef: 'synthetic://shot' }, attempts[1]] };
    expect(() => parse(withSyntheticAttempt)).toThrow(/attempts\[0\].sourceRef.*冲突/);
    expect(parse({ ...withSyntheticAttempt, sourceKind: 'synthetic' }).sourceKind).toBe('synthetic');
  });
});
