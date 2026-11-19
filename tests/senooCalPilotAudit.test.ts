import { describe, expect, it } from 'vitest';
import { auditSenooCalPilot, parseSenooCalPilotMapping, parseSenooCalPilotSchedule } from '../src/physics/senooCalPilotAudit';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

function scheduleRows(): unknown[][] {
  const groups = ['m1', 'm0', 'empty_control'];
  return [
    [], ['CAL 先导排程', null, null, '采集说明'], [], ['计划轮号', '计划组别'],
    ...Array.from({ length: 300 }, (_, index) => [`CAL-P-${String(index + 1).padStart(4, '0')}`, groups[index % 3]]),
  ];
}

describe('Senoo CAL pilot schedule', () => {
  it('reads the fixed plan by cell location, preserving order and text IDs while ignoring notes', () => {
    const rows = scheduleRows();
    rows.push([null, null, null, '其他说明']);
    const schedule = parseSenooCalPilotSchedule(rows);
    expect(schedule).toHaveLength(300);
    expect(schedule[0]).toEqual({ plannedAttemptId: 'CAL-P-0001', preparedGroup: 'm1' });
    expect(schedule[299]).toEqual({ plannedAttemptId: 'CAL-P-0300', preparedGroup: 'empty_control' });
  });

  it('rejects invalid headers, missing or duplicate IDs, unbalanced groups, and extra data', () => {
    const rows = scheduleRows();
    rows[3][0] = '实际轮号';
    expect(() => parseSenooCalPilotSchedule(rows)).toThrow(/A4:B4/);
    rows[3][0] = '计划轮号';
    rows[304] = ['CAL-P-0301', 'm1'];
    expect(() => parseSenooCalPilotSchedule(rows)).toThrow(/A305:B305/);
    rows.pop();
    rows[4][0] = 1;
    expect(() => parseSenooCalPilotSchedule(rows)).toThrow(/A5.*文本/);
    rows[4][0] = rows[5][0];
    expect(() => parseSenooCalPilotSchedule(rows)).toThrow(/A6.*重复/);
    rows[4] = ['CAL-P-0001', 'm0'];
    expect(() => parseSenooCalPilotSchedule(rows)).toThrow(/各 100 轮/);
    rows[4][1] = 'val';
    expect(() => parseSenooCalPilotSchedule(rows)).toThrow(/B5.*无效/);
  });
});

describe('Senoo CAL pilot round mapping', () => {
  it('requires one-to-one explicit text IDs and keeps leading zeros', () => {
    const mapping = parseSenooCalPilotMapping('[{"plannedAttemptId":"CAL-P-0001","attemptId":"0001"}]');
    expect([...mapping]).toEqual([['CAL-P-0001', '0001']]);
    expect(() => parseSenooCalPilotMapping('broken')).toThrow(/有效 JSON/);
    expect(() => parseSenooCalPilotMapping('{}')).toThrow(/数组/);
    expect(() => parseSenooCalPilotMapping('[{"plannedAttemptId":"p1","attemptId":1}]')).toThrow(/第 1 项.*文本/);
    expect(() => parseSenooCalPilotMapping('[{"plannedAttemptId":"p1","attemptId":"01"},{"plannedAttemptId":"p1","attemptId":"02"}]'))
      .toThrow(/计划轮号 p1 重复/);
    expect(() => parseSenooCalPilotMapping('[{"plannedAttemptId":"p1","attemptId":"01"},{"plannedAttemptId":"p2","attemptId":"01"}]'))
      .toThrow(/实际轮号 01 重复/);
  });

  it('rejects collisions with identity fallbacks and mappings outside the plan', () => {
    const report = validateSenooMeasurements(freshSheets());
    const schedule = [
      { plannedAttemptId: 'CAL-P-0001', preparedGroup: 'm1' },
      { plannedAttemptId: '0001', preparedGroup: 'm0' },
    ] as const;
    expect(() => auditSenooCalPilot(schedule, report, 'SYN-CAL', new Map([['someone-else', '0001']])))
      .toThrow(/someone-else 不在排程中/);
    expect(() => auditSenooCalPilot(schedule, report, 'SYN-CAL', new Map([['CAL-P-0001', '0001']])))
      .toThrow(/多个计划轮对应实际轮号 0001/);
    expect(() => auditSenooCalPilot(schedule, report, 'SYN-VAL')).toThrow(/CAL 标定批次/);
  });
});

