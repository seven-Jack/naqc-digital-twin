import type { SenooDataSheet } from '../data/senooMeasurementWorkbook';

type Sheets = Record<SenooDataSheet, unknown[][]>;

export interface SenooMeasurementIssue {
  severity: 'error' | 'warning';
  sheet: SenooDataSheet;
  row: number;
  field: string;
  message: string;
}

const preparedGroups = ['m1', 'm0', 'empty_control'] as const;
const roles = ['calibration', 'validation'] as const;
const originKinds = ['synthetic', 'measured', 'unknown'] as const;
const prepStatuses = ['pass', 'fail', 'not_run', 'unknown'] as const;
const analysisStatuses = ['included', 'excluded', 'pending'] as const;
const frameStatuses = ['valid', 'invalid', 'missing', 'skipped', 'unknown'] as const;
const eventTypes = ['prep_erasure', 'clock_pi', 'raman_pi', 'illumination_399', 'trap_ramp', 'other'] as const;
type PreparedGroup = typeof preparedGroups[number];
type FrameStatus = typeof frameStatuses[number];

const pairFields = ['batch_id', 'attempt_id', 'site_id'];
const fields: Record<SenooDataSheet, readonly string[]> = {
  '批次配置': [
    'batch_id', 'batch_role', 'acquisition_run_id', 'acquired_at_utc', 'role_assigned_at_utc', 'apparatus_version',
    'protocol_version', 'working_point', 'clock_id', 't0_ref', 'clock_alignment_ref', 'camera_config_ref',
    'roi_map_version', 'count_unit', 'count_processing_ref', 'readout_rule_ref', 'outcome_policy', 'screening_rule_ref',
  ],
  '尝试与位点': [
    ...pairFields, 'prepared_group', 'prep_erasure_status', 'analysis_status', 'exclusion_stage', 'exclusion_reason',
    'instrument_decision', 'decision_ready_us', 'attempt_log_ref', 'previous_attempt_ref',
  ],
  '曝光记录': [
    ...pairFields, 'image_no', 'frame_status', 'exposure_id', 'raw_ref', 'roi_id',
    'decision_count', 'raw_roi_sum', 'actual_threshold', 'threshold_op', 'trigger_us',
    'exposure_start_us', 'exposure_end_us', 'count_ready_us', 'frame_issue',
  ],
  '事件时标': [
    'batch_id', 'attempt_id', 'event_id', 'event_type', 'site_id', 'image_no', 'start_us', 'end_us', 'source_ref', 'notes',
  ],
};

type Context = { sheet: SenooDataSheet; row: number };
type RecordRow = Context & { values: ReadonlyMap<string, unknown> };
type AddIssue = (context: Context, field: string, message: string, severity?: SenooMeasurementIssue['severity']) => void;

