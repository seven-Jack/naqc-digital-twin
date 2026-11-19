import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import windowCsv from '../references/knowledge/data/senoo-ed4-rabi-window-diagnostics.csv?raw';
import blockadeCsv from '../references/knowledge/data/senoo-ed4f-blockade-rabi.csv?raw';
import shiftsCsv from '../references/knowledge/data/senoo-ed5f-pair-shifts.csv?raw';
import {
  SENOO_BLOCKADE_POINTS, SENOO_BLOCKADE_SUMMARY, SENOO_BLOCKADE_WINDOWS, SENOO_PAIR_SHIFTS, SENOO_PAIR_SOURCE,
} from '../src/data/senooPairCharacterization';

const parseCsv = (csv: string) => csv.trimEnd().split(/\r?\n/).slice(1).map(row => row.split(','));

describe('Senoo two-atom characterization archives', () => {
  it('retains the five energy shift source points, with both uncertainty axes and the direction-specific curves', () => {
    expect(SENOO_PAIR_SOURCE.evidenceKind).toBe('literature_reproduction');
    expect(createHash('sha256').update(shiftsCsv).digest('hex')).toBe(SENOO_PAIR_SOURCE.derivedTables.shifts.sha256);
    const rows = parseCsv(shiftsCsv);
    expect(SENOO_PAIR_SHIFTS).toHaveLength(5);
    SENOO_PAIR_SHIFTS.forEach((point, index) => {
      const [cells, direction, ...fields] = rows[index];
      expect([point.index, point.sourceCells, point.direction]).toEqual([index, cells, direction]);
      expect([
        point.distanceUm, point.distanceErrorUm, point.observedMHz, point.shiftErrorMHz, point.coefficientGHzUm6,
        point.modelMHz, point.residualMHz, point.modelLowMHz, point.modelHighMHz,
      ]).toEqual(fields.slice(0, 9).map(Number));
      expect([String(point.insideYError), String(point.overlapsErrorBox)]).toEqual(fields.slice(9));
    });
    expect(SENOO_PAIR_SHIFTS.map(point => point.coefficientGHzUm6)).toEqual([24, 24, 24, 24, 21]);
    expect(SENOO_PAIR_SHIFTS[2]).toMatchObject({
      sourceCells: 'ExtendedDataFig5f_1!D2:D5', distanceUm: 3.782, distanceErrorUm: 0.05,
      observedMHz: 8.04, shiftErrorMHz: 0.15, insideYError: false, overlapsErrorBox: true,
    });
    expect(SENOO_PAIR_SHIFTS.every(point => point.overlapsErrorBox)).toBe(true);
  });

  it('matches all 60 blockade observations, both stored shared-phase fits and the saturated source point', () => {
    expect(createHash('sha256').update(blockadeCsv).digest('hex')).toBe(SENOO_PAIR_SOURCE.derivedTables.blockade.sha256);
    expect(SENOO_PAIR_SOURCE.distanceUm).toBe(2.4);
    expect(SENOO_PAIR_SOURCE.exactDenominators).toBeNull();
    const rows = parseCsv(blockadeCsv);
    expect(SENOO_BLOCKADE_POINTS).toHaveLength(60);
    SENOO_BLOCKADE_POINTS.forEach((point, index) => {
      const [sourceCells, timeUs, window, observed, lowerError, upperError] = rows[index];
      expect(point).toMatchObject({
        index, sourceCells, timeUs: Number(timeUs), window: Number(window), indexInWindow: index % 15,
        observed: Number(observed), lowerError: Number(lowerError), upperError: Number(upperError),
      });
      for (const [branch, offset] of [['free', 6], ['published', 10]] as const) {
        expect([point[branch].fitted, point[branch].residual, point[branch].scaledResidual])
          .toEqual(rows[index].slice(offset, offset + 3).map(Number));
        expect(String(point[branch].insideErrorBar)).toBe(rows[index][offset + 3]);
      }
    });
    expect(SENOO_BLOCKADE_POINTS[10]).toMatchObject({
      sourceCells: 'ExtendedDataFig4f!L2:L5', timeUs: 0.36, observed: 1, lowerError: 0.0128225843453169, upperError: 0,
    });
    expect(SENOO_PAIR_SOURCE.branchLabels.published).toBe('固定刊版频率复算');
  });

  it('attaches precisely eight ED4f diagnostics to their four source windows', () => {
    expect(createHash('sha256').update(windowCsv).digest('hex')).toBe(SENOO_PAIR_SOURCE.derivedTables.windows.sha256);
    const rows = parseCsv(windowCsv).filter(row => row[0] === '4f');
    expect(SENOO_BLOCKADE_WINDOWS.map(window => window.sourceRange)).toEqual([
      'ExtendedDataFig4f!B2:P5', 'ExtendedDataFig4f!Q2:AE5', 'ExtendedDataFig4f!AF2:AT5', 'ExtendedDataFig4f!AU2:BI5',
    ]);
    expect(SENOO_BLOCKADE_WINDOWS.flatMap(window => window.points)).toEqual(SENOO_BLOCKADE_POINTS);
    expect(SENOO_PAIR_SOURCE.localPhaseData).toBe('window_summary_only');
    SENOO_BLOCKADE_WINDOWS.forEach((window, index) => {
      expect(window.points).toHaveLength(15);
      expect(window.id).toBe(index + 1);
      for (const [branch, offset] of [['free', 0], ['published', 4]] as const) {
        const diagnostic = window[branch];
        const [, sourceBranch, frequencyHz, , firstSourceCell, lastSourceCell] = rows[index + offset];
        expect(diagnostic).toMatchObject({ sourceBranch, firstSourceCell, lastSourceCell, frequencyHz: Number(frequencyHz) });
        expect([
          diagnostic.count, diagnostic.startUs, diagnostic.endUs, diagnostic.centerUs, diagnostic.sharedPhaseRad,
          diagnostic.localPhaseRad, diagnostic.phaseCorrectionRad, diagnostic.sharedRmse, diagnostic.localRmse,
          diagnostic.sharedMeanResidual, diagnostic.localMeanResidual, diagnostic.sharedWeightedSse,
          diagnostic.localWeightedSse, diagnostic.sharedInsideErrorBar, diagnostic.localInsideErrorBar,
        ]).toEqual(rows[index + offset].slice(6).map(Number));
      }
    });
  });

  it('reproduces the aggregate residual comparison without re-fitting either branch', () => {
    const { free, published, extraSharedWeightedSse, extraLocalWeightedSse, extraWeightedSseReduction } = SENOO_BLOCKADE_SUMMARY;
    expect(free.frequencyHz).toBe(4242415.771484375);
    expect(published.frequencyHz).toBe(4490000);
    expect(free.sharedRmse * 100).toBeCloseTo(5.8905, 4);
    expect(published.sharedRmse * 100).toBeCloseTo(8.2698, 4);
    expect(free.localRmse * 100).toBeCloseTo(5.63, 2);
    expect(published.localRmse * 100).toBeCloseTo(7.89, 2);
    expect(free.rmsInMeanErrorUnits).toBeCloseTo(1.4573, 4);
    expect(published.rmsInMeanErrorUnits).toBeCloseTo(2.1150, 4);
    expect([free.sharedInsideErrorBar, published.sharedInsideErrorBar]).toEqual([30, 28]);
    expect(extraSharedWeightedSse).toBeCloseTo(140.97, 2);
    expect(extraLocalWeightedSse).toBeCloseTo(126.94, 2);
    expect(extraWeightedSseReduction * 100).toBeCloseTo(9.95, 2);
  });
});
