import type { SenooCzBenchmark } from './senooCzBenchmark';
import type { SenooCzBenchmarkRate, SenooCzBenchmarkRateKey } from './senooCzBenchmarkStatistics';

type FitRate = Pick<SenooCzBenchmarkRate, 'hits' | 'denominator' | 'unresolved'>;
type FitSummary = {
  readonly rows: readonly { readonly depth: number; readonly rates: Readonly<Record<SenooCzBenchmarkRateKey, FitRate>> }[];
};

interface FitPoint {
  readonly depth: number;
  readonly hits: number;
  readonly denominator: number;
  readonly observed: number;
}

type UnavailableFit = {
  readonly status: 'unavailable';
  readonly reason: 'echo' | 'unresolved' | 'insufficient-depths' | 'zero-amplitude';
  readonly supportedDepths: readonly number[];
  readonly observesZeroDepth: boolean;
};

function preparePoints(mode: SenooCzBenchmark['mode'], summary: FitSummary, key: SenooCzBenchmarkRateKey) {
  const rows = summary.rows.filter(row => row.rates[key].denominator > 0);
  const supportedDepths = rows.map(row => row.depth);
  const observesZeroDepth = supportedDepths.includes(0);
  const unavailable = (reason: UnavailableFit['reason']): UnavailableFit => ({ status: 'unavailable', reason, supportedDepths, observesZeroDepth });
  if (mode === 'echo') return unavailable('echo');
  if (rows.some(row => row.rates[key].unresolved > 0)) return unavailable('unresolved');
  if (new Set(supportedDepths).size < 3) return unavailable('insufficient-depths');
  const points = rows.map(({ depth, rates }) => {
    const { hits, denominator } = rates[key];
    return { depth, hits, denominator, observed: hits / denominator };
  });
  return { status: 'ready' as const, points, supportedDepths, observesZeroDepth };
}

function diagnostics(points: readonly FitPoint[], prediction: (depth: number) => number) {
  let weightedSquares = 0;
  let weight = 0;
  const compared = points.map(point => {
    const predicted = prediction(point.depth);
    const residual = predicted - point.observed;
    weight += point.denominator;
    weightedSquares += point.denominator * residual ** 2;
    return { ...point, predicted, residual };
  });
  return { weightedRms: Math.sqrt(weightedSquares / weight), points: compared };
}

function exponentialFit(points: readonly FitPoint[], asymptote: number) {
  const greatestDepth = points.reduce((maximum, point) => Math.max(maximum, point.depth), 0);
  const firstPositiveDepth = points.reduce((minimum, point) => point.depth > 0 ? Math.min(minimum, point.depth) : minimum, Infinity);
  const basis = (rate: number, depth: number) => depth === 0 ? 1 : Math.exp(-rate * (depth / greatestDepth));
  function profile(rate: number) {
    let weightedDot = 0;
    let weightedNorm = 0;
    for (const point of points) {
      const value = basis(rate, point.depth);
      weightedDot += point.denominator * value * (point.observed - asymptote);
      weightedNorm += point.denominator * value ** 2;
    }
    // At p = 0, positive depths alone constrain the curve to its asymptote regardless of amplitude.
    const amplitude = weightedNorm === 0 ? 0 : Math.min(1 - asymptote, Math.max(0, weightedDot / weightedNorm));
    const error = points.reduce((sum, point) =>
      sum + point.denominator * (amplitude * basis(rate, point.depth) + asymptote - point.observed) ** 2, 0);
    return { rate, amplitude, error };
  }

  // Profile the amplitude analytically. A logarithmic grid over the decay at the
  // largest depth resolves rates near p = 1 even when the available depths span many scales.
  const lastRate = 40 * greatestDepth / firstPositiveDepth;
  const grid = [0];
  for (let rate = Number.EPSILON; rate < lastRate; rate *= 1.25) grid.push(rate);
  grid.push(lastRate);
  let bestIndex = 0;
  let best = profile(0);
  for (let index = 1; index < grid.length; index++) {
    const candidate = profile(grid[index]);
    if (candidate.error < best.error) {
      best = candidate;
      bestIndex = index;
    }
  }

  let lower = grid[Math.max(0, bestIndex - 1)];
  let upper = grid[Math.min(grid.length - 1, bestIndex + 1)];
  const golden = (Math.sqrt(5) - 1) / 2;
  let left = profile(upper - golden * (upper - lower));
  let right = profile(lower + golden * (upper - lower));
  for (let step = 0; step < 56; step++) {
    if (left.error < best.error) best = left;
    if (right.error < best.error) best = right;
    if (left.error <= right.error) {
      upper = right.rate;
      right = left;
      left = profile(upper - golden * (upper - lower));
    } else {
      lower = left.rate;
      left = right;
      right = profile(lower + golden * (upper - lower));
    }
  }

  const boundary = profile(Infinity);
  if (boundary.error < best.error) best = boundary;
  const logDecay = -best.rate / greatestDepth;
  return {
    amplitude: best.amplitude,
    decayPerGate: Math.exp(logDecay),
    logDecayPerGate: Number.isFinite(logDecay) ? logDecay : null,
    fidelityPerGate: 1 + (1 - asymptote) * Math.expm1(logDecay),
    ...diagnostics(points, depth => best.amplitude * basis(best.rate, depth) + asymptote),
  };
}

