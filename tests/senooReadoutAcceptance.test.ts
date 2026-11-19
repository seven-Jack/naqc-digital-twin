import { describe, expect, it } from 'vitest';
import {
  assessSenooReadoutAcceptance, parseSenooReadoutAcceptancePlan, senooReadoutAcceptanceMetrics,
} from '../src/physics/senooReadoutAcceptance';

const limits = Object.fromEntries(senooReadoutAcceptanceMetrics.map(metric => [metric.key, 0.25]));
const basePlan = {
  confidenceLevel: 0.95, independenceRef: 'engineering-fixture://independent-attempts',
  minAttemptsPerGroup: 1, minEvaluableFraction: 1, limits,
};

function engineeringEvidence(sizes: number[], { excluded = 0, m1Wrong = 0, emptyAmbiguous = 0 } = {}) {
  const preparedGroups = ['m1', 'm0', 'empty_control'] as const;
  const evaluated = sizes.reduce((sum, size) => sum + size, 0);
  return {
    groups: preparedGroups.map(preparedGroup => ({
      preparedGroup, attemptedSites: evaluated + excluded, evaluated,
      wrongLabel: preparedGroup === 'm1' ? m1Wrong : 0, reportedLoss: 0,
      ambiguous: preparedGroup === 'empty_control' ? emptyAmbiguous : 0,
    })),
    samples: preparedGroups.flatMap(preparedGroup => sizes.flatMap((size, index) =>
      Array.from({ length: size }, () => ({ preparedGroup, attemptId: `engineering-attempt-${index}` })),
    )),
  };
}

describe('Senoo independent readout acceptance plan', () => {
  it('normalizes only complete prespecified plans and rejects invalid rates or sample support', () => {
    const normalized = parseSenooReadoutAcceptancePlan({ ...basePlan, independenceRef: ` ${basePlan.independenceRef} ` });
    expect(normalized).toEqual(basePlan);
    expect(Object.isFrozen(normalized.limits)).toBe(true);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, confidenceLevel: 1 })).toThrow(/置信水平/);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, minAttemptsPerGroup: 1.5 })).toThrow(/正整数/);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, minEvaluableFraction: -0.1 })).toThrow(/可评估位点比例/);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, independenceRef: ' ' })).toThrow(/独立性依据/);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, limits: { ...limits, m1Wrong: '0.25' } })).toThrow(/上限/);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, limits: { ...limits, unexpected: 0.25 } })).toThrow(/字段/);
    expect(() => parseSenooReadoutAcceptancePlan({ ...basePlan, limits: { m1Wrong: 0.25 } })).toThrow(/字段/);
  });

  it('uses a simultaneous interval and widens it for shared and uneven attempt sizes', () => {
    const plan = parseSenooReadoutAcceptancePlan(basePlan);
    const calibration = engineeringEvidence([1, 1, 1, 1], { m1Wrong: 1 });
    const independent = engineeringEvidence(Array<number>(200).fill(1), { m1Wrong: 20 });
    const clustered = engineeringEvidence([...Array<number>(25).fill(6), ...Array<number>(25).fill(2)], { m1Wrong: 20 });
    const separate = assessSenooReadoutAcceptance(plan, calibration, independent, false);
    const shared = assessSenooReadoutAcceptance(plan, calibration, clustered, false);
    const logFactor = Math.log(16 / 0.05);
    expect(separate.metrics[0].upper).toBeCloseTo(0.1 + Math.sqrt(logFactor / 400), 12);
    expect(shared.metrics[0].upper).toBeCloseTo(0.1 + Math.sqrt(1000 * logFactor / (2 * 200 ** 2)), 12);
    expect(shared.metrics[0]).toMatchObject({
      key: 'm1Wrong', numerator: 20, denominator: 200, rate: 0.1, lower: 0,
      calibrationRate: 0.25, delta: -0.15, limit: 0.25, attemptCount: 50, status: 'inconclusive',
    });
    expect(shared.groups[0]).toMatchObject({ evaluableSites: 200, attemptCount: 50, sumSquaredAttemptSizes: 1000 });
    expect(separate.status).toBe('pass');
    expect(shared.status).toBe('inconclusive');
  });

  it('retains low support, missing denominators, and out-of-domain verdicts', () => {
    const plan = parseSenooReadoutAcceptancePlan({ ...basePlan, minAttemptsPerGroup: 200, minEvaluableFraction: 0.9 });
    const calibration = engineeringEvidence([1, 1, 1, 1]);
    const empty = assessSenooReadoutAcceptance(plan, calibration, engineeringEvidence([], { excluded: 5 }), false);
    expect(empty.status).toBe('inconclusive');
    expect(empty.metrics[0]).toMatchObject({ denominator: 0, lower: null, upper: null, rate: null, delta: null });
    expect(empty.groups[0]).toMatchObject({ attemptedSites: 5, evaluableFraction: 0, meetsMinimum: false });

    const validation = engineeringEvidence(Array<number>(200).fill(1), { excluded: 50 });
    const insufficientCoverage = assessSenooReadoutAcceptance(plan, calibration, validation, false);
    expect(insufficientCoverage.groups[0]).toMatchObject({ attemptCount: 200, evaluableFraction: 0.8, meetsMinimum: false });
    expect(insufficientCoverage.metrics[0].status).toBe('pass');
    expect(insufficientCoverage.status).toBe('inconclusive');

    const differentWorkpoint = assessSenooReadoutAcceptance(plan, calibration, validation, true);
    expect(differentWorkpoint.status).toBe('cross-workpoint');
    expect(differentWorkpoint.metrics).toEqual(insufficientCoverage.metrics);
  });

  it('uses each frozen limit and identifies a lower-bound breach for empty-control ambiguity', () => {
    const plan = parseSenooReadoutAcceptancePlan({ ...basePlan, limits: { ...limits, emptyAmbiguity: 0.1 } });
    const calibration = engineeringEvidence([1, 1, 1, 1], { emptyAmbiguous: 1 });
    const validation = engineeringEvidence(Array<number>(200).fill(1), { emptyAmbiguous: 100 });
    const assessment = assessSenooReadoutAcceptance(plan, calibration, validation, false);
    expect(assessment.status).toBe('fail');
    expect(assessment.metrics.find(metric => metric.key === 'emptyAmbiguity')).toMatchObject({
      status: 'fail', numerator: 100, rate: 0.5, calibrationRate: 0.25, delta: 0.25, limit: 0.1,
    });
    expect(assessment.metrics.find(metric => metric.key === 'emptyFalsePositive')).toMatchObject({ status: 'pass', numerator: 0 });
  });
});
