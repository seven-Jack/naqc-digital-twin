import type { SenooCircuitBatch } from './senooCircuitBatch';
import type { SenooCircuitStatistics } from './senooCircuitStatistics';
import type { SenooMeasuredCandidate } from './senooMeasuredReadout';

export const senooCircuitPredictionMetricKeys = [
  'postTransportReady', 'circuitExecuted', 'validReadout', 'validReadoutGivenGate',
  'reportedLossGivenCompleteFrames', 'ambiguityGivenCompleteFrames', 'targetBitstringPopulation', 'parity',
] as const;

export type SenooCircuitPredictionMetricKey = typeof senooCircuitPredictionMetricKeys[number];

const identityTextFields = [
  'apparatusVersion', 'protocolVersion', 'workingPoint', 'circuitId', 'circuitVersion', 'basis', 'circuitSelectionRuleRef',
] as const;
const componentNames = ['load', 'transport', 'gate', 'readout'] as const;
const referenceFields = ['modelVersion', 'evidenceRef', 'independenceRef'] as const;
const predictionFields = [
  'kind', 'schemaVersion', 'sourceKind', ...identityTextFields, 'trapWavelengthM', 'siteIds', 'targetBitstrings', ...referenceFields,
  'predictedAtUtc', 'confidenceLevel', 'components', 'readoutCalibration', 'metrics',
];

type CircuitIdentity = Readonly<Record<typeof identityTextFields[number], string>> & {
  readonly trapWavelengthM: number;
  readonly siteIds: readonly string[];
  readonly targetBitstrings: readonly string[];
};

interface ComponentReference {
  readonly modelVersion: string;
  readonly sourceRef: string;
  readonly calibrationRunIds: readonly string[];
}

export interface SenooPredictionReadoutFingerprint {
  readonly calibrationRunId: string;
  readonly calibrationSha256: string;
  readonly candidate: SenooMeasuredCandidate;
}

interface PredictionMetric {
  readonly expected: number;
  readonly tolerance: number;
  readonly minDenominator: number;
}

export interface SenooCircuitPrediction extends CircuitIdentity {
  readonly kind: 'senoo-circuit-prediction';
  readonly schemaVersion: 1;
  readonly sourceKind: 'synthetic' | 'measured-model';
  readonly predictedAtUtc: string;
  readonly modelVersion: string;
  readonly evidenceRef: string;
  readonly independenceRef: string;
  readonly confidenceLevel: number;
  readonly components: Readonly<Record<typeof componentNames[number], ComponentReference>>;
  readonly readoutCalibration: SenooPredictionReadoutFingerprint | null;
  readonly metrics: Readonly<Record<SenooCircuitPredictionMetricKey, PredictionMetric | null>>;
}

type BatchIdentity = Pick<SenooCircuitBatch, keyof CircuitIdentity | 'sourceKind' | 'acquisitionRunId' | 'acquiredAtUtc'>;
type CircuitAnalysis = Pick<SenooCircuitStatistics, 'metrics' | 'readout'>;
type ComparisonStatus = 'pass' | 'fail' | 'inconclusive';

export function createSenooCircuitPredictionTemplate() {
  return {
    kind: 'senoo-circuit-prediction', schemaVersion: 1, sourceKind: null,
    ...Object.fromEntries(identityTextFields.map(field => [field, null])), trapWavelengthM: null, siteIds: [], targetBitstrings: [],
    predictedAtUtc: null, modelVersion: null, evidenceRef: null, independenceRef: null, confidenceLevel: null,
    components: Object.fromEntries(componentNames.map(name => [name, { modelVersion: null, sourceRef: null, calibrationRunIds: [] }])),
    readoutCalibration: null,
    metrics: Object.fromEntries(senooCircuitPredictionMetricKeys.map(key => [key, key === 'targetBitstringPopulation'
      ? null : { expected: null, tolerance: null, minDenominator: null }])),
  };
}

