import {
  projectSenooBellCoherence, projectSenooBellOverlap, SENOO_BELL_ANALYSIS_PHASE_RAD, SENOO_BELL_SETTINGS,
  summarizeSenooBellObservations, type SenooBellObservations,
} from './senooBellObservations';
import {
  createSenooCircuitPredictionTemplate, matchesSenooPredictionReadout, parseSenooPredictionComponents,
  parseSenooPredictionReadout, type SenooCircuitPrediction,
} from './senooCircuitPrediction';

const identityFields = ['apparatusVersion', 'protocolVersion', 'workingPoint', 'circuitId', 'circuitVersion', 'circuitSelectionRuleRef'] as const;
const referenceFields = ['ensembleRef', 'phaseReferenceRef', 'evidenceRef', 'independenceRef'] as const;
const settingKeys = ['analysisPhaseRad', 'expected', 'tolerance', 'minDenominator'] as const;
const derivedKeys = ['coherenceImag', 'overlap'] as const;
const fields = [
  'kind', 'schemaVersion', 'sourceKind', ...identityFields, ...referenceFields, 'trapWavelengthM', 'siteIds', 'modelVersion',
  'predictedAtUtc', 'holdoutSealRef', 'confidenceLevel', 'components', 'readoutCalibration', 'settings', 'derivedTolerances',
];
type Setting = typeof SENOO_BELL_SETTINGS[number];
type Status = 'pass' | 'fail' | 'inconclusive';

interface SettingPrediction {
  readonly analysisPhaseRad: number | null;
  readonly expected: number;
  readonly tolerance: number;
  readonly minDenominator: number;
}

export interface SenooBellPrediction extends Readonly<Record<typeof identityFields[number] | typeof referenceFields[number], string>> {
  readonly kind: 'senoo-bell-prediction';
  readonly schemaVersion: 1;
  readonly sourceKind: SenooCircuitPrediction['sourceKind'];
  readonly trapWavelengthM: number;
  readonly siteIds: readonly string[];
  readonly modelVersion: string;
  readonly predictedAtUtc: string;
  readonly holdoutSealRef: string | null;
  readonly confidenceLevel: number;
  readonly components: SenooCircuitPrediction['components'];
  readonly readoutCalibration: SenooCircuitPrediction['readoutCalibration'];
  readonly settings: Readonly<Record<Setting, SettingPrediction>>;
  readonly derivedTolerances: Readonly<Record<typeof derivedKeys[number], number>>;
}

