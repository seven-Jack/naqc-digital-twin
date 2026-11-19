import type { SenooMeasuredAssessment } from './senooMeasuredReadout';

export const senooReadoutAcceptanceMetrics = [
  { key: 'm1Wrong', group: 'm1', label: '错标', count: 'wrongLabel' },
  { key: 'm1Loss', group: 'm1', label: '判丢失', count: 'reportedLoss' },
  { key: 'm1Ambiguity', group: 'm1', label: '歧义', count: 'ambiguous' },
  { key: 'm0Wrong', group: 'm0', label: '错标', count: 'wrongLabel' },
  { key: 'm0Loss', group: 'm0', label: '判丢失', count: 'reportedLoss' },
  { key: 'm0Ambiguity', group: 'm0', label: '歧义', count: 'ambiguous' },
  { key: 'emptyFalsePositive', group: 'empty_control', label: '误报', count: 'wrongLabel' },
  { key: 'emptyAmbiguity', group: 'empty_control', label: '歧义', count: 'ambiguous' },
] as const;

export type SenooReadoutAcceptanceMetricKey = typeof senooReadoutAcceptanceMetrics[number]['key'];

export interface SenooReadoutAcceptancePlan {
  readonly confidenceLevel: number;
  readonly independenceRef: string;
  readonly minAttemptsPerGroup: number;
  readonly minEvaluableFraction: number;
  readonly limits: Readonly<Record<SenooReadoutAcceptanceMetricKey, number>>;
}

type GroupSummary = SenooMeasuredAssessment['groups'][number];
type Sample = SenooMeasuredAssessment['samples'][number];
type MetricStatus = 'pass' | 'fail' | 'inconclusive';

interface AssessmentEvidence {
  readonly groups: readonly Pick<GroupSummary, 'preparedGroup' | 'attemptedSites' | 'evaluated' | 'wrongLabel' | 'reportedLoss' | 'ambiguous'>[];
  readonly samples: readonly Pick<Sample, 'attemptId' | 'preparedGroup'>[];
}

const planFields = ['confidenceLevel', 'independenceRef', 'minAttemptsPerGroup', 'minEvaluableFraction', 'limits'];
const metricKeys = senooReadoutAcceptanceMetrics.map(metric => metric.key);
const preparedGroups = ['m1', 'm0', 'empty_control'] as const;

function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || !fields.every(field => Object.hasOwn(value, field))) {
    throw new Error('双曝光验收方案的字段不完整或含额外字段。');
  }
  return value as Record<string, unknown>;
}

function fraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parseSenooReadoutAcceptancePlan(value: unknown): SenooReadoutAcceptancePlan {
  const { confidenceLevel, independenceRef, minAttemptsPerGroup, minEvaluableFraction, limits } = exactObject(value, planFields);
  if (!fraction(confidenceLevel) || confidenceLevel === 0 || confidenceLevel === 1) {
    throw new Error('双曝光验收的置信水平须介于 0 和 1 之间。');
  }
  if (typeof independenceRef !== 'string' || !independenceRef.trim()) throw new Error('请填写采集尝试间的独立性依据。');
  if (typeof minAttemptsPerGroup !== 'number' || !Number.isSafeInteger(minAttemptsPerGroup) || minAttemptsPerGroup < 1) {
    throw new Error('每个制备组的最少可评估尝试数须为正整数。');
  }
  if (!fraction(minEvaluableFraction)) throw new Error('最小可评估位点比例须在 0 到 1 之间。');
  const rawLimits = exactObject(limits, metricKeys);
  const parsedLimits = Object.fromEntries(senooReadoutAcceptanceMetrics.map(({ key, group, label }) => {
    const limit = rawLimits[key];
    if (!fraction(limit)) throw new Error(`${group} ${label}的验收上限须在 0 到 1 之间。`);
    return [key, limit];
  })) as Record<SenooReadoutAcceptanceMetricKey, number>;
  return Object.freeze({
    confidenceLevel, independenceRef: independenceRef.trim(), minAttemptsPerGroup, minEvaluableFraction,
    limits: Object.freeze(parsedLimits),
  });
}

