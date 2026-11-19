import { classifyDualExposure, createDualExposureRule, type ReadoutOutcome } from './dualExposureReadout';
import type { SenooMeasurementReport } from './senooMeasurements';

type Batch = SenooMeasurementReport['batches'][number];
type Site = SenooMeasurementReport['records'][number];
type PreparedGroup = Site['preparedGroup'];

const expectedOutcome = { m1: 'm1', m0: 'm0', empty_control: 'no-atom' } as const;
const comparableFields = [
  'apparatus_version', 'protocol_version', 'camera_config_ref', 'roi_map_version',
  'count_processing_ref', 'screening_rule_ref',
] as const;

function syntheticBatch(report: SenooMeasurementReport, id: string, role: Batch['role']) {
  if (report.issues.some(issue => issue.severity === 'error')) {
    throw new Error('工作簿有校验错误，请修正后重新导入。');
  }
  const batch = report.batches.find(item => item.id === id);
  if (!batch || batch.role !== role || batch.sourceKind !== 'synthetic') {
    throw new Error(role === 'calibration' ? '请选择标记为合成数据的标定批次。' : '请选择标记为合成数据的独立验证批次。');
  }
  if (!batch.countUnit) throw new Error('批次没有登记计数单位。');
  return { ...batch, countUnit: batch.countUnit };
}

function evaluableSamples(records: Site[], batchId: string) {
  return records.flatMap(record => {
    if (record.batchId !== batchId || record.analysisStatus !== 'included') return [];
    const first = record.frames.find(frame => frame.imageNo === 1);
    const second = record.frames.find(frame => frame.imageNo === 2);
    if (first?.status !== 'valid' || second?.status !== 'valid'
        || first.decisionCount === null || second.decisionCount === null
        || !Number.isFinite(first.decisionCount) || !Number.isFinite(second.decisionCount)) return [];
    return [{
      attemptId: record.attemptId,
      siteId: record.siteId,
      preparedGroup: record.preparedGroup,
      counts: { first: first.decisionCount, second: second.decisionCount },
      sourceRefs: { first: first.sourceRef, second: second.sourceRef },
      originalDecision: record.instrumentDecision,
    }];
  });
}

type Sample = ReturnType<typeof evaluableSamples>[number];
type DenominatorFields = Pick<Batch, 'attemptedSites' | 'prepPassed' | 'validPairs' | 'included'>;

function denominators({ attemptedSites, prepPassed, validPairs, included }: DenominatorFields, evaluated: number) {
  return { attemptedSites, prepPassed, validPairs, included, evaluated };
}

function bounds(samples: Sample[], channel: 'first' | 'second', brightGroup: PreparedGroup) {
  let darkMax = -Infinity;
  let brightMin = Infinity;
  for (const sample of samples) {
    const count = sample.counts[channel];
    if (sample.preparedGroup === brightGroup) brightMin = Math.min(brightMin, count);
    else darkMax = Math.max(darkMax, count);
  }
  if (darkMax >= brightMin) {
    throw new Error(`Image ${channel === 'first' ? 1 : 2} 的合成标定样本亮暗重叠，无法使用中点分界规则。`);
  }
  const midpoint = darkMax / 2 + brightMin / 2;
  return Object.freeze({ darkMax, brightMin, threshold: midpoint > darkMax ? midpoint : brightMin });
}

export function freezeSenooSyntheticRule(report: SenooMeasurementReport, batchId: string) {
  const batch = syntheticBatch(report, batchId, 'calibration');
  const samples = evaluableSamples(report.records, batch.id);
  const groups = new Set(samples.map(sample => sample.preparedGroup));
  if (groups.size !== Object.keys(expectedOutcome).length) {
    throw new Error('合成标定批次须有 m₁、m₀ 和空位三组可判读配对。');
  }
  const first = bounds(samples, 'first', 'm1');
  const second = bounds(samples, 'second', 'm0');
  const selected = createDualExposureRule({ first: first.threshold, second: second.threshold });
  const rule = Object.freeze({
    ...selected, thresholds: Object.freeze(selected.thresholds), outcomes: Object.freeze(selected.outcomes),
  });
  return Object.freeze({
    evidence: 'synthetic-acceptance',
    schemaVersion: 1,
    method: 'nominal-channel-gap-midpoint',
    calibrationBatchId: batch.id,
    calibrationRunId: batch.acquisitionRunId,
    countUnit: batch.countUnit,
    conditions: Object.freeze(Object.fromEntries(comparableFields.map(field => [field, batch.metadata[field] ?? null]))),
    channelBounds: Object.freeze({ first, second }),
    denominators: denominators(batch, samples.length),
    samples: samples.map(({ originalDecision: _originalDecision, ...sample }) => sample),
    rule,
  } as const);
}

type FrozenSenooSyntheticRule = ReturnType<typeof freezeSenooSyntheticRule>;

export function verifySenooSyntheticRule(frozen: FrozenSenooSyntheticRule, report: SenooMeasurementReport, batchId: string) {
  const batch = syntheticBatch(report, batchId, 'validation');
  if (batch.id === frozen.calibrationBatchId || batch.acquisitionRunId === frozen.calibrationRunId) {
    throw new Error('验证批次与标定批次共用采集运行。');
  }
  if (batch.countUnit !== frozen.countUnit) throw new Error('验证批次的计数单位与冻结规则不一致。');
  const mismatch = comparableFields.find(field => (batch.metadata[field] ?? null) !== frozen.conditions[field]);
  if (mismatch) throw new Error(`验证批次的 ${mismatch} 与冻结规则不一致。`);

  const samples = evaluableSamples(report.records, batch.id).map(sample => ({
    ...sample, outcome: classifyDualExposure(sample.counts, frozen.rule).outcome,
  }));
  const groups = batch.groups.map(group => {
    const selected = samples.filter(sample => sample.preparedGroup === group.preparedGroup);
    const counts: Record<ReadoutOutcome, number> = { m1: 0, m0: 0, 'no-atom': 0, ambiguous: 0 };
    for (const sample of selected) counts[sample.outcome]++;
    const expected = expectedOutcome[group.preparedGroup];
    return {
      preparedGroup: group.preparedGroup,
      ...denominators(group, selected.length),
      wrongLabel: counts.m1 + counts.m0 - (expected === 'm1' || expected === 'm0' ? counts[expected] : 0),
      reportedLoss: counts['no-atom'],
      ambiguous: counts.ambiguous,
      correct: counts[expected],
      counts,
    };
  });

  const totals = { evaluated: samples.length, spinEvaluated: 0, wrongSpin: 0, falseLoss: 0,
    ambiguous: 0, emptyEvaluated: 0, emptyFalsePositive: 0, correct: 0, reportedLoss: 0 };
  for (const group of groups) {
    totals.correct += group.correct;
    totals.ambiguous += group.ambiguous;
    totals.reportedLoss += group.reportedLoss;
    if (group.preparedGroup === 'empty_control') {
      totals.emptyEvaluated += group.evaluated;
      totals.emptyFalsePositive += group.wrongLabel;
    } else {
      totals.spinEvaluated += group.evaluated;
      totals.wrongSpin += group.wrongLabel;
      totals.falseLoss += group.reportedLoss;
    }
  }
  return {
    evidence: 'synthetic-acceptance',
    validationBatchId: batch.id,
    validationRunId: batch.acquisitionRunId,
    denominators: denominators(batch, samples.length),
    groups, totals, samples,
  } as const;
}
