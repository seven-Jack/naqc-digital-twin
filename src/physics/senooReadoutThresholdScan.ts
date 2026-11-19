import type { SenooMeasuredCandidate } from './senooMeasuredReadout';

const groups = ['m1', 'm0', 'empty_control'] as const;
type PreparedGroup = typeof groups[number];
type Comparison = SenooMeasuredCandidate['firstComparison'];

interface ThresholdRange {
  readonly min: number;
  readonly max: number;
}

export interface SenooReadoutScanSample {
  readonly preparedGroup: PreparedGroup;
  readonly first: number;
  readonly second: number;
}

export interface SenooReadoutScanOptions {
  readonly firstRange: ThresholdRange;
  readonly secondRange: ThresholdRange;
  readonly firstComparison: Comparison;
  readonly secondComparison: Comparison;
  readonly rankBy: 'total-errors' | 'worst-group-error';
}

export interface SenooReadoutThresholdBin {
  readonly lower: number;
  readonly upper: number;
  readonly lowerInclusive: boolean;
  readonly upperInclusive: boolean;
  readonly threshold: number;
}

export interface SenooReadoutScanGroup {
  readonly denominator: number;
  readonly wrong: number;
  readonly loss: number;
  readonly ambiguous: number;
}

export interface SenooReadoutScanRow {
  readonly candidate: SenooMeasuredCandidate;
  readonly groups: Readonly<Record<PreparedGroup, SenooReadoutScanGroup>>;
  readonly totalErrors: number;
  readonly worstGroupError: number;
}

export interface SenooReadoutScanResult {
  readonly options: SenooReadoutScanOptions;
  readonly testedPairs: number;
  readonly firstAxis: readonly SenooReadoutThresholdBin[];
  readonly secondAxis: readonly SenooReadoutThresholdBin[];
  readonly rows: readonly SenooReadoutScanRow[];
}

export const SENOO_READOUT_SCAN_MAX_CELLS = 1_000_000;
const maxRankedRows = 12;

function validateRange(range: ThresholdRange) {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    throw new Error('阈值区间需要有限的最小值与最大值，且最小值不能大于最大值。');
  }
}

function representatives(values: ReadonlySet<number>, range: ThresholdRange, comparison: Comparison) {
  const valuesInRange = [...values].filter(value => comparison === 'ge'
    ? value >= range.min && value < range.max
    : value > range.min && value <= range.max);
  valuesInRange.sort((left, right) => left - right);
  if (comparison === 'ge') valuesInRange.push(range.max);
  else valuesInRange.unshift(range.min);
  return valuesInRange;
}

function makeAxis(thresholds: readonly number[], range: ThresholdRange, comparison: Comparison): SenooReadoutThresholdBin[] {
  return thresholds.map((threshold, index) => comparison === 'ge' ? {
    lower: index === 0 ? range.min : thresholds[index - 1], upper: threshold,
    lowerInclusive: index === 0, upperInclusive: true, threshold,
  } : {
    lower: threshold, upper: thresholds[index + 1] ?? range.max,
    lowerInclusive: true, upperInclusive: index === thresholds.length - 1, threshold,
  });
}