function blank(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function readRows(sheet: SenooDataSheet, rows: unknown[][], add: AddIssue): RecordRow[] {
  const context = { sheet, row: 1 };
  const columns = new Map<string, number>();
  (rows[0] ?? []).forEach((cell, index) => {
    if (typeof cell !== 'string' || !cell.trim()) return;
    const name = cell.trim();
    if (columns.has(name)) add(context, name, '字段名重复。');
    else columns.set(name, index);
  });
  const missing = fields[sheet].filter(field => !columns.has(field));
  for (const field of missing) add(context, field, '模板缺少该字段。');
  if (missing.length) return [];

  const mapped = [...columns].filter(([field]) => fields[sheet].includes(field) || (sheet === '批次配置' && field === 'source_kind'));
  for (const [field] of columns) {
    if (!mapped.some(([name]) => name === field)) add(context, field, '附加字段未用于校验。', 'warning');
  }
  const result: RecordRow[] = [];
  rows.forEach((cells, index) => {
    if (index === 0 || !cells || cells.every(blank)) return;
    result.push({ sheet, row: index + 1, values: new Map(mapped.map(([field, column]) => [field, cells[column]])) });
  });
  return result;
}

class Cells {
  constructor(readonly row: RecordRow, private readonly add: AddIssue) {}

  issue(field: string, message: string, severity?: SenooMeasurementIssue['severity']) {
    this.add(this.row, field, message, severity);
  }

  text(field: string, required = false): string | null {
    const cell = this.row.values.get(field);
    if (blank(cell)) {
      if (required) this.issue(field, '此项不能为空。');
      return null;
    }
    if (typeof cell !== 'string') {
      this.issue(field, '请按模板填写文本，ID 应保留原始前导零。');
      return null;
    }
    return cell.trim();
  }

  choice<const T extends string>(field: string, options: readonly T[], required = false): T | null {
    const cell = this.text(field, required);
    if (cell === null) return null;
    const choice = options.find(option => option === cell);
    if (!choice) this.issue(field, `可用选项为 ${options.join('、')}。`);
    return choice ?? null;
  }

  number(field: string, required = false): number | null {
    const cell = this.row.values.get(field);
    if (blank(cell)) {
      if (required) this.issue(field, '此项不能为空。');
      return null;
    }
    if (typeof cell !== 'number' || !Number.isFinite(cell)) {
      this.issue(field, '请填写有限数值。');
      return null;
    }
    return cell;
  }

  image(required = false): 1 | 2 | null {
    const number = this.number('image_no', required);
    if (number === 1 || number === 2) return number;
    if (number !== null) this.issue('image_no', '曝光编号必须为 1 或 2。');
    return null;
  }

  utc(field: string) {
    const text = this.text(field);
    if (text !== null && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(text) || !Number.isFinite(Date.parse(text)))) {
      this.issue(field, '请使用带 UTC 标记 Z 的 ISO 8601 时间。');
    }
    return text;
  }
}

type Batch = {
  id: string;
  role: typeof roles[number];
  sourceKind: typeof originKinds[number];
  acquisitionRunId: string;
  countUnit: string | null;
  clockId: string | null;
  timeOrigin: string | null;
  metadata: Readonly<Record<string, string | null>>;
  row: RecordRow;
};

type Site = {
  batchId: string;
  attemptId: string;
  siteId: string;
  preparedGroup: PreparedGroup;
  prepErasureStatus: typeof prepStatuses[number];
  analysisStatus: typeof analysisStatuses[number];
  exclusionStage: string | null;
  exclusionReason: string | null;
  instrumentDecision: string | null;
  decisionReadyUs: number | null;
  attemptLogRef: string | null;
  previousAttemptRef: string | null;
  row: RecordRow;
};

type Exposure = {
  imageNo: 1 | 2;
  status: FrameStatus;
  exposureId: string | null;
  sourceRef: string | null;
  roiId: string | null;
  decisionCount: number | null;
  rawRoiSum: number | null;
  actualThreshold: number | null;
  thresholdOp: 'ge' | 'gt' | 'other' | null;
  triggerUs: number | null;
  startUs: number | null;
  endUs: number | null;
  countReadyUs: number | null;
  issue: string | null;
  row: RecordRow;
};

type ExperimentEvent = {
  batchId: string;
  attemptId: string;
  siteId: string | null;
  eventId: string;
  eventType: typeof eventTypes[number];
  imageNo: 1 | 2 | null;
  startUs: number | null;
  endUs: number | null;
  sourceRef: string | null;
  notes: string | null;
};

type SiteRecord = Omit<Site, 'row'> & { frames: Omit<Exposure, 'row'>[] };
type GroupSummary = {
  preparedGroup: PreparedGroup;
  attemptedSites: number;
  prepPassed: number;
  validPairs: number;
  included: number;
};

type BatchSummary = Omit<Batch, 'row'> & {
  uniqueAttempts: number;
  attemptedSites: number;
  prepPassed: number;
  validPairs: number;
  included: number;
  missingFrames: number;
  skippedFrames: number;
  invalidFrames: number;
  unknownFrames: number;
  groups: GroupSummary[];
};

