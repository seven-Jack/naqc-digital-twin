import { describe, expect, it } from 'vitest';
import { SENOO_READOUT_SOURCE } from '../src/data/senooReadoutSource';

describe('Senoo Figure 2b source counts', () => {
  it('identifies the experimental source and preserves the first/second image axis order', () => {
    const { source } = SENOO_READOUT_SOURCE;
    expect(source.doi).toBe('10.1038/s41567-026-03258-8');
    expect(source.figure).toBe('2b');
    expect(source.isotope).toBe(171);
    expect(source.state).toBe('³P₀ m-qubit');
    expect(source.tweezerWavelengthNm).toBe(767);
    expect(source.evidenceKind).toBe('published-figure-source');
    expect(source.workbook.sha256).toBe('81a4c54bd1619b23ce8d60e6f136b2c20912c0f22d8dcef8a053b36a400688f4');
    expect(source.axes).toEqual({
      x: { label: 'Image 1', unit: 'counts' },
      y: { label: 'Image 2', unit: 'counts' },
      scale: 'log10',
    });
  });

  it('retains each of the 255 transposed source columns in its preparation group', () => {
    expect(SENOO_READOUT_SOURCE.groups.map(group => [group.id, group.sheet, group.range])).toEqual([
      ['loss', 'Fig2b_loss', 'B2:IV3'],
      ['spin0', 'Fig2b_spin0', 'B2:IV3'],
      ['spin1', 'Fig2b_spin1', 'B2:IV3'],
    ]);
    const identifiers = new Set<string>();
    for (const group of SENOO_READOUT_SOURCE.groups) {
      expect(group.points).toHaveLength(255);
      expect(group.points.map(point => point.sourceIndex)).toEqual(Array.from({ length: 255 }, (_, index) => index));
      for (const point of group.points) {
        expect(point.id).toBe(`${group.sheet}:${point.sourceColumn}`);
        expect(Number.isFinite(point.first) && point.first > 0).toBe(true);
        expect(Number.isFinite(point.second) && point.second > 0).toBe(true);
        identifiers.add(point.id);
      }
    }
    expect(identifiers.size).toBe(765);
  });

  it('preserves exact fractional counts and their source cells at the beginning, middle and end', () => {
    const values = [
      [[19.67751863, 19.67751863], [25.17751863, 25.17751863], [27.67751863, 21.67751863]],
      [[23.67751863, 93.67751863], [25.67751863, 76.17751863], [24.17751863, 97.67751863]],
      [[63.67751863, 22.17751863], [98.17751863, 21.67751863], [86.67751863, 26.17751863]],
    ];
    for (const [groupIndex, group] of SENOO_READOUT_SOURCE.groups.entries()) {
      for (const [position, index] of [0, 127, 254].entries()) {
        const point = group.points[index];
        expect([point.first, point.second]).toEqual(values[groupIndex][position]);
        expect(point.sourceColumn).toBe(['B', 'DY', 'IV'][position]);
      }
    }
  });

  it('keeps the full observed ranges and low-count samples under their preparation labels', () => {
    const ranges = SENOO_READOUT_SOURCE.groups.map(group => [
      Math.min(...group.points.map(point => point.first)),
      Math.max(...group.points.map(point => point.first)),
      Math.min(...group.points.map(point => point.second)),
      Math.max(...group.points.map(point => point.second)),
    ]);
    expect(ranges).toEqual([
      [13.17751863, 38.67751863, 14.17751863, 32.67751863],
      [16.17751863, 34.17751863, 18.17751863, 167.17751863],
      [21.17751863, 154.17751863, 15.67751863, 33.67751863],
    ]);
    // A low second-image count remains in the m0 preparation group. It is not
    // removed or relabelled as a loss by an inferred classification threshold.
    const preparedM0 = SENOO_READOUT_SOURCE.groups.find(group => group.id === 'spin0')!;
    expect(preparedM0.preparation).toContain('制备');
    expect(preparedM0.points[149]).toEqual({
      id: 'Fig2b_spin0:EU', sourceIndex: 149, sourceColumn: 'EU',
      first: 21.67751863, second: 18.17751863,
    });
  });
});
