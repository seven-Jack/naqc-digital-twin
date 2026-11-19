import { describe, expect, it } from 'vitest';
import { SENOO_POPULATION_SOURCE } from '../src/data/senooPopulationSource';

describe('Senoo Fig. 2c population source', () => {
  it('retains the published state labels, aligned sample times and asymmetric errors', () => {
    const { source, traces } = SENOO_POPULATION_SOURCE;
    expect(source).toMatchObject({
      doi: '10.1038/s41567-026-03258-8', isotope: 171, timeUnit: 'µs',
      populationUnit: 'fraction', evidenceKind: 'published-figure-source',
    });
    const [m1, r0] = traces;
    expect([m1.sheet, r0.sheet]).toEqual(['Fig2c_right_blue', 'Fig2c_right_red']);
    expect([m1.label, r0.label]).toEqual(['m₁', 'r₀']);
    expect(m1.points).toHaveLength(80);
    expect(r0.points).toHaveLength(80);
    expect(m1.points.map(point => point.timeUs)).toEqual(r0.points.map(point => point.timeUs));
    expect(m1.points[0]).toEqual({
      sourceIndex: 0, sourceColumn: 'B', timeUs: 0.01, population: 0.983379501385041,
      lowerError: 0.00974600445279483, upperError: 0.00654660357878045,
    });
    expect(r0.points.at(-1)).toEqual({
      sourceIndex: 79, sourceColumn: 'CC', timeUs: 0.999999999999999, population: 0.0169014084507042,
      lowerError: 0.00665691813446965, upperError: 0.00990847612659152,
    });
    expect(m1.points.some(point => point.population === 0 && point.lowerError === 0 && point.upperError > 0)).toBe(true);
    expect(r0.points.some(point => point.population === 1 && point.upperError === 0 && point.lowerError > 0)).toBe(true);
  });
});