export interface SenooMeasurementReport {
  issues: SenooMeasurementIssue[];
  batches: BatchSummary[];
  records: SiteRecord[];
  events: ExperimentEvent[];
}

const tupleKey = (...parts: string[]) => JSON.stringify(parts);

function unique<T extends { row: RecordRow }>(map: Map<string, T>, key: string, record: T, field: string, add: AddIssue) {
  const previous = map.get(key);
  if (previous) add(record.row, field, `与第 ${previous.row.row} 行的键重复。`);
  else map.set(key, record);
}

function validateOrder(cells: Cells, times: readonly (readonly [string, number | null])[]) {
  let previous: readonly [string, number] | null = null;
  for (const [field, time] of times) {
    if (time === null) continue;
    if (previous && time < previous[1]) cells.issue(field, `时标早于 ${previous[0]}。`);
    previous = [field, time];
  }
}

function readBatches(rows: RecordRow[], add: AddIssue) {
  const batches = new Map<string, Batch>();
  const runRoles = new Map<string, Batch>();
  for (const row of rows) {
    const cells = new Cells(row, add);
    const id = cells.text('batch_id', true);
    const role = cells.choice('batch_role', roles, true);
    const acquisitionRunId = cells.text('acquisition_run_id', true);
    const sourceKind = cells.choice('source_kind', originKinds) ?? 'unknown';
    const acquired = cells.utc('acquired_at_utc');
    const roleAssigned = cells.utc('role_assigned_at_utc');
    if (!acquired) cells.issue('acquired_at_utc', '缺少采集日期。', 'warning');
    const countUnit = cells.text('count_unit');
    const clockId = cells.text('clock_id');
    const timeOrigin = cells.text('t0_ref');
    const metadata: Record<string, string | null> = { acquired_at_utc: acquired, role_assigned_at_utc: roleAssigned };
    for (const field of ['apparatus_version', 'protocol_version', 'working_point', 'camera_config_ref', 'roi_map_version',
      'count_processing_ref', 'readout_rule_ref', 'outcome_policy', 'screening_rule_ref', 'clock_alignment_ref']) {
      const value = cells.text(field);
      metadata[field] = value;
      if (!value && field !== 'clock_alignment_ref') cells.issue(field, '缺少批次条件或规则来源。', 'warning');
    }
    for (const [field, value] of [['count_unit', countUnit], ['clock_id', clockId], ['t0_ref', timeOrigin]] as const) {
      if (!value) cells.issue(field, '计数或时基信息待补。', 'warning');
    }
    if (!id || !role || !acquisitionRunId) continue;
    const batch = { id, role, sourceKind, acquisitionRunId, countUnit, clockId, timeOrigin, metadata, row };
    unique(batches, id, batch, 'batch_id', add);
    const other = runRoles.get(acquisitionRunId);
    if (other && other.role !== role) {
      cells.issue('acquisition_run_id', `同一采集运行也用于批次 ${other.id}，标定与验证批次有重叠。`);
    } else if (!other) runRoles.set(acquisitionRunId, batch);
  }
  if (!rows.length) add({ sheet: '批次配置', row: 2 }, 'batch_id', '请至少填写一个批次。');
  return batches;
}

