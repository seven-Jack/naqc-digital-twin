import { describe, expect, it } from 'vitest';
import { createSenooCircuitBatchTemplate, parseSenooCircuitBatch } from '../src/physics/senooCircuitBatch';

const ref = 'engineering-fixture://sensor-log';
const stage = (startS: number, endS: number) => ({ status: 'executed', startS, endS, sourceRef: ref, reason: null });
const skipped = (reason: string) => ({ status: 'skipped', startS: null, endS: null, sourceRef: null, reason });

function frame(imageNo: 1 | 2, count: number, roiId: string) {
  const triggerS = imageNo === 1 ? 1e-6 : 2e-6;
  return {
    imageNo, status: 'valid', exposureId: `image-${imageNo}`, sourceRef: `${ref}/image-${imageNo}`,
    roiId,
    count, actualThreshold: 2, comparison: imageNo === 1 ? 'ge' : 'gt', triggerS, startS: triggerS,
    endS: triggerS + 0.4e-6, countReadyS: triggerS + 0.9e-6,
  };
}

function rawBatch() {
  const forward = [frame(1, 0, 'roi-A'), frame(2, 4, 'roi-A')];
  const reverse = [frame(2, 0, 'roi-B'), frame(1, 3, 'roi-B')];
  return {
    ...createSenooCircuitBatchTemplate(), sourceKind: 'measured', sourceRef: ref, trapWavelengthM: 767e-9,
    apparatusVersion: 'engineering-apparatus', protocolVersion: 'engineering-protocol', workingPoint: 'engineering-point',
    cameraConfigRef: ref, roiMapVersion: 'engineering-roi', countProcessingRef: ref, outcomePolicy: 'engineering-outcomes',
    screeningRuleRef: ref, circuitSelectionRuleRef: `${ref}/analysis-spec`, countUnit: 'counts',
    acquisitionRunId: 'engineering-circuit-run', batchId: 'engineering-circuit-batch',
    acquiredAtUtc: '2026-11-18T01:02:03.1234Z', clockId: 'test-t0', timeOriginRef: ref,
    circuitId: 'bell', circuitVersion: 'engineering-circuit-version', basis: 'XZ',
    siteIds: ['target-A', 'target-B'], targetBitstrings: ['01'], expectedAttempts: 1,
    attempts: [{
      attemptId: '0001', sourceRef: `${ref}/attempt-0001`,
      selection: { status: 'included', sourceRef: `${ref}/analysis-mask`, reason: null },
      initialOccupiedSiteIds: ['reservoir-A', 'target-B'], postTransportOccupiedSiteIds: ['target-A', 'target-B'],
      stages: {
        load: stage(-3e-6, -2e-6), transport: stage(-2e-6, -1e-6), gate: stage(-1e-6, 1e-6), readout: stage(1e-6, 4e-6),
      },
      sites: [
        { siteId: 'target-B', instrumentDecision: 'm1', frames: reverse },
        { siteId: 'target-A', instrumentDecision: 'm0', frames: forward },
      ],
    }],
  };
}

const parse = (input: unknown) => parseSenooCircuitBatch(JSON.stringify(input));

