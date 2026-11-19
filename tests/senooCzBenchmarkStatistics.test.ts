import { describe, expect, it } from 'vitest';
import { parseSenooCzBenchmark, type SenooCzBenchmark } from '../src/physics/senooCzBenchmark';
import { summarizeSenooCzBenchmark } from '../src/physics/senooCzBenchmarkStatistics';

type Attempt = SenooCzBenchmark['attempts'][number];
type Sequence = SenooCzBenchmark['sequences'][number];
const ref = 'synthetic://engineering-grb-statistics';

function sequence(sequenceId: string, depth: number, target: Sequence['target']): Sequence {
  return { sequenceId, depth, target, seed: `seed-${sequenceId}`, sourceRef: `${ref}/sequence/${sequenceId}` };
}

function attempt(index: number, blockId: string, masks: Attempt['masks'], bitstring: Attempt['bitstring'],
  survival: Attempt['survival'], sequenceId = 'first'): Attempt {
  return {
    attemptId: `test-${index}`, pairId: 'engineering-pair', blockId, sequenceId, siteIds: ['engineering-01', 'engineering-02'],
    masks, bitstring, survival, sourceRef: `${ref}/attempt/${index}`,
    survivalRef: survival.some(status => status !== 'unknown') ? `${ref}/survival/${index}` : null,
  };
}

function bench(sequences: Sequence[], attempts: Attempt[]) {
  return parseSenooCzBenchmark(JSON.stringify({
    schemaVersion: 1, kind: 'senoo-cz-benchmark', sourceKind: 'synthetic', sourceRef: ref,
    waveformSha256: 'a'.repeat(64), apparatusVersion: 'engineering-apparatus', gateVersion: 'engineering-gate',
    workingPoint: 'engineering-point', acquisitionRunId: 'engineering-statistics-run', protocolRef: `${ref}/protocol`,
    maskRef: `${ref}/mask`, readoutCalibrationRef: `${ref}/readout`, survivalProtocolRef: `${ref}/survival`,
    independenceRef: `${ref}/independence`, confidenceLevel: 0.95, expectedAttempts: attempts.length,
    mode: 'non-echo', sequences, attempts,
  }));
}

describe('Senoo gRB and per-site survival statistics', () => {
  it('keeps independent recorded mask memberships and full denominators for unresolved events', () => {
    const batch = bench([sequence('absent', 8, '00'), sequence('first', 0, '00'), sequence('second', 0, '11')], [
      attempt(1, 'block-A', { prep: true, decay: false, loss: false }, '00', ['present', 'unknown']),
      attempt(2, 'block-A', { prep: true, decay: true, loss: true }, null, ['lost', 'unknown']),
      attempt(3, 'block-B', { prep: true, decay: false, loss: false }, null, ['unknown', 'unknown']),
      attempt(4, 'block-B', { prep: true, decay: false, loss: true }, null, ['lost', 'lost']),
      attempt(5, 'block-C', { prep: false, decay: true, loss: true }, '11', ['present', 'present'], 'second'),
      attempt(6, 'block-D', { prep: false, decay: false, loss: true }, '00', ['present', 'present']),
    ]);
    const result = summarizeSenooCzBenchmark(batch);
    expect(result).toMatchObject({ mode: 'non-echo', scope: 'synthetic', simultaneousTailCount: 20 });
    const [zero, absent] = result.rows;
    expect(zero).toMatchObject({ depth: 0, sequenceCount: 2, started: 6, rates: {
      prep: { hits: 1, denominator: 4, unresolved: 1, blocks: 2, blockSizeSquaredSum: 8, identification: [0.25, 0.5] },
      decay: { hits: 1, denominator: 2, unresolved: 0, blocks: 2, blockSizeSquaredSum: 2, identification: [0.5, 0.5] },
      loss: { hits: 2, denominator: 4, unresolved: 0, blocks: 4, blockSizeSquaredSum: 4, identification: [0.5, 0.5] },
      siteLoss: { hits: 3, denominator: 8, unresolved: 4, blocks: 2, blockSizeSquaredSum: 32, identification: [0.375, 0.875] },
      pairLoss: { hits: 1, denominator: 4, unresolved: 2, blocks: 2, blockSizeSquaredSum: 8, identification: [0.25, 0.75] },
    } });
    expect(zero.maskIntersections).toContainEqual({ prep: false, decay: true, loss: true, attempts: 1 });
    expect(zero.maskIntersections).toContainEqual({ prep: true, decay: false, loss: false, attempts: 2 });
    expect(zero.maskIntersections.reduce((sum, row) => sum + row.attempts, 0)).toBe(zero.started);
    expect(absent).toMatchObject({ depth: 8, sequenceCount: 1, started: 0 });
    expect(absent.rates.prep).toEqual({ hits: 0, denominator: 0, unresolved: 0, blocks: 0,
      blockSizeSquaredSum: 0, identification: null, interval: null });
  });

  it('uses the eligible size of each independent block instead of assuming site or pair independence', () => {
    const count = 128;
    const records = Array.from({ length: count }, (_, index) => attempt(index, `block-${index}`,
      { prep: true, decay: false, loss: false }, index % 2 === 0 ? '00' : '01', ['present', 'present']));
    const independent = summarizeSenooCzBenchmark(bench([sequence('first', 0, '00')], records)).rows[0].rates;
    const common = summarizeSenooCzBenchmark(bench([sequence('first', 0, '00')],
      records.map(record => ({ ...record, blockId: 'common' })))).rows[0].rates;
    const halfWidth = Math.sqrt(Math.log(10 / 0.05) / (2 * count));
    expect(independent.prep.interval?.[0]).toBeCloseTo(0.5 - halfWidth, 13);
    expect(independent.prep.interval?.[1]).toBeCloseTo(0.5 + halfWidth, 13);
    expect(independent.siteLoss.blockSizeSquaredSum).toBe(4 * count);
    expect(independent.siteLoss.interval?.[1]).toBeCloseTo(halfWidth, 13);
    expect(common.prep).toMatchObject({ blocks: 1, blockSizeSquaredSum: count ** 2, interval: [0, 1] });
    expect(common.siteLoss).toMatchObject({ blocks: 1, blockSizeSquaredSum: (2 * count) ** 2, interval: [0, 1] });
  });
});
