import { describe, expect, it } from 'vitest';
import {
  compareSenooCircuitPrediction, createSenooCircuitPredictionTemplate, parseSenooCircuitPrediction, senooCircuitPredictionMetricKeys,
} from '../src/physics/senooCircuitPrediction';

const identity = {
  apparatusVersion: 'fixture-apparatus', protocolVersion: 'fixture-protocol', workingPoint: 'fixture-working-point',
  circuitSelectionRuleRef: 'engineering-fixture://selection-v1', trapWavelengthM: 767e-9,
  circuitId: 'fixture-bell', circuitVersion: 'fixture-circuit-v1', basis: 'XX', siteIds: ['a', 'b'], targetBitstrings: ['00', '11'],
};
const batch = {
  ...identity, sourceKind: 'synthetic', acquisitionRunId: 'fixture-holdout', acquiredAtUtc: '2026-11-22T00:00:00Z',
} as const;
const readoutFingerprint = {
  calibrationRunId: 'fixture-readout-calibration', calibrationSha256: 'c'.repeat(64),
  candidate: { first: 37, second: 47, firstComparison: 'gt', secondComparison: 'ge' },
} as const;

function rawPrediction() {
  return {
    ...createSenooCircuitPredictionTemplate(), ...identity, sourceKind: 'synthetic',
    predictedAtUtc: '2026-11-21T00:00:00Z', modelVersion: 'fixture-model-v1', evidenceRef: 'engineering-fixture://prediction',
    independenceRef: 'engineering-fixture://independent-attempts', confidenceLevel: 0.9,
    components: {
      load: { modelVersion: 'fixture-load', sourceRef: 'engineering-fixture://load', calibrationRunIds: ['fixture-load-calibration'] },
      transport: { modelVersion: 'fixture-transport', sourceRef: 'engineering-fixture://transport', calibrationRunIds: ['fixture-transport-calibration'] },
      gate: { modelVersion: 'fixture-gate', sourceRef: 'engineering-fixture://gate', calibrationRunIds: ['fixture-gate-calibration'] },
      readout: { modelVersion: 'fixture-readout', sourceRef: 'engineering-fixture://readout', calibrationRunIds: ['fixture-readout-calibration'] },
    },
    metrics: Object.fromEntries(senooCircuitPredictionMetricKeys.map(key => [key, {
      expected: 0.5, tolerance: key === 'parity' ? 0.5 : 0.2, minDenominator: 20,
    }])),
  };
}

type CircuitAnalysis = Parameters<typeof compareSenooCircuitPrediction>[2];
const observedMetric = { numerator: 50, denominator: 100, value: 0.5 };

function fixtureAnalysis(metrics: Partial<CircuitAnalysis['metrics']> = {}): CircuitAnalysis {
  return {
    readout: { status: 'synthetic', calibrationRunId: null, calibrationSha256: null, candidate: null },
    metrics: {
      postTransportReady: observedMetric, circuitExecuted: observedMetric, validReadout: observedMetric,
      validReadoutGivenGate: observedMetric, reportedLossGivenCompleteFrames: observedMetric,
      ambiguityGivenCompleteFrames: observedMetric, targetBitstringPopulation: observedMetric, parity: observedMetric, ...metrics,
    },
  };
}

