import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import bellCsv from '../references/knowledge/data/senoo-fig2f-bell.csv?raw';
import { SENOO_PXP_OBSERVATIONS, SENOO_PXP_SOURCE } from '../src/data/senooPxpSource';
import {
  createSenooPxpReplayRecord, createSenooPxpSelection, importSenooPxpReplayRecord, senooPxpReplayFrame,
} from '../src/physics/senooPxpReplay';

describe('Senoo Figure 2f literature replay', () => {
  it('loads all 74 observations with their source values, fit points and effective counts', () => {
    expect(createHash('sha256').update(bellCsv).digest('hex')).toBe(SENOO_PXP_SOURCE.derivedTable.sha256);
    expect(SENOO_PXP_SOURCE.selection).toBe('loss_detected');
    expect(SENOO_PXP_SOURCE.countProvenance).toBe('inferred_from_68pct_clopper_pearson');
    const groups = Object.values(SENOO_PXP_OBSERVATIONS);
    expect(groups.map(group => group.points.length)).toEqual([4, 35, 35]);
    expect(groups.map(group => group.targetPopulation)).toEqual([3079 / 3154, 3638 / 3758, 3397 / 3524]);

    const [, ...rows] = bellCsv.trimEnd().split(/\r?\n/);
    const points = groups.flatMap(group => group.points);
    expect(points.map(point => point.id)).toEqual(rows.map(row => row.split(',')[1]));
    const optional = (value: string) => value === '' ? null : Number(value);
    points.forEach((point, index) => {
      const columns = rows[index].split(',');
      expect(point).toEqual({
        id: columns[1], sourceCells: columns[1], kind: columns[2], state: columns[3] || null,
        phaseOverPi: optional(columns[4]), observed: Number(columns[5]),
        lowerError: Number(columns[6]), upperError: Number(columns[7]),
        numerator: Number(columns[13]), denominator: Number(columns[15]),
        fixedFit: optional(columns[8]), fixedResidual: optional(columns[9]),
        freeFit: optional(columns[19]), freeResidual: optional(columns[20]),
      });
    });
    // The literature reproduction retains unconstrained fit points above +1.
    expect(Math.max(...points.map(point => point.fixedFit ?? 0))).toBeGreaterThan(1);
    expect(Math.max(...points.map(point => point.observed))).toBeLessThanOrEqual(1);
  });

  it('selects the scene and observation group from one protocol step when advancing and rewinding', () => {
    const selection = createSenooPxpSelection();
    const clockPoint = 'Fig2f_right_bottom!AF2:AF5';
    const selected = { ...selection, pointIds: { ...selection.pointIds, 'm-to-o': clockPoint } };
    const start = senooPxpReplayFrame(selected);
    expect(start).toMatchObject({
      index: 0, stage: { id: 'pxp', state: 'rydberg-pair', channels: ['rydberg'] },
      observations: null, point: null,
    });
    expect(senooPxpReplayFrame({ ...selected, stageId: 'r-to-m' })).toMatchObject({
      index: 1, stage: { state: 'metastable-odd-pair', channels: ['raman', 'rydberg'] },
      observations: { fixedFidelity: null },
      point: { sourceCells: 'Fig2f_left_bottom!B2:B5', kind: 'population', numerator: 64, denominator: 3154 },
    });
    expect(senooPxpReplayFrame({ ...selected, stageId: 'rotate' })).toMatchObject({
      index: 2, stage: { state: 'metastable-even-pair', channels: ['raman'] },
      point: { sourceCells: 'Fig2f_left_top!B2:B5', denominator: 3758 },
    });
    expect(senooPxpReplayFrame({ ...selected, stageId: 'm-to-o' })).toMatchObject({
      index: 3, stage: { state: 'clock-pair', channels: ['clock', 'raman'] },
      point: { id: clockPoint, kind: 'parity', phaseOverPi: 2, numerator: 29, denominator: 113 },
    });
    expect(senooPxpReplayFrame(selected)).toEqual(start);
  });

  it('round-trips the current step and each source selection with real timestamps missing', () => {
    const { pointIds } = createSenooPxpSelection();
    const record = createSenooPxpReplayRecord({
      stageId: 'rotate',
      pointIds: { ...pointIds, rotate: 'Fig2f_right_top!I2:I5', 'm-to-o': 'Fig2f_right_bottom!AF2:AF5' },
    });
    expect(record).toMatchObject({
      schema: 'senoo-fig2f-replay', timebase: 'protocol-step', experimentalTimestampsS: null,
      source: { workbook: SENOO_PXP_SOURCE.workbook, derivedTable: SENOO_PXP_SOURCE.derivedTable },
    });
    const recovered = importSenooPxpReplayRecord(JSON.stringify(record));
    expect(recovered).toEqual(record);
    expect(senooPxpReplayFrame(recovered.selection).point?.id).toBe(record.selection.pointIds.rotate);
    expect(senooPxpReplayFrame({ ...recovered.selection, stageId: 'm-to-o' }).point?.id)
      .toBe(record.selection.pointIds['m-to-o']);
  });

  it('rejects a different diagram revision, a measured timebase and a point from another step', () => {
    const good = createSenooPxpReplayRecord(createSenooPxpSelection());
    expect(() => importSenooPxpReplayRecord('bad JSON')).toThrow('JSON');
    for (const invalid of [
      { ...good, schema: 'senoo-literature-replay' }, { ...good, version: 0 },
      { ...good, timebase: 'measured-s' }, { ...good, experimentalTimestampsS: [0, 1, 2, 3] },
      { ...good, source: { ...good.source, workbook: { ...good.source.workbook, sha256: 'different' } } },
      { ...good, source: { ...good.source, derivedTable: { ...good.source.derivedTable, sha256: 'different' } } },
      { ...good, source: { ...good.source, selection: 'all_attempts' } },
      { ...good, selection: { ...good.selection, stageId: 'unknown' } },
      { ...good, selection: { ...good.selection, pointIds: { ...good.selection.pointIds, 'r-to-m': 'Fig2f_right_bottom!B2:B5' } } },
    ]) {
      expect(() => importSenooPxpReplayRecord(JSON.stringify(invalid))).toThrow();
    }
  });
});
