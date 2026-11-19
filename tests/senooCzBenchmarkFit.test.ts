import { describe, expect, it } from 'vitest';
import { fitSenooCzBenchmark } from '../src/physics/senooCzBenchmarkFit';
import type { SenooCzBenchmarkRateKey } from '../src/physics/senooCzBenchmarkStatistics';

const keys = ['prep', 'decay', 'loss', 'siteLoss', 'pairLoss'] as const;
type Summary = Parameters<typeof fitSenooCzBenchmark>[1];
type Counts = { hits: number; denominator: number; unresolved: number };

function summaryAt(depths: readonly number[], countsFor: (key: SenooCzBenchmarkRateKey, index: number) => Counts): Summary {
  return { rows: depths.map((depth, index) => {
    const rates = Object.fromEntries(keys.map(key => [key, countsFor(key, index)])) as Record<SenooCzBenchmarkRateKey, Counts>;
    return { depth, rates };
  }) };
}

const nonEcho = { mode: 'non-echo' } as const;

describe('Senoo CZ benchmark descriptive fits', () => {
  it('recovers each gRB asymptote and fidelity, plus independent signed loss slopes and intercepts', () => {
    const observed = {
      prep: [0.8, 0.4, 0.2, 0.1], decay: [0.6, 0.3, 0.15, 0.075], loss: [0.75, 0.5, 0.375, 0.3125],
      siteLoss: [0.3, 0.25, 0.2, 0.15], pairLoss: [0.08, 0.10, 0.12, 0.14],
    };
    const summary = summaryAt([0, 1, 2, 3], (key, index) => {
      const denominator = 400 * (index + 1);
      return { hits: Math.round(denominator * observed[key][index]), denominator, unresolved: 0 };
    });
    const fits = fitSenooCzBenchmark(nonEcho, summary);
    expect(fits.weighting).toBe('denominator');
    const amplitudes = { prep: 0.8, decay: 0.6, loss: 0.5 };
    for (const key of (['prep', 'decay', 'loss'] as const)) {
      const result = fits.grb[key];
      if (result.status !== 'fit') throw new Error(`Expected ${key} fit`);
      expect(result.asymptote).toBe(key === 'loss' ? 0.25 : 0);
      expect(result.amplitude).toBeCloseTo(amplitudes[key], 12);
      expect(result.decayPerGate).toBeCloseTo(0.5, 12);
      expect(result.fidelityPerGate).toBeCloseTo(key === 'loss' ? 0.625 : 0.5, 12);
      expect(result.weightedRms).toBeLessThan(1e-12);
      expect(result.points.every(point => Math.abs(point.residual) < 1e-12)).toBe(true);
    }
    expect(fits.loss.siteLoss).toMatchObject({ status: 'fit', intercept: expect.closeTo(0.3, 13), slopePerGate: expect.closeTo(-0.05, 13) });
    expect(fits.loss.pairLoss).toMatchObject({ status: 'fit', intercept: expect.closeTo(0.08, 13), slopePerGate: expect.closeTo(0.02, 13) });
  });

  it('uses denominator weights and returns raw signed fitted residuals', () => {
    const denominators = [100, 100, 20];
    const hits = [20, 30, 5];
    const fit = fitSenooCzBenchmark(nonEcho, summaryAt([0, 1, 2], (_key, index) => ({
      hits: hits[index], denominator: denominators[index], unresolved: 0,
    }))).loss.siteLoss;
    if (fit.status !== 'fit') throw new Error('Expected linear fit');
    expect(fit.intercept).toBeCloseTo(0.215, 13);
    expect(fit.slopePerGate).toBeCloseTo(0.055, 13);
    expect(fit.points.map(point => point.residual)).toEqual([expect.closeTo(0.015, 13), expect.closeTo(-0.03, 13), expect.closeTo(0.075, 13)]);
    expect(fit.weightedRms).toBeCloseTo(Math.sqrt((100 * 0.015 ** 2 + 100 * 0.03 ** 2 + 20 * 0.075 ** 2) / 220), 13);
  });

  it('labels sparse, unresolved, floor-only and echo cohorts without a fitted value', () => {
    const prepUnknown = summaryAt([0, 1, 2], (key, index) => ({
      hits: key === 'loss' ? 25 : 5, denominator: 100, unresolved: key === 'prep' && index === 0 ? 1 : 0,
    }));
    const result = fitSenooCzBenchmark(nonEcho, prepUnknown);
    expect(result.grb.prep).toEqual({ status: 'unavailable', reason: 'unresolved', supportedDepths: [0, 1, 2], observesZeroDepth: true });
    expect(result.grb.loss).toEqual({ status: 'unavailable', reason: 'zero-amplitude', supportedDepths: [0, 1, 2], observesZeroDepth: true });
    expect(result.grb.decay).toMatchObject({ status: 'fit', decayPerGate: 1 });
    expect(fitSenooCzBenchmark({ mode: 'echo' }, prepUnknown).loss.siteLoss).toMatchObject({ status: 'unavailable', reason: 'echo' });
    const complete = () => ({ hits: 6, denominator: 10, unresolved: 0 });
    expect(fitSenooCzBenchmark(nonEcho, summaryAt([0, 1], complete)).grb.prep).toMatchObject({ reason: 'insufficient-depths' });
    const floorAtPositiveDepths = summaryAt([1, 2, 3], () => ({ hits: 25, denominator: 100, unresolved: 0 }));
    expect(fitSenooCzBenchmark(nonEcho, floorAtPositiveDepths).grb.loss).toMatchObject({ reason: 'zero-amplitude', observesZeroDepth: false });
  });

  it('resolves nontrivial decay near one for deep circuits without rounding away the per-CZ log survival', () => {
    const depth = 2 ** 51;
    const hits = [80, 40, 20];
    const result = fitSenooCzBenchmark(nonEcho, summaryAt([0, depth, 2 * depth], (_key, index) => ({
      hits: hits[index], denominator: 100, unresolved: 0,
    }))).grb.prep;
    if (result.status !== 'fit' || result.logDecayPerGate === null) throw new Error('Expected nonzero decay');
    expect(Math.exp(result.logDecayPerGate * depth)).toBeCloseTo(0.5, 12);
    expect(result.weightedRms).toBeLessThan(1e-12);
  });

  it('fits three positive depths and labels depth-zero extrapolation', () => {
    const observations = [0.4, 0.2, 0.1];
    const summary = summaryAt([1, 2, 3], (key, index) => ({
      denominator: 100, hits: key === 'siteLoss' ? 10 + 5 * index : Math.round(100 * observations[index]), unresolved: 0,
    }));
    const fit = fitSenooCzBenchmark(nonEcho, summary);
    expect(fit.grb.prep).toMatchObject({
      status: 'fit', observesZeroDepth: false, supportedDepths: [1, 2, 3],
      amplitude: expect.closeTo(0.8, 12), decayPerGate: expect.closeTo(0.5, 12),
    });
    expect(fit.loss.siteLoss).toMatchObject({
      status: 'fit', observesZeroDepth: false, slopePerGate: expect.closeTo(0.05, 12), intercept: expect.closeTo(0.05, 12),
    });

    const offset = 2 ** 52;
    const adjacent = summaryAt([offset, offset + 1, offset + 2], (_key, index) => ({
      hits: 10 + 5 * index, denominator: 100, unresolved: 0,
    }));
    expect(fitSenooCzBenchmark(nonEcho, adjacent).loss.siteLoss).toMatchObject({
      status: 'fit', observesZeroDepth: false, slopePerGate: expect.closeTo(0.05, 12), weightedRms: expect.closeTo(0, 12),
    });
  });
});