describe('Senoo frozen whole-machine predictions', () => {
  it('keeps the blank template unavailable and enforces normalized targets, metrics and confidence', () => {
    const template = createSenooCircuitPredictionTemplate();
    expect(() => parseSenooCircuitPrediction(JSON.stringify(template))).toThrow(/证据类型/);
    const raw = rawPrediction();
    expect(() => parseSenooCircuitPrediction(JSON.stringify({ ...raw, siteIds: ['a', 'a'] }))).toThrow(/重复标识/);
    expect(() => parseSenooCircuitPrediction(JSON.stringify({ ...raw, confidenceLevel: 1 }))).toThrow(/置信水平/);
    expect(() => parseSenooCircuitPrediction(JSON.stringify({ ...raw, trapWavelengthM: 0 }))).toThrow(/trapWavelengthM/);
    expect(() => parseSenooCircuitPrediction(JSON.stringify({ ...raw, predictedAtUtc: '2026-02-30T00:00:00Z' }))).toThrow(/UTC/);
    expect(() => parseSenooCircuitPrediction(JSON.stringify({ ...raw, targetBitstrings: [] }))).toThrow(/targetBitstrings/);
    const missingTarget = parseSenooCircuitPrediction(JSON.stringify({
      ...raw, targetBitstrings: [], metrics: { ...raw.metrics, targetBitstringPopulation: null },
    }));
    const report = compareSenooCircuitPrediction(missingTarget, { ...batch, targetBitstrings: [] }, fixtureAnalysis());
    expect(report.metrics).toHaveLength(7);
  });

  it('computes simultaneous intervals across attempted-shot denominators and respects parity range', () => {
    const prediction = parseSenooCircuitPrediction(JSON.stringify(rawPrediction()));
    const report = compareSenooCircuitPrediction(prediction, { ...batch, targetBitstrings: ['11', '00'] }, fixtureAnalysis());
    expect(report).toMatchObject({ scope: 'synthetic', status: 'pass', confidenceLevel: 0.9, predictedBeforeAcquisition: true });
    expect(report.metrics).toHaveLength(8);
    const valid = report.metrics.find(metric => metric.key === 'validReadout')!;
    const parity = report.metrics.find(metric => metric.key === 'parity')!;
    const radius = Math.sqrt(Math.log(160) / 200);
    expect(valid.lower).toBeCloseTo(0.5 - radius);
    expect(valid.upper).toBeCloseTo(0.5 + radius);
    expect(parity.lower).toBeCloseTo(0.5 - 2 * radius);
    expect(parity.upper).toBeCloseTo(0.5 + 2 * radius);
  });

  it('reports disjoint, overlapping and missing intervals with their original denominators', () => {
    const prediction = parseSenooCircuitPrediction(JSON.stringify(rawPrediction()));
    const report = compareSenooCircuitPrediction(prediction, batch, fixtureAnalysis({
      validReadout: { numerator: 94, denominator: 100, value: 0.94 },
      circuitExecuted: { numerator: 1, denominator: 2, value: 0.5 },
      targetBitstringPopulation: { numerator: 0, denominator: 0, value: null },
      parity: { numerator: -4, denominator: 100, value: -0.04 },
    }));
    expect(report.status).toBe('fail');
    expect(report.metrics.find(metric => metric.key === 'validReadout')).toMatchObject({
      observed: 0.94, numerator: 94, denominator: 100, status: 'fail',
    });
    expect(report.metrics.find(metric => metric.key === 'circuitExecuted')).toMatchObject({
      lower: 0, upper: 1, denominator: 2, status: 'inconclusive',
    });
    expect(report.metrics.find(metric => metric.key === 'targetBitstringPopulation')).toMatchObject({
      lower: null, upper: null, denominator: 0, residual: null, status: 'inconclusive',
    });
    expect(report.metrics.find(metric => metric.key === 'parity')?.residual).toBeCloseTo(-0.54);
  });

  it('rejects swapped sites, mismatched calibration details, and overlapping holdout runs', () => {
    const raw = rawPrediction();
    expect(() => parseSenooCircuitPrediction(JSON.stringify({ ...raw, sourceKind: 'measured-model' }))).toThrow(/readoutCalibration/);
    const prediction = parseSenooCircuitPrediction(JSON.stringify({ ...raw, sourceKind: 'measured-model', readoutCalibration: readoutFingerprint }));
    const measured = { ...batch, sourceKind: 'measured' as const };
    const analysis: CircuitAnalysis = {
      ...fixtureAnalysis(), readout: { status: 'evaluated', ...readoutFingerprint },
    };
    expect(() => compareSenooCircuitPrediction(prediction, batch, analysis)).toThrow(/证据类型/);
    expect(() => compareSenooCircuitPrediction(prediction, { ...measured, siteIds: ['b', 'a'] }, analysis)).toThrow(/位点顺序/);
    expect(() => compareSenooCircuitPrediction(prediction,
      { ...measured, circuitSelectionRuleRef: 'engineering-fixture://selection-v2' }, analysis)).toThrow(/circuitSelectionRuleRef/);
    expect(() => compareSenooCircuitPrediction(prediction,
      { ...measured, trapWavelengthM: 760e-9 }, analysis)).toThrow(/trapWavelengthM/);
    expect(() => compareSenooCircuitPrediction(prediction, { ...measured, acquisitionRunId: 'fixture-gate-calibration' }, analysis)).toThrow(/重叠/);
    expect(() => compareSenooCircuitPrediction(prediction, measured, {
      ...analysis, readout: { ...analysis.readout, candidate: { ...readoutFingerprint.candidate, firstComparison: 'ge' } },
    })).toThrow(/冻结读出规则/);
    expect(compareSenooCircuitPrediction(prediction, measured, analysis).scope).toBe('measured-model');
  });
});