function readSites(rows: RecordRow[], batches: Map<string, Batch>, add: AddIssue) {
  const sites = new Map<string, Site>();
  for (const row of rows) {
    const cells = new Cells(row, add);
    const batchId = cells.text('batch_id', true);
    const attemptId = cells.text('attempt_id', true);
    const siteId = cells.text('site_id', true);
    const preparedGroup = cells.choice('prepared_group', preparedGroups, true);
    const prepErasureStatus = cells.choice('prep_erasure_status', prepStatuses, true);
    const analysisStatus = cells.choice('analysis_status', analysisStatuses, true);
    const exclusionStage = cells.choice('exclusion_stage', ['preparation', 'image1', 'image2', 'pairing', 'readout', 'other']);
    const exclusionReason = cells.text('exclusion_reason', analysisStatus === 'excluded' || analysisStatus === 'pending');
    const instrumentDecision = cells.choice('instrument_decision', ['m1', 'm0', 'loss', 'ambiguous', 'unclassified', 'not_available']);
    const decisionReadyUs = cells.number('decision_ready_us');
    const attemptLogRef = cells.text('attempt_log_ref');
    const previousAttemptRef = cells.text('previous_attempt_ref');
    if (analysisStatus === 'excluded' && !exclusionStage) cells.issue('exclusion_stage', '筛除阶段待补。', 'warning');
    if (analysisStatus === 'included' && prepErasureStatus === 'fail') {
      cells.issue('analysis_status', '制备擦除失败的位点标为纳入，请核对原统计口径。', 'warning');
    }
    if (batchId && !batches.has(batchId)) cells.issue('batch_id', '没有对应的批次配置。');
    if (!batchId || !attemptId || !siteId || !preparedGroup || !prepErasureStatus || !analysisStatus) continue;
    unique(sites, tupleKey(batchId, attemptId, siteId), {
      batchId, attemptId, siteId, preparedGroup, prepErasureStatus, analysisStatus, exclusionStage, exclusionReason,
      instrumentDecision, decisionReadyUs, attemptLogRef, previousAttemptRef, row,
    }, 'site_id', add);
  }
  if (!rows.length) add({ sheet: '尝试与位点', row: 2 }, 'attempt_id', '请至少填写一条尝试与位点记录。');
  return sites;
}

function readExposures(rows: RecordRow[], sites: Map<string, Site>, add: AddIssue) {
  const frames = new Map<string, Map<number, Exposure>>();
  const exposureSlots = new Map<string, 1 | 2>();
  for (const row of rows) {
    const cells = new Cells(row, add);
    const batchId = cells.text('batch_id', true);
    const attemptId = cells.text('attempt_id', true);
    const siteId = cells.text('site_id', true);
    const imageNo = cells.image(true);
    const status = cells.choice('frame_status', frameStatuses, true);
    const exposureId = cells.text('exposure_id');
    const sourceRef = cells.text('raw_ref');
    const roiId = cells.text('roi_id');
    const decisionCount = cells.number('decision_count');
    const rawRoiSum = cells.number('raw_roi_sum');
    const actualThreshold = cells.number('actual_threshold');
    const thresholdOp = cells.choice('threshold_op', ['ge', 'gt', 'other']);
    const triggerUs = cells.number('trigger_us');
    const startUs = cells.number('exposure_start_us');
    const endUs = cells.number('exposure_end_us');
    const countReadyUs = cells.number('count_ready_us');
    const issue = cells.text('frame_issue', status !== null && status !== 'valid');
    validateOrder(cells, [['trigger_us', triggerUs], ['exposure_start_us', startUs], ['exposure_end_us', endUs], ['count_ready_us', countReadyUs]]);
    if (status === 'valid') {
      if (!exposureId) cells.issue('exposure_id', '有效帧缺少可关联的曝光 ID。');
      if (!sourceRef) cells.issue('raw_ref', '有效帧缺少原图或计数日志引用。');
      if (!roiId) cells.issue('roi_id', '有效帧的 ROI 待补。', 'warning');
      if (actualThreshold === null || thresholdOp === null) cells.issue('actual_threshold', '实际阈值或比较方式待补。', 'warning');
      if (decisionCount === null) cells.issue('decision_count', '判决计数待补，可先追溯原始记录。', 'warning');
      if (triggerUs === null || startUs === null || endUs === null) cells.issue('exposure_start_us', '相机触发或曝光边界待补。', 'warning');
    }
    if ((status === 'missing' || status === 'skipped') && (decisionCount !== null || rawRoiSum !== null)) {
      cells.issue('decision_count', '缺帧或跳过时计数应留空。');
    }
    if (!batchId || !attemptId || !siteId || !imageNo || !status) continue;
    const key = tupleKey(batchId, attemptId, siteId);
    if (!sites.has(key)) {
      cells.issue('site_id', '没有对应的批次、尝试和位点记录。');
      continue;
    }
    const pair = frames.get(key) ?? new Map<number, Exposure>();
    const previous = pair.get(imageNo);
    if (previous) cells.issue('image_no', `同一位点的 Image ${imageNo} 与第 ${previous.row.row} 行重复。`);
    else pair.set(imageNo, {
      imageNo, status, exposureId, sourceRef, roiId, decisionCount, rawRoiSum, actualThreshold, thresholdOp,
      triggerUs, startUs, endUs, countReadyUs, issue, row,
    });
    frames.set(key, pair);
    if (exposureId) {
      const exposureKey = tupleKey(batchId, attemptId, exposureId);
      const previousSlot = exposureSlots.get(exposureKey);
      if (previousSlot && previousSlot !== imageNo) cells.issue('exposure_id', '同一次相机曝光被分配给了两个 Image 编号。');
      else exposureSlots.set(exposureKey, imageNo);
    }
  }
  return frames;
}

