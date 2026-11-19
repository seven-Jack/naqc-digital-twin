import { describe, expect, it } from 'vitest';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { freezeSenooSyntheticRule, verifySenooSyntheticRule } from '../src/physics/senooSyntheticWorkflow';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

const calibrationId = 'SYN-CAL';
const validationId = 'SYN-VAL';

describe('Senoo synthetic calibration and independent validation', () => {
  it('chooses and freezes the same rule using only included SYN-CAL pairs', () => {
    const sheets = freshSheets();
    const report = validateSenooMeasurements(sheets);
    expect(report.issues).toEqual([]);
    const frozen = freezeSenooSyntheticRule(report, calibrationId);
    expect(frozen).toMatchObject({
      evidence: 'synthetic-acceptance',
      calibrationBatchId: calibrationId,
      calibrationRunId: 'synthetic://SYN-CAL/run',
      countUnit: 'counts',
      rule: { thresholds: { first: 37, second: 47 } },
      channelBounds: {
        first: { darkMax: 0, brightMin: 74 },
        second: { darkMax: 12, brightMin: 82 },
      },
      denominators: { attemptedSites: 5, prepPassed: 4, validPairs: 3, included: 3, evaluated: 3 },
    });
    expect(frozen.samples).toHaveLength(3);
    expect(Reflect.set(frozen.rule.thresholds, 'first', 0)).toBe(false);
    expect(Reflect.set(frozen.rule.outcomes, 'lowLow', 'm1')).toBe(false);

    // This included holdout value would destroy the CAL separation if it leaked.
    setCell(sheets, '曝光记录', 14, 'decision_count', 1000);
    expect(freezeSenooSyntheticRule(validateSenooMeasurements(sheets), calibrationId)).toEqual(frozen);
    expect(freezeSenooSyntheticRule({
      ...report,
      batches: report.batches.filter(batch => batch.id === calibrationId),
      records: report.records.filter(record => record.batchId === calibrationId),
    }, calibrationId)).toEqual(frozen);
  });

  it('uses the saved rule for SYN-VAL and retains the original instrument decision', () => {
    const report = validateSenooMeasurements(freshSheets());
    const frozen = freezeSenooSyntheticRule(report, calibrationId);
    const before = JSON.stringify(frozen);
    const verified = verifySenooSyntheticRule(frozen, report, validationId);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(verified).toMatchObject({
      validationBatchId: validationId,
      denominators: { attemptedSites: 3, prepPassed: 3, validPairs: 3, included: 3, evaluated: 3 },
      totals: {
        evaluated: 3, spinEvaluated: 2, wrongSpin: 0, falseLoss: 1, ambiguous: 0,
        emptyEvaluated: 1, emptyFalsePositive: 0, correct: 2, reportedLoss: 2,
      },
    });
    expect(verified.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ preparedGroup: 'm1', evaluated: 1, wrongLabel: 0, reportedLoss: 1, ambiguous: 0, correct: 0 }),
      expect.objectContaining({ preparedGroup: 'm0', evaluated: 1, wrongLabel: 0, reportedLoss: 0, ambiguous: 0, correct: 1 }),
      expect.objectContaining({ preparedGroup: 'empty_control', evaluated: 1, reportedLoss: 1, ambiguous: 0, correct: 1 }),
    ]));
    expect(verified.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: 'no-atom', originalDecision: 'm1' }),
      expect.objectContaining({ outcome: 'm0', originalDecision: 'm0' }),
      expect.objectContaining({ outcome: 'no-atom', originalDecision: 'loss' }),
    ]));
  });

  it('rejects incompatible roles, unverified sources and reused acquisition runs', () => {
    const report = validateSenooMeasurements(freshSheets());
    const frozen = freezeSenooSyntheticRule(report, calibrationId);
    expect(() => freezeSenooSyntheticRule(report, validationId)).toThrow();
    expect(() => verifySenooSyntheticRule(frozen, report, calibrationId)).toThrow();

    const measured = freshSheets();
    setCell(measured, '批次配置', 2, 'source_kind', 'measured');
    setCell(measured, '批次配置', 3, 'source_kind', 'unknown');
    const measuredReport = validateSenooMeasurements(measured);
    expect(() => freezeSenooSyntheticRule(measuredReport, calibrationId)).toThrow();
    expect(() => verifySenooSyntheticRule(frozen, measuredReport, validationId)).toThrow();

    // Give verification a direct report with an inconsistent run assignment.
    const reused = { ...report, batches: report.batches.map(batch => batch.id === validationId
      ? { ...batch, acquisitionRunId: frozen.calibrationRunId } : batch) };
    expect(() => verifySenooSyntheticRule(frozen, reused, validationId)).toThrow();

    const mismatched = freshSheets();
    setCell(mismatched, '批次配置', 3, 'count_unit', 'ADU');
    expect(() => verifySenooSyntheticRule(frozen, validateSenooMeasurements(mismatched), validationId)).toThrow();
    setCell(mismatched, '批次配置', 3, 'count_unit', 'counts');
    setCell(mismatched, '批次配置', 3, 'roi_map_version', 'different-roi');
    expect(() => verifySenooSyntheticRule(frozen, validateSenooMeasurements(mismatched), validationId)).toThrow();
  });

  it('keeps a missing count out of the evaluated denominator and retains valid zero', () => {
    const sheets = freshSheets();
    setCell(sheets, '曝光记录', 14, 'decision_count', null);
    const report = validateSenooMeasurements(sheets);
    const verified = verifySenooSyntheticRule(freezeSenooSyntheticRule(report, calibrationId), report, validationId);
    expect(verified.denominators).toMatchObject({ attemptedSites: 3, validPairs: 3, included: 3, evaluated: 2 });
    expect(verified.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ preparedGroup: 'm0', included: 1, evaluated: 0 }),
      expect.objectContaining({ preparedGroup: 'empty_control', included: 1, evaluated: 1, correct: 1 }),
    ]));
    expect(verified.totals).toMatchObject({ spinEvaluated: 1, falseLoss: 1, emptyEvaluated: 1 });
  });

  it('counts equality as high and keeps wrong spin, ambiguity, and empty false positives separate', () => {
    const sheets = freshSheets();
    const frozen = freezeSenooSyntheticRule(validateSenooMeasurements(sheets), calibrationId);
    setCell(sheets, '曝光记录', 12, 'decision_count', 37); // m1 at the first threshold
    setCell(sheets, '曝光记录', 14, 'decision_count', 38);
    setCell(sheets, '曝光记录', 15, 'decision_count', 47); // m0 with both frames high
    setCell(sheets, '曝光记录', 17, 'decision_count', 47); // empty control with only Image 2 high

    const verified = verifySenooSyntheticRule(frozen, validateSenooMeasurements(sheets), validationId);
    expect(verified.totals).toMatchObject({
      evaluated: 3, spinEvaluated: 2, wrongSpin: 0, falseLoss: 0, ambiguous: 1, emptyFalsePositive: 1, correct: 1,
    });

    setCell(sheets, '曝光记录', 15, 'decision_count', 46); // m0 now misclassified as m1
    const withWrongLabel = verifySenooSyntheticRule(frozen, validateSenooMeasurements(sheets), validationId);
    expect(withWrongLabel.totals).toMatchObject({ wrongSpin: 1, falseLoss: 0, ambiguous: 0, emptyFalsePositive: 1 });
  });

  it('rejects CAL data without a usable group or with overlapping dark and bright boundaries', () => {
    const missing = freshSheets();
    setCell(missing, '曝光记录', 2, 'decision_count', null);
    expect(() => freezeSenooSyntheticRule(validateSenooMeasurements(missing), calibrationId)).toThrow();

    const overlapping = freshSheets();
    setCell(overlapping, '曝光记录', 4, 'decision_count', 74);
    expect(() => freezeSenooSyntheticRule(validateSenooMeasurements(overlapping), calibrationId)).toThrow();
  });
});
