import { READOUT_OUTCOMES, type ReadoutOutcome } from './dualExposureReadout';

const stageNames = ['load', 'transport', 'gate', 'readout'] as const;
type StageName = typeof stageNames[number];
type SourceKind = 'measured' | 'synthetic';
type JsonObject = Record<string, unknown>;

export interface SenooCircuitStage {
  readonly status: 'executed' | 'failed' | 'skipped';
  readonly startS: number | null;
  readonly endS: number | null;
  readonly sourceRef: string | null;
  readonly reason: string | null;
}

export interface SenooCircuitFrame {
  readonly imageNo: 1 | 2;
  readonly status: 'valid' | 'missing' | 'invalid' | 'skipped';
  readonly exposureId: string | null;
  readonly sourceRef: string | null;
  readonly roiId: string | null;
  readonly count: number | null;
  readonly actualThreshold: number | null;
  readonly comparison: 'ge' | 'gt' | null;
  readonly triggerS: number | null;
  readonly startS: number | null;
  readonly endS: number | null;
  readonly countReadyS: number | null;
}

export interface SenooCircuitSite {
  readonly siteId: string;
  readonly instrumentDecision: ReadoutOutcome | null;
  readonly frames: readonly [SenooCircuitFrame, SenooCircuitFrame];
}

export interface SenooCircuitSelection {
  readonly status: 'included' | 'excluded';
  readonly sourceRef: string;
  readonly reason: string | null;
}

export interface SenooCircuitAttempt {
  readonly attemptId: string;
  readonly sourceRef: string;
  readonly selection: SenooCircuitSelection;
  readonly initialOccupiedSiteIds: readonly string[];
  readonly postTransportOccupiedSiteIds: readonly string[];
  readonly stages: Readonly<Record<StageName, SenooCircuitStage>>;
  readonly sites: readonly SenooCircuitSite[];
}

export interface SenooCircuitBatch {
  readonly kind: 'senoo-circuit-batch';
  readonly schemaVersion: 1;
  readonly sourceKind: SourceKind;
  readonly sourceRef: string;
  readonly isotope: 171;
  readonly trapWavelengthM: number;
  readonly apparatusVersion: string;
  readonly protocolVersion: string;
  readonly workingPoint: string;
  readonly cameraConfigRef: string;
  readonly roiMapVersion: string;
  readonly countProcessingRef: string;
  readonly outcomePolicy: string;
  readonly screeningRuleRef: string;
  readonly circuitSelectionRuleRef: string;
  readonly countUnit: string;
  readonly acquisitionRunId: string;
  readonly batchId: string;
  readonly acquiredAtUtc: string;
  readonly clockId: string;
  readonly timeOriginRef: string;
  readonly circuitId: string;
  readonly circuitVersion: string;
  readonly basis: string;
  readonly siteIds: readonly string[];
  readonly targetBitstrings: readonly string[];
  readonly expectedAttempts: number;
  readonly attempts: readonly SenooCircuitAttempt[];
}

export function createSenooCircuitBatchTemplate() {
  return {
    kind: 'senoo-circuit-batch', schemaVersion: 1,
    sourceKind: null, sourceRef: null, isotope: 171, trapWavelengthM: null,
    apparatusVersion: null, protocolVersion: null, workingPoint: null,
    cameraConfigRef: null, roiMapVersion: null, countProcessingRef: null, outcomePolicy: null,
    screeningRuleRef: null, circuitSelectionRuleRef: null, countUnit: null, acquisitionRunId: null, batchId: null, acquiredAtUtc: null,
    clockId: null, timeOriginRef: null, circuitId: null, circuitVersion: null, basis: null,
    siteIds: [], targetBitstrings: [], expectedAttempts: null, attempts: [],
  } as const;
}

function requireValue(condition: unknown, path: string, issue: string): asserts condition {
  if (!condition) throw new Error(`${path}：${issue}`);
}

