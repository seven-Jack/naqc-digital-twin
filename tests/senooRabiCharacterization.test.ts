import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import csv from '../references/knowledge/data/senoo-fig2c-rabi.csv?raw';
import { SENOO_POPULATION_SOURCE } from '../src/data/senooPopulationSource';
import {
  SENOO_RABI_CHARACTERIZATION_SOURCE, SENOO_RABI_FIT, SENOO_RABI_POINTS, SENOO_RABI_STATES,
} from '../src/data/senooRabiCharacterization';
import { senooRabiPopulation } from '../src/physics/senooRabi';
import { us } from '../src/physics/units';

describe('Senoo Figure 2c paired single-atom Rabi reproduction', () => {
  it('retains every paired observation, raw source cell and uncertainty at archived precision', () => {
    const source = SENOO_RABI_CHARACTERIZATION_SOURCE;
    expect(createHash('sha256').update(csv).digest('hex')).toBe(source.derivedTable.sha256);
    expect(source).toMatchObject({
      isotope: 171, tweezerWavelengthNm: 767, rydbergDriveWavelengthNm: 302,
      evidenceKind: 'literature_reproduction', timeRangeUs: [0.01, 1],
      selectionLabel: '通过最终丢失检测后的条件布居',
      sourceRanges: { m1: 'Fig2c_right_blue!B2:CC5', r0: 'Fig2c_right_red!B2:CC5' },
    });
    expect(source.workbook).toEqual(SENOO_POPULATION_SOURCE.source.workbook);
    const [, ...rawRows] = csv.trimEnd().split(/\r?\n/);
    expect(SENOO_RABI_POINTS).toHaveLength(80);
    SENOO_RABI_POINTS.forEach(({ sourceIndex, timeUs, m1, r0 }, index) => {
      expect(sourceIndex).toBe(index);
      expect([
        timeUs,
        ...[m1, r0].flatMap(point => [
          point.sourceCells, point.population, point.lowerError, point.upperError,
          point.prediction, point.residual, point.residualInMeanErrorUnits, point.withinErrorBar,
        ]),
      ].join(',')).toBe(rawRows[index]);
    });
    expect(SENOO_RABI_POINTS[65].m1).toMatchObject({
      sourceCells: 'Fig2c_right_blue!BO2:BO5', population: 0, lowerError: 0, upperError: 0.00529774750511315,
    });
    expect(SENOO_RABI_POINTS[65].r0).toMatchObject({
      sourceCells: 'Fig2c_right_red!BO2:BO5', population: 1, lowerError: 0.00529774750511313, upperError: 0,
    });
  });

  it('reproduces the two archived model predictions and signed residuals at each source time', () => {
    for (const row of SENOO_RABI_POINTS) {
      const model = senooRabiPopulation(us(row.timeUs), SENOO_RABI_FIT.parameters);
      expect(row.m1.population + row.r0.population).toBeCloseTo(1, 12);
      expect(row.m1.prediction + row.r0.prediction).toBeCloseTo(1, 12);
      for (const state of SENOO_RABI_STATES) {
        const { population, lowerError, upperError, prediction, residual, withinErrorBar } = row[state];
        expect(prediction).toBeCloseTo(model[state], 12);
        expect(residual).toBeCloseTo(prediction - population, 12);
        expect(withinErrorBar).toBe(population - lowerError <= prediction && prediction <= population + upperError);
      }
    }
  });

  it('retains the fit bounds, contrast and separate residual summaries', () => {
    const { parameters, contrast, piTimeUs, firstMaximumUs, fittedState, summaries } = SENOO_RABI_FIT;
    expect(fittedState).toBe('r0');
    expect(parameters.frequencyHz / 1e6).toBeCloseTo(3.02209, 5);
    expect(parameters.phaseRad).toBeCloseTo(-0.03701, 5);
    expect(parameters.minimumR0).toBeCloseTo(0.005293, 6);
    expect(parameters.maximumR0).toBe(1);
    expect(contrast * 100).toBeCloseTo(99.4707, 4);
    expect(piTimeUs).toBeCloseTo(0.16545, 5);
    expect(firstMaximumUs).toBeCloseTo(0.16740, 5);
    expect(summaries.m1.meanResidual * 100).toBeCloseTo(0.0367, 4);
    expect(summaries.r0.meanResidual * 100).toBeCloseTo(-0.0367, 4);
    for (const { rmse, rmsInMeanErrorUnits, insideErrorBars, maxAbsResidual } of Object.values(summaries)) {
      expect(rmse * 100).toBeCloseTo(2.1064, 4);
      expect(rmsInMeanErrorUnits).toBeCloseTo(1.0994, 4);
      expect(insideErrorBars).toBe(47);
      expect(maxAbsResidual * 100).toBeCloseTo(5.1130, 4);
    }
  });
});
