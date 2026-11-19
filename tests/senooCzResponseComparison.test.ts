import { describe, expect, it } from 'vitest';
import type { SenooCzDynamicsResult } from '../src/physics/senooCzDynamics';
import {
  SENOO_CZ_RESPONSE_INPUTS, type SenooCzResponse, type SenooCzResponseAttempt,
} from '../src/physics/senooCzResponse';
import { compareSenooCzResponse } from '../src/physics/senooCzResponseComparison';
import { createSenooCzWaveformTemplate, type SenooCzWaveform } from '../src/physics/senooCzWaveform';

const digest = 'abc123'.repeat(10) + 'abcd';
const waveform: SenooCzWaveform = {
  ...createSenooCzWaveformTemplate(),
  sourceKind: 'synthetic', apparatusVersion: 'fixture-apparatus', gateVersion: 'fixture-gate', workingPoint: 'fixture-point',
  siteIds: ['fixture-first', 'fixture-second'], acquisitionRunId: 'waveform-run', phaseReference: 'reference-a',
};

const prediction: SenooCzDynamicsResult = {
  inputs: SENOO_CZ_RESPONSE_INPUTS.map(input => ({
    input, diagonal: { real: 1, imag: 0 }, logicalPopulation: 1,
    logicalReturnProbability: input === '11' ? 1 + 1e-12 : 0.95, rydbergLeakageProbability: 0.01, normError: 0,
  })),
  conditionalPhaseRad: 0,
  convergence: {
    coarseStepCount: 1, fineStepCount: 2, maxDiagonalAbsChange: 0, maxLeakageAbsChange: 0, conditionalPhaseAbsChangeRad: 0,
  },
};

function fixture(attempts: readonly SenooCzResponseAttempt[] = []): SenooCzResponse {
  return {
    kind: 'senoo-cz-response', schemaVersion: 1, sourceKind: 'synthetic', sourceRef: 'synthetic://response',
    waveformSha256: digest, apparatusVersion: 'fixture-apparatus', gateVersion: 'fixture-gate', workingPoint: 'fixture-point',
    siteIds: ['fixture-first', 'fixture-second'], acquisitionRunId: 'response-run', clockId: 'clock', timeOriginRef: 'origin',
    readoutCalibrationRef: 'readout-ref', screeningRef: 'screening-ref', observationProtocolRef: 'observation-ref',
    independenceRef: 'independence-ref', confidenceLevel: 0.95, expectedAttempts: attempts.length, phase: null, attempts,
  };
}