function readEvents(
  rows: RecordRow[], sites: Map<string, Site>, frames: Map<string, Map<number, Exposure>>, add: AddIssue,
) {
  const attempts = new Map<string, string[]>();
  for (const [key, site] of sites) {
    const attemptKey = tupleKey(site.batchId, site.attemptId);
    const linked = attempts.get(attemptKey) ?? [];
    linked.push(key);
    attempts.set(attemptKey, linked);
  }
  const events = new Map<string, ExperimentEvent & { row: RecordRow }>();
  for (const row of rows) {
    const cells = new Cells(row, add);
    const batchId = cells.text('batch_id', true);
    const attemptId = cells.text('attempt_id', true);
    const eventId = cells.text('event_id', true);
    const eventType = cells.choice('event_type', eventTypes, true);
    const siteId = cells.text('site_id');
    const imageNo = cells.image();
    const startUs = cells.number('start_us');
    const endUs = cells.number('end_us');
    const sourceRef = cells.text('source_ref', true);
    const notes = cells.text('notes');
    validateOrder(cells, [['start_us', startUs], ['end_us', endUs]]);
    if (!batchId || !attemptId || !eventId || !eventType) continue;
    const key = siteId ? tupleKey(batchId, attemptId, siteId) : null;
    const linked = key ? (sites.has(key) ? [key] : undefined) : attempts.get(tupleKey(batchId, attemptId));
    if (!linked) {
      cells.issue(siteId ? 'site_id' : 'attempt_id', '事件没有对应的尝试或位点。');
      continue;
    }
    if (eventType === 'illumination_399' && imageNo && startUs !== null && endUs !== null) {
      const mismatch = linked.find(siteKey => {
        const frame = frames.get(siteKey)?.get(imageNo);
        return frame?.status === 'valid' && frame.startUs !== null && frame.endUs !== null
          && (endUs <= frame.startUs || startUs >= frame.endUs);
      });
      if (mismatch) cells.issue('start_us', `位点 ${sites.get(mismatch)!.siteId} 的 399 nm 照明窗与相机曝光没有重叠。`);
    }
    unique(events, tupleKey(batchId, attemptId, eventId), {
      batchId, attemptId, siteId, eventId, eventType, imageNo, startUs, endUs, sourceRef, notes, row,
    }, 'event_id', add);
  }
  return [...events.values()].map(({ row: _row, ...event }) => event);
}

