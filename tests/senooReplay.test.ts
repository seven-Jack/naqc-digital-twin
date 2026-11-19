import { describe, expect, it } from 'vitest';
import { SENOO_APPARATUS_PROFILE, SENOO_REPLAY_STAGES } from '../src/data/senooApparatus';
import {
  createSenooReplayRecord, importSenooReplayRecord, senooReplayFrame, senooReplaySample,
} from '../src/physics/senooReplay';

function stagePosition(id: typeof SENOO_REPLAY_STAGES[number]['id']) {
  return SENOO_REPLAY_STAGES.findIndex(stage => stage.id === id);
}

describe('Senoo Figure 2b literature replay', () => {
  it('reveals each measurement at its completed exposure and supports rewind', () => {
    const sample = senooReplaySample('spin0', 128);
    const frame = (stage: Parameters<typeof stagePosition>[0]) => senooReplayFrame(sample, stagePosition(stage));
    expect(frame('image-1')).toMatchObject({ state: 'm0', firstCount: null, secondCount: null, decision: null });
    expect(frame('rotate')).toMatchObject({ state: 'm1', firstCount: 20.17751863, secondCount: null, decision: null });
    expect(frame('image-2')).toMatchObject({ state: 'g0', firstCount: 20.17751863, secondCount: null, decision: null });
    expect(frame('decision')).toMatchObject({
      state: 'removed', firstCount: 20.17751863, secondCount: 167.17751863, decision: { outcome: 'm0' },
    });
    expect(frame('clock-1')).toMatchObject({ state: 'm0', firstCount: null, secondCount: null, decision: null });
  });

  it('keeps the nominal state independent of the exploratory thresholds', () => {
    const spin1 = senooReplaySample('spin1', 0);
    expect(senooReplayFrame(spin1, stagePosition('clock-1')).state).toBe('g0');
    expect(senooReplayFrame(spin1, stagePosition('rotate')).state).toBe('removed');
    expect(senooReplayFrame(spin1, stagePosition('decision')).decision?.outcome).toBe('m1');
    const empty = senooReplaySample('loss', 0);
    expect(senooReplayFrame(empty, 1).state).toBe('unknown');
    expect(senooReplayFrame(empty, stagePosition('prepare')).state).toBe('empty');
    expect(senooReplayFrame(empty, stagePosition('decision')).decision?.outcome).toBe('no-atom');
    expect(SENOO_APPARATUS_PROFILE.sampleExposureTimesS).toBeNull();
    expect(SENOO_APPARATUS_PROFILE.publishedThresholdsCounts).toBeNull();
  });

  it('restores the exact source and cursor and rejects changed values, provenance or rule', () => {
    const sample = senooReplaySample('spin1', 254);
    const record = createSenooReplayRecord(sample, 8.375);
    expect(record.sample).toMatchObject({
      pointId: 'Fig2b_spin1:IV',
      cells: { first: 'IV2', second: 'IV3' },
      counts: { first: 86.67751863, second: 26.17751863 },
    });
    expect(importSenooReplayRecord(JSON.stringify(record))).toEqual(record);
    expect(() => importSenooReplayRecord(JSON.stringify({
      ...record, sample: { ...sample, counts: { ...sample.counts, first: 86 } },
    }))).toThrow('样本计数');
    expect(() => importSenooReplayRecord(JSON.stringify({
      ...record, source: { ...record.source, workbook: { ...record.source.workbook, sha256: 'mismatch' } },
    }))).toThrow('工作簿哈希');
    expect(() => importSenooReplayRecord(JSON.stringify({
      ...record, rule: { ...record.rule, thresholds: { first: 39, second: 40 } },
    }))).toThrow('判决规则');
    expect(() => importSenooReplayRecord(JSON.stringify({ ...record, position: 11 }))).toThrow('回放进度');
  });
});