describe('Senoo CAL pilot audit', () => {
  it('reconciles physical rounds by ID, counting shared-exposure sites and failed attempts separately', () => {
    const sheets = freshSheets();
    setCell(sheets, '尝试与位点', 3, 'prepared_group', 'm1');
    setCell(sheets, '尝试与位点', 4, 'prepared_group', 'm1');
    setCell(sheets, '曝光记录', 5, 'decision_count', null);
    const report = validateSenooMeasurements(sheets);
    const schedule = [
      { plannedAttemptId: 'CAL-P-0001', preparedGroup: 'm1' },
      { plannedAttemptId: '0002', preparedGroup: 'empty_control' },
      { plannedAttemptId: '0003', preparedGroup: 'm1' },
      { plannedAttemptId: 'CAL-P-0004', preparedGroup: 'm0' },
    ] as const;
    const mapping = new Map([['CAL-P-0001', '0001'], ['CAL-P-0004', 'unrecorded-0004']]);
    const audit = auditSenooCalPilot(schedule, report, 'SYN-CAL', mapping);
    expect(audit).toMatchObject({ plannedRounds: 4, actualRounds: 3, matchedRounds: 2, mixedRounds: 0, unmappedRounds: 0 });
    expect(audit.groups).toEqual([
      {
        preparedGroup: 'm1', plannedRounds: 2, actualRounds: 2, matchedRounds: 2,
        attemptedSites: 4, prepPassed: 3, validPairs: 3, included: 3, evaluated: 2,
        missingFrames: 0, skippedFrames: 2, invalidFrames: 0, unknownFrames: 0,
      },
      {
        preparedGroup: 'm0', plannedRounds: 1, actualRounds: 1, matchedRounds: 0,
        attemptedSites: 1, prepPassed: 1, validPairs: 0, included: 0, evaluated: 0,
        missingFrames: 1, skippedFrames: 0, invalidFrames: 0, unknownFrames: 0,
      },
      {
        preparedGroup: 'empty_control', plannedRounds: 1, actualRounds: 0, matchedRounds: 0,
        attemptedSites: 0, prepPassed: 0, validPairs: 0, included: 0, evaluated: 0,
        missingFrames: 0, skippedFrames: 0, invalidFrames: 0, unknownFrames: 0,
      },
    ]);
    expect(audit.findings).toEqual([
      { plannedAttemptId: '0002', attemptId: '0002', kind: 'group-mismatch', expectedGroup: 'empty_control', actualGroups: ['m0'] },
      { plannedAttemptId: 'CAL-P-0004', attemptId: 'unrecorded-0004', kind: 'missing', expectedGroup: 'm0', actualGroups: [] },
    ]);
  });

  it('keeps mixed and unmapped rounds visible without counting them in mapped site denominators', () => {
    const report = validateSenooMeasurements(freshSheets());
    const schedule = [{ plannedAttemptId: '0001', preparedGroup: 'm1' }] as const;
    const audit = auditSenooCalPilot(schedule, report, 'SYN-CAL');
    expect(audit).toMatchObject({ actualRounds: 3, matchedRounds: 0, mixedRounds: 1, unmappedRounds: 2 });
    expect(audit.groups.map(({ actualRounds, attemptedSites }) => [actualRounds, attemptedSites])).toEqual([[1, 0], [1, 0], [0, 0]]);
    expect(audit.findings).toEqual([
      { plannedAttemptId: '0001', attemptId: '0001', kind: 'mixed-group', expectedGroup: 'm1', actualGroups: ['m1', 'm0', 'empty_control'] },
      { plannedAttemptId: null, attemptId: '0002', kind: 'unmapped', expectedGroup: null, actualGroups: ['m0'] },
      { plannedAttemptId: null, attemptId: '0003', kind: 'unmapped', expectedGroup: null, actualGroups: ['m1'] },
    ]);
  });
});
