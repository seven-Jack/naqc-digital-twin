import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createSenooTransportReplayRecord, parseSenooTransportImport, projectSenooTransportFrame,
  senooTransportCheckpoints, summarizeSenooTransportRun,
} from '../src/physics/senooTransportReplay';
import { createSenooTransportRunTemplate, parseSenooTransportRun } from '../src/physics/senooTransportRun';

const fixture = readFileSync(new URL('./fixtures/senoo-transport-synthetic.json', import.meta.url), 'utf8');
const parse = (value: unknown) => parseSenooTransportRun(JSON.stringify(value));
const run = parseSenooTransportRun(fixture);
const [assembled, incomplete, missingFinal, skipped] = run.attempts;

describe('Senoo independent load and transport record', () => {
  it('keeps isotope, SI geometry, evidence and explicit missing states', () => {
    expect(run).toMatchObject({
      kind: 'senoo-transport-run', schemaVersion: 1, isotope: 171, sourceKind: 'synthetic',
      trapWavelengthM: 7.67e-7, acquisitionRunId: 'SYN-TRANSPORT-01', clockId: 'SYN-CLOCK-01',
      expectedAttempts: 4,
    });
    expect(run.sites).toMatchObject([
      { id: 'T1', target: true, positionM: [0, 0, 0] },
      { id: 'T2', target: true, positionM: [4e-6, 0, 0] },
      { id: 'R1', target: false, positionM: [6e-6, 0, 9e-6] },
    ]);
    expect(assembled.moves[0]).toMatchObject({
      id: 'tracked-A2', outcome: 'survived', outcomeAtS: 0.008, path: { kind: 'tracked' },
    });
    expect(incomplete.moves[0]).toMatchObject({ outcome: 'lost', path: { kind: 'commanded' } });
    expect(missingFinal).toMatchObject({ final: null, moves: [{ outcome: 'unknown', path: null }] });
    expect(skipped.transport).toMatchObject({ status: 'skipped', startS: null, endS: null });
    expect(createSenooTransportRunTemplate()).toMatchObject({
      kind: 'senoo-transport-run', schemaVersion: 1, sites: [], attempts: [],
    });
  });

  it('rejects synthetic references in measured records and conflicting attempt counts', () => {
    expect(() => parse({ ...run, sourceKind: 'measured' })).toThrow(/sourceRef|来源|synthetic|实测/);
    expect(() => parse({ ...run, expectedAttempts: 5 })).toThrow(/expectedAttempts|attempts|尝试|轮次/);
  });

  it('rejects skipped transport with actual motion and lost evidence declared before the move ends', () => {
    const attempts = [assembled, incomplete, missingFinal, { ...skipped, moves: [assembled.moves[0]] }];
    expect(() => parse({ ...run, attempts })).toThrow(/skip|moves|跳过|输运/);
    const earlyOutcome = { ...incomplete.moves[0], outcomeAtS: 0.105 };
    expect(() => parse({ ...run, attempts: [assembled, { ...incomplete, moves: [earlyOutcome] }, missingFinal, skipped] }))
      .toThrow(/outcomeAtS|时标|结局/);
  });

  it('rejects unresolved sites, non-monotonic track samples and absent outcome evidence', () => {
    const [move] = assembled.moves;
    expect(() => parse({ ...run, attempts: [{ ...assembled, moves: [{ ...move, toSiteId: 'not-in-array' }] },
      incomplete, missingFinal, skipped] })).toThrow(/toSiteId|位点|目的/);
    expect(() => parse({ ...run, attempts: [{ ...assembled, moves: [{ ...move, outcomeSourceRef: null }] },
      incomplete, missingFinal, skipped] })).toThrow(/outcomeSourceRef|结局|来源/);
    const path = { ...move.path!, samples: [...move.path!.samples].reverse() };
    expect(() => parse({ ...run, attempts: [{ ...assembled, moves: [{ ...move, path }] },
      incomplete, missingFinal, skipped] })).toThrow(/timeS|样点|轨迹|递增/);
  });
});