function object(value: unknown, path: string): JsonObject {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, '应为 JSON 对象');
  return value as JsonObject;
}

function list(value: unknown, path: string): unknown[] {
  requireValue(Array.isArray(value), path, '应为数组');
  return value;
}

function requiredText(value: unknown, path: string): string {
  requireValue(typeof value === 'string' && !!value.trim(), path, '应为非空文本');
  return value.trim();
}

function optionalText(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : requiredText(value, path);
}

function number(value: unknown, path: string): number {
  requireValue(typeof value === 'number' && Number.isFinite(value), path, '应为有限数值');
  return value;
}

function optionalNumber(value: unknown, path: string): number | null {
  return value === null || value === undefined ? null : number(value, path);
}

function choice<T>(value: unknown, options: readonly T[], path: string): T {
  const selected = options.find(option => value === option);
  requireValue(selected !== undefined, path, `应为 ${options.join('、')} 之一`);
  return selected;
}

function sourceReference(value: unknown, sourceKind: SourceKind, path: string): string {
  const source = requiredText(value, path);
  requireValue(sourceKind !== 'measured' || !/^(synthetic|control-setpoint|literature|simulation):/i.test(source),
    path, '实测声明与来源类型冲突');
  return source;
}

function optionalSource(value: unknown, sourceKind: SourceKind, path: string): string | null {
  return value === null || value === undefined ? null : sourceReference(value, sourceKind, path);
}

function uniqueTexts(value: unknown, path: string): string[] {
  const values = list(value, path).map((entry, index) => requiredText(entry, `${path}[${index}]`));
  requireValue(new Set(values).size === values.length, path, '含重复项');
  return values;
}

function readUtc(value: unknown, path: string): string {
  const utc = requiredText(value, path);
  const time = Date.parse(utc);
  requireValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(utc) && Number.isFinite(time)
    && new Date(time).toISOString().slice(0, 19) === utc.slice(0, 19), path, '应为有效的 UTC 日期及时间');
  return utc;
}

function parseStage(value: unknown, sourceKind: SourceKind, path: string): SenooCircuitStage {
  const raw = object(value, path);
  const status = choice(raw.status, ['executed', 'failed', 'skipped'] as const, `${path}.status`);
  const startS = optionalNumber(raw.startS, `${path}.startS`);
  const endS = optionalNumber(raw.endS, `${path}.endS`);
  const sourceRef = optionalSource(raw.sourceRef, sourceKind, `${path}.sourceRef`);
  const reason = optionalText(raw.reason, `${path}.reason`);
  if (status === 'skipped') {
    requireValue(startS === null && endS === null, path, '跳过阶段须留空开始和结束时刻');
  } else {
    requireValue(startS !== null && endS !== null && endS >= startS && Number.isFinite(endS - startS) && sourceRef,
      path, '执行或失败阶段须有有效时段和原始记录引用');
  }
  requireValue(status === 'executed' || reason, `${path}.reason`, '失败或跳过应登记原因');
  return { status, startS, endS, sourceRef, reason };
}

function parseStages(value: unknown, sourceKind: SourceKind, path: string): SenooCircuitAttempt['stages'] {
  const raw = object(value, path);
  const stages = {
    load: parseStage(raw.load, sourceKind, `${path}.load`),
    transport: parseStage(raw.transport, sourceKind, `${path}.transport`),
    gate: parseStage(raw.gate, sourceKind, `${path}.gate`),
    readout: parseStage(raw.readout, sourceKind, `${path}.readout`),
  };
  let lastEndS = -Infinity;
  for (const name of stageNames) {
    const { startS, endS } = stages[name];
    if (startS === null || endS === null) continue;
    requireValue(startS >= lastEndS, `${path}.${name}`, '阶段开始早于上一实际阶段结束');
    lastEndS = endS;
  }
  return stages;
}