describe('Senoo independent CZ response comparison', () => {
  it('retains every attempt and bounds each probability over all pre-gate admitted attempts', () => {
    const groups = [
      ['returned', 30], ['other-logical', 20], ['rydberg', 30], ['first-site-loss', 2], ['second-site-loss', 3],
      ['pair-loss', 5], ['ambiguous', 4], ['unavailable', 6],
    ] as const;
    const attempts: SenooCzResponseAttempt[] = groups.flatMap(([outcome, count]) => Array.from({ length: count }, (_, i) => ({
      attemptId: `${outcome}-${i}`, input: '00', prep: 'accepted', outcome, sourceRef: `synthetic://${outcome}/${i}`,
    } as const)));
    attempts.push(
      { attemptId: 'skip-0', input: '00', prep: 'rejected', outcome: null, sourceRef: 'synthetic://skipped/0' },
      { attemptId: 'skip-1', input: '01', prep: 'rejected', outcome: null, sourceRef: 'synthetic://skipped/1' },
      { attemptId: 'single', input: '11', prep: 'accepted', outcome: 'returned', sourceRef: 'synthetic://single' },
    );
    const result = compareSenooCzResponse(fixture(attempts), waveform, ` ${digest.toUpperCase()} `, prediction);
    const [first, rejected, absent, sparse] = result.rows;
    expect(result).toMatchObject({ scope: 'synthetic', waveformRunId: 'waveform-run', responseRunId: 'response-run', confidenceLevel: 0.95 });
    expect(first).toMatchObject({ input: '00', started: 101, rejected: 1, accepted: 100, unresolved: 20, counts: Object.fromEntries(groups) });
    expect(first.return).toMatchObject({ hits: 30, denominator: 100, observed: 0.3, identification: [0.3, 0.5], model: 0.95, relation: 'below' });
    expect(first.rydbergLeakage).toMatchObject({ hits: 30, denominator: 100, observed: 0.3, model: 0.01, relation: 'above' });

    const radius = Math.sqrt(Math.log(16 / (1 - 0.95)) / 200);
    const lo = 0.3 - radius;
    const hi = 0.5 + radius;
    expect(first.return.interval).toEqual([expect.closeTo(lo, 13), expect.closeTo(hi, 13)]);
    expect(first.return.residual).toEqual([expect.closeTo(lo - 0.95, 13), expect.closeTo(hi - 0.95, 13)]);
    expect(rejected).toMatchObject({ input: '01', started: 1, rejected: 1, accepted: 0 });
    expect(rejected.return).toMatchObject({ denominator: 0, observed: null, identification: null, interval: null, residual: null, relation: 'unavailable' });
    expect(absent).toMatchObject({ input: '10', started: 0, rejected: 0, accepted: 0 });
    expect(sparse.return).toMatchObject({ denominator: 1, interval: [0, 1], model: 1, relation: 'inside' });
  });

  it('uses a signed circular phase residual and splits intervals that cross the principal branch', () => {
    const phase = { estimateRad: 3.1, halfWidthRad: 0.25, confidenceLevel: 0.9, sourceRef: 'synthetic://phase', phaseReference: 'reference-a' };
    const response = { ...fixture(), phase };
    const result = compareSenooCzResponse(response, waveform, digest, prediction).phase;
    expect(result).toMatchObject({ status: 'comparable', modelRad: 0, estimateRad: 3.1, halfWidthRad: 0.25, confidenceLevel: 0.9 });
    expect(result.residualRad).toBeCloseTo(3.1, 13);
    expect(result.residualIntervalsRad).toEqual([[-Math.PI, expect.closeTo(3.35 - 2 * Math.PI, 13)], [expect.closeTo(2.85, 13), Math.PI]]);

    const reverse = compareSenooCzResponse({ ...response, phase: { ...phase, estimateRad: -3.1 } }, waveform, digest, prediction).phase;
    expect(reverse.residualIntervalsRad).toEqual([[-Math.PI, expect.closeTo(-2.85, 13)], [expect.closeTo(-3.35 + 2 * Math.PI, 13), Math.PI]]);
    const principal = compareSenooCzResponse({ ...response, phase: { ...phase, estimateRad: Math.PI - 0.01 } }, waveform, digest,
      { ...prediction, conditionalPhaseRad: -Math.PI + 0.01 }).phase;
    expect(principal.residualRad).toBeCloseTo(-0.02, 13);
    const full = compareSenooCzResponse({ ...response, phase: { ...phase, halfWidthRad: Math.PI } }, waveform, digest, prediction).phase;
    expect(full.residualIntervalsRad).toEqual([[-Math.PI, Math.PI]]);
  });

  it('keeps missing or mismatched phase evidence separate from the population comparison', () => {
    expect(compareSenooCzResponse(fixture(), waveform, digest, prediction).phase).toMatchObject({
      status: 'missing-response', residualRad: null, residualIntervalsRad: null,
    });
    const phase = { estimateRad: 0, halfWidthRad: 0, confidenceLevel: 0.9, sourceRef: 'synthetic://phase', phaseReference: 'wrong-reference' };
    const response = { ...fixture(), phase };
    expect(compareSenooCzResponse(response, waveform, digest, prediction).phase).toMatchObject({
      status: 'incompatible-reference', residualRad: null, residualIntervalsRad: null,
    });
    expect(compareSenooCzResponse(response, waveform, digest, { ...prediction, conditionalPhaseRad: null }).phase.status).toBe('missing-model');
  });

  it('requires the exact digest, independent runs, matching identity and ordered sites', () => {
    const response = fixture();
    expect(() => compareSenooCzResponse(response, waveform, 'f'.repeat(64), prediction)).toThrow(/waveformSha256/);
    expect(() => compareSenooCzResponse(response, waveform, null, prediction)).toThrow(/waveformSha256/);
    expect(() => compareSenooCzResponse({ ...response, acquisitionRunId: 'waveform-run' }, waveform, digest, prediction)).toThrow(/acquisitionRunId/);
    expect(() => compareSenooCzResponse({ ...response, siteIds: ['fixture-second', 'fixture-first'] }, waveform, digest, prediction)).toThrow(/siteIds/);
    expect(() => compareSenooCzResponse({ ...response, workingPoint: 'different-point' }, waveform, digest, prediction)).toThrow(/workingPoint/);
    expect(() => compareSenooCzResponse({ ...response, sourceKind: 'measured' }, waveform, digest, prediction)).toThrow(/实测波形/);
  });
});
