import { describe, expect, it } from 'vitest';
import {
  assessSenooMeasuredCandidate, checkSenooMeasuredVerificationWorkbook, createSenooMeasuredVerificationReport,
  freezeSenooMeasuredReadout, inspectSenooMeasuredBatch, matchesSenooFrozenReadout,
  parseSenooFrozenMeasuredReadout, parseSenooMeasuredVerificationReport, scanSenooMeasuredCalibration,
  verifySenooMeasuredReadout, type SenooMeasuredWorkbook,
} from '../src/physics/senooMeasuredReadout';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

const cal = 'ENGINEERING-CAL';
const val = 'ENGINEERING-VAL';
const candidate = { first: 37, second: 47, firstComparison: 'ge', secondComparison: 'ge' } as const;
const scanOptions = {
  firstRange: { min: -1, max: 1000 }, secondRange: { min: -1, max: 1000 },
  firstComparison: 'ge', secondComparison: 'gt', rankBy: 'worst-group-error',
} as const;
const frozenAtUtc = '2026-12-01T00:00:00Z';
const plan = {
  confidenceLevel: 0.95, independenceRef: 'engineering-fixture://block-reference', minAttemptsPerGroup: 1,
  minEvaluableFraction: 1, limits: {
    m1Wrong: 0.2, m1Loss: 0.3, m1Ambiguity: 0.1, m0Wrong: 0.2, m0Loss: 0.3, m0Ambiguity: 0.1,
    emptyFalsePositive: 0.1, emptyAmbiguity: 0.1,
  },
} as const;

// Test-only shape derived from the packaged synthetic cases, never a measured artifact.
function engineeringWorkbook() {
  const sheets = freshSheets();
  for (const rows of Object.values(sheets)) {
    for (const row of rows) {
      for (const [index, value] of row.entries()) {
        if (typeof value === 'string') row[index] = value.replaceAll('synthetic://', 'engineering-fixture://')
          .replaceAll('SYN-CAL', cal).replaceAll('SYN-VAL', val);
      }
    }
  }
  setCell(sheets, '批次配置', 2, 'source_kind', 'measured');
  setCell(sheets, '批次配置', 3, 'source_kind', 'measured');
  return sheets;
}

function workbook(sheets = engineeringWorkbook(), filename = 'engineering-fixture.xlsx', sha256 = '1'.repeat(64)) {
  return { report: validateSenooMeasurements(sheets), filename, sha256 } satisfies SenooMeasuredWorkbook;
}