function parseFrame(value: unknown, sourceKind: SourceKind, readout: SenooCircuitStage, path: string): SenooCircuitFrame {
  const raw = object(value, path);
  const imageNo = choice(raw.imageNo, [1, 2] as const, `${path}.imageNo`);
  const status = choice(raw.status, ['valid', 'missing', 'invalid', 'skipped'] as const, `${path}.status`);
  const exposureId = optionalText(raw.exposureId, `${path}.exposureId`);
  const sourceRef = optionalSource(raw.sourceRef, sourceKind, `${path}.sourceRef`);
  const roiId = optionalText(raw.roiId, `${path}.roiId`);
  const count = optionalNumber(raw.count, `${path}.count`);
  const actualThreshold = optionalNumber(raw.actualThreshold, `${path}.actualThreshold`);
  const comparison = raw.comparison == null ? null : choice(raw.comparison, ['ge', 'gt'] as const, `${path}.comparison`);
  const triggerS = optionalNumber(raw.triggerS, `${path}.triggerS`);
  const startS = optionalNumber(raw.startS, `${path}.startS`);
  const endS = optionalNumber(raw.endS, `${path}.endS`);
  const countReadyS = optionalNumber(raw.countReadyS, `${path}.countReadyS`);
  const times = [triggerS, startS, endS, countReadyS].filter(time => time !== null);
  if (status === 'valid') {
    requireValue(exposureId && sourceRef && roiId && count !== null && actualThreshold !== null && comparison && times.length === 4,
      path, '有效帧须有曝光 ID、位点 ROI、原始记录引用、计数、实际阈值、比较规则和完整时标');
    requireValue(startS !== null && endS !== null && endS > startS, path, '有效帧的曝光时长须为正');
  }
  requireValue(status === 'valid' || status === 'invalid' || count === null, `${path}.count`, '缺帧或跳过时计数须留空');
  requireValue(readout.status !== 'skipped' || status === 'skipped', `${path}.status`, '读出阶段跳过时两个帧槽均应标为跳过');
  requireValue(status !== 'skipped' || times.length === 0, path, '跳过帧的实测时标须留空');
  const { startS: readoutStartS, endS: readoutEndS } = readout;
  requireValue(times.every((time, index) => readoutStartS !== null && readoutEndS !== null
    && time >= readoutStartS && time <= readoutEndS && (index === 0 || time >= times[index - 1])),
  path, '触发、曝光和计数时标应按顺序落在读出阶段内');
  return { imageNo, status, exposureId, sourceRef, roiId, count, actualThreshold, comparison, triggerS, startS, endS, countReadyS };
}

function parseSite(value: unknown, sourceKind: SourceKind, readout: SenooCircuitStage, path: string): SenooCircuitSite {
  const raw = object(value, path);
  const siteId = requiredText(raw.siteId, `${path}.siteId`);
  const instrumentDecision = raw.instrumentDecision == null
    ? null : choice(raw.instrumentDecision, READOUT_OUTCOMES, `${path}.instrumentDecision`);
  requireValue(readout.status !== 'skipped' || instrumentDecision === null,
    `${path}.instrumentDecision`, '读出阶段跳过时原仪器判决须留空');
  const rawFrames = list(raw.frames, `${path}.frames`);
  requireValue(rawFrames.length === 2, `${path}.frames`, '须保留 Image 1 和 Image 2 的帧槽，包括缺帧与跳过');
  const frames = rawFrames.map((frame, index) => parseFrame(frame, sourceKind, readout, `${path}.frames[${index}]`));
  const first = frames.find(frame => frame.imageNo === 1);
  const second = frames.find(frame => frame.imageNo === 2);
  requireValue(first && second, `${path}.frames`, 'Image 1 和 Image 2 各须恰有一条记录');
  requireValue((first.endS === null || second.startS === null || second.startS >= first.endS)
    && (first.triggerS === null || second.triggerS === null || second.triggerS >= first.triggerS),
  `${path}.frames`, 'Image 2 须在 Image 1 后触发和曝光');
  return { siteId, instrumentDecision, frames: [first, second] };
}

