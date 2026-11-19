import { describe, expect, it } from 'vitest';
import { createSenooCzBenchmarkTemplate, parseSenooCzBenchmark } from '../src/physics/senooCzBenchmark';

const ref = 'engineering-fixture://cz-grb';
const sequences = [
  { sequenceId: 's0', seed: '0001', depth: 0, target: '00', sourceRef: `${ref}/sequence/0` },
  { sequenceId: 's4', seed: '0042', depth: 4, target: '11', sourceRef: `${ref}/sequence/4` },
];
const attempts = [
  {
    attemptId: 'trial-1', pairId: 'pair-1', blockId: 'block-1', sequenceId: 's4', siteIds: ['b', 'a'],
    masks: { prep: true, decay: false, loss: true }, bitstring: '11', survival: ['present', 'present'],
    sourceRef: `${ref}/trial/1/pair/1`, survivalRef: `${ref}/trial/1/survival`,
  },
  {
    attemptId: 'trial-1', pairId: 'pair-2', blockId: 'block-1', sequenceId: 's4', siteIds: ['c', 'd'],
    masks: { prep: true, decay: false, loss: false }, bitstring: null, survival: ['lost', 'unknown'],
    sourceRef: `${ref}/trial/1/pair/2`, survivalRef: `${ref}/trial/1/survival`,
  },
  {
    attemptId: 'trial-2', pairId: 'pair-1', blockId: 'block-2', sequenceId: 's0', siteIds: ['b', 'a'],
    masks: { prep: false, decay: true, loss: false }, bitstring: '00', survival: ['unknown', 'unknown'],
    sourceRef: `${ref}/trial/2/pair/1`, survivalRef: null,
  },
];
const batch = {
  ...createSenooCzBenchmarkTemplate(), sourceKind: 'measured', sourceRef: ref, waveformSha256: 'AB'.repeat(32),
  apparatusVersion: 'fixture-apparatus', gateVersion: 'fixture-cz', workingPoint: 'fixture-workpoint',
  acquisitionRunId: 'engineering-grb-only-run', protocolRef: `${ref}/protocol`, maskRef: `${ref}/masks`,
  readoutCalibrationRef: `${ref}/readout`, survivalProtocolRef: `${ref}/survival`, independenceRef: `${ref}/blocks`,
  confidenceLevel: 0.95, mode: 'non-echo', expectedAttempts: attempts.length, sequences, attempts,
};

const parse = (value: unknown) => parseSenooCzBenchmark(JSON.stringify(value));
const withAttempt = (index: number, patch: object) => ({
  ...batch, attempts: attempts.map((attempt, i) => i === index ? { ...attempt, ...patch } : attempt),
});

describe('Senoo CZ gRB independent batch input', () => {
  it('downloads a blank template and preserves recorded masks, sequence seeds and ordered sites', () => {
    expect(createSenooCzBenchmarkTemplate()).toMatchObject({
      kind: 'senoo-cz-benchmark', schemaVersion: 1, sourceKind: null, mode: null, waveformSha256: null,
      expectedAttempts: null, attempts: [], sequences: [],
    });
    expect(() => parse(createSenooCzBenchmarkTemplate())).toThrow(/sourceKind/);
    expect(parse(batch)).toEqual({ ...batch, waveformSha256: batch.waveformSha256.toLowerCase() });
    expect(parse({ ...batch, mode: 'echo' }).mode).toBe('echo');
  });

  it('rejects inconsistent attempt totals, duplicate pair attempts, split blocks and unstable ordered sites', () => {
    expect(() => parse({ ...batch, expectedAttempts: 2 })).toThrow(/全部原子对尝试/);
    expect(() => parse({ ...batch, expectedAttempts: 0 })).toThrow(/expectedAttempts/);
    expect(() => parse(withAttempt(2, { attemptId: 'trial-1 ' }))).toThrow(/组合重复/);
    expect(() => parse(withAttempt(1, { blockId: 'block-other' }))).toThrow(/blockId.*同一采集尝试/);
    expect(() => parse(withAttempt(2, { siteIds: ['a', 'b'] }))).toThrow(/顺序不一致/);
    expect(() => parse(withAttempt(1, { siteIds: ['same', ' same '] }))).toThrow(/应互异/);
  });

  it('checks sequence identity, seed, target and safe depth before resolving attempt links', () => {
    expect(() => parse({ ...batch, sequences: [] })).toThrow(/非空线路/);
    expect(() => parse({ ...batch, sequences: [sequences[0], { ...sequences[1], sequenceId: 's0 ' }] })).toThrow(/sequenceId.*重复/);
    expect(() => parse({ ...batch, sequences: [{ ...sequences[0], depth: Number.MAX_SAFE_INTEGER + 1 }] })).toThrow(/\.depth/);
    expect(() => parse({ ...batch, sequences: [{ ...sequences[0], seed: 1 }] })).toThrow(/\.seed/);
    expect(() => parse({ ...batch, sequences: [{ ...sequences[0], target: '000' }] })).toThrow(/\.target/);
    expect(() => parse(withAttempt(0, { sequenceId: 's8' }))).toThrow(/sequenceId.*不存在/);
  });

  it('rejects implicit masks, missing bitstrings and survival confirmation without evidence', () => {
    expect(() => parse(withAttempt(0, { masks: { prep: true, decay: false } }))).toThrow(/masks.*布尔/);
    expect(() => parse(withAttempt(0, { bitstring: undefined }))).toThrow(/\.bitstring/);
    expect(() => parse(withAttempt(1, { bitstring: '11' }))).toThrow(/bitstring.*丢失冲突/);
    expect(() => parse(withAttempt(1, { survivalRef: null }))).toThrow(/survivalRef.*证据/);
    expect(() => parse(withAttempt(2, { survival: ['false', 'unknown'] }))).toThrow(/survival\[0\]/);
    expect(parse(withAttempt(2, { bitstring: null })).attempts[2]).toMatchObject({
      bitstring: null, survival: ['unknown', 'unknown'], survivalRef: null,
    });
  });

  it('checks schema, aggregate references, confidence, and evidence source declarations', () => {
    expect(() => parseSenooCzBenchmark('{')).toThrow(/JSON/);
    expect(() => parse({ ...batch, schemaVersion: 2 })).toThrow(/v1/);
    expect(() => parse({ ...batch, mode: 'unknown' })).toThrow(/mode/);
    expect(() => parse({ ...batch, confidenceLevel: 1 })).toThrow(/confidenceLevel/);
    expect(() => parse({ ...batch, waveformSha256: 'wrong' })).toThrow(/SHA-256/);
    expect(() => parse({ ...batch, maskRef: 'LiTeRaTuRe://fig3b' })).toThrow(/maskRef.*冲突/);
    expect(() => parse({ ...batch, independenceRef: '' })).toThrow(/independenceRef/);
    expect(() => parse(withAttempt(1, { survivalRef: 'synthetic://survival' }))).toThrow(/survivalRef.*冲突/);
    expect(parse({ ...withAttempt(1, { sourceRef: 'synthetic://shot' }), sourceKind: 'synthetic' }).sourceKind).toBe('synthetic');
  });
});
