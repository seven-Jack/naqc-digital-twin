import { describe, expect, it } from 'vitest';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

describe('Senoo measurement template validation', () => {
  it('pairs by batch, attempt and site while retaining shared exposures and zero counts', () => {
    const result = validateSenooMeasurements(freshSheets());
    expect(result.issues).toEqual([]);
    const shared = result.records.filter(site => site.batchId === 'SYN-CAL' && site.attemptId === '0001');
    expect(shared.map(site => site.siteId)).toEqual(['01', '02', '03']);
    for (const site of shared) {
      expect(site.frames.map(frame => frame.exposureId)).toEqual(['SYN-CAL-0001-I1', 'SYN-CAL-0001-I2']);
    }
    expect(shared[1].frames[0]).toMatchObject({ imageNo: 1, status: 'valid', decisionCount: 0, roiId: 'ROI-02' });
    expect(result.records.find(site => site.batchId === 'SYN-VAL' && site.siteId === '01')?.frames[0]).toMatchObject({
      exposureId: 'SYN-VAL-0001-I1', decisionCount: 36, actualThreshold: 36, thresholdOp: 'ge',
    });
  });

  it('reports separate batch and preparation denominators from the original screening flags', () => {
    const result = validateSenooMeasurements(freshSheets());
    expect(result.batches).toMatchObject([
      {
        id: 'SYN-CAL', role: 'calibration', sourceKind: 'synthetic', uniqueAttempts: 3,
        attemptedSites: 5, prepPassed: 4, validPairs: 3, included: 3, missingFrames: 1, skippedFrames: 2,
        groups: [
          { preparedGroup: 'm1', attemptedSites: 2, prepPassed: 1, validPairs: 1, included: 1 },
          { preparedGroup: 'm0', attemptedSites: 2, prepPassed: 2, validPairs: 1, included: 1 },
          { preparedGroup: 'empty_control', attemptedSites: 1, prepPassed: 1, validPairs: 1, included: 1 },
        ],
      },
      {
        id: 'SYN-VAL', role: 'validation', sourceKind: 'synthetic', uniqueAttempts: 1,
        attemptedSites: 3, prepPassed: 3, validPairs: 3, included: 3, missingFrames: 0, skippedFrames: 0,
      },
    ]);

    const contradictory = freshSheets();
    setCell(contradictory, '尝试与位点', 5, 'analysis_status', 'included');
    const withWarning = validateSenooMeasurements(contradictory);
    expect(withWarning.batches[0]).toMatchObject({ validPairs: 3, included: 4 });
    expect(withWarning.issues).toContainEqual(expect.objectContaining({
      severity: 'warning', sheet: '尝试与位点', row: 5, field: 'analysis_status',
    }));
  });

  it('retains missing and skipped slots, while reporting absent rows and counts on a missing frame', () => {
    const sheets = freshSheets();
    const result = validateSenooMeasurements(sheets);
    expect(result.records.find(site => site.attemptId === '0002')?.frames[1]).toMatchObject({
      imageNo: 2, status: 'missing', decisionCount: null,
    });
    expect(result.records.find(site => site.attemptId === '0003')?.frames).toMatchObject([
      { imageNo: 1, status: 'skipped', decisionCount: null },
      { imageNo: 2, status: 'skipped', decisionCount: null },
    ]);

    setCell(sheets, '曝光记录', 9, 'decision_count', 0);
    expect(validateSenooMeasurements(sheets).issues).toContainEqual(expect.objectContaining({
      severity: 'error', sheet: '曝光记录', row: 9, field: 'decision_count',
    }));
    sheets['曝光记录'].splice(8, 1);
    expect(validateSenooMeasurements(sheets).issues).toContainEqual(expect.objectContaining({
      severity: 'error', sheet: '尝试与位点', row: 5, field: 'site_id', message: expect.stringContaining('Image 2'),
    }));
  });

  it('identifies duplicate keys at the source row without inflating the reported pair denominator', () => {
    const sheets = freshSheets();
    sheets['曝光记录'].push([...sheets['曝光记录'][1]]);
    const result = validateSenooMeasurements(sheets);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'error', sheet: '曝光记录', row: 18, field: 'image_no', message: expect.stringContaining('第 2 行'),
    }));
    expect(result.batches[0]).toMatchObject({ attemptedSites: 5, validPairs: 3 });
  });

  it('pinpoints intra-frame, cross-image and count-availability order violations', () => {
    const sheets = freshSheets();
    setCell(sheets, '曝光记录', 4, 'exposure_end_us', 1129);
    setCell(sheets, '曝光记录', 3, 'trigger_us', 1123);
    setCell(sheets, '曝光记录', 3, 'exposure_start_us', 1179);
    setCell(sheets, '尝试与位点', 2, 'decision_ready_us', 1320);
    const result = validateSenooMeasurements(sheets);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', sheet: '曝光记录', row: 4, field: 'exposure_end_us' }),
      expect.objectContaining({ severity: 'error', sheet: '曝光记录', row: 3, field: 'trigger_us' }),
      expect.objectContaining({ severity: 'error', sheet: '曝光记录', row: 3, field: 'exposure_start_us' }),
      expect.objectContaining({ severity: 'error', sheet: '尝试与位点', row: 2, field: 'decision_ready_us' }),
    ]));
  });

  it('detects reuse of one acquisition run between calibration and validation batches', () => {
    const sheets = freshSheets();
    setCell(sheets, '批次配置', 3, 'acquisition_run_id', 'synthetic://SYN-CAL/run');
    expect(validateSenooMeasurements(sheets).issues).toContainEqual(expect.objectContaining({
      severity: 'error', sheet: '批次配置', row: 3, field: 'acquisition_run_id',
      message: expect.stringContaining('SYN-CAL'),
    }));
  });

  it('records unknown provenance and missing actual thresholds or decisions without inferring them', () => {
    const sheets = freshSheets();
    sheets['批次配置'] = sheets['批次配置'].map(row => row.slice(0, -1));
    setCell(sheets, '曝光记录', 2, 'actual_threshold', null);
    setCell(sheets, '曝光记录', 2, 'threshold_op', null);
    setCell(sheets, '尝试与位点', 2, 'instrument_decision', null);
    const result = validateSenooMeasurements(sheets);
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'warning', sheet: '曝光记录', row: 2, field: 'actual_threshold',
    }));
    expect(result.batches.map(batch => batch.sourceKind)).toEqual(['unknown', 'unknown']);
    expect(result.records[0].instrumentDecision).toBeNull();
    expect(result.records[0].frames[0]).toMatchObject({ decisionCount: 74, actualThreshold: null, thresholdOp: null });
  });
});