function parseSelection(value: unknown, sourceKind: SourceKind, path: string): SenooCircuitSelection {
  const raw = object(value, path);
  const status = choice(raw.status, ['included', 'excluded'] as const, `${path}.status`);
  const sourceRef = sourceReference(raw.sourceRef, sourceKind, `${path}.sourceRef`);
  const reason = optionalText(raw.reason, `${path}.reason`);
  requireValue(status === 'included' || reason, `${path}.reason`, '筛除尝试须登记原因');
  return { status, sourceRef, reason };
}

function parseAttempt(value: unknown, sourceKind: SourceKind, siteIds: readonly string[], path: string): SenooCircuitAttempt {
  const raw = object(value, path);
  const attemptId = requiredText(raw.attemptId, `${path}.attemptId`);
  const sourceRef = sourceReference(raw.sourceRef, sourceKind, `${path}.sourceRef`);
  const selection = parseSelection(raw.selection, sourceKind, `${path}.selection`);
  const initialOccupiedSiteIds = uniqueTexts(raw.initialOccupiedSiteIds, `${path}.initialOccupiedSiteIds`);
  const postTransportOccupiedSiteIds = uniqueTexts(raw.postTransportOccupiedSiteIds, `${path}.postTransportOccupiedSiteIds`);
  const postTransport = new Set(postTransportOccupiedSiteIds);
  const stages = parseStages(raw.stages, sourceKind, `${path}.stages`);
  if (stages.transport.status === 'skipped') {
    requireValue(initialOccupiedSiteIds.length === postTransport.size && initialOccupiedSiteIds.every(id => postTransport.has(id)),
      `${path}.postTransportOccupiedSiteIds`, '跳过输运时前后占位集合须相同');
  }
  if (stages.gate.status === 'executed') {
    requireValue(stages.transport.status !== 'failed' && siteIds.every(id => postTransport.has(id)),
      `${path}.stages.gate`, '执行目标电路前须确认输运未失败且全部目标位点已占位');
  }
  const rawSites = list(raw.sites, `${path}.sites`);
  requireValue(rawSites.length === siteIds.length, `${path}.sites`, '须逐一登记所有目标位点');
  const foundSites = new Map<string, SenooCircuitSite>();
  const targetIds = new Set(siteIds);
  const timeFields = ['triggerS', 'startS', 'endS'] as const;
  const exposures = new Map<string, { imageNo: 1 | 2; times: Partial<Record<typeof timeFields[number], number>>; roiIds: Set<string> }>();
  for (const [index, value] of rawSites.entries()) {
    const sitePath = `${path}.sites[${index}]`;
    const site = parseSite(value, sourceKind, stages.readout, sitePath);
    requireValue(targetIds.has(site.siteId) && !foundSites.has(site.siteId), `${sitePath}.siteId`, '位点未知或重复');
    foundSites.set(site.siteId, site);
    for (const frame of site.frames) {
      if (frame.exposureId === null) continue;
      const exposure = exposures.get(frame.exposureId) ?? { imageNo: frame.imageNo, times: {}, roiIds: new Set<string>() };
      requireValue(exposure.imageNo === frame.imageNo, `${sitePath}.frames`,
        '同一尝试的一次相机曝光被分配给两个 Image 编号');
      for (const name of timeFields) {
        const time = frame[name];
        if (time === null) continue;
        requireValue(exposure.times[name] === undefined || exposure.times[name] === time, `${sitePath}.frames.${name}`,
          '共用曝光 ID 的相机时标不一致');
        exposure.times[name] = time;
      }
      if (frame.status === 'valid' && frame.roiId) {
        requireValue(!exposure.roiIds.has(frame.roiId), `${sitePath}.frames.roiId`, '共用曝光 ID 的有效位点 ROI 重复');
        exposure.roiIds.add(frame.roiId);
      }
      exposures.set(frame.exposureId, exposure);
    }
  }
  return {
    attemptId, sourceRef, selection, initialOccupiedSiteIds, postTransportOccupiedSiteIds, stages,
    sites: siteIds.map(id => foundSites.get(id)!),
  };
}

