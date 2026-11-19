import { parseSenooCircuitBatch, type SenooCircuitBatch } from './senooCircuitBatch';
import { assessSenooCircuitReadoutEvidence } from './senooCircuitReadoutEvidence';
import {
  acquiredSenooFrameRefs, type SenooFrozenMeasuredReadout, type SenooMeasuredVerificationReport,
} from './senooMeasuredReadout';

export const SENOO_BELL_SETTINGS = ['population', 'plus', 'minus'] as const;
export const SENOO_BELL_ANALYSIS_PHASE_RAD = { population: null, plus: Math.PI / 4, minus: -Math.PI / 4 } as const;
const settingNames = SENOO_BELL_SETTINGS;
const phases = SENOO_BELL_ANALYSIS_PHASE_RAD;
type SettingName = typeof settingNames[number];
const matchingFields = [
  'sourceKind', 'isotope', 'trapWavelengthM', 'apparatusVersion', 'protocolVersion', 'workingPoint',
  'cameraConfigRef', 'roiMapVersion', 'countProcessingRef', 'outcomePolicy', 'screeningRuleRef',
  'circuitSelectionRuleRef', 'countUnit', 'circuitId', 'circuitVersion',
] as const;

type ObservationSetting = { readonly analysisPhaseRad: number | null; readonly batch: SenooCircuitBatch };

export interface SenooBellObservations {
  readonly kind: 'senoo-bell-observations';
  readonly schemaVersion: 1;
  readonly ensembleRef: string;
  readonly phaseReferenceRef: string;
  readonly independenceRef: string;
  readonly confidenceLevel: number;
  readonly settings: Readonly<Record<SettingName, ObservationSetting>>;
}

interface BellMetric {
  numerator: number;
  denominator: number;
  value: number | null;
  lower: number | null;
  upper: number | null;
}

export function createSenooBellObservationTemplate() {
  const setting = (analysisPhaseRad: number | null) => ({ analysisPhaseRad, batch: null });
  return {
    kind: 'senoo-bell-observations', schemaVersion: 1,
    ensembleRef: null, phaseReferenceRef: null, independenceRef: null, confidenceLevel: null,
    settings: {
      population: setting(phases.population), plus: setting(phases.plus), minus: setting(phases.minus),
    },
  } as const;
}

function exactRecord(value: unknown, fields: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
    || fields.some(field => !Object.hasOwn(value, field))) {
    throw new Error(`${path} 字段缺失或含额外字段。`);
  }
  return value as Record<string, unknown>;
}

function provenance(value: unknown, path: string, measured: boolean) {
  if (typeof value !== 'string' || !value.trim()
    || (measured && /^(synthetic|control-setpoint|literature|simulation):/i.test(value.trim()))) {
    throw new Error(`${path} 须填写对应的原始记录引用。`);
  }
  return value.trim();
}

function parseSetting(value: unknown, name: SettingName): ObservationSetting {
  const path = `settings.${name}`;
  const raw = exactRecord(value, ['analysisPhaseRad', 'batch'], path);
  if (raw.analysisPhaseRad !== phases[name]) {
    throw new Error(`${path}.analysisPhaseRad 须使用模板中预定的相位。`);
  }
  const batch = parseSenooCircuitBatch(JSON.stringify(raw.batch));
  const expectedBasis = name === 'population' ? 'ZZ' : 'XX';
  if (batch.basis !== expectedBasis || batch.siteIds.length !== 2) {
    throw new Error(`${path}.batch 须为按原位序登记的双位点 ${expectedBasis} 批次。`);
  }
  return { analysisPhaseRad: phases[name], batch };
}

function checkCommonConditions(settings: SenooBellObservations['settings']) {
  const reference = settings.population.batch;
  const batchKeys = new Set<string>();
  const attemptKeys = new Set<string>();
  const attemptRefs = new Set<string>();
  const frameRefs = new Set<string>();
  for (const name of settingNames) {
    const { batch } = settings[name];
    const mismatch = matchingFields.find(field => batch[field] !== reference[field]);
    if (mismatch) throw new Error(`settings.${name}.batch 的 ${mismatch} 与布居批次不一致。`);
    if (reference.siteIds.some((site, index) => batch.siteIds[index] !== site)) {
      throw new Error(`settings.${name}.batch 的位点顺序与布居批次不一致。`);
    }
    const batchKey = JSON.stringify([batch.acquisitionRunId, batch.batchId]);
    if (batchKeys.has(batchKey)) throw new Error('不同 Bell 测量设置共用采集运行与批次标识。');
    batchKeys.add(batchKey);
    for (const attempt of batch.attempts) {
      const attemptKey = JSON.stringify([batch.acquisitionRunId, attempt.attemptId]);
      if (attemptKeys.has(attemptKey)) throw new Error(`同一采集运行的尝试 ${attempt.attemptId} 出现在多个 Bell 设置。`);
      attemptKeys.add(attemptKey);
    }

    const attempts = new Set(batch.attempts.map(attempt => attempt.sourceRef));
    const frames = new Set(batch.attempts.flatMap(attempt => attempt.sites.flatMap(site => acquiredSenooFrameRefs(site.frames))));
    if ([...attempts].some(ref => attemptRefs.has(ref))) throw new Error('不同 Bell 测量批次共用原始尝试记录引用。');
    if ([...frames].some(ref => frameRefs.has(ref))) throw new Error('不同 Bell 测量批次共用原始帧引用。');
    for (const ref of attempts) attemptRefs.add(ref);
    for (const ref of frames) frameRefs.add(ref);
  }
}

