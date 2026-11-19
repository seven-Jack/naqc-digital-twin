import { describe, expect, it } from 'vitest';
import {
  auditSenooBellAcquisition, createSenooBellAcquisitionSchedule, parseSenooBellAcquisitionSchedule,
} from '../src/physics/senooBellAcquisition';
import { parseSenooBellObservations, summarizeSenooBellObservations } from '../src/physics/senooBellObservations';
import { bellObservationFixture, interleavedAttempt } from './helpers/senooBellFixture';

const settings = ['population', 'plus', 'minus'] as const;
type Setting = typeof settings[number];

function parseRows(csv: string) {
  const [header, ...rows] = csv.trimEnd().split(/\r?\n/);
  return { header, rows: rows.map(row => row.split(',')) };
}

function renderCsv(header: string, rows: readonly string[][]) {
  return [header, ...rows.map(row => row.join(','))].join('\r\n');
}

function mappedEvidence() {
  const { header, rows } = parseRows(createSenooBellAcquisitionSchedule(1));
  const observations = bellObservationFixture();
  const acquisitionRunId = 'SYN-BELL-ACQUISITION';
  const timeOriginRef = 'synthetic://bell-acquisition-test/run/t0';
  const fixtureIndices = { population: 0, plus: -2, minus: -1 };
  for (const row of rows.slice(0, settings.length)) {
    const setting = row[4] as Setting;
    const { batch } = observations.settings[setting];
    const example = batch.attempts.at(fixtureIndices[setting])!;
    const attempt = interleavedAttempt(example, `actual-${row[3]}`, Number(row[2]));
    observations.settings[setting].batch = { ...batch, acquisitionRunId, timeOriginRef, expectedAttempts: 1, attempts: [attempt] };
    row.splice(6, 4, acquisitionRunId, attempt.attemptId, setting, attempt.sourceRef);
  }
  const parsed = parseSenooBellObservations(JSON.stringify(observations));
  const statistics = summarizeSenooBellObservations(parsed, null, null);
  return {
    rows,
    audit: () => auditSenooBellAcquisition(parseSenooBellAcquisitionSchedule(renderCsv(header, rows)), parsed, statistics),
  };
}

describe('Senoo Bell interleaved acquisition', () => {
  it('keeps the generated plan balanced in each block with no actual records', () => {
    const schedule = parseSenooBellAcquisitionSchedule(createSenooBellAcquisitionSchedule(2));
    expect(schedule.version).toBe('senoo-bell-schedule-v1');
    expect(schedule.rows).toHaveLength(36);
    expect(new Set(schedule.rows.map(row => row.plannedId)).size).toBe(36);
    const phaseBySetting = { population: null, plus: Math.PI / 4, minus: -Math.PI / 4 };
    for (const block of [1, 2]) {
      const rows = schedule.rows.filter(row => row.block === block);
      expect(rows.map(row => row.slot)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
      for (const setting of settings) {
        const group = rows.filter(row => row.setting === setting);
        expect(group).toHaveLength(6);
        expect(group.every(row => row.actual === null && row.analysisPhaseRad === phaseBySetting[setting])).toBe(true);
      }
      for (let first = 0; first < rows.length; first += 3) {
        expect(rows.slice(first, first + 3).map(row => row.setting).sort()).toEqual([...settings].sort());
      }
    }
  });

  it('rejects tampered schedule version, phase, partial actual row and duplicated attempt mappings', () => {
    const { header, rows } = parseRows(createSenooBellAcquisitionSchedule(1));
    const withRow = (index: number, row: string[]) => renderCsv(header, rows.map((value, ordinal) => ordinal === index ? row : value));
    const phaseRow = rows.findIndex(row => row[4] === 'plus');
    const wrongPhase = rows[phaseRow].map((field, index) => index === 5 ? '0' : field);
    expect(() => parseSenooBellAcquisitionSchedule(withRow(phaseRow, wrongPhase))).toThrow();
    const wrongVersion = rows[0].map((field, index) => index === 0 ? 'unknown-version' : field);
    expect(() => parseSenooBellAcquisitionSchedule(withRow(0, wrongVersion))).toThrow();
    const partialActual = [...rows[0].slice(0, 6), 'SYN-BELL-ACQUISITION', '', '', ''];
    expect(() => parseSenooBellAcquisitionSchedule(withRow(0, partialActual))).toThrow();
    rows[0].splice(6, 4, 'SYN-BELL-ACQUISITION', 'reused-attempt', rows[0][4], 'synthetic://first');
    rows[1].splice(6, 4, 'SYN-BELL-ACQUISITION', 'reused-attempt', rows[1][4], 'synthetic://second');
    expect(() => parseSenooBellAcquisitionSchedule(renderCsv(header, rows))).toThrow();
  });

  it('accepts a UTF-8 BOM and CSV quotes around an actual log path', () => {
    const { header, rows } = parseRows(createSenooBellAcquisitionSchedule(1));
    rows[0].splice(6, 4, 'SYN-BELL-ACQUISITION', 'record-1', rows[0][4], '"synthetic://目录,今日/""原始"".log"');
    const schedule = parseSenooBellAcquisitionSchedule(`\uFEFF${renderCsv(header, rows)}`);
    expect(schedule.rows[0].actual?.sourceRef).toBe('synthetic://目录,今日/"原始".log');
  });

  it('counts a missing frame and an excluded complete pair with distinct denominators', () => {
    const { audit } = mappedEvidence();
    expect(audit()).toMatchObject({
      settings: [
        { setting: 'population', planned: 6, matched: 1, executed: 1, included: 1, complete: 1, effective: 1 },
        { setting: 'plus', planned: 6, matched: 1, executed: 1, included: 1, complete: 0, effective: 0 },
        { setting: 'minus', planned: 6, matched: 1, executed: 1, included: 0, complete: 1, effective: 0 },
      ],
      issues: [],
    });
  });

  it('reports the identifiers for unmapped actual attempts and conflicting source references', () => {
    const { rows, audit } = mappedEvidence();
    const [, , , plannedId, , , , attemptId] = rows[0];
    rows[0][9] = 'synthetic://different-source-log';
    expect(audit().issues).toEqual(expect.arrayContaining([expect.objectContaining({ plannedId, attemptId })]));
    rows[0].splice(6, 4, '', '', '', '');
    expect(audit().issues.some(issue => issue.attemptId === attemptId)).toBe(true);
  });

  it('detects a same-setting attempt mapped backward on the shared run clock', () => {
    const { rows, audit } = mappedEvidence();
    const source = rows[0];
    const laterSlot = rows.slice(3).find(row => row[4] === source[4])!;
    const actual = source.splice(6, 4, '', '', '', '');
    laterSlot.splice(6, 4, ...actual);
    expect(audit().issues.some(issue => /顺序|时序|时标/.test(issue.reason))).toBe(true);
  });
});