function fitGrb(mode: SenooCzBenchmark['mode'], summary: FitSummary, key: 'prep' | 'decay' | 'loss', asymptote: number) {
  const prepared = preparePoints(mode, summary, key);
  if (prepared.status === 'unavailable') return prepared;
  const { points, supportedDepths, observesZeroDepth } = prepared;
  const fit = exponentialFit(points, asymptote);
  if (fit.amplitude === 0) {
    return { status: 'unavailable' as const, reason: 'zero-amplitude' as const, supportedDepths, observesZeroDepth };
  }
  return { status: 'fit' as const, asymptote, supportedDepths, observesZeroDepth, ...fit };
}

function fitLoss(mode: SenooCzBenchmark['mode'], summary: FitSummary, key: 'siteLoss' | 'pairLoss') {
  const prepared = preparePoints(mode, summary, key);
  if (prepared.status === 'unavailable') return prepared;
  const { points, supportedDepths, observesZeroDepth } = prepared;
  const firstDepth = supportedDepths.reduce((minimum, depth) => Math.min(minimum, depth), Infinity);
  const greatestDepth = supportedDepths.reduce((maximum, depth) => Math.max(maximum, depth), 0);
  const span = greatestDepth - firstDepth;
  const normalized = (depth: number) => (depth - firstDepth) / span;
  let weight = 0;
  let totalDepth = 0;
  let totalObserved = 0;
  for (const point of points) {
    weight += point.denominator;
    totalDepth += point.denominator * normalized(point.depth);
    totalObserved += point.denominator * point.observed;
  }
  const meanDepth = totalDepth / weight;
  const meanObserved = totalObserved / weight;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    const delta = normalized(point.depth) - meanDepth;
    covariance += point.denominator * delta * (point.observed - meanObserved);
    variance += point.denominator * delta ** 2;
  }
  const scaledSlope = covariance / variance;
  const slopePerGate = scaledSlope / span;
  const atFirstDepth = meanObserved - scaledSlope * meanDepth;
  const intercept = atFirstDepth - slopePerGate * firstDepth;
  return { status: 'fit' as const, intercept, slopePerGate, supportedDepths, observesZeroDepth,
    ...diagnostics(points, depth => atFirstDepth + scaledSlope * normalized(depth)) };
}

/** Descriptive independent-batch fits. Point intervals are computed separately from fitted curves. */
export function fitSenooCzBenchmark(batch: Pick<SenooCzBenchmark, 'mode'>, summary: FitSummary) {
  const { mode } = batch;
  return {
    weighting: 'denominator' as const,
    grb: {
      prep: fitGrb(mode, summary, 'prep', 0),
      decay: fitGrb(mode, summary, 'decay', 0),
      loss: fitGrb(mode, summary, 'loss', 1 / 4),
    },
    loss: { siteLoss: fitLoss(mode, summary, 'siteLoss'), pairLoss: fitLoss(mode, summary, 'pairLoss') },
  };
}

export type SenooCzBenchmarkFit = ReturnType<typeof fitSenooCzBenchmark>;