export function parseSenooCircuitBatch(text: string): SenooCircuitBatch {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('电路批次文件中的 JSON 无效。');
  }
  const raw = object(input, '电路批次');
  requireValue(raw.kind === 'senoo-circuit-batch' && raw.schemaVersion === 1,
    '电路批次', '请选择 Senoo 电路批次 v1 JSON');
  const sourceKind = choice(raw.sourceKind, ['measured', 'synthetic'] as const, 'sourceKind');
  const ref = (field: string) => sourceReference(raw[field], sourceKind, field);
  const txt = (field: string) => requiredText(raw[field], field);
  requireValue(raw.isotope === 171, 'isotope', '应为 ¹⁷¹Yb 的整数质量数 171');
  const trapWavelengthM = number(raw.trapWavelengthM, 'trapWavelengthM');
  requireValue(trapWavelengthM > 0, 'trapWavelengthM', '应为正的米制波长');

  const siteIds = uniqueTexts(raw.siteIds, 'siteIds');
  requireValue(siteIds.length > 0, 'siteIds', '须按位串顺序登记至少一个目标位点');
  const basis = txt('basis');
  requireValue(/^[XYZ]+$/.test(basis) && basis.length === siteIds.length, 'basis', '应按目标位点顺序逐位使用 X、Y 或 Z');
  const targetBitstrings = uniqueTexts(raw.targetBitstrings, 'targetBitstrings');
  requireValue(targetBitstrings.every(bits => /^[01]+$/.test(bits) && bits.length === siteIds.length),
    'targetBitstrings', '目标位串的长度应与位点数相同，且每位应为 0 或 1');
  const expectedAttempts = number(raw.expectedAttempts, 'expectedAttempts');
  requireValue(Number.isSafeInteger(expectedAttempts) && expectedAttempts > 0, 'expectedAttempts', '应为正的尝试总数');
  const rawAttempts = list(raw.attempts, 'attempts');
  requireValue(rawAttempts.length === expectedAttempts, 'attempts', '实际记录数应与声明的完整尝试总数相同');
  const attempts = rawAttempts.map((attempt, index) => parseAttempt(attempt, sourceKind, siteIds, `attempts[${index}]`));
  requireValue(new Set(attempts.map(attempt => attempt.attemptId)).size === attempts.length, 'attempts', '含重复的尝试 ID');

  return {
    kind: 'senoo-circuit-batch', schemaVersion: 1, sourceKind, sourceRef: ref('sourceRef'), isotope: 171, trapWavelengthM,
    apparatusVersion: txt('apparatusVersion'), protocolVersion: txt('protocolVersion'), workingPoint: txt('workingPoint'),
    cameraConfigRef: ref('cameraConfigRef'), roiMapVersion: txt('roiMapVersion'), countProcessingRef: ref('countProcessingRef'),
    outcomePolicy: txt('outcomePolicy'), screeningRuleRef: ref('screeningRuleRef'),
    circuitSelectionRuleRef: ref('circuitSelectionRuleRef'), countUnit: txt('countUnit'),
    acquisitionRunId: txt('acquisitionRunId'), batchId: txt('batchId'), acquiredAtUtc: readUtc(raw.acquiredAtUtc, 'acquiredAtUtc'),
    clockId: txt('clockId'), timeOriginRef: ref('timeOriginRef'), circuitId: txt('circuitId'), circuitVersion: txt('circuitVersion'),
    basis, siteIds, targetBitstrings, expectedAttempts, attempts,
  };
}