describe('Senoo independent transport projection and statistics', () => {
  it('computes separate denominators from known load, final targets and move outcomes', () => {
    expect(summarizeSenooTransportRun(run)).toMatchObject({
      loading: { numerator: 6, denominator: 10, unknown: 2, total: 12 },
      assembly: { numerator: 1, denominator: 3, unknown: 1, total: 4 },
      survival: { numerator: 1, denominator: 2, unknown: 1, total: 3 },
      skippedAttempts: 1,
    });
  });

  it('shows only available evidence and reversibly projects a tracked path in SI', () => {
    expect(senooTransportCheckpoints(assembled)).toEqual([
      0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.010,
    ]);
    const beforeLoadReport = projectSenooTransportFrame(run, assembled, 0.0015);
    expect(beforeLoadReport.sites.every(site => site.state === 'unknown')).toBe(true);
    const initial = projectSenooTransportFrame(run, assembled, 0.002);
    expect(initial.sites).toMatchObject([
      { siteId: 'T1', state: 'occupied', atomId: 'A1' },
      { siteId: 'T2', state: 'empty', atomId: null },
      { siteId: 'R1', state: 'occupied', atomId: 'A2' },
    ]);
    const mid = projectSenooTransportFrame(run, assembled, 0.005);
    expect(mid.moves).toMatchObject([{ id: 'tracked-A2', pathKind: 'tracked', positionM: [5e-6, 1e-6, 4e-6], outcome: null }]);
    const interpolated = projectSenooTransportFrame(run, assembled, 0.0045).moves[0].positionM;
    expect(interpolated?.[0]).toBeCloseTo(5.5e-6, 14);
    expect(interpolated?.[1]).toBeCloseTo(0.5e-6, 14);
    expect(interpolated?.[2]).toBeCloseTo(6.5e-6, 14);
    expect(projectSenooTransportFrame(run, assembled, 0.007).moves[0].outcome).toBeNull();
    expect(projectSenooTransportFrame(run, assembled, 0.008).moves[0].outcome).toBe('survived');
    const final = projectSenooTransportFrame(run, assembled, 0.009);
    expect(final.sites).toMatchObject([
      { siteId: 'T1', state: 'occupied', atomId: 'A1' },
      { siteId: 'T2', state: 'occupied', atomId: 'A2' },
      { siteId: 'R1', state: 'empty', atomId: null },
    ]);
    expect(projectSenooTransportFrame(run, assembled, 0.005)).toEqual(mid);
    expect(projectSenooTransportFrame(run, assembled, 0.002)).toEqual(initial);
  });

  it('keeps commands and untracked events apart from positions and distinguishes empty from unknown', () => {
    const commanded = projectSenooTransportFrame(run, incomplete, 0.105);
    expect(commanded.moves).toMatchObject([{ id: 'command-B2', pathKind: 'commanded', positionM: null }]);
    const lost = projectSenooTransportFrame(run, incomplete, 0.109);
    expect(lost.sites.find(site => site.siteId === 'T2')).toMatchObject({ state: 'empty', atomId: null });
    const unknown = projectSenooTransportFrame(run, missingFinal, 0.210);
    expect(unknown.sites.find(site => site.siteId === 'T1')).toMatchObject({ state: 'unknown', atomId: null });
    expect(unknown.moves).toMatchObject([{ id: 'untracked-C2', pathKind: null, positionM: null }]);
    expect(projectSenooTransportFrame(run, skipped, 0.310).moves).toHaveLength(0);
  });

  it('restores a saved replay only with an existing attempt and an in-range cursor', () => {
    const origin = {
      filename: 'senoo-transport-synthetic.json',
      sha256: createHash('sha256').update(fixture).digest('hex'),
    };
    const archive = createSenooTransportReplayRecord(run, assembled.attemptId, 0.005, origin);
    const restore = (record: unknown) => parseSenooTransportImport(JSON.stringify(record));
    expect(restore(archive)).toEqual({ run, cursor: { attemptId: 'assembled', timeS: 0.005 }, origin });
    expect(() => restore({ ...archive, attemptId: 'not-recorded' })).toThrow(/轮号|游标/);
    expect(() => restore({ ...archive, timeS: 0.011 })).toThrow(/轮号|游标/);
    expect(() => restore({ ...archive, input: { ...origin, sha256: 'invalid' } })).toThrow(/SHA-256/);
  });
});
