import { eligibleReadout } from './senooMeasuredReadout';
import { summarizeSenooMeasurementSites, type SenooMeasurementReport } from './senooMeasurements';

const preparedGroups = ['m1', 'm0', 'empty_control'] as const;
type Group = typeof preparedGroups[number];
type Site = SenooMeasurementReport['records'][number];

export interface SenooCalPilotScheduleEntry {
  plannedAttemptId: string;
  preparedGroup: Group;
}

export interface SenooCalPilotFinding {
  plannedAttemptId: string | null;
  attemptId: string;
  kind: 'missing' | 'unmapped' | 'group-mismatch' | 'mixed-group';
  expectedGroup: Group | null;
  actualGroups: Group[];
}

function identifier(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseSenooCalPilotSchedule(rows: readonly (readonly unknown[])[]): SenooCalPilotScheduleEntry[] {
  if (rows[3]?.[0] !== '计划轮号' || rows[3]?.[1] !== '计划组别') {
    throw new Error('CAL 先导排程 A4:B4 须为「计划轮号」和「计划组别」。');
  }
  for (const [index, row] of rows.entries()) {
    if (!row || (index >= 3 && index < 304)) continue;
    const a = row[0];
    const b = row[1];
    const blank = (cell: unknown) => cell === undefined || cell === null || cell === '';
    if ((!blank(a) && !(index === 1 && a === 'CAL 先导排程')) || !blank(b)) {
      throw new Error(`CAL 先导排程 A${index + 1}:B${index + 1} 包含排程外的数据。`);
    }
  }

  const seen = new Set<string>();
  const counts = { m1: 0, m0: 0, empty_control: 0 };
  const schedule: SenooCalPilotScheduleEntry[] = [];
  for (let row = 5; row <= 304; row += 1) {
    const plannedAttemptId = identifier(rows[row - 1]?.[0]);
    const label = identifier(rows[row - 1]?.[1]);
    const preparedGroup = preparedGroups.find(group => group === label);
    if (!plannedAttemptId) throw new Error(`CAL 先导排程 A${row} 须为非空文本轮号。`);
    if (seen.has(plannedAttemptId)) throw new Error(`CAL 先导排程 A${row} 的计划轮号 ${plannedAttemptId} 重复。`);
    if (!preparedGroup) throw new Error(`CAL 先导排程 B${row} 的组别无效。`);
    seen.add(plannedAttemptId);
    counts[preparedGroup] += 1;
    schedule.push({ plannedAttemptId, preparedGroup });
  }
  if (preparedGroups.some(group => counts[group] !== 100)) {
    throw new Error('CAL 先导排程的 m1、m0、empty_control 须各 100 轮。');
  }
  return schedule;
}

export function parseSenooCalPilotMapping(text: string): ReadonlyMap<string, string> {
  let entries: unknown;
  try {
    entries = JSON.parse(text);
  } catch {
    throw new Error('CAL 轮号对照须为有效 JSON。');
  }
  if (!Array.isArray(entries)) throw new Error('CAL 轮号对照须为条目数组。');

  const mapping = new Map<string, string>();
  const seenActualIds = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`CAL 轮号对照第 ${index + 1} 项无效。`);
    }
    const plannedAttemptId = identifier(entry.plannedAttemptId);
    const attemptId = identifier(entry.attemptId);
    if (!plannedAttemptId || !attemptId || Object.keys(entry).length !== 2) {
      throw new Error(`CAL 轮号对照第 ${index + 1} 项须提供 plannedAttemptId 和 attemptId 文本。`);
    }
    if (mapping.has(plannedAttemptId)) throw new Error(`CAL 轮号对照的计划轮号 ${plannedAttemptId} 重复。`);
    if (seenActualIds.has(attemptId)) throw new Error(`CAL 轮号对照的实际轮号 ${attemptId} 重复。`);
    mapping.set(plannedAttemptId, attemptId);
    seenActualIds.add(attemptId);
  }
  return mapping;
}

