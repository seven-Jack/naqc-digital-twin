import type { SenooCzDynamicsResult } from './senooCzDynamics';
import {
  SENOO_CZ_RESPONSE_INPUTS, SENOO_CZ_RESPONSE_OUTCOMES,
  type SenooCzResponse, type SenooCzResponseOutcome,
} from './senooCzResponse';
import type { SenooCzWaveform } from './senooCzWaveform';

type Interval = readonly [number, number];
type OutcomeCounts = Record<SenooCzResponseOutcome, number>;
type Relation = 'below' | 'inside' | 'above' | 'unavailable';
type PhaseStatus = 'comparable' | 'missing-response' | 'missing-model' | 'incompatible-reference';

const identityFields = ['apparatusVersion', 'gateVersion', 'workingPoint'] as const;
const unresolvedOutcomes = ['first-site-loss', 'second-site-loss', 'pair-loss', 'ambiguous', 'unavailable'] as const;
const probabilityTailCount = SENOO_CZ_RESPONSE_INPUTS.length * 2 * 2;

export function matchSenooCzResponseWaveform(response: SenooCzResponse, waveform: SenooCzWaveform, waveformSha256: string | null) {
  const digest = waveformSha256?.trim().toLowerCase();
  if (!digest || !/^[a-f0-9]{64}$/.test(digest) || response.waveformSha256.trim().toLowerCase() !== digest) {
    throw new Error('门响应关联的 waveformSha256 与当前波形文件不一致。');
  }
  if (response.sourceKind === 'measured' && waveform.sourceKind !== 'measured') {
    throw new Error('实测门响应需关联实测波形。');
  }
  const mismatch = identityFields.find(field => response[field] !== waveform[field]);
  if (mismatch) throw new Error(`门响应与波形的 ${mismatch} 不一致。`);
  if (!response.siteIds.every((id, index) => id === waveform.siteIds?.[index])) {
    throw new Error('门响应与波形的 siteIds 及位点顺序不一致。');
  }
  const runId = waveform.acquisitionRunId;
  if (!runId || runId === response.acquisitionRunId) {
    throw new Error('独立门响应与波形需登记不同的 acquisitionRunId。');
  }
  return runId;
}

function probabilityComparison(hits: number, denominator: number, unresolved: number, radius: number, predicted: number) {
  // Propagation can put the computed probability just beyond 1 by roundoff.
  const model = Math.min(predicted, 1);
  const observed = denominator === 0 ? null : hits / denominator;
  const identification: Interval | null = observed === null ? null : [observed, (hits + unresolved) / denominator];
  const interval: Interval | null = identification === null ? null
    : [Math.max(0, identification[0] - radius), Math.min(1, identification[1] + radius)];
  const residual: Interval | null = interval === null ? null : [interval[0] - model, interval[1] - model];
  const relation: Relation = interval === null ? 'unavailable' : interval[1] < model ? 'below' : interval[0] > model ? 'above' : 'inside';
  return { hits, denominator, observed, identification, interval, model, residual, relation };
}

function principalAngle(radians: number) {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

function circularInterval(center: number, halfWidth: number): readonly Interval[] {
  const pi = Math.PI;
  if (halfWidth >= pi) return [[-pi, pi]];
  const lower = center - halfWidth;
  const upper = center + halfWidth;
  if (lower < -pi) return [[-pi, upper], [lower + 2 * pi, pi]];
  if (upper > pi) return [[-pi, upper - 2 * pi], [lower, pi]];
  return [[lower, upper]];
}

function phaseComparison(response: SenooCzResponse, waveform: SenooCzWaveform, modelRad: number | null) {
  const phase = response.phase;
  const base = {
    modelRad, estimateRad: phase?.estimateRad ?? null,
    halfWidthRad: phase?.halfWidthRad ?? null, confidenceLevel: phase?.confidenceLevel ?? null,
  };
  let status: PhaseStatus = 'comparable';
  let residualRad: number | null = null;
  let residualIntervalsRad: readonly Interval[] | null = null;
  if (phase === null) status = 'missing-response';
  else if (modelRad === null) status = 'missing-model';
  else if (phase.phaseReference !== waveform.phaseReference) status = 'incompatible-reference';
  else {
    residualRad = principalAngle(principalAngle(phase.estimateRad) - principalAngle(modelRad));
    residualIntervalsRad = circularInterval(residualRad, phase.halfWidthRad);
  }
  return { ...base, status, residualRad, residualIntervalsRad };
}

export function compareSenooCzResponse(
  response: SenooCzResponse, waveform: SenooCzWaveform, waveformSha256: string | null, prediction: SenooCzDynamicsResult,
) {
  const waveformRunId = matchSenooCzResponseWaveform(response, waveform, waveformSha256);
  const groups = new Map(SENOO_CZ_RESPONSE_INPUTS.map(input => [input, {
    started: 0, rejected: 0, counts: Object.fromEntries(SENOO_CZ_RESPONSE_OUTCOMES.map(outcome => [outcome, 0])) as OutcomeCounts,
  }]));
  for (const attempt of response.attempts) {
    const group = groups.get(attempt.input)!;
    group.started++;
    if (attempt.prep === 'rejected') group.rejected++;
    else if (attempt.outcome !== null) group.counts[attempt.outcome]++;
    else throw new Error('制备通过的尝试缺少门响应分类。');
  }

  // Eight probabilities use two one-sided Hoeffding bounds each. The upper bound
  // treats every unresolved detector outcome as a possible hit for that metric.
  const logTailCorrection = Math.log(probabilityTailCount) - Math.log1p(-response.confidenceLevel);
  const rows = SENOO_CZ_RESPONSE_INPUTS.map(input => {
    const { started, rejected, counts } = groups.get(input)!;
    const model = prediction.inputs.find(value => value.input === input);
    if (!model) throw new Error(`相干预测缺少 ${input} 输入。`);
    const accepted = started - rejected;
    const unresolved = unresolvedOutcomes.reduce((total, outcome) => total + counts[outcome], 0);
    const radius = accepted === 0 ? 0 : Math.sqrt(logTailCorrection / (2 * accepted));
    return {
      input, started, rejected, accepted, counts, unresolved,
      return: probabilityComparison(counts.returned, accepted, unresolved, radius, model.logicalReturnProbability),
      rydbergLeakage: probabilityComparison(counts.rydberg, accepted, unresolved, radius, model.rydbergLeakageProbability),
    };
  });
  return {
    scope: response.sourceKind, responseRunId: response.acquisitionRunId, waveformRunId, confidenceLevel: response.confidenceLevel, rows,
    phase: phaseComparison(response, waveform, prediction.conditionalPhaseRad),
  };
}

export type SenooCzResponseComparison = ReturnType<typeof compareSenooCzResponse>;
