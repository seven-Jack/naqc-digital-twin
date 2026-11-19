import { describe, expect, it } from 'vitest';
import { classifyDualExposureBrightness } from '../src/physics/dualExposureReadout';
import {
  scanDualExposureCalibrationThresholds,
  type SenooReadoutScanOptions, type SenooReadoutScanRow, type SenooReadoutScanSample,
} from '../src/physics/senooReadoutThresholdScan';

const groups = ['m1', 'm0', 'empty_control'] as const;
const zero = { wrong: 0, loss: 0, ambiguous: 0, denominator: 0 };

function directScore(samples: readonly SenooReadoutScanSample[], candidate: SenooReadoutScanRow['candidate']): SenooReadoutScanRow {
  const groups = { m1: { ...zero }, m0: { ...zero }, empty_control: { ...zero } };
  for (const sample of samples) {
    const firstHigh = candidate.firstComparison === 'ge' ? sample.first >= candidate.first : sample.first > candidate.first;
    const secondHigh = candidate.secondComparison === 'ge' ? sample.second >= candidate.second : sample.second > candidate.second;
    const { outcome } = classifyDualExposureBrightness(firstHigh, secondHigh);
    const counts = groups[sample.preparedGroup];
    counts.denominator++;
    if (outcome === 'ambiguous') counts.ambiguous++;
    if (outcome === 'no-atom' && sample.preparedGroup !== 'empty_control') counts.loss++;
    if ((outcome === 'm1' || outcome === 'm0') && outcome !== sample.preparedGroup) counts.wrong++;
  }
  const errors = Object.values(groups).map(group => group.wrong + group.loss + group.ambiguous);
  return { candidate, groups, totalErrors: errors.reduce((sum, count) => sum + count, 0),
    worstGroupError: Math.max(...Object.values(groups).map((group, index) => errors[index] / group.denominator)) };
}

describe('Senoo exact dual-exposure calibration threshold scan', () => {
  it('partitions closed ranges exactly at observed values and keeps singleton endpoints', () => {
    const samples = groups.map((preparedGroup, index) => ({ preparedGroup, first: index - 1, second: index - 1 }));
    const result = scanDualExposureCalibrationThresholds(samples, {
      firstRange: { min: -1, max: 1 }, secondRange: { min: -1, max: 1 },
      firstComparison: 'ge', secondComparison: 'gt', rankBy: 'total-errors',
    });
    expect(result.firstAxis).toEqual([
      { lower: -1, upper: -1, lowerInclusive: true, upperInclusive: true, threshold: -1 },
      { lower: -1, upper: 0, lowerInclusive: false, upperInclusive: true, threshold: 0 },
      { lower: 0, upper: 1, lowerInclusive: false, upperInclusive: true, threshold: 1 },
    ]);
    expect(result.secondAxis).toEqual([
      { lower: -1, upper: 0, lowerInclusive: true, upperInclusive: false, threshold: -1 },
      { lower: 0, upper: 1, lowerInclusive: true, upperInclusive: false, threshold: 0 },
      { lower: 1, upper: 1, lowerInclusive: true, upperInclusive: true, threshold: 1 },
    ]);
    expect(result.testedPairs).toBe(9);
    for (const row of result.rows) expect(row).toEqual(directScore(samples, row.candidate));
  });

  it('matches direct classification and stable top-12 ranking under all equality rules', () => {
    const samples = groups.flatMap((preparedGroup, groupIndex) => Array.from({ length: 15 }, (_, index) => ({
      preparedGroup, first: ((index * 3 + 2 * groupIndex) % 9 - 4) / 2,
      second: ((index * 2 + 3 * groupIndex) % 11 - 6) / 2,
    })));
    for (const firstComparison of ['ge', 'gt'] as const) for (const secondComparison of ['ge', 'gt'] as const) {
      for (const rankBy of ['total-errors', 'worst-group-error'] as const) {
        const result = scanDualExposureCalibrationThresholds(samples, {
          firstRange: { min: -2, max: 2.25 }, secondRange: { min: -3.25, max: 1.5 }, firstComparison, secondComparison, rankBy,
        });
        const exhaustive = result.firstAxis.flatMap(({ threshold: first }) => result.secondAxis.map(({ threshold: second }) =>
          directScore(samples, { first, second, firstComparison, secondComparison })));
        exhaustive.sort((a, b) => (rankBy === 'total-errors'
          ? a.totalErrors - b.totalErrors || a.worstGroupError - b.worstGroupError
          : a.worstGroupError - b.worstGroupError || a.totalErrors - b.totalErrors)
          || a.candidate.first - b.candidate.first || a.candidate.second - b.candidate.second);
        expect(result.testedPairs).toBeGreaterThan(12);
        expect(result.rows).toEqual(exhaustive.slice(0, 12));
      }
    }
  });

  it('distinguishes the two ranking objectives for imbalanced calibration cohorts', () => {
    const samples: SenooReadoutScanSample[] = [
      { preparedGroup: 'm1', first: 1.5, second: 0 },
      { preparedGroup: 'm1', first: 3, second: 0 },
      { preparedGroup: 'm0', first: 0, second: 3 },
      ...Array.from({ length: 10 }, (_, index): SenooReadoutScanSample => ({
        preparedGroup: 'empty_control', first: index < 4 ? 1.5 : 0, second: 0,
      })),
    ];
    const options: SenooReadoutScanOptions = { firstRange: { min: 1, max: 2 }, secondRange: { min: 1, max: 1 },
      firstComparison: 'ge', secondComparison: 'ge', rankBy: 'total-errors' };
    const total = scanDualExposureCalibrationThresholds(samples, options);
    const worst = scanDualExposureCalibrationThresholds(samples, { ...options, rankBy: 'worst-group-error' });
    expect(total.rows[0]).toMatchObject({ candidate: { first: 2, second: 1 }, totalErrors: 1, worstGroupError: 0.5 });
    expect(worst.rows[0]).toMatchObject({ candidate: { first: 1.5, second: 1 }, totalErrors: 4, worstGroupError: 0.4 });
    expect(total.secondAxis).toEqual([{ lower: 1, upper: 1, lowerInclusive: true, upperInclusive: true, threshold: 1 }]);
  });

  it('rejects invalid comparison inputs, unavailable cohorts, and oversized interval grids', () => {
    const options: SenooReadoutScanOptions = { firstRange: { min: 0, max: 1000 }, secondRange: { min: 0, max: 1000 },
      firstComparison: 'gt', secondComparison: 'gt', rankBy: 'total-errors' };
    const samples = groups.map(preparedGroup => ({ preparedGroup, first: 0, second: 0 }));
    expect(() => scanDualExposureCalibrationThresholds(samples.slice(1), options)).toThrow(/三组/);
    expect(() => scanDualExposureCalibrationThresholds([...samples, { ...samples[0], second: NaN }], options)).toThrow(/均有限/);
    expect(() => scanDualExposureCalibrationThresholds(samples, { ...options, secondRange: { min: 1, max: -1 } })).toThrow(/阈值区间/);
    expect(() => scanDualExposureCalibrationThresholds(samples, { ...options, rankBy: 'unsupported' as 'total-errors' })).toThrow(/排序方式/);
    const broad = Array.from({ length: 1001 }, (_, index) => ({ preparedGroup: groups[index % 3], first: index, second: index }));
    expect(() => scanDualExposureCalibrationThresholds(broad, options)).toThrow(/1000000/);
  });
});