describe('Senoo measured dual exposure preparation', () => {
  it('requires measured declarations and traceable inputs in addition to general import validity', () => {
    const synthetic = workbook(freshSheets());
    expect(inspectSenooMeasuredBatch(synthetic, 'SYN-CAL', 'calibration').issues).toContainEqual(expect.stringContaining('measured'));
    expect(() => freezeSenooMeasuredReadout(synthetic, 'SYN-CAL', candidate, frozenAtUtc)).toThrow(/measured/);

    const relabeled = freshSheets();
    setCell(relabeled, '批次配置', 2, 'source_kind', 'measured');
    expect(inspectSenooMeasuredBatch(workbook(relabeled), 'SYN-CAL', 'calibration').issues)
      .toContainEqual(expect.stringContaining('synthetic://'));

    const incomplete = engineeringWorkbook();
    setCell(incomplete, '批次配置', 2, 'working_point', null);
    setCell(incomplete, '曝光记录', 2, 'actual_threshold', null);
    setCell(incomplete, '曝光记录', 2, 'exposure_start_us', null);
    setCell(incomplete, '尝试与位点', 2, 'prep_erasure_status', 'fail');
    const gaps = inspectSenooMeasuredBatch(workbook(incomplete), cal, 'calibration');
    expect(gaps.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('working_point'), expect.stringContaining('actual_threshold'),
      expect.stringContaining('exposure_start_us'), expect.stringContaining('制备擦除失败'),
    ]));
    expect(gaps.denominators).toMatchObject({ attemptedSites: 5, prepPassed: 3, validPairs: 3, included: 3, evaluated: 3 });
  });

  it('assesses explicit overlapping-channel candidates and each frame boundary on CAL alone', () => {
    const sheets = engineeringWorkbook();
    setCell(sheets, '曝光记录', 4, 'decision_count', 74);
    const input = workbook(sheets);
    const threshold = { first: 74, second: 12, firstComparison: 'gt', secondComparison: 'ge' } as const;
    const assessment = assessSenooMeasuredCandidate(input, cal, threshold);
    expect(assessment.samples[0]).toMatchObject({
      preparedGroup: 'm1', counts: { first: 74, second: 12 }, originalDecision: 'm1', outcome: 'm0',
    });
    expect(assessment.samples[0].frames.first).toMatchObject({
      actualThreshold: 36, thresholdOp: 'ge', triggerUs: 1124, startUs: 1130, endUs: 1180,
    });
    const signed = { first: -1, second: 12, firstComparison: 'ge', secondComparison: 'gt' } as const;
    expect(assessSenooMeasuredCandidate(input, cal, signed).samples[0].outcome).toBe('m1');
    expect(() => assessSenooMeasuredCandidate(input, val, threshold)).toThrow(/标定批次/);
    expect(() => assessSenooMeasuredCandidate(input, cal, { ...threshold, first: Infinity })).toThrow(/有限/);
  });

  it('scans the same eligible CAL pairs as manual scoring and records workbook provenance', () => {
    const input = workbook(engineeringWorkbook(), 'engineering-scan.xlsx', 'A'.repeat(64));
    const scan = scanSenooMeasuredCalibration(input, cal, scanOptions);
    expect(scan).toMatchObject({
      batchId: cal, runId: input.report.batches[0].acquisitionRunId,
      filename: 'engineering-scan.xlsx', sha256: 'a'.repeat(64), countUnit: 'counts',
      workingPoint: input.report.batches[0].metadata.working_point,
      options: scanOptions,
    });
    expect(scan.rows.length).toBeGreaterThan(0);
    for (const row of scan.rows) {
      const assessed = assessSenooMeasuredCandidate(input, cal, row.candidate);
      expect(assessed.denominators).toMatchObject({ attemptedSites: 5, evaluated: 3 });
      for (const group of assessed.groups) {
        expect(row.groups[group.preparedGroup]).toMatchObject({
          denominator: 1, wrong: group.wrongLabel, ambiguous: group.ambiguous,
          loss: group.preparedGroup === 'empty_control' ? 0 : group.reportedLoss,
        });
      }
      expect(row.totalErrors).toBe(assessed.denominators.evaluated - assessed.totals.correct);
    }
    expect(() => scanSenooMeasuredCalibration(input, val, scanOptions)).toThrow(/标定批次/);
    expect(() => scanSenooMeasuredCalibration(workbook(freshSheets()), 'SYN-CAL', scanOptions)).toThrow(/measured/);
  });

  it('keeps candidate axes and rankings invariant to changed or absent VAL records', () => {
    const baseline = scanSenooMeasuredCalibration(workbook(), cal, scanOptions);
    const shifted = engineeringWorkbook();
    setCell(shifted, '曝光记录', 14, 'decision_count', 900);
    const shiftedHash = 'b'.repeat(64);
    const shiftedResult = scanSenooMeasuredCalibration(workbook(shifted, 'shifted-val.xlsx', shiftedHash), cal, scanOptions);
    expect(shiftedResult).toEqual({ ...baseline, filename: 'shifted-val.xlsx', sha256: shiftedHash });

    const calOnly = engineeringWorkbook();
    for (const key of ['批次配置', '尝试与位点', '曝光记录', '事件时标'] as const) {
      calOnly[key] = calOnly[key].filter(row => row[0] !== val);
    }
    const calOnlyResult = scanSenooMeasuredCalibration(workbook(calOnly, 'cal-only.xlsx', 'c'.repeat(64)), cal, scanOptions);
    expect(calOnlyResult).toEqual({ ...baseline, filename: 'cal-only.xlsx', sha256: 'c'.repeat(64) });
  });

  it('freezes only CAL, exports raw stages, and recomputes its summary while parsing', () => {
    const input = workbook();
    const frozen = freezeSenooMeasuredReadout(input, cal, candidate, frozenAtUtc, ' plans/fit-v1.md ');
    expect(frozen).toMatchObject({
      frozenAtUtc, acceptancePlanRef: 'plans/fit-v1.md', candidate,
      assessment: {
        batchId: cal, countUnit: 'counts',
        denominators: {
          uniqueAttempts: 3, attemptedSites: 5, prepPassed: 4, validPairs: 3, included: 3, evaluated: 3,
          missingFrames: 1, skippedFrames: 2, invalidFrames: 0, unknownFrames: 0,
        },
      },
    });
    expect(frozen.assessment.attempts).toMatchObject([
      { attemptId: '0001', attemptedSites: 3, evaluated: 3 },
      { attemptId: '0002', attemptedSites: 1, evaluated: 0 },
      { attemptId: '0003', attemptedSites: 1, evaluated: 0 },
    ]);
    expect(frozen.assessment.records.length).toBe(5);
    expect(frozen.assessment.samples.length).toBe(3);
    expect(Reflect.set(frozen.candidate, 'first', 40)).toBe(false);
    expect(Reflect.set(frozen.assessment.samples[0].frames.first, 'decisionCount', 0)).toBe(false);
    expect(Reflect.set(input.report.records[0].frames[0], 'decisionCount', 75)).toBe(true);
    expect(frozen.assessment.samples[0].frames.first.decisionCount).toBe(74);

    const shiftedHoldout = engineeringWorkbook();
    setCell(shiftedHoldout, '曝光记录', 14, 'decision_count', 1000);
    expect(freezeSenooMeasuredReadout(workbook(shiftedHoldout), cal, candidate, frozenAtUtc, 'plans/fit-v1.md')).toEqual(frozen);
    expect(parseSenooFrozenMeasuredReadout(JSON.stringify(frozen))).toEqual(frozen);
    expect(() => parseSenooFrozenMeasuredReadout(JSON.stringify({
      ...frozen, candidate: { ...candidate, first: 0 },
    }))).toThrow(/标定摘要/);
    expect(() => parseSenooFrozenMeasuredReadout(JSON.stringify({
      ...frozen, assessment: { ...frozen.assessment, totals: { ...frozen.assessment.totals, ambiguous: 3 } },
    }))).toThrow(/标定摘要/);
  });

  it('uses the imported frozen rule on independent VAL and retains both original and candidate outcomes', () => {
    const frozen = parseSenooFrozenMeasuredReadout(JSON.stringify(freezeSenooMeasuredReadout(workbook(), cal, candidate, frozenAtUtc)));
    const validation = workbook(engineeringWorkbook(), 'holdout-engineering-fixture.xlsx', '2'.repeat(64));
    const before = JSON.stringify(frozen);
    const result = verifySenooMeasuredReadout(frozen, validation, val);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(result).toMatchObject({
      batchId: val, sha256: '2'.repeat(64), crossWorkpoint: false,
      denominators: { attemptedSites: 3, evaluated: 3 },
      totals: { wrongSpin: 0, spinEvaluated: 2, falseLoss: 1, emptyEvaluated: 1, emptyFalsePositive: 0, ambiguous: 0 },
      rates: { spinLoss: { numerator: 1, denominator: 2, rate: 0.5 } },
    });
    expect(result.samples[0]).toMatchObject({
      outcome: 'no-atom', originalDecision: 'm1',
      frames: { first: { actualThreshold: 36, thresholdOp: 'ge', decisionCount: 36 } },
    });
  });

  it('blocks reused runs, frame references and mismatched conditions while marking a different working point', () => {
    const frozen = freezeSenooMeasuredReadout(workbook(), cal, candidate, frozenAtUtc);

    const repeatedRun = engineeringWorkbook();
    repeatedRun['批次配置'].splice(1, 1);
    repeatedRun['尝试与位点'] = repeatedRun['尝试与位点'].filter(row => row[0] !== cal);
    repeatedRun['曝光记录'] = repeatedRun['曝光记录'].filter(row => row[0] !== cal);
    repeatedRun['事件时标'] = repeatedRun['事件时标'].filter(row => row[0] !== cal);
    setCell(repeatedRun, '批次配置', 2, 'acquisition_run_id', frozen.assessment.runId);
    expect(() => verifySenooMeasuredReadout(frozen, workbook(repeatedRun), val)).toThrow(/不同采集运行/);

    const reusedSource = engineeringWorkbook();
    setCell(reusedSource, '曝光记录', 12, 'raw_ref', frozen.assessment.samples[0].sourceRefs.first);
    expect(() => verifySenooMeasuredReadout(frozen, workbook(reusedSource), val)).toThrow(/共用原始帧引用/);

    const reusedScreenedSource = engineeringWorkbook();
    const screenedCalibration = frozen.assessment.records.find(site => site.attemptId === '0002')!;
    const screenedFrame = screenedCalibration.frames.find(frame => frame.status === 'valid')!;
    expect(frozen.assessment.samples.some(sample => sample.attemptId === '0002')).toBe(false);
    setCell(reusedScreenedSource, '曝光记录', 12, 'raw_ref', screenedFrame.sourceRef);
    expect(() => verifySenooMeasuredReadout(frozen, workbook(reusedScreenedSource), val)).toThrow(/共用原始帧引用/);

    const mismatched = engineeringWorkbook();
    setCell(mismatched, '批次配置', 3, 'roi_map_version', 'another-fixture-roi');
    expect(() => verifySenooMeasuredReadout(frozen, workbook(mismatched), val)).toThrow(/roi_map_version/);

    const transfer = engineeringWorkbook();
    setCell(transfer, '批次配置', 3, 'working_point', 'fixture-other-point');
    expect(verifySenooMeasuredReadout(frozen, workbook(transfer), val).crossWorkpoint).toBe(true);
  });
});

