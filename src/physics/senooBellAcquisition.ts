import { readAcquisitionCsvCells } from './acquisitionCsv';
import {
  SENOO_BELL_ANALYSIS_PHASE_RAD, SENOO_BELL_SETTINGS,
  type SenooBellObservations, type summarizeSenooBellObservations,
} from './senooBellObservations';
import type { SenooCircuitAttempt, SenooCircuitBatch } from './senooCircuitBatch';

const version = 'senoo-bell-schedule-v1';
const settingIds = SENOO_BELL_SETTINGS;
type Setting = typeof settingIds[number];
const order = [0, 1, 2, 1, 2, 0, 2, 0, 1, 0, 2, 1, 2, 1, 0, 1, 0, 2] as const;
export const SENOO_BELL_ACQUISITION_BLOCKS = 500;
export const SENOO_BELL_ACQUISITION_FILENAME = 'Senoo_Bell_独立实测交错排程.csv';
const header = [
  'schedule_version', 'block', 'slot_in_block', 'planned_id', 'setting', 'analysis_phase_rad',
  'actual_run_id', 'actual_attempt_id', 'actual_setting', 'actual_log_ref',
];

interface ActualAttempt {
  readonly runId: string;
  readonly attemptId: string;
  readonly setting: Setting;
  readonly sourceRef: string;
}

interface ScheduleRow {
  readonly block: number;
  readonly slot: number;
  readonly plannedId: string;
  readonly setting: Setting;
  readonly analysisPhaseRad: number | null;
  readonly actual: ActualAttempt | null;
}

export interface SenooBellAcquisitionSchedule {
  readonly version: typeof version;
  readonly rows: readonly ScheduleRow[];
}

function plannedRow(index: number): ScheduleRow {
  const block = Math.floor(index / order.length);
  const position = index % order.length;
  const setting = settingIds[(order[position] + block) % settingIds.length];
  return {
    block: block + 1, slot: position + 1, plannedId: `BELL-${String(index + 1).padStart(5, '0')}`,
    setting, analysisPhaseRad: SENOO_BELL_ANALYSIS_PHASE_RAD[setting], actual: null,
  };
}

export function createSenooBellAcquisitionSchedule(blocks = SENOO_BELL_ACQUISITION_BLOCKS) {
  if (!Number.isSafeInteger(blocks) || blocks < 1 || blocks > SENOO_BELL_ACQUISITION_BLOCKS) {
    throw new Error('Bell 排程须包含 1 至 500 个完整区块。');
  }
  const rows = Array.from({ length: blocks * order.length }, (_, index) => {
    const row = plannedRow(index);
    return [version, row.block, row.slot, row.plannedId, row.setting, row.analysisPhaseRad, '', '', '', ''].join(',');
  });
  return [header.join(','), ...rows, ''].join('\n');
}

function attemptKey(runId: string, attemptId: string) {
  return JSON.stringify([runId, attemptId]);
}

export function parseSenooBellAcquisitionSchedule(text: string): SenooBellAcquisitionSchedule {
  const [first, ...lines] = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const columns = readAcquisitionCsvCells(first, 'Bell 排程表头');
  if (columns.length !== header.length || header.some((column, index) => column !== columns[index])) {
    throw new Error('Bell 排程 CSV 表头与模板不一致。');
  }
  if (!lines.length || lines.length % order.length || lines.length > SENOO_BELL_ACQUISITION_BLOCKS * order.length) {
    throw new Error('Bell 排程须包含 1 至 500 个完整区块。');
  }
  const used = new Set<string>();
  const rows = lines.map((line, index) => {
    const row = plannedRow(index);
    const fields = readAcquisitionCsvCells(line, row.plannedId);
    const [format, block, slot, id, setting, phase, actualRun, actualAttempt, actualSetting, actualRef] = fields;
    const phaseMatches = row.analysisPhaseRad === null ? phase === ''
      : !!phase?.trim() && Math.abs(Number(phase) - row.analysisPhaseRad) <= 5e-15;
    if (fields.length !== header.length || format !== version || block !== String(row.block)
      || slot !== String(row.slot) || id !== row.plannedId || setting !== row.setting || !phaseMatches) {
      throw new Error(`Bell 排程第 ${index + 2} 行的计划字段不符，预期轮号 ${row.plannedId}。`);
    }
    const [runId, attemptId, recordedSetting, sourceRef] = [actualRun, actualAttempt, actualSetting, actualRef].map(value => value.trim());
    if (![runId, attemptId, recordedSetting, sourceRef].some(Boolean)) return row;
    const confirmedSetting = settingIds.find(key => key === recordedSetting);
    if (!runId || !attemptId || !confirmedSetting || !sourceRef) {
      throw new Error(`${id} 须完整填写实际运行、轮次、设置与原始日志引用。`);
    }
    const key = attemptKey(runId, attemptId);
    if (used.has(key)) throw new Error(`${id} 重复关联实际轮次 ${attemptId}。`);
    used.add(key);
    return { ...row, actual: { runId, attemptId, setting: confirmedSetting, sourceRef } };
  });
  return { version, rows };
}