export function createSenooBellPredictionTemplate() {
  return {
    kind: 'senoo-bell-prediction', schemaVersion: 1, sourceKind: null,
    ...Object.fromEntries([...identityFields, ...referenceFields].map(field => [field, null])),
    trapWavelengthM: null, siteIds: [], modelVersion: null, predictedAtUtc: null, holdoutSealRef: null, confidenceLevel: null,
    components: createSenooCircuitPredictionTemplate().components, readoutCalibration: null,
    settings: Object.fromEntries(SENOO_BELL_SETTINGS.map(setting => [setting, {
      analysisPhaseRad: SENOO_BELL_ANALYSIS_PHASE_RAD[setting], expected: null, tolerance: null, minDenominator: null,
    }])),
    derivedTolerances: { coherenceImag: null, overlap: null },
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
  if (typeof value !== 'string' || !value.trim()
    || (measured && /^(synthetic|simulation|literature|control-setpoint):/i.test(value.trim()))) {
    throw new Error(`${path} 需要可追溯的登记记录。`);
  }
  return value.trim();
}

function finiteNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} 须为适用范围内的有限数值。`);
  }
  return value;
}

function parseSetting(value: unknown, setting: Setting): SettingPrediction {
  const path = `settings.${setting}`;
  const raw = exactRecord(value, settingKeys, path);
  const analysisPhaseRad = SENOO_BELL_ANALYSIS_PHASE_RAD[setting];
  if (raw.analysisPhaseRad !== analysisPhaseRad) throw new Error(`${path}.analysisPhaseRad 与预定分析轴不一致。`);
  const minimum = setting === 'population' ? 0 : -1;
  const minDenominator = finiteNumber(raw.minDenominator, `${path}.minDenominator`, 1, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(minDenominator)) throw new Error(`${path}.minDenominator 须为正整数。`);
  return Object.freeze({
    analysisPhaseRad, minDenominator,
    expected: finiteNumber(raw.expected, `${path}.expected`, minimum, 1),
    tolerance: finiteNumber(raw.tolerance, `${path}.tolerance`, 0, 1 - minimum),
  });
}

export function parseSenooBellPrediction(text: string): SenooBellPrediction {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Bell 联合预测文件需要有效的 JSON。');
  }
  const raw = exactRecord(value, fields, 'Bell 联合预测');
  if (raw.kind !== 'senoo-bell-prediction' || raw.schemaVersion !== 1) throw new Error('请选择 Bell 联合预测 v1 JSON。');
  const { sourceKind } = raw;
  if (sourceKind !== 'synthetic' && sourceKind !== 'measured-model') throw new Error('请登记 Bell 预测的证据类型。');
  const measured = sourceKind === 'measured-model';
  const identity = Object.fromEntries(identityFields.map(field => [
    field, requiredText(raw[field], field, measured && field === 'circuitSelectionRuleRef'),
  ])) as Record<typeof identityFields[number], string>;
  const references = Object.fromEntries(referenceFields.map(field => [
    field, requiredText(raw[field], field, measured),
  ])) as Record<typeof referenceFields[number], string>;
  if (!Array.isArray(raw.siteIds) || raw.siteIds.length !== 2) throw new Error('siteIds 须按位序登记两个位点。');
  const siteIds = Object.freeze(raw.siteIds.map(id => requiredText(id, 'siteIds')));
  if (siteIds[0] === siteIds[1]) throw new Error('siteIds 中两个位点须互异。');
  const trapWavelengthM = finiteNumber(raw.trapWavelengthM, 'trapWavelengthM', Number.MIN_VALUE, Infinity);
  const confidenceLevel = finiteNumber(raw.confidenceLevel, 'confidenceLevel', 0, 1);
  if (confidenceLevel === 0 || confidenceLevel === 1) throw new Error('联合置信水平须大于 0 且小于 1。');
  const predictedAtUtc = requiredText(raw.predictedAtUtc, 'predictedAtUtc');
  const predictedTime = Date.parse(predictedAtUtc);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(predictedAtUtc) || !Number.isFinite(predictedTime)
    || new Date(predictedTime).toISOString().slice(0, 19) !== predictedAtUtc.slice(0, 19)) {
    throw new Error('predictedAtUtc 须登记有效的 UTC 预测归档时标。');
  }
  const components = parseSenooPredictionComponents(raw.components, measured);
  const readoutCalibration = parseSenooPredictionReadout(raw.readoutCalibration, measured);
  if (readoutCalibration && !components.readout.calibrationRunIds.includes(readoutCalibration.calibrationRunId)) {
    throw new Error('冻结读出须对应读出组件登记的标定运行。');
  }
  const settings = exactRecord(raw.settings, SENOO_BELL_SETTINGS, 'settings');
  const derived = exactRecord(raw.derivedTolerances, derivedKeys, 'derivedTolerances');
  return Object.freeze({
    kind: raw.kind, schemaVersion: raw.schemaVersion, sourceKind, ...identity, ...references, siteIds, trapWavelengthM,
    modelVersion: requiredText(raw.modelVersion, 'modelVersion'), predictedAtUtc, confidenceLevel, components, readoutCalibration,
    holdoutSealRef: raw.holdoutSealRef === null ? null : requiredText(raw.holdoutSealRef, 'holdoutSealRef', measured),
    settings: Object.freeze({
      population: parseSetting(settings.population, 'population'), plus: parseSetting(settings.plus, 'plus'),
      minus: parseSetting(settings.minus, 'minus'),
    }),
    derivedTolerances: Object.freeze({
      coherenceImag: finiteNumber(derived.coherenceImag, 'derivedTolerances.coherenceImag', 0, 1),
      overlap: finiteNumber(derived.overlap, 'derivedTolerances.overlap', 0, 1.5),
    }),
  });
}

type Statistics = ReturnType<typeof summarizeSenooBellObservations>;
type Interval = { value: number | null; lower: number | null; upper: number | null };

function compareInterval(expected: number, tolerance: number, observedInterval: Interval | null, eligible: boolean) {
  const observed = observedInterval?.value ?? null;
  const lower = observedInterval?.lower ?? null;
  const upper = observedInterval?.upper ?? null;
  const residualLower = lower === null ? null : lower - expected;
  const residualUpper = upper === null ? null : upper - expected;
  let status: Status = 'inconclusive';
  if (eligible && residualLower !== null && residualUpper !== null) {
    if (residualLower >= -tolerance && residualUpper <= tolerance) status = 'pass';
    if (residualUpper < -tolerance || residualLower > tolerance) status = 'fail';
  }
  return {
    expected, tolerance, observed, lower, upper, residual: observed === null ? null : observed - expected,
    residualLower, residualUpper, status,
  };
}

function point(value: number) {
  return { value, lower: value, upper: value };
}

export function compareSenooBellPrediction(
  prediction: SenooBellPrediction, observations: SenooBellObservations,
  statistics: Statistics = summarizeSenooBellObservations(observations, null, null),
) {
  const populationBatch = observations.settings.population.batch;
  const measured = prediction.sourceKind === 'measured-model';
  if (populationBatch.sourceKind !== (measured ? 'measured' : 'synthetic')) throw new Error('Bell 预测与观测的证据类型不相容。');
  const mismatch = [...identityFields, 'trapWavelengthM' as const].find(field => prediction[field] !== populationBatch[field]);
  if (mismatch) throw new Error(`Bell 预测与观测的 ${mismatch} 不一致。`);
  if (prediction.siteIds.some((id, index) => id !== populationBatch.siteIds[index])) throw new Error('Bell 预测与观测的位点顺序不一致。');
  for (const field of ['phaseReferenceRef', 'ensembleRef', 'confidenceLevel'] as const) {
    if (prediction[field] !== observations[field]) throw new Error(`Bell 预测与观测的 ${field} 不一致。`);
  }
  if (statistics.sourceKind !== populationBatch.sourceKind || statistics.confidenceLevel !== prediction.confidenceLevel
    || statistics.settings.length !== SENOO_BELL_SETTINGS.length
    || SENOO_BELL_SETTINGS.some((setting, index) => {
      const row = statistics.settings[index];
      const { batch, analysisPhaseRad } = observations.settings[setting];
      return row.setting !== setting || row.batchId !== batch.batchId || row.acquisitionRunId !== batch.acquisitionRunId
        || row.analysisPhaseRad !== analysisPhaseRad;
    })) {
    throw new Error('Bell 统计摘要与导入观测的设置或批次不一致。');
  }
  const calibrationRuns = new Set(Object.values(prediction.components).flatMap(component => component.calibrationRunIds));
  const chronology = SENOO_BELL_SETTINGS.map(setting => {
    const { batch, analysisPhaseRad } = observations.settings[setting];
    if (prediction.settings[setting].analysisPhaseRad !== analysisPhaseRad) throw new Error(`${setting} 的预测和观测分析轴不一致。`);
    if (calibrationRuns.has(batch.acquisitionRunId)) throw new Error(`${setting} 的留出运行与模型标定运行重叠。`);
    return {
      setting, acquiredAtUtc: batch.acquiredAtUtc, acquisitionRunId: batch.acquisitionRunId,
      predictedBeforeAcquisition: Date.parse(prediction.predictedAtUtc) < Date.parse(batch.acquiredAtUtc),
    };
  });
  if (measured && chronology.some(row => !row.predictedBeforeAcquisition) && !prediction.holdoutSealRef) {
    throw new Error('存在先采集的独立观测，须登记 holdoutSealRef 和开封记录。');
  }
  const readoutCalibration = prediction.readoutCalibration;
  if (readoutCalibration && statistics.settings.some(row => !matchesSenooPredictionReadout(readoutCalibration, row.readout))) {
    throw new Error('Bell 三组观测须使用预测登记的同一冻结读出规则和来源 SHA-256。');
  }
  const settings = statistics.settings.map(row => {
    const { expected, tolerance, minDenominator, analysisPhaseRad } = prediction.settings[row.setting];
    const denominator = row.metric?.denominator ?? null;
    const sufficient = denominator !== null && denominator >= minDenominator;
    return {
      setting: row.setting, analysisPhaseRad, minDenominator, sufficient, numerator: row.metric?.numerator ?? null, denominator,
      ...compareInterval(expected, tolerance, row.metric, sufficient),
    };
  });
  const [population, plus, minus] = settings;
  const [populationObservation, plusObservation, minusObservation] = statistics.settings.map(row => row.metric);
  const predictedCoherence = projectSenooBellCoherence(point(plus.expected), point(minus.expected))!;
  const predictedOverlap = projectSenooBellOverlap(point(population.expected), predictedCoherence)!;
  const coherence = projectSenooBellCoherence(plusObservation, minusObservation);
  const overlap = projectSenooBellOverlap(populationObservation, coherence);
  const phaseDenominators = { plus: plus.denominator, minus: minus.denominator };
  const phaseSufficient = plus.sufficient && minus.sufficient;
  const derived = {
    coherenceImag: {
      ...compareInterval(predictedCoherence.value, prediction.derivedTolerances.coherenceImag, coherence, phaseSufficient),
      denominators: phaseDenominators,
    },
    overlap: {
      ...compareInterval(predictedOverlap.value, prediction.derivedTolerances.overlap, overlap, phaseSufficient && population.sufficient),
      denominators: { population: population.denominator, ...phaseDenominators },
    },
  };
  const statuses = [...settings, ...Object.values(derived)].map(row => row.status);
  const status: Status = statuses.includes('fail') ? 'fail' : statuses.every(value => value === 'pass') ? 'pass' : 'inconclusive';
  return {
    status, scope: prediction.sourceKind, confidenceLevel: prediction.confidenceLevel, chronology,
    settings, derived, readoutVerified: measured && statistics.settings.every(row => row.readoutEvidence === 'criteria-met'),
  };
}