describe('Senoo circuit batch import', () => {
  it('keeps the download template blank and accepts signed times with shared camera images in logical site order', () => {
    const template = createSenooCircuitBatchTemplate();
    expect(template).toMatchObject({ sourceKind: null, expectedAttempts: null, attempts: [] });
    expect(() => parse(template)).toThrow(/sourceKind/);

    const batch = parse(rawBatch());
    expect(batch).toMatchObject({ sourceKind: 'measured', basis: 'XZ', targetBitstrings: ['01'], expectedAttempts: 1 });
    expect(batch.attempts[0].stages.load.startS).toBe(-3e-6);
    expect(batch.attempts[0].selection).toEqual({ status: 'included', sourceRef: `${ref}/analysis-mask`, reason: null });
    expect(batch.attempts[0].sites.map(site => site.siteId)).toEqual(batch.siteIds);
    const [first, second] = batch.attempts[0].sites;
    expect(first.frames.map(value => value.imageNo)).toEqual([1, 2]);
    expect(second.frames[0]).toMatchObject({ exposureId: first.frames[0].exposureId, count: 3, comparison: 'ge' });
    expect(parse(batch)).toEqual(batch);
  });

  it('allows no-motion occupancy and keeps a failed gate preceding diagnostic readout', () => {
    const batch = rawBatch();
    const attempt = batch.attempts[0];
    attempt.initialOccupiedSiteIds = [...attempt.postTransportOccupiedSiteIds].reverse();
    const withNoMotion = { ...attempt, stages: { ...attempt.stages, transport: skipped('already filled') } };
    expect(parse({ ...batch, attempts: [withNoMotion] }).attempts[0].stages.transport.status).toBe('skipped');
    expect(() => parse({ ...batch, attempts: [{ ...withNoMotion, initialOccupiedSiteIds: [] }] })).toThrow(/前后占位/);

    const diagnostics = { ...withNoMotion, stages: {
      ...withNoMotion.stages,
      gate: { ...attempt.stages.gate, status: 'failed', reason: 'stop before circuit completion' },
      readout: { ...attempt.stages.readout, status: 'failed', reason: 'second exposure did not complete' },
    } };
    expect(parse({ ...batch, attempts: [diagnostics] }).attempts[0].sites[0].frames[0].count).toBe(0);
  });

  it('rejects incomplete attempt totals, missing site rows, duplicated IDs and sources contradicting measured', () => {
    const batch = rawBatch();
    const [attempt] = batch.attempts;
    expect(() => parse({ ...batch, expectedAttempts: 2 })).toThrow(/完整尝试总数/);
    expect(() => parse({ ...batch, expectedAttempts: 2, attempts: [attempt, attempt] })).toThrow(/重复的尝试 ID/);
    expect(() => parse({ ...batch, attempts: [{ ...attempt, sites: attempt.sites.slice(1) }] })).toThrow(/所有目标位点/);
    attempt.sites[0].frames[0].sourceRef = 'synthetic://exposure';
    expect(() => parse(batch)).toThrow(/实测声明与来源类型冲突/);
    expect(parse({ ...batch, sourceKind: 'synthetic' }).attempts[0].sites[1].frames[1].sourceRef).toBe('synthetic://exposure');
  });

  it('rejects noncausal acquisition windows, missing frame slots and gates without confirmed occupancy', () => {
    const batch = rawBatch();
    const [attempt] = batch.attempts;
    expect(() => parse({ ...batch, attempts: [{ ...attempt, postTransportOccupiedSiteIds: ['target-B'] }] })).toThrow(/全部目标位点/);
    expect(() => parse({ ...batch, attempts: [{ ...attempt, stages: { ...attempt.stages, readout: stage(0, 4e-6) } }] })).toThrow(/阶段开始早于/);
    const bothFrames = attempt.sites[1].frames;
    attempt.sites[1].frames = [bothFrames[0]];
    expect(() => parse(batch)).toThrow(/包括缺帧与跳过/);
    attempt.sites[1].frames = bothFrames;
    bothFrames[1].countReadyS = 5e-6;
    expect(() => parse(batch)).toThrow(/落在读出阶段/);
    bothFrames[1].countReadyS = 3e-6;
    bothFrames[1].exposureId = bothFrames[0].exposureId;
    expect(() => parse(batch)).toThrow(/分配给两个 Image/);
  });

  it('retains a screened attempt and its otherwise valid frames with documented mask origin and reason', () => {
    const batch = rawBatch();
    const [attempt] = batch.attempts;
    const selection = { status: 'excluded', sourceRef: `${ref}/flag-rejection`, reason: 'erasure flag' };
    const screened = { ...attempt, selection };
    expect(parse({ ...batch, attempts: [screened] }).attempts[0]).toMatchObject({
      selection, stages: { gate: { status: 'executed' } },
    });
    expect(() => parse({ ...batch, attempts: [{ ...screened, selection: { ...selection, reason: null } }] }))
      .toThrow(/筛除尝试须登记原因/);
    expect(() => parse({ ...batch, attempts: [{ ...attempt, selection: { ...attempt.selection, sourceRef: null } }] }))
      .toThrow(/selection\.sourceRef/);
    expect(() => parse({ ...batch, circuitSelectionRuleRef: null })).toThrow(/circuitSelectionRuleRef/);
  });

  it('rejects inconsistent shared camera timing or reused ROI across targets', () => {
    const batch = rawBatch();
    const first = batch.attempts[0].sites[1].frames[0];
    const originalStart = first.startS;
    first.startS += 1e-7;
    expect(() => parse(batch)).toThrow(/相机时标不一致/);
    first.startS = originalStart;
    first.roiId = 'roi-B';
    expect(() => parse(batch)).toThrow(/位点 ROI 重复/);
    first.roiId = '';
    expect(() => parse(batch)).toThrow(/roiId/);
  });
});