export function parseSenooBellObservations(text: string): SenooBellObservations {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Bell 观测文件中的 JSON 无效。');
  }
  const raw = exactRecord(value, [
    'kind', 'schemaVersion', 'ensembleRef', 'phaseReferenceRef', 'independenceRef', 'confidenceLevel', 'settings',
  ], 'Bell 观测');
  if (raw.kind !== 'senoo-bell-observations' || raw.schemaVersion !== 1) {
    throw new Error('请选择 Senoo Bell 观测 v1 JSON。');
  }
  const { confidenceLevel } = raw;
  if (typeof confidenceLevel !== 'number' || !(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error('联合置信水平须大于 0 且小于 1。');
  }
  const input = exactRecord(raw.settings, settingNames, 'settings');
  const settings = {
    population: parseSetting(input.population, 'population'),
    plus: parseSetting(input.plus, 'plus'),
    minus: parseSetting(input.minus, 'minus'),
  };
  checkCommonConditions(settings);
  const measured = settings.population.batch.sourceKind === 'measured';
  return {
    kind: raw.kind, schemaVersion: raw.schemaVersion, confidenceLevel, settings,
    ensembleRef: provenance(raw.ensembleRef, 'ensembleRef', measured),
    phaseReferenceRef: provenance(raw.phaseReferenceRef, 'phaseReferenceRef', measured),
    independenceRef: provenance(raw.independenceRef, 'independenceRef', measured),
  };
}

function boundedMean(numerator: number, denominator: number, minimum: number, confidenceLevel: number): BellMetric {
  if (!denominator) return { numerator, denominator, value: null, lower: null, upper: null };
  const value = numerator / denominator;
  const width = 1 - minimum;
  const margin = width * Math.sqrt(Math.log(2 * settingNames.length / (1 - confidenceLevel)) / (2 * denominator));
  return { numerator, denominator, value, lower: Math.max(minimum, value - margin), upper: Math.min(1, value + margin) };
}

type Estimate = { value: number; lower: number; upper: number };
type EstimateInput = { [K in keyof Estimate]: Estimate[K] | null } | null;

function hasBounds(metric: EstimateInput): metric is Estimate {
  return metric !== null && metric.value !== null && metric.lower !== null && metric.upper !== null;
}

export function projectSenooBellCoherence(plus: EstimateInput, minus: EstimateInput): Estimate | null {
  if (!hasBounds(plus) || !hasBounds(minus)) return null;
  // E(phi) = 2 Re[rho00,11 exp(2 i phi) + rho01,10]. At ±pi/4 the odd-subspace term cancels.
  return {
    value: (minus.value - plus.value) / 4,
    lower: (minus.lower - plus.upper) / 4,
    upper: (minus.upper - plus.lower) / 4,
  };
}

export function projectSenooBellOverlap(population: EstimateInput, coherence: Estimate | null): Estimate | null {
  if (!hasBounds(population) || !coherence) return null;
  return {
    value: population.value / 2 + coherence.value,
    lower: population.lower / 2 + coherence.lower,
    upper: population.upper / 2 + coherence.upper,
  };
}

export function summarizeSenooBellObservations(
  observations: SenooBellObservations,
  explicitRule: SenooFrozenMeasuredReadout | null,
  verification: SenooMeasuredVerificationReport | null,
) {
  const { confidenceLevel } = observations;
  const settings = settingNames.map(setting => {
    const { analysisPhaseRad, batch } = observations.settings[setting];
    const { stats, evidence: readoutEvidence, issue } = assessSenooCircuitReadoutEvidence(batch, explicitRule, verification);
    const parity = stats.metrics.parity;
    const metric = !parity ? null : setting === 'population'
      ? boundedMean(stats.selectedBitstrings.filter(entry => entry.bitstring === '00' || entry.bitstring === '11')
        .reduce((sum, entry) => sum + entry.count, 0), parity.denominator, 0, confidenceLevel)
      : boundedMean(parity.numerator, parity.denominator, -1, confidenceLevel);
    return { setting, analysisPhaseRad, batchId: batch.batchId, acquisitionRunId: batch.acquisitionRunId,
      counts: stats.counts, metric, readout: stats.readout, readoutEvidence, issue };
  });
  const [{ metric: population }, { metric: plus }, { metric: minus }] = settings;
  const coherence = projectSenooBellCoherence(plus, minus);
  const overlap = projectSenooBellOverlap(population, coherence);
  const estimate = hasBounds(population) && coherence && overlap ? {
    population: population.value, coherenceImag: coherence.value, overlap: overlap.value,
    lower: overlap.lower, upper: overlap.upper,
  } : null;
  return { sourceKind: observations.settings.population.batch.sourceKind, confidenceLevel, settings, estimate };
}