interface AuditIssue {
  readonly plannedId: string | null;
  readonly attemptId: string;
  readonly reason: string;
}

export function auditSenooBellAcquisition(
  schedule: SenooBellAcquisitionSchedule,
  observations: SenooBellObservations,
  statistics: ReturnType<typeof summarizeSenooBellObservations>,
) {
  const recorded = new Map<string, { setting: Setting; attempt: SenooCircuitAttempt; batch: SenooCircuitBatch }>();
  for (const setting of settingIds) {
    const { batch } = observations.settings[setting];
    for (const attempt of batch.attempts) {
      recorded.set(attemptKey(batch.acquisitionRunId, attempt.attemptId), { setting, attempt, batch });
    }
  }
  const issues: AuditIssue[] = [];
  const referenced = new Set<string>();
  const planned = { population: 0, plus: 0, minus: 0 };
  const mapped = { population: 0, plus: 0, minus: 0 };
  const matched = { population: 0, plus: 0, minus: 0 };
  let firstBatch: SenooCircuitBatch | null = null;
  let previous: { endS: number; plannedId: string; attemptId: string } | null = null;
  for (const row of schedule.rows) {
    planned[row.setting]++;
    const { actual } = row;
    if (!actual) continue;
    mapped[row.setting]++;
    const key = attemptKey(actual.runId, actual.attemptId);
    const observation = recorded.get(key);
    const finding = (reason: string) => issues.push({ plannedId: row.plannedId, attemptId: actual.attemptId, reason });
    if (!observation) {
      finding('观测 JSON 中无对应的实际运行与轮次。');
      continue;
    }
    referenced.add(key);
    const { attempt, batch } = observation;
    const settingMatches = actual.setting === row.setting && actual.setting === observation.setting;
    const refMatches = actual.sourceRef === attempt.sourceRef;
    if (!settingMatches) finding('实际设置、观测分组与排程设置不一致。');
    if (!refMatches) finding('实际日志引用与观测轮次不一致。');
    if (settingMatches && refMatches) matched[row.setting]++;

    firstBatch ??= batch;
    if (batch.acquisitionRunId !== firstBatch.acquisitionRunId || batch.clockId !== firstBatch.clockId
      || batch.timeOriginRef !== firstBatch.timeOriginRef) {
      finding('须使用同一采集运行、时钟和时间原点才能核对轮序。');
      continue;
    }
    const stages = Object.values(attempt.stages).filter(stage => stage.startS !== null && stage.endS !== null);
    const startS = stages[0]?.startS;
    const endS = stages.at(-1)?.endS;
    if (startS == null || endS == null) {
      finding('无实际阶段时标，无法核对轮序。');
      continue;
    }
    if (previous && startS < previous.endS) {
      finding(`实际时标与前一轮 ${previous.plannedId}（${previous.attemptId}）倒序或重叠。`);
    }
    previous = { endS, plannedId: row.plannedId, attemptId: actual.attemptId };
  }
  for (const [key, { attempt, batch }] of recorded) {
    if (!referenced.has(key)) {
      issues.push({ plannedId: null, attemptId: attempt.attemptId, reason: `采集运行 ${batch.acquisitionRunId} 的观测轮未关联计划。` });
    }
  }
  const settings = statistics.settings.map(({ setting, counts }) => ({
    setting, planned: planned[setting], mapped: mapped[setting], matched: matched[setting],
    recorded: counts.attempted, executed: counts.circuitExecuted, included: counts.analysisIncluded,
    complete: counts.completeFramePairs, effective: counts.selectedValidReadout,
    selectedComplete: counts.selectedCompleteFramePairs, readoutAttempted: counts.readoutAttempted,
    missingOrInvalid: counts.missingOrInvalidFrames, loss: counts.reportedLoss, ambiguous: counts.ambiguous,
  }));
  return { settings, issues };
}