function summarizeGroup(plan: SenooReadoutAcceptancePlan, evidence: AssessmentEvidence, group: typeof preparedGroups[number]) {
  const summary = evidence.groups.find(value => value.preparedGroup === group);
  const attemptedSites = summary?.attemptedSites ?? 0;
  const evaluableSites = summary?.evaluated ?? 0;
  const sizes = new Map<string, number>();
  for (const sample of evidence.samples) {
    if (sample.preparedGroup === group) sizes.set(sample.attemptId, (sizes.get(sample.attemptId) ?? 0) + 1);
  }
  const attemptCount = sizes.size;
  const sumSquaredAttemptSizes = Array.from(sizes.values()).reduce((sum, size) => sum + size ** 2, 0);
  const evaluableFraction = attemptedSites === 0 ? null : evaluableSites / attemptedSites;
  return {
    group, attemptedSites, evaluableSites, evaluableFraction, attemptCount, sumSquaredAttemptSizes,
    meetsMinimum: attemptCount >= plan.minAttemptsPerGroup && evaluableFraction !== null
      && evaluableFraction >= plan.minEvaluableFraction,
  };
}

export function assessSenooReadoutAcceptance(
  plan: SenooReadoutAcceptancePlan, calibration: AssessmentEvidence, validation: AssessmentEvidence, crossWorkpoint: boolean,
) {
  const groups = preparedGroups.map(group => summarizeGroup(plan, validation, group));
  const logCorrection = Math.log(2 * metricKeys.length) - Math.log1p(-plan.confidenceLevel);
  const metrics = senooReadoutAcceptanceMetrics.map(({ key, group, label, count }) => {
    const support = groups.find(item => item.group === group)!;
    const baseline = calibration.groups.find(item => item.preparedGroup === group);
    const numerator = validation.groups.find(item => item.preparedGroup === group)?.[count] ?? 0;
    const denominator = support.evaluableSites;
    const rate = denominator === 0 ? null : numerator / denominator;
    const calibrationRate = baseline && baseline.evaluated > 0 ? baseline[count] / baseline.evaluated : null;
    const delta = rate === null || calibrationRate === null ? null : rate - calibrationRate;
    // Conditional on the eligible-site counts, each independent attempt contributes in [0, n_i/N].
    // Dependence between sites of the same attempt is unrestricted. Bonferroni covers all eight metrics.
    const radius = denominator === 0 ? null
      : Math.sqrt(support.sumSquaredAttemptSizes / denominator ** 2 * logCorrection / 2);
    const lower = rate === null || radius === null ? null : Math.max(0, rate - radius);
    const upper = rate === null || radius === null ? null : Math.min(1, rate + radius);
    const limit = plan.limits[key];
    let status: MetricStatus = 'inconclusive';
    if (upper !== null && upper <= limit) status = 'pass';
    if (lower !== null && lower > limit) status = 'fail';
    return {
      key, group, label, numerator, denominator, rate, attemptCount: support.attemptCount,
      lower, upper, limit, calibrationRate, delta, status,
    };
  });
  let status: MetricStatus | 'cross-workpoint' = 'inconclusive';
  if (crossWorkpoint) status = 'cross-workpoint';
  else if (metrics.some(metric => metric.status === 'fail')) status = 'fail';
  else if (groups.every(group => group.meetsMinimum) && metrics.every(metric => metric.status === 'pass')) status = 'pass';
  return { method: 'attempt-cluster-hoeffding-bonferroni' as const, status, confidenceLevel: plan.confidenceLevel, metrics, groups };
}

export type SenooReadoutAcceptanceResult = ReturnType<typeof assessSenooReadoutAcceptance>;
