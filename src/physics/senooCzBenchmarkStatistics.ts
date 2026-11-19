import { SENOO_CZ_BENCHMARK_MASKS, type SenooCzBenchmark } from './senooCzBenchmark';

export const SENOO_CZ_BENCHMARK_RATE_KEYS = [...SENOO_CZ_BENCHMARK_MASKS, 'siteLoss', 'pairLoss'] as const;
export type SenooCzBenchmarkRateKey = typeof SENOO_CZ_BENCHMARK_RATE_KEYS[number];

type Interval = readonly [number, number];

export interface SenooCzBenchmarkRate {
  readonly hits: number;
  readonly denominator: number;
  readonly unresolved: number;
  readonly blocks: number;
  readonly blockSizeSquaredSum: number;
  readonly identification: Interval | null;
  readonly interval: Interval | null;
}

interface Accumulator {
  hits: number;
  denominator: number;
  unresolved: number;
  readonly blockSizes: Map<string, number>;
}

function emptyRate(): Accumulator {
  return { hits: 0, denominator: 0, unresolved: 0, blockSizes: new Map() };
}

function count(rate: Accumulator, blockId: string, denominator: number, hits: number, unresolved: number) {
  rate.hits += hits;
  rate.denominator += denominator;
  rate.unresolved += unresolved;
  rate.blockSizes.set(blockId, (rate.blockSizes.get(blockId) ?? 0) + denominator);
}

function estimate(rate: Accumulator, logTailCorrection: number): SenooCzBenchmarkRate {
  const { hits, denominator, unresolved, blockSizes } = rate;
  const blocks = blockSizes.size;
  const blockSizeSquaredSum = Array.from(blockSizes.values()).reduce((sum, size) => sum + size ** 2, 0);
  const identification: Interval | null = denominator === 0 ? null : [hits / denominator, (hits + unresolved) / denominator];
  // Conditional on the recorded masks and block sizes, each independent block's
  // contribution to an endpoint can range over the eligible units in that block.
  const radius = denominator === 0 ? 0 : Math.sqrt(logTailCorrection * blockSizeSquaredSum / 2) / denominator;
  const interval: Interval | null = identification === null ? null : [
    Math.max(0, identification[0] - radius),
    Math.min(1, identification[1] + radius),
  ];
  return { hits, denominator, unresolved, blocks, blockSizeSquaredSum, identification, interval };
}

function depthCounts() {
  return {
    sequenceCount: 0, started: 0, maskIntersections: new Array<number>(8).fill(0),
    rates: { prep: emptyRate(), decay: emptyRate(), loss: emptyRate(), siteLoss: emptyRate(), pairLoss: emptyRate() },
  };
}

/** Reports actual mask memberships and partial counts, conditioning on the recorded cohort for each rate. */
export function summarizeSenooCzBenchmark(batch: SenooCzBenchmark) {
  const sequences = new Map(batch.sequences.map(sequence => [sequence.sequenceId, sequence]));
  const byDepth = new Map<number, ReturnType<typeof depthCounts>>();
  for (const { depth } of batch.sequences) {
    const group = byDepth.get(depth) ?? depthCounts();
    group.sequenceCount++;
    byDepth.set(depth, group);
  }

  for (const attempt of batch.attempts) {
    const { sequenceId, blockId, masks, bitstring, survival } = attempt;
    const sequence = sequences.get(sequenceId)!;
    const group = byDepth.get(sequence.depth)!;
    group.started++;
    group.maskIntersections[4 * Number(masks.prep) + 2 * Number(masks.decay) + Number(masks.loss)]++;

    const lostSites = survival.filter(status => status === 'lost').length;
    const unknownSites = survival.filter(status => status === 'unknown').length;
    const returned = Number(bitstring === sequence.target);
    const unresolvedReturn = Number(bitstring === null && lostSites === 0);
    for (const mask of SENOO_CZ_BENCHMARK_MASKS) {
      if (masks[mask]) count(group.rates[mask], blockId, 1, returned, unresolvedReturn);
    }
    if (masks.prep) {
      count(group.rates.siteLoss, blockId, 2, lostSites, unknownSites);
      count(group.rates.pairLoss, blockId, 1, Number(lostSites === 2),
        Number(unknownSites > 0 && !survival.includes('present')));
    }
  }

  const simultaneousTailCount = 2 * SENOO_CZ_BENCHMARK_RATE_KEYS.length * byDepth.size;
  const logTailCorrection = Math.log(simultaneousTailCount) - Math.log1p(-batch.confidenceLevel);
  const rows = Array.from(byDepth.entries()).sort(([left], [right]) => left - right).map(([depth, group]) => ({
    depth, sequenceCount: group.sequenceCount, started: group.started,
    rates: {
      prep: estimate(group.rates.prep, logTailCorrection), decay: estimate(group.rates.decay, logTailCorrection),
      loss: estimate(group.rates.loss, logTailCorrection), siteLoss: estimate(group.rates.siteLoss, logTailCorrection),
      pairLoss: estimate(group.rates.pairLoss, logTailCorrection),
    },
    maskIntersections: group.maskIntersections.map((attempts, index) => ({
      prep: (index & 4) !== 0, decay: (index & 2) !== 0, loss: (index & 1) !== 0, attempts,
    })),
  }));
  return {
    method: 'weighted-block-hoeffding-bonferroni' as const, scope: batch.sourceKind, mode: batch.mode,
    confidenceLevel: batch.confidenceLevel, independenceRef: batch.independenceRef, simultaneousTailCount, rows,
  };
}

export type SenooCzBenchmarkStatistics = ReturnType<typeof summarizeSenooCzBenchmark>;
export type SenooCzBenchmarkDepthStatistics = SenooCzBenchmarkStatistics['rows'][number];