function pairSites(sites: Map<string, Site>, frames: Map<string, Map<number, Exposure>>, add: AddIssue): SiteRecord[] {
  return [...sites].map(([key, { row, ...site }]) => {
    const pair = frames.get(key);
    const first = pair?.get(1);
    const second = pair?.get(2);
    if (!first || !second) {
      add(row, 'site_id', `缺少 Image ${first ? '2' : second ? '1' : '1 和 2'} 的记录行，缺帧也要登记。`);
    }
    const available = [first, second].filter((frame): frame is Exposure => frame !== undefined);
    if (first && second) {
      if (first.endUs !== null && second.startUs !== null && second.startUs < first.endUs) {
        add(second.row, 'exposure_start_us', 'Image 2 在 Image 1 曝光结束之前开始。');
      }
      if (first.triggerUs !== null && second.triggerUs !== null && second.triggerUs < first.triggerUs) {
        add(second.row, 'trigger_us', 'Image 2 的相机触发早于 Image 1。');
      }
    }
    if (site.analysisStatus === 'included' && (first?.status !== 'valid' || second?.status !== 'valid')) {
      add(row, 'analysis_status', '原记录标为纳入，但双帧未同时有效，请核对统计分母。', 'warning');
    }
    if (site.decisionReadyUs !== null && available.some(frame => {
      const time = frame.countReadyUs ?? frame.endUs;
      return time !== null && site.decisionReadyUs! < time;
    })) add(row, 'decision_ready_us', '判决时刻早于至少一帧的计数可用或曝光结束时刻。');
    return { ...site, frames: available.map(({ row: _row, ...frame }) => frame) };
  });
}

export function summarizeSenooMeasurementSites(records: readonly SiteRecord[]) {
  return {
    attemptedSites: records.length,
    prepPassed: records.filter(site => site.prepErasureStatus === 'pass').length,
    validPairs: records.filter(site => site.frames.length === 2 && site.frames.every(frame => frame.status === 'valid')).length,
    included: records.filter(site => site.analysisStatus === 'included').length,
  };
}

export function validateSenooMeasurements(sheets: Sheets): SenooMeasurementReport {
  const issues: SenooMeasurementIssue[] = [];
  const add: AddIssue = ({ sheet, row }, field, message, severity = 'error') => issues.push({ severity, sheet, row, field, message });
  const batches = readBatches(readRows('批次配置', sheets['批次配置'], add), add);
  const sites = readSites(readRows('尝试与位点', sheets['尝试与位点'], add), batches, add);
  const frames = readExposures(readRows('曝光记录', sheets['曝光记录'], add), sites, add);
  const events = readEvents(readRows('事件时标', sheets['事件时标'], add), sites, frames, add);
  const records = pairSites(sites, frames, add);
  const byBatch = new Map<string, SiteRecord[]>();
  for (const record of records) {
    const batchRecords = byBatch.get(record.batchId) ?? [];
    batchRecords.push(record);
    byBatch.set(record.batchId, batchRecords);
  }
  const summaries = [...batches.values()].map(({ row, ...batch }) => {
    const batchRecords = byBatch.get(batch.id) ?? [];
    if (!batchRecords.length) add(row, 'batch_id', '本批次没有尝试与位点记录。', 'warning');
    const counts = { valid: 0, missing: 0, skipped: 0, invalid: 0, unknown: 0 };
    for (const site of batchRecords) for (const frame of site.frames) counts[frame.status]++;
    return {
      ...batch,
      uniqueAttempts: new Set(batchRecords.map(site => site.attemptId)).size,
      ...summarizeSenooMeasurementSites(batchRecords),
      missingFrames: counts.missing,
      skippedFrames: counts.skipped,
      invalidFrames: counts.invalid,
      unknownFrames: counts.unknown,
      groups: preparedGroups.map(preparedGroup => ({
        preparedGroup, ...summarizeSenooMeasurementSites(batchRecords.filter(record => record.preparedGroup === preparedGroup)),
      })),
    };
  });
  return { issues, batches: summaries, records, events };
}
