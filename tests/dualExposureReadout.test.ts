import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPLORATORY_THRESHOLDS, evaluateSenooReadout } from '../src/data/senooReadoutEvaluation';
import { SENOO_READOUT_SOURCE } from '../src/data/senooReadoutSource';
import { classifyDualExposure, createDualExposureRule } from '../src/physics/dualExposureReadout';

describe('dual-exposure threshold exploration', () => {
  it('uses each exposure independently and treats equality as high', () => {
    const rule = createDualExposureRule({ first: 40, second: 60 });
    expect(classifyDualExposure({ first: 39.99, second: 59.99 }, rule))
      .toEqual({ firstHigh: false, secondHigh: false, outcome: 'no-atom' });
    expect(classifyDualExposure({ first: 39.99, second: 60 }, rule))
      .toEqual({ firstHigh: false, secondHigh: true, outcome: 'm0' });
    expect(classifyDualExposure({ first: 40, second: 59.99 }, rule))
      .toEqual({ firstHigh: true, secondHigh: false, outcome: 'm1' });
    expect(classifyDualExposure({ first: 40, second: 60 }, rule))
      .toEqual({ firstHigh: true, secondHigh: true, outcome: 'ambiguous' });
    expect(() => createDualExposureRule({ first: NaN, second: 40 })).toThrow(RangeError);
    expect(() => classifyDualExposure({ first: 40, second: Infinity }, rule)).toThrow(RangeError);
  });

  it('counts the published sample groups and preserves low counts and source cells', () => {
    const result = evaluateSenooReadout(DEFAULT_EXPLORATORY_THRESHOLDS);
    expect(result.rows.map(({ groupId, total, counts }) => [groupId, total, counts])).toEqual([
      ['loss', 255, { m0: 0, m1: 0, 'no-atom': 255, ambiguous: 0 }],
      ['spin0', 255, { m0: 247, m1: 0, 'no-atom': 8, ambiguous: 0 }],
      ['spin1', 255, { m0: 0, m1: 249, 'no-atom': 6, ambiguous: 0 }],
    ]);
    expect(result.samples).toHaveLength(765);
    expect(result.source.workbook.sha256).toBe(SENOO_READOUT_SOURCE.source.workbook.sha256);
    expect(result.samples.find(({ observation }) => observation.id === 'Fig2b_spin0:EU')).toEqual({
      observation: {
        id: 'Fig2b_spin0:EU',
        preparedGroup: 'spin0',
        counts: { first: 21.67751863, second: 18.17751863 },
        source: { sheet: 'Fig2b_spin0', index: 149, column: 'EU', cells: { first: 'EU2', second: 'EU3' } },
      },
      decision: { firstHigh: false, secondHigh: false, outcome: 'no-atom' },
    });
  });

  it('recreates the exported decisions from the saved thresholds and raw counts', () => {
    const thresholds = { first: 20.17751863, second: 167.17751863 };
    const serialized = JSON.stringify(evaluateSenooReadout(thresholds));
    const saved = JSON.parse(serialized) as ReturnType<typeof evaluateSenooReadout>;
    expect(saved.rule.version).toBe(1);
    expect(saved.rule.mode).toBe('exploratory');
    const rule = createDualExposureRule(saved.rule.thresholds);
    for (const { observation, decision } of saved.samples) {
      expect(classifyDualExposure(observation.counts, rule)).toEqual(decision);
    }
    expect(saved.samples.find(({ observation }) => observation.id === 'Fig2b_spin0:DZ')?.decision.outcome).toBe('ambiguous');
    expect(JSON.stringify(evaluateSenooReadout(saved.rule.thresholds))).toBe(serialized);
  });
});
