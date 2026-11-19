import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fig1cCsv from '../references/knowledge/data/senoo-fig1c-bell.csv?raw';
import fig1dCsv from '../references/knowledge/data/senoo-fig1d-bell.csv?raw';
import { SENOO_CZ_BELL_OBSERVATIONS, SENOO_CZ_BELL_SOURCE } from '../src/data/senooCzBellSource';
import {
  createSenooCzBellReplayRecord, createSenooCzBellSelection, importSenooCzBellReplayRecord, senooCzBellReplayFrame,
} from '../src/physics/senooCzBellReplay';

describe('Senoo Figure 1c–d CZ Bell literature replay', () => {
  it('retains both public scans, every source datum and the uncorrected fidelity convention', () => {
    expect(SENOO_CZ_BELL_SOURCE).toMatchObject({
      figure: 'Fig. 1c–d', selection: 'loss_detected', fidelityCondition: 'uncorrected_measurement_errors',
    });
    for (const [panel, csv, stageId, size] of [
      ['1c', fig1cCsv, 'measure-m', 45], ['1d', fig1dCsv, 'm-to-o', 64],
    ] as const) {
      expect(createHash('sha256').update(csv).digest('hex')).toBe(SENOO_CZ_BELL_SOURCE.derivedTables[panel].sha256);
      const group = SENOO_CZ_BELL_OBSERVATIONS[stageId];
      expect(group.points).toHaveLength(size);
      expect(group.freeFidelity).toBeNull();
      expect(group.freeFidelityError).toBeNull();
      const [, ...rows] = csv.trimEnd().split(/\r?\n/);
      const optional = (value: string) => value === '' ? null : Number(value);
      group.points.forEach((point, index) => {
        const columns = rows[index].split(',');
        expect(point).toEqual({
          id: columns[0], sourceCells: columns[0], kind: columns[1], state: columns[2] || null,
          phaseOverPi: optional(columns[3]), observed: Number(columns[4]), lowerError: Number(columns[5]),
          upperError: Number(columns[6]), numerator: Number(columns[12]), denominator: Number(columns[14]),
          fixedFit: optional(columns[7]), fixedResidual: optional(columns[8]), freeFit: null, freeResidual: null,
        });
      });
    }
    expect(SENOO_CZ_BELL_OBSERVATIONS['measure-m']).toMatchObject({
      targetPopulation: 3113 / 3153, fixedFidelity: 0.9854887601112499, publishedFidelity: 0.986,
    });
    expect(SENOO_CZ_BELL_OBSERVATIONS['m-to-o']).toMatchObject({
      targetPopulation: 3490 / 3538, fixedFidelity: 0.9385406582104048, publishedFidelity: 0.938,
    });
  });

  it('links each diagram step to its own observations when advancing and rewinding', () => {
    const selection = createSenooCzBellSelection();
    expect(senooCzBellReplayFrame(selection)).toMatchObject({
      index: 0, stage: { id: 'prepare', channels: ['raman'], state: 'metastable-pair' },
      point: null, observations: null,
    });
    expect(senooCzBellReplayFrame({ ...selection, stageId: 'cz' })).toMatchObject({
      index: 1, stage: { id: 'cz', channels: ['rydberg'], state: 'metastable-pair' },
      point: null, observations: null,
    });
    const selected = {
      ...selection, pointIds: { 'measure-m': 'Fig1c_right!AA2:AA5', 'm-to-o': 'Fig1d_right!BI2:BI5' },
    };
    const metastable = senooCzBellReplayFrame({ ...selected, stageId: 'measure-m' });
    expect(metastable).toMatchObject({
      index: 2, stage: { id: 'measure-m', channels: ['raman'], state: 'metastable-even-pair' },
      point: { observed: 1, upperError: 0, numerator: 218, denominator: 218 },
    });
    expect(senooCzBellReplayFrame({ ...selected, stageId: 'm-to-o' })).toMatchObject({
      index: 3, stage: { id: 'm-to-o', channels: ['clock', 'raman'], state: 'clock-pair' },
      point: { phaseOverPi: 2, numerator: 183, denominator: 196 },
    });
    expect(senooCzBellReplayFrame({ ...selected, stageId: 'measure-m' })).toEqual(metastable);
  });

  it('round-trips selection and rejects records outside this source and timebase', () => {
    const { pointIds } = createSenooCzBellSelection();
    const record = createSenooCzBellReplayRecord({
      stageId: 'm-to-o', pointIds: { ...pointIds, 'm-to-o': 'Fig1d_right!BI2:BI5' },
    });
    expect(record).toMatchObject({
      schema: 'senoo-cz-bell-replay', version: 1, timebase: 'protocol-step', experimentalTimestampsS: null,
      source: { workbook: SENOO_CZ_BELL_SOURCE.workbook, derivedTables: SENOO_CZ_BELL_SOURCE.derivedTables },
    });
    const imported = importSenooCzBellReplayRecord(JSON.stringify(record));
    expect(imported).toEqual(record);
    expect(senooCzBellReplayFrame(imported.selection).point?.id).toBe(record.selection.pointIds['m-to-o']);
    for (const invalid of [
      { ...record, schema: 'senoo-fig2f-replay' },
      { ...record, experimentalTimestampsS: [0, 1, 2, 3] },
      { ...record, source: { ...record.source, fidelityCondition: 'measurement_error_corrected' } },
      { ...record, source: { ...record.source, derivedTables: { ...record.source.derivedTables, '1c': null } } },
      { ...record, selection: { ...record.selection, stageId: 'pxp' } },
      { ...record, selection: { ...record.selection, pointIds: { ...record.selection.pointIds, 'measure-m': 'Fig1d_right!B2:B5' } } },
    ]) {
      expect(() => importSenooCzBellReplayRecord(JSON.stringify(invalid))).toThrow();
    }
  });
});