function exactRecord(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`${path} 字段缺失或含额外字段。`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, path: string, measured = false): string {
  if (typeof value !== 'string' || !value.trim() || (measured && /^synthetic:/i.test(value.trim()))) {
    throw new Error(`${path} 需要有效的独立记录。`);
  }
  return value.trim();
}

function uniqueTextList(value: unknown, path: string, required: boolean, measured = false): readonly string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) throw new Error(`${path} 需要登记标识列表。`);
  const strings = value.map(item => requiredText(item, path, measured));
  if (new Set(strings).size !== strings.length) throw new Error(`${path} 含重复标识。`);
  return Object.freeze(strings);
}

function comparison(value: unknown, path: string): SenooMeasuredCandidate['firstComparison'] {
  if (value !== 'ge' && value !== 'gt') throw new Error(`${path} 需要 ge 或 gt 比较规则。`);
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} 须为有限数值。`);
  return value;
}

export function parseSenooPredictionReadout(value: unknown, measured: boolean): SenooPredictionReadoutFingerprint | null {
  const path = 'readoutCalibration';
  if (value === null && !measured) return null;
  const raw = exactRecord(value, ['calibrationRunId', 'calibrationSha256', 'candidate'], path);
  const calibrationRunId = requiredText(raw.calibrationRunId, `${path}.calibrationRunId`, measured);
  const calibrationSha256 = requiredText(raw.calibrationSha256, `${path}.calibrationSha256`).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(calibrationSha256)) throw new Error(`${path} 需要完整的 SHA-256。`);
  const { first, second, firstComparison, secondComparison } = exactRecord(
    raw.candidate, ['first', 'second', 'firstComparison', 'secondComparison'], `${path}.candidate`,
  );
  return Object.freeze({
    calibrationRunId, calibrationSha256, candidate: Object.freeze({
      first: finiteNumber(first, `${path}.candidate.first`), second: finiteNumber(second, `${path}.candidate.second`),
      firstComparison: comparison(firstComparison, `${path}.candidate.firstComparison`),
      secondComparison: comparison(secondComparison, `${path}.candidate.secondComparison`),
    }),
  });
}

export function parseSenooPredictionComponents(value: unknown, measured: boolean): SenooCircuitPrediction['components'] {
  const raw = exactRecord(value, componentNames, 'components');
  const entries = componentNames.map(name => {
    const path = `components.${name}`;
    const component = exactRecord(raw[name], ['modelVersion', 'sourceRef', 'calibrationRunIds'], path);
    return [name, Object.freeze({
      modelVersion: requiredText(component.modelVersion, `${path}.modelVersion`),
      sourceRef: requiredText(component.sourceRef, `${path}.sourceRef`, measured),
      calibrationRunIds: uniqueTextList(component.calibrationRunIds, `${path}.calibrationRunIds`, measured, measured),
    })] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as SenooCircuitPrediction['components'];
}

function metricMinimum(key: SenooCircuitPredictionMetricKey) {
  return key === 'parity' ? -1 : 0;
}

function parseMetrics(value: unknown, hasTargetBitstrings: boolean): SenooCircuitPrediction['metrics'] {
  const raw = exactRecord(value, senooCircuitPredictionMetricKeys, 'metrics');
  const entries = senooCircuitPredictionMetricKeys.map(key => {
    const path = `metrics.${key}`;
    if (key === 'targetBitstringPopulation' && !hasTargetBitstrings) {
      if (raw[key] !== null) throw new Error(`${path} 需要与 targetBitstrings 一同登记。`);
      return [key, null] as const;
    }
    const row = exactRecord(raw[key], ['expected', 'tolerance', 'minDenominator'], path);
    const expected = finiteNumber(row.expected, `${path}.expected`);
    const tolerance = finiteNumber(row.tolerance, `${path}.tolerance`);
    const minDenominator = finiteNumber(row.minDenominator, `${path}.minDenominator`);
    const minimum = metricMinimum(key);
    if (expected < minimum || expected > 1 || tolerance < 0 || tolerance > 1 - minimum
      || !Number.isSafeInteger(minDenominator) || minDenominator < 1) {
      throw new Error(`${path} 的预测均值、容许差值或最低分母超出适用范围。`);
    }
    return [key, Object.freeze({ expected, tolerance, minDenominator })] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as SenooCircuitPrediction['metrics'];
}

export function parseSenooCircuitPrediction(text: string): SenooCircuitPrediction {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('整机预测记录需要有效的 JSON。');
  }
  const raw = exactRecord(value, predictionFields, '整机预测记录');
  if (raw.kind !== 'senoo-circuit-prediction' || raw.schemaVersion !== 1) throw new Error('整机预测文件的类型或版本无效。');
  const { sourceKind } = raw;
  if (sourceKind !== 'measured-model' && sourceKind !== 'synthetic') throw new Error('请声明整机预测的证据类型。');
  const measured = sourceKind === 'measured-model';
  const identity = Object.fromEntries(identityTextFields.map(field => [
    field, requiredText(raw[field], field, measured && field === 'circuitSelectionRuleRef'),
  ])) as Record<typeof identityTextFields[number], string>;
  const trapWavelengthM = finiteNumber(raw.trapWavelengthM, 'trapWavelengthM');
  if (trapWavelengthM <= 0) throw new Error('trapWavelengthM 须为正的米制波长。');
  const siteIds = uniqueTextList(raw.siteIds, 'siteIds', true);
  const targetBitstrings = uniqueTextList(raw.targetBitstrings, 'targetBitstrings', false);
  if (!/^[XYZ]+$/.test(identity.basis) || identity.basis.length !== siteIds.length
    || targetBitstrings.some(bits => !/^[01]+$/.test(bits) || bits.length !== siteIds.length)) {
    throw new Error('测量基、目标位串与位点数不相符。');
  }
  const predictedAtUtc = requiredText(raw.predictedAtUtc, 'predictedAtUtc');
  const predictedTime = Date.parse(predictedAtUtc);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(predictedAtUtc) || !Number.isFinite(predictedTime)
    || new Date(predictedTime).toISOString().slice(0, 19) !== predictedAtUtc.slice(0, 19)) {
    throw new Error('predictedAtUtc 须登记 UTC 时标。');
  }
  const confidenceLevel = finiteNumber(raw.confidenceLevel, 'confidenceLevel');
  if (confidenceLevel <= 0 || confidenceLevel >= 1) throw new Error('同时置信水平须大于 0 且小于 1。');
  const components = parseSenooPredictionComponents(raw.components, measured);
  const readoutCalibration = parseSenooPredictionReadout(raw.readoutCalibration, measured);
  if (readoutCalibration && !components.readout.calibrationRunIds.includes(readoutCalibration.calibrationRunId)) {
    throw new Error('读出冻结记录须对应读出模型登记的标定采集运行。');
  }
  return Object.freeze({
    kind: raw.kind, schemaVersion: raw.schemaVersion, sourceKind, ...identity, trapWavelengthM, siteIds, targetBitstrings, predictedAtUtc,
    modelVersion: requiredText(raw.modelVersion, 'modelVersion'), evidenceRef: requiredText(raw.evidenceRef, 'evidenceRef', measured),
    independenceRef: requiredText(raw.independenceRef, 'independenceRef', measured), confidenceLevel,
    components, readoutCalibration, metrics: parseMetrics(raw.metrics, targetBitstrings.length > 0),
  });
}

export function matchesSenooPredictionReadout(expected: SenooPredictionReadoutFingerprint, actual: CircuitAnalysis['readout']): boolean {
  const actualRule = actual.candidate;
  return actual.status === 'evaluated' && expected.calibrationRunId === actual.calibrationRunId
    && expected.calibrationSha256 === actual.calibrationSha256?.toLowerCase()
    && actualRule !== null && actualRule !== undefined
    && (['first', 'second', 'firstComparison', 'secondComparison'] as const).every(field => expected.candidate[field] === actualRule[field]);
}

function verifyComparisonIdentity(prediction: SenooCircuitPrediction, batch: BatchIdentity, analysis: CircuitAnalysis) {
  const expectedSource = prediction.sourceKind === 'measured-model' ? 'measured' : 'synthetic';
  if (expectedSource !== batch.sourceKind) throw new Error('预测与采集批次的证据类型不相容。');
  const mismatch = [...identityTextFields, 'trapWavelengthM' as const].find(field => prediction[field] !== batch[field]);
  if (mismatch) throw new Error(`预测与采集批次的 ${mismatch} 不一致。`);
  const targets = new Set(batch.targetBitstrings);
  if (prediction.siteIds.length !== batch.siteIds.length || prediction.siteIds.some((id, index) => id !== batch.siteIds[index])
    || prediction.targetBitstrings.length !== targets.size || prediction.targetBitstrings.some(bits => !targets.has(bits))) {
    throw new Error('预测与采集批次的位点顺序或目标位串不一致。');
  }
  if (componentNames.some(name => prediction.components[name].calibrationRunIds.includes(batch.acquisitionRunId))) {
    throw new Error('留出采集运行与模型的组件标定运行重叠。');
  }
  if (prediction.readoutCalibration && !matchesSenooPredictionReadout(prediction.readoutCalibration, analysis.readout)) {
    throw new Error('预测与批次判读必须使用相同的冻结读出规则和来源 SHA-256。');
  }
}

export function compareSenooCircuitPrediction(
  prediction: SenooCircuitPrediction, batch: BatchIdentity, analysis: CircuitAnalysis,
) {
  verifyComparisonIdentity(prediction, batch, analysis);
  const keys = senooCircuitPredictionMetricKeys.filter(key => prediction.metrics[key] !== null);
  const logCorrection = Math.log(2 * keys.length) - Math.log1p(-prediction.confidenceLevel);
  const metrics = keys.map(key => {
    const { expected, tolerance, minDenominator } = prediction.metrics[key]!;
    const actual = analysis.metrics[key];
    const minimum = metricMinimum(key);
    const bandLower = Math.max(minimum, expected - tolerance);
    const bandUpper = Math.min(1, expected + tolerance);
    const observed = actual?.value ?? null;
    const denominator = actual?.denominator ?? null;
    // Each attempt contributes at most one observation to each denominator.
    const radius = observed === null || denominator === null || denominator === 0 ? null
      : (1 - minimum) * Math.sqrt(logCorrection / (2 * denominator));
    const lower = radius === null || observed === null ? null : Math.max(minimum, observed - radius);
    const upper = radius === null || observed === null ? null : Math.min(1, observed + radius);
    let status: ComparisonStatus = 'inconclusive';
    if (denominator !== null && denominator >= minDenominator && lower !== null && upper !== null) {
      if (lower >= bandLower && upper <= bandUpper) status = 'pass';
      if (upper < bandLower || lower > bandUpper) status = 'fail';
    }
    return {
      key, numerator: actual?.numerator ?? null, denominator, observed, lower, upper, expected, tolerance, minDenominator,
      bandLower, bandUpper, residual: observed === null ? null : observed - expected, status,
    };
  });
  let status: ComparisonStatus = 'inconclusive';
  if (metrics.some(metric => metric.status === 'fail')) status = 'fail';
  else if (metrics.every(metric => metric.status === 'pass')) status = 'pass';
  return {
    method: 'attempt-hoeffding-bonferroni' as const, scope: prediction.sourceKind, status, confidenceLevel: prediction.confidenceLevel,
    modelVersion: prediction.modelVersion, predictedAtUtc: prediction.predictedAtUtc,
    predictedBeforeAcquisition: Date.parse(prediction.predictedAtUtc) < Date.parse(batch.acquiredAtUtc),
    evidenceRef: prediction.evidenceRef, independenceRef: prediction.independenceRef, metrics,
  };
}

export type SenooCircuitPredictionComparison = ReturnType<typeof compareSenooCircuitPrediction>;