function brightPrefixLength(thresholds: readonly number[], value: number, comparison: Comparison) {
  let lower = 0;
  let upper = thresholds.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const high = comparison === 'ge' ? value >= thresholds[middle] : value > thresholds[middle];
    if (high) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

function accumulateSuffix(counts: Uint32Array, height: number, width: number) {
  for (let row = height - 1; row >= 0; row--) {
    const rowOffset = row * width;
    let rowTotal = 0;
    for (let column = width - 1; column >= 0; column--) {
      const position = rowOffset + column;
      rowTotal += counts[position];
      counts[position] = rowTotal + (row + 1 < height ? counts[position + width] : 0);
    }
  }
}

function outcomesAt(counts: Uint32Array, firstHigh: number, secondHigh: number, bothHigh: number) {
  const ambiguous = counts[bothHigh];
  const firstOnly = counts[firstHigh] - ambiguous;
  const secondOnly = counts[secondHigh] - ambiguous;
  const dark = counts[0] - firstOnly - secondOnly - ambiguous;
  return { denominator: counts[0], firstOnly, secondOnly, dark, ambiguous };
}

interface RankedPair {
  readonly firstIndex: number;
  readonly secondIndex: number;
  readonly totalErrors: number;
  readonly worstGroupError: number;
}

/** Each cell represents one uniform decision interval pair on the calibration samples. */
export function scanDualExposureCalibrationThresholds(
  samples: readonly SenooReadoutScanSample[], options: SenooReadoutScanOptions,
): SenooReadoutScanResult {
  const { firstRange, secondRange, firstComparison, secondComparison, rankBy } = options;
  validateRange(firstRange);
  validateRange(secondRange);
  if ((firstComparison !== 'ge' && firstComparison !== 'gt') || (secondComparison !== 'ge' && secondComparison !== 'gt')
      || (rankBy !== 'total-errors' && rankBy !== 'worst-group-error')) {
    throw new Error('请选择两帧的等号规则与扫描排序方式。');
  }

  const totals = { m1: 0, m0: 0, empty_control: 0 };
  const firstValues = new Set<number>();
  const secondValues = new Set<number>();
  for (const { first, second, preparedGroup } of samples) {
    if (!Number.isFinite(first) || !Number.isFinite(second) || !groups.includes(preparedGroup)) {
      throw new Error('标定扫描只接收已知制备组且两帧计数均有限的配对。');
    }
    totals[preparedGroup]++;
    firstValues.add(first);
    secondValues.add(second);
  }
  if (groups.some(group => totals[group] === 0)) throw new Error('标定扫描需要 m₁、m₀ 和空位三组各有可评估的配对。');

  const firstThresholds = representatives(firstValues, firstRange, firstComparison);
  const secondThresholds = representatives(secondValues, secondRange, secondComparison);
  const testedPairs = firstThresholds.length * secondThresholds.length;
  if (testedPairs > SENOO_READOUT_SCAN_MAX_CELLS) {
    throw new Error(`候选区间组合超过 ${SENOO_READOUT_SCAN_MAX_CELLS} 组，请缩小一帧或两帧的扫描范围。`);
  }
  const height = firstThresholds.length + 1;
  const width = secondThresholds.length + 1;
  const grids = { m1: new Uint32Array(height * width), m0: new Uint32Array(height * width), empty_control: new Uint32Array(height * width) };
  // Bright candidates form a prefix along each axis. Bucket by the two prefix lengths.
  for (const { first, second, preparedGroup } of samples) {
    const row = brightPrefixLength(firstThresholds, first, firstComparison);
    const column = brightPrefixLength(secondThresholds, second, secondComparison);
    grids[preparedGroup][row * width + column]++;
  }
  for (const group of groups) accumulateSuffix(grids[group], height, width);

  const compare = (left: RankedPair, right: RankedPair) => (rankBy === 'total-errors'
    ? left.totalErrors - right.totalErrors || left.worstGroupError - right.worstGroupError
    : left.worstGroupError - right.worstGroupError || left.totalErrors - right.totalErrors)
    || left.firstIndex - right.firstIndex || left.secondIndex - right.secondIndex;
  const ranked: RankedPair[] = [];
  const { m1, m0, empty_control: empty } = grids;
  for (let firstIndex = 0; firstIndex < firstThresholds.length; firstIndex++) {
    // The zero bucket on the unused axis includes all observations.
    const firstHigh = (firstIndex + 1) * width;
    for (let secondIndex = 0; secondIndex < secondThresholds.length; secondIndex++) {
      const secondHigh = secondIndex + 1;
      const bothHigh = firstHigh + secondHigh;
      const m1Errors = totals.m1 - (m1[firstHigh] - m1[bothHigh]);
      const m0Errors = totals.m0 - (m0[secondHigh] - m0[bothHigh]);
      const emptyErrors = empty[firstHigh] + empty[secondHigh] - empty[bothHigh];
      const pair: RankedPair = {
        firstIndex, secondIndex, totalErrors: m1Errors + m0Errors + emptyErrors,
        worstGroupError: Math.max(m1Errors / totals.m1, m0Errors / totals.m0, emptyErrors / totals.empty_control),
      };
      if (ranked.length === maxRankedRows && compare(pair, ranked[maxRankedRows - 1]) >= 0) continue;
      const index = ranked.findIndex(previous => compare(pair, previous) < 0);
      if (index < 0) ranked.push(pair);
      else ranked.splice(index, 0, pair);
      if (ranked.length > maxRankedRows) ranked.pop();
    }
  }

  const rows = ranked.map(({ firstIndex, secondIndex, totalErrors, worstGroupError }): SenooReadoutScanRow => {
    const firstHigh = (firstIndex + 1) * width;
    const secondHigh = secondIndex + 1;
    const bothHigh = firstHigh + secondHigh;
    const firstState = outcomesAt(m1, firstHigh, secondHigh, bothHigh);
    const secondState = outcomesAt(m0, firstHigh, secondHigh, bothHigh);
    const vacant = outcomesAt(empty, firstHigh, secondHigh, bothHigh);
    return {
      candidate: { first: firstThresholds[firstIndex], second: secondThresholds[secondIndex], firstComparison, secondComparison },
      groups: {
        m1: { denominator: firstState.denominator, wrong: firstState.secondOnly, loss: firstState.dark, ambiguous: firstState.ambiguous },
        m0: { denominator: secondState.denominator, wrong: secondState.firstOnly, loss: secondState.dark, ambiguous: secondState.ambiguous },
        empty_control: { denominator: vacant.denominator, wrong: vacant.firstOnly + vacant.secondOnly, loss: 0, ambiguous: vacant.ambiguous },
      },
      totalErrors, worstGroupError,
    };
  });
  return {
    options: { ...options, firstRange: { ...firstRange }, secondRange: { ...secondRange } }, testedPairs,
    firstAxis: makeAxis(firstThresholds, firstRange, firstComparison), secondAxis: makeAxis(secondThresholds, secondRange, secondComparison), rows,
  };
}
