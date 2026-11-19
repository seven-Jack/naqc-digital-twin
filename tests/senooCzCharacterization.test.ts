import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import figureCsv from '../references/knowledge/data/senoo-fig3-cz-by-depth.csv?raw';
import {
  SENOO_CZ_CHARACTERIZATION_SOURCE, SENOO_CZ_DEPTHS, SENOO_CZ_GRB_SERIES,
  SENOO_CZ_INDEPENDENT_LOSS, SENOO_CZ_LOSS_SERIES,
} from '../src/data/senooCzCharacterization';

describe('Senoo Figure 3b–d CZ characterization', () => {
  it('retains all 30 source observations and their provenance at full precision', () => {
    expect(createHash('sha256').update(figureCsv).digest('hex')).toBe(SENOO_CZ_CHARACTERIZATION_SOURCE.derivedTable.sha256);
    expect(SENOO_CZ_CHARACTERIZATION_SOURCE.evidenceKind).toBe('literature_reproduction');
    const series = [...SENOO_CZ_GRB_SERIES, ...SENOO_CZ_LOSS_SERIES];
    const entries = series.flatMap(curve => curve.points.map(point => ({ curve, point })));
    const rows = figureCsv.trimEnd().split(/\r?\n/).slice(1);
    expect(entries).toHaveLength(30);
    expect(new Set(entries.map(({ point }) => point.sourceCells)).size).toBe(30);
    for (const curve of series) expect(curve.points.map(point => point.depth)).toEqual(SENOO_CZ_DEPTHS);
    entries.forEach(({ curve, point }, index) => {
      const [sourceCells, condition, unit, depth, probability, lower, upper, fitted, residual, normalized,
        inside, numerator, denominator, provenance, lowerTail, upperTail] = rows[index].split(',');
      expect(curve.id).toBe(condition);
      expect(point).toEqual({
        sourceCells, denominatorUnit: unit, depth: Number(depth), probability: Number(probability),
        lowerError: Number(lower), upperError: Number(upper), fittedProbability: Number(fitted), residual: Number(residual),
        residualOverMeanError: Number(normalized), insideSourceInterval: inside === 'True',
        numerator: Number(numerator), denominator: Number(denominator), countProvenance: provenance,
        cpLowerTail: Number(lowerTail), cpUpperTail: Number(upperTail),
      });
    });
  });

  it('keeps gRB success and each fixed-asymptote per-gate fit on separate scales', () => {
    expect(SENOO_CZ_GRB_SERIES.map(curve => curve.summary.publishedLabel)).toEqual(['99.37(7)%', '99.51(6)%', '99.78(4)%']);
    expect(SENOO_CZ_GRB_SERIES.map(curve => curve.summary.asymptote)).toEqual([0, 0, 0.25]);
    expect(SENOO_CZ_GRB_SERIES.map(curve => curve.points[5].denominator)).toEqual([3259, 2826, 2661]);
    for (const curve of SENOO_CZ_GRB_SERIES) {
      const { fidelity, asymptote, standardError } = curve.summary;
      const amplitude = curve.points[0].fittedProbability - asymptote;
      const decay = 1 - (1 - fidelity) / (1 - asymptote);
      expect(standardError).toBeGreaterThan(0);
      for (const point of curve.points) {
        expect(amplitude * decay ** point.depth + asymptote).toBeCloseTo(point.fittedProbability, 6);
      }
    }
  });

  it('preserves the distinct loss units and references for Figure 3d', () => {
    const [site, correlated] = SENOO_CZ_LOSS_SERIES;
    expect(site.denominatorUnit).toBe('atom_site');
    expect(correlated.denominatorUnit).toBe('atom_pair');
    SENOO_CZ_DEPTHS.forEach((depth, index) => {
      const pairCount = SENOO_CZ_GRB_SERIES[0].points[index].denominator;
      expect(site.points[index]).toMatchObject({ depth, denominator: pairCount * 2 });
      expect(correlated.points[index]).toMatchObject({ depth, denominator: pairCount });
    });
    expect(site.summary.publishedCells).toBe('Fig3d!B3:B4');
    expect(correlated.summary.publishedCells).toBe('Fig3d!C3:C4');
    for (const curve of [site, correlated]) {
      const { rate, publishedRate, standardError, publishedStandardError, intercept } = curve.summary;
      expect(rate).toBeCloseTo(publishedRate, 10);
      expect(standardError).toBeCloseTo(publishedStandardError, 10);
      for (const point of curve.points) expect(intercept + rate * point.depth).toBeCloseTo(point.fittedProbability, 7);
    }
    expect(SENOO_CZ_INDEPENDENT_LOSS.sourceCells).toBe('Fig3d!D3:D4');
    expect(SENOO_CZ_INDEPENDENT_LOSS.rate).toBeCloseTo(site.summary.publishedRate ** 2, 15);
  });
});
