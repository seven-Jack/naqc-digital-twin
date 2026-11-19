export interface DualExposureCounts {
  readonly first: number;
  readonly second: number;
}

export type DualExposureThresholds = DualExposureCounts;

export const READOUT_OUTCOMES = ['m0', 'm1', 'no-atom', 'ambiguous'] as const;
export type ReadoutOutcome = typeof READOUT_OUTCOMES[number];

const defaultOutcomes = { lowLow: 'no-atom', lowHigh: 'm0', highLow: 'm1', highHigh: 'ambiguous' } as const;

export function createDualExposureRule(thresholds: DualExposureThresholds) {
  if (![thresholds.first, thresholds.second].every(value => Number.isFinite(value) && value >= 0)) {
    throw new RangeError('Readout thresholds must be finite, nonnegative counts.');
  }
  return {
    id: 'dual-exposure-threshold',
    version: 1,
    mode: 'exploratory',
    thresholds: { ...thresholds },
    highComparison: 'greater-than-or-equal',
    outcomes: { ...defaultOutcomes },
  } as const;
}

export type DualExposureRule = ReturnType<typeof createDualExposureRule>;

export function classifyDualExposureBrightness(
  firstHigh: boolean, secondHigh: boolean, outcomes: DualExposureRule['outcomes'] = defaultOutcomes,
) {
  const region = `${firstHigh ? 'high' : 'low'}${secondHigh ? 'High' : 'Low'}` as const;
  return { firstHigh, secondHigh, outcome: outcomes[region] };
}

export function classifyDualExposure(counts: DualExposureCounts, rule: DualExposureRule) {
  if (![counts.first, counts.second].every(Number.isFinite)) {
    throw new RangeError('Both exposure counts must be finite.');
  }
  return classifyDualExposureBrightness(counts.first >= rule.thresholds.first, counts.second >= rule.thresholds.second, rule.outcomes);
}