export function auditSenooCalPilot(
  schedule: readonly SenooCalPilotScheduleEntry[],
  report: SenooMeasurementReport,
  batchId: string,
  mapping?: ReadonlyMap<string, string>,
) {
  if (!report.batches.some(batch => batch.id === batchId && batch.role === 'calibration')) {
    throw new Error('请选择 CAL 标定批次。');
  }

  const plannedIds = new Set(schedule.map(round => round.plannedAttemptId));
  for (const [plannedAttemptId, attemptId] of mapping ?? []) {
    if (!plannedIds.has(plannedAttemptId)) throw new Error(`CAL 轮号对照中的计划轮号 ${plannedAttemptId} 不在排程中。`);
    if (!identifier(attemptId) || attemptId !== identifier(attemptId)) {
      throw new Error(`计划轮 ${plannedAttemptId} 的实际轮号须为非空文本。`);
    }
  }
  const mappedAttempts = new Set<string>();
  const expected = schedule.map(round => {
    const attemptId = mapping?.get(round.plannedAttemptId) ?? round.plannedAttemptId;
    if (mappedAttempts.has(attemptId)) throw new Error(`多个计划轮对应实际轮号 ${attemptId}，请核对显式对照和同名轮号。`);
    mappedAttempts.add(attemptId);
    return { ...round, attemptId };
  });

  const sitesByAttempt = new Map<string, Site[]>();
  for (const site of report.records) {
    if (site.batchId !== batchId) continue;
    const sites = sitesByAttempt.get(site.attemptId) ?? [];
    sites.push(site);
    sitesByAttempt.set(site.attemptId, sites);
  }
  const actualGroupsByAttempt = new Map(Array.from(sitesByAttempt, ([attemptId, sites]) => [
    attemptId, Array.from(new Set(sites.map(site => site.preparedGroup))),
  ]));
  const actualRoundsByGroup = { m1: 0, m0: 0, empty_control: 0 };
  let mixedRounds = 0;
  for (const labels of actualGroupsByAttempt.values()) {
    if (labels.length === 1) actualRoundsByGroup[labels[0]] += 1;
    else mixedRounds += 1;
  }

  const findings: SenooCalPilotFinding[] = [];
  const matchedByGroup = { m1: 0, m0: 0, empty_control: 0 };
  const mappedSitesByGroup: Record<Group, Site[]> = { m1: [], m0: [], empty_control: [] };
  for (const { plannedAttemptId, attemptId, preparedGroup } of expected) {
    const actualGroups = actualGroupsByAttempt.get(attemptId) ?? [];
    const finding = { plannedAttemptId, attemptId, expectedGroup: preparedGroup, actualGroups };
    if (!actualGroups.length) findings.push({ ...finding, kind: 'missing' });
    else if (actualGroups.length > 1) findings.push({ ...finding, kind: 'mixed-group' });
    else {
      const [actualGroup] = actualGroups;
      mappedSitesByGroup[actualGroup].push(...sitesByAttempt.get(attemptId)!);
      if (actualGroup === preparedGroup) matchedByGroup[preparedGroup] += 1;
      else findings.push({ ...finding, kind: 'group-mismatch' });
    }
  }
  let unmappedRounds = 0;
  for (const [attemptId, actualGroups] of actualGroupsByAttempt) {
    if (mappedAttempts.has(attemptId)) continue;
    unmappedRounds += 1;
    findings.push({ plannedAttemptId: null, attemptId, kind: 'unmapped', expectedGroup: null, actualGroups });
  }

  const groups = preparedGroups.map(preparedGroup => {
    // Site denominators use only mapped, single-group rounds, counted by actual label.
    // The round total above includes every single-group round in the CAL batch.
    const sites = mappedSitesByGroup[preparedGroup];
    const frames = { valid: 0, missing: 0, skipped: 0, invalid: 0, unknown: 0 };
    for (const site of sites) for (const frame of site.frames) frames[frame.status] += 1;
    return {
      preparedGroup,
      plannedRounds: schedule.filter(round => round.preparedGroup === preparedGroup).length,
      actualRounds: actualRoundsByGroup[preparedGroup],
      matchedRounds: matchedByGroup[preparedGroup],
      ...summarizeSenooMeasurementSites(sites),
      evaluated: sites.filter(eligibleReadout).length,
      missingFrames: frames.missing,
      skippedFrames: frames.skipped,
      invalidFrames: frames.invalid,
      unknownFrames: frames.unknown,
    };
  });
  return {
    batchId, plannedRounds: schedule.length, actualRounds: sitesByAttempt.size,
    matchedRounds: groups.reduce((sum, group) => sum + group.matchedRounds, 0),
    mixedRounds, unmappedRounds, groups, findings,
  };
}
