import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createSenooTransportReplayRecord } from '../src/physics/senooTransportReplay';
import { parseSenooTransportRun } from '../src/physics/senooTransportRun';

const fixture = resolve('tests/fixtures/senoo-transport-synthetic.json');
const fixtureText = readFileSync(fixture, 'utf8');
const fixtureHash = createHash('sha256').update(fixtureText).digest('hex');
const directory = mkdtempSync(join(tmpdir(), 'senoo-transport-audit-test-'));
const cli = join(directory, 'audit.mjs');

beforeAll(() => {
  buildSync({
    entryPoints: ['scripts/audit-senoo-transport-acquisition.ts'], outfile: cli,
    bundle: true, platform: 'node', format: 'esm',
  });
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function execute(...paths: string[]) {
  return spawnSync(process.execPath, [cli, ...paths], { encoding: 'utf8' });
}

it('flags the same run inside a replay and distinguishes the input hashes', () => {
  const run = parseSenooTransportRun(fixtureText);
  const first = run.attempts[0];
  const origin = { filename: basename(fixture), sha256: fixtureHash };
  const replay = createSenooTransportReplayRecord(run, first.attemptId, first.startS, origin);
  const wrapperPath = join(directory, 'replay.json');
  writeFileSync(wrapperPath, JSON.stringify(replay));
  const result = execute(fixture, wrapperPath);
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe('conflict');
  expect(report.runs[0]).toMatchObject({ sha256: fixtureHash, declaredReplayOrigin: null });
  expect(report.runs[1].sha256).not.toBe(fixtureHash);
  expect(report.runs[1].declaredReplayOrigin).toEqual(origin);
  expect(report.comparison.conflicts).toContain('采集运行 ID 相同。');
  expect(report.comparison.reviews).toContain('回放登记的原输入哈希指向同一文件，核查原件。');
});

it('reports reused frame evidence under two distinct trial and run IDs for source review', () => {
  const original = parseSenooTransportRun(fixtureText);
  const second = JSON.parse(fixtureText.replaceAll('synthetic://senoo-transport/', 'synthetic://second/'));
  second.acquisitionRunId = 'SYN-TRANSPORT-02';
  second.attempts[1].attemptId = 'second-trial';
  const sharedRef = original.attempts[0].initial!.sourceRef;
  second.attempts[1].final.sourceRef = sharedRef;
  const secondPath = join(directory, 'second.json');
  writeFileSync(secondPath, JSON.stringify(second));
  const result = execute(fixture, secondPath);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe('source-review');
  expect(report.comparison.conflicts).toEqual([]);
  expect(report.comparison.sharedTrialEvidence).toEqual([{
    sourceRef: sharedRef, firstAttempts: [original.attempts[0].attemptId], secondAttempts: ['second-trial'],
  }]);
});

it('exits with code two and identifies an unreadable input', () => {
  const missing = join(directory, 'not-delivered.json');
  const result = execute(fixture, missing);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain(missing);
  expect(result.stdout).toBe('');
});

it('keeps two public layouts, incomplete trials and unobserved move totals distinct from Senoo', () => {
  const frame = (ref: string, occupancy: string | null) => ({
    rawFrameRef: ref, decisionRef: occupancy ? 'fixture#decisions' : null, occupancy, timeS: null,
  });
  const publicRun = {
    kind: 'public-transport-run', schemaVersion: 1, apparatus: 'cross-apparatus test fixture', species: '88Sr',
    sourceRef: 'fixture#source', selectionRef: 'two fixture trials', decisionRef: 'fixture#rule', clockRef: null,
    minimumInitialAtoms: 2, initialLayout: { siteIds: ['i1', 'i2', 'i3'], coordinates: null },
    finalLayout: { siteIds: ['f1', 'f2'], targetSiteIds: ['f1', 'f2'], coordinates: null },
    attempts: [
      { attemptId: 'a', sourceRef: 'fixture#a', recordedTime: '2025-01-08 15:00', initial: frame('a1', '101'), final: frame('a2', '01'), moves: null },
      { attemptId: 'b', sourceRef: 'fixture#b', initial: frame('a2', '1?0'), final: null, moves: null },
    ],
  };
  const input = join(directory, 'public.json');
  Object.assign(publicRun.attempts[0].initial, { rawFrameSha256: '1'.repeat(64) });
  Object.assign(publicRun.attempts[0].final!, { rawFrameSha256: '1'.repeat(64) });
  writeFileSync(input, JSON.stringify(publicRun));
  expect(execute(input).status).toBe(2);
  const result = execute('--public-transport', input);
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.evidence).toBe('cross-apparatus');
  expect(report.statistics).toMatchObject({
    pairedRawFrames: 1, pairedMeasuredTimes: 0, loading: { numerator: 3, denominator: 5, total: 6 },
    targetOccupancy: { numerator: 1, denominator: 2, total: 4 },
    finalOccupancy: { numerator: 1, denominator: 2, total: 4 }, assembly: { numerator: 0, denominator: 1, total: 2 },
    survival: { numerator: 0, denominator: 0, total: null, attemptsWithoutMoveLog: 2 },
  });
  expect(report.findings).toMatchObject({
    missingFinalRawFrame: ['b'], missingTargetAtoms: ['a'],
    reusedRawFrames: [{ rawFrameRef: 'a2', uses: [{ attemptId: 'a', phase: 'final' }, { attemptId: 'b', phase: 'initial' }] }],
    repeatedRawFrameHashes: [{ sha256: '1'.repeat(64), uses: [{ attemptId: 'a', phase: 'initial' }, { attemptId: 'a', phase: 'final' }] }],
  });
  expect(report.selection).toMatchObject({ excluded: [], undetermined: ['b'], eligibleStatistics: { attempts: 1 } });
  expect(report.attempts[0].recordedTime).toBe(publicRun.attempts[0].recordedTime);
  const missingClock = structuredClone(publicRun);
  Object.assign(missingClock.attempts[0].initial, { timeS: 1 });
  writeFileSync(input, JSON.stringify(missingClock));
  expect(execute('--public-transport', input).status).toBe(2);
});