describe('Senoo independent readout report replay', () => {
  it('stores the holdout conditions and recomputes the outcomes, denominators and acceptance plan', () => {
    const frozen = freezeSenooMeasuredReadout(workbook(), cal, candidate, frozenAtUtc, 'engineering-plan', plan);
    const holdout = workbook(engineeringWorkbook(), 'holdout.xlsx', 'a'.repeat(64));
    const report = createSenooMeasuredVerificationReport(frozen, holdout, val);
    expect(report).toMatchObject({
      kind: 'senoo-measured-verification', schemaVersion: 3, holdoutConditions: frozen.conditions,
      verification: { batchId: val, crossWorkpoint: false, acceptance: { status: 'inconclusive' },
        rates: { spinLoss: { numerator: 1, denominator: 2 } } },
    });
    const replayed = parseSenooMeasuredVerificationReport(JSON.stringify(report));
    expect(replayed).toEqual(report);
    expect(matchesSenooFrozenReadout(frozen, replayed.frozen)).toBe(true);
    expect(Reflect.set(replayed.verification.records[0].frames[0], 'decisionCount', 100)).toBe(false);

    const transfer = engineeringWorkbook();
    setCell(transfer, '批次配置', 3, 'working_point', 'fixture-other-point');
    const changed = createSenooMeasuredVerificationReport(frozen, workbook(transfer), val);
    expect(parseSenooMeasuredVerificationReport(JSON.stringify(changed)).verification.acceptance?.status).toBe('cross-workpoint');
  });

  it('replays both legacy export versions without adding unrecorded holdout conditions', () => {
    const input = workbook();
    const frozenRules = [freezeSenooMeasuredReadout(input, cal, candidate, frozenAtUtc),
      freezeSenooMeasuredReadout(input, cal, candidate, frozenAtUtc, 'engineering-plan', plan)];
    for (const frozen of frozenRules) {
      const legacy = { schemaVersion: frozen.schemaVersion, frozen, verification: verifySenooMeasuredReadout(frozen, input, val) };
      const restored = parseSenooMeasuredVerificationReport(JSON.stringify(legacy));
      expect(restored).toEqual(legacy);
      expect(restored).not.toHaveProperty('holdoutConditions');
      expect(checkSenooMeasuredVerificationWorkbook(restored, input)).toBe('match');
      if (frozen.schemaVersion === 1) {
        const earliest = structuredClone(legacy);
        Reflect.deleteProperty(earliest.verification, 'acceptance');
        expect(parseSenooMeasuredVerificationReport(JSON.stringify(earliest))).toEqual(legacy);
      }
    }
  });

  it('rejects tampered results, duplicate holdout rows, illegal frame sources, overlaps and conditions', () => {
    const input = workbook();
    const frozen = freezeSenooMeasuredReadout(input, cal, candidate, frozenAtUtc, 'engineering-plan', plan);
    const report = createSenooMeasuredVerificationReport(frozen, input, val);
    const { verification } = report;
    const [first, ...remaining] = verification.records;
    const withReference = (sourceRef: string) => [{ ...first, frames: [{ ...first.frames[0], sourceRef }, first.frames[1]] }, ...remaining];
    const changedSummaries = [
      { ...verification, denominators: { ...verification.denominators, evaluated: 100 } },
      { ...verification, acceptance: { ...verification.acceptance, status: 'pass' } },
      { ...verification, records: [first, first, ...remaining] },
      { ...verification, records: withReference('synthetic://illegal-frame') },
      { ...verification, records: withReference(frozen.assessment.samples[0].sourceRefs.first) },
      { ...verification, runId: frozen.assessment.runId },
    ];
    for (const changed of changedSummaries) {
      expect(() => parseSenooMeasuredVerificationReport(JSON.stringify({ ...report, verification: changed }))).toThrow(/重算结果/);
    }
    expect(() => parseSenooMeasuredVerificationReport(JSON.stringify({
      ...report, holdoutConditions: { ...report.holdoutConditions, roi_map_version: 'fixture-other-roi' },
    }))).toThrow(/重算结果/);
  });

  it('audits renamed workbook bytes and rejects matching hashes with mismatched source observations', () => {
    const input = workbook();
    const frozen = freezeSenooMeasuredReadout(input, cal, candidate, frozenAtUtc);
    const holdout = workbook(engineeringWorkbook(), 'holdout.xlsx', 'a'.repeat(64));
    const report = createSenooMeasuredVerificationReport(frozen, holdout, val);
    expect(checkSenooMeasuredVerificationWorkbook(report, null)).toBe('no-workbook');
    expect(checkSenooMeasuredVerificationWorkbook(report, input)).toBe('different-workbook');
    expect(checkSenooMeasuredVerificationWorkbook(report, { ...holdout, filename: 'renamed.xlsx', sha256: 'A'.repeat(64) })).toBe('match');

    const changed = engineeringWorkbook();
    setCell(changed, '曝光记录', 12, 'decision_count', 1000);
    expect(() => checkSenooMeasuredVerificationWorkbook(report, workbook(changed, 'holdout.xlsx', 'a'.repeat(64))))
      .toThrow(/逐轮记录或条件不一致/);
  });
});
