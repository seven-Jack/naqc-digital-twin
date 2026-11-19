type SourceKind = 'synthetic' | 'measured';
type JsonObject = Record<string, unknown>;
type ReadReference = (value: unknown, field: string) => string;

export type SenooTransportPosition = readonly [number, number, number];

export interface SenooTransportSite {
  readonly id: string;
  readonly positionM: SenooTransportPosition;
  readonly target: boolean;
}

interface SenooTransportOccupancy {
  readonly siteId: string;
  readonly state: 'occupied' | 'empty' | 'unknown';
  readonly atomId: string | null;
}

export interface SenooTransportSnapshot {
  readonly availableAtS: number;
  readonly sourceRef: string;
  readonly sites: readonly SenooTransportOccupancy[];
}

interface TimeWindow {
  readonly startS: number;
  readonly endS: number;
}

interface TimedRecord extends TimeWindow {
  readonly sourceRef: string;
}

type TransportStage = ({
  readonly status: 'executed' | 'failed';
} & TimeWindow | {
  readonly status: 'skipped';
  readonly startS: null;
  readonly endS: null;
}) & {
  readonly sourceRef: string;
  readonly reason: string | null;
};

interface MovePath {
  readonly kind: 'tracked' | 'commanded';
  readonly sourceRef: string;
  readonly samples: readonly { readonly timeS: number; readonly positionM: SenooTransportPosition }[];
}

export interface SenooTransportMove extends TimedRecord {
  readonly id: string;
  readonly atomId: string | null;
  readonly fromSiteId: string;
  readonly toSiteId: string;
  readonly outcome: 'survived' | 'lost' | 'unknown';
  readonly outcomeAtS: number | null;
  readonly outcomeSourceRef: string | null;
  readonly path: MovePath | null;
}

export interface SenooTransportAttempt extends TimedRecord {
  readonly attemptId: string;
  readonly load: TimedRecord | null;
  readonly initial: SenooTransportSnapshot | null;
  readonly final: SenooTransportSnapshot | null;
  readonly transport: TransportStage;
  readonly moves: readonly SenooTransportMove[];
}

export interface SenooTransportRun {
  readonly kind: 'senoo-transport-run';
  readonly schemaVersion: 1;
  readonly sourceKind: SourceKind;
  readonly sourceRef: string;
  readonly isotope: 171;
  readonly apparatusVersion: string;
  readonly workingPoint: string;
  readonly trapWavelengthM: number;
  readonly acquisitionRunId: string;
  readonly clockId: string;
  readonly timeOriginRef: string;
  readonly coordinateFrameRef: string;
  readonly expectedAttempts: number;
  readonly sites: readonly SenooTransportSite[];
  readonly attempts: readonly SenooTransportAttempt[];
}

export function createSenooTransportRunTemplate() {
  return {
    kind: 'senoo-transport-run', schemaVersion: 1, sourceKind: null, sourceRef: null, isotope: 171,
    apparatusVersion: null, workingPoint: null, trapWavelengthM: null, acquisitionRunId: null,
    clockId: null, timeOriginRef: null, coordinateFrameRef: null, expectedAttempts: null, sites: [], attempts: [],
  } as const;
}

function requireValue(condition: unknown, field: string, issue: string): asserts condition {
  if (!condition) throw new Error(`${field}：${issue}`);
}

function object(value: unknown, field: string): JsonObject {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), field, '应为 JSON 对象');
  return value as JsonObject;
}

function array(value: unknown, field: string): unknown[] {
  requireValue(Array.isArray(value), field, '应为数组');
  return value;
}

function text(value: unknown, field: string): string {
  requireValue(typeof value === 'string' && !!value.trim(), field, '应为非空文本');
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  return value == null ? null : text(value, field);
}

function finite(value: unknown, field: string): number {
  requireValue(typeof value === 'number' && Number.isFinite(value), field, '应为有限数值');
  return value;
}

function choice<T>(value: unknown, options: readonly T[], field: string): T {
  const selected = options.find(option => option === value);
  requireValue(selected !== undefined, field, `应为 ${options.join('、')} 之一`);
  return selected;
}

function position(value: unknown, field: string): SenooTransportPosition {
  const parts = array(value, field);
  requireValue(parts.length === 3, field, '应包含三个米制坐标');
  return [finite(parts[0], `${field}[0]`), finite(parts[1], `${field}[1]`), finite(parts[2], `${field}[2]`)];
}

function window(raw: JsonObject, field: string, parent?: TimeWindow): TimeWindow {
  const startS = finite(raw.startS, `${field}.startS`);
  const endS = finite(raw.endS, `${field}.endS`);
  requireValue(endS >= startS && Number.isFinite(endS - startS), field, '结束不得早于开始，时间跨度应为有限秒数');
  requireValue(!parent || (startS >= parent.startS && endS <= parent.endS), field, '时段应位于所属操作时段内');
  return { startS, endS };
}

function readSite(value: unknown, field: string): SenooTransportSite {
  const raw = object(value, field);
  requireValue(typeof raw.target === 'boolean', `${field}.target`, '应为布尔值');
  return { id: text(raw.id, `${field}.id`), positionM: position(raw.positionM, `${field}.positionM`), target: raw.target };
}

function snapshot(
  value: unknown, field: string, time: TimeWindow, siteIds: ReadonlySet<string>, ref: ReadReference,
): SenooTransportSnapshot | null {
  if (value == null) return null;
  const raw = object(value, field);
  const availableAtS = finite(raw.availableAtS, `${field}.availableAtS`);
  requireValue(availableAtS >= time.startS && availableAtS <= time.endS, `${field}.availableAtS`, '占位可用时刻应位于尝试时段内');
  const seen = new Set<string>();
  const atoms = new Set<string>();
  const sites = array(raw.sites, `${field}.sites`).map((item, index) => {
    const at = `${field}.sites[${index}]`;
    const entry = object(item, at);
    const siteId = text(entry.siteId, `${at}.siteId`);
    requireValue(siteIds.has(siteId) && !seen.has(siteId), `${at}.siteId`, '位点未知或重复');
    seen.add(siteId);
    const state = choice(entry.state, ['occupied', 'empty', 'unknown'] as const, `${at}.state`);
    const atomId = optionalText(entry.atomId, `${at}.atomId`);
    if (atomId !== null) {
      requireValue(state === 'occupied' && !atoms.has(atomId), `${at}.atomId`, '只有已占位位点可登记原子且同一原子不得重复');
      atoms.add(atomId);
    }
    return { siteId, state, atomId };
  });
  requireValue(seen.size === siteIds.size, `${field}.sites`, '观测快照须登记全部位点，缺测位点填 unknown');
  return { availableAtS, sourceRef: ref(raw.sourceRef, `${field}.sourceRef`), sites };
}

function transportStage(value: unknown, field: string, attempt: TimeWindow, ref: ReadReference): TransportStage {
  const raw = object(value, field);
  const status = choice(raw.status, ['executed', 'failed', 'skipped'] as const, `${field}.status`);
  const reason = optionalText(raw.reason, `${field}.reason`);
  const sourceRef = ref(raw.sourceRef, `${field}.sourceRef`);
  requireValue(status === 'executed' || reason, `${field}.reason`, '失败或跳过须登记原因');
  if (status === 'skipped') {
    requireValue(raw.startS === null && raw.endS === null, field, '跳过操作应留空实际起止时刻');
    return { status, reason, sourceRef, startS: null, endS: null };
  }
  return { status, reason, sourceRef, ...window(raw, field, attempt) };
}

function movePath(
  value: unknown, field: string, time: TimeWindow, sourceKind: SourceKind, ref: ReadReference,
): MovePath | null {
  if (value == null) return null;
  const raw = object(value, field);
  const kind = choice(raw.kind, ['tracked', 'commanded'] as const, `${field}.kind`);
  const name = `${field}.sourceRef`;
  const sourceRef = kind === 'commanded' && sourceKind === 'measured'
      && typeof raw.sourceRef === 'string' && /^control-setpoint:/i.test(raw.sourceRef.trim())
    ? text(raw.sourceRef, name) : ref(raw.sourceRef, name);
  const rows = array(raw.samples, `${field}.samples`);
  requireValue(rows.length > 0, `${field}.samples`, '登记轨迹须至少有一个样点，缺少轨迹时填 null');
  const samples = rows.map((item, index) => {
    const at = `${field}.samples[${index}]`;
    const sample = object(item, at);
    const timeS = finite(sample.timeS, `${at}.timeS`);
    requireValue(timeS >= time.startS && timeS <= time.endS, `${at}.timeS`, '轨迹时标应位于搬运时段内');
    return { timeS, positionM: position(sample.positionM, `${at}.positionM`) };
  });
  const invalid = samples.findIndex((sample, index) => index > 0 && sample.timeS <= samples[index - 1].timeS);
  requireValue(invalid < 0, `${field}.samples[${invalid}].timeS`, '轨迹时标应严格递增');
  return { kind, sourceRef, samples };
}

function movesForAttempt(
  values: readonly unknown[], field: string, attempt: TimeWindow, stage: TimeWindow,
  siteIds: ReadonlySet<string>, sourceKind: SourceKind, ref: ReadReference,
): SenooTransportMove[] {
  const ids = new Set<string>();
  const atomIntervals = new Map<string, TimeWindow[]>();
  const moves = values.map((value, index) => {
    const at = `${field}[${index}]`;
    const raw = object(value, at);
    const id = text(raw.id, `${at}.id`);
    requireValue(!ids.has(id), `${at}.id`, '同一尝试内搬运 ID 不得重复');
    ids.add(id);
    const time = window(raw, at, stage);
    const atomId = optionalText(raw.atomId, `${at}.atomId`);
    if (atomId !== null) {
      const intervals = atomIntervals.get(atomId) ?? [];
      intervals.push(time);
      atomIntervals.set(atomId, intervals);
    }
    const fromSiteId = text(raw.fromSiteId, `${at}.fromSiteId`);
    const toSiteId = text(raw.toSiteId, `${at}.toSiteId`);
    requireValue(siteIds.has(fromSiteId), `${at}.fromSiteId`, '起始位点未知');
    requireValue(siteIds.has(toSiteId), `${at}.toSiteId`, '目标位点未知');
    const outcome = choice(raw.outcome, ['survived', 'lost', 'unknown'] as const, `${at}.outcome`);
    const outcomeAtS = raw.outcomeAtS == null ? null : finite(raw.outcomeAtS, `${at}.outcomeAtS`);
    const outcomeSourceRef = raw.outcomeSourceRef == null ? null : ref(raw.outcomeSourceRef, `${at}.outcomeSourceRef`);
    requireValue(outcome === 'unknown' || (outcomeAtS !== null && outcomeSourceRef), at, '已确认结局须有可用时刻及证据引用');
    requireValue(outcomeAtS === null || (outcomeAtS >= time.endS && outcomeAtS <= attempt.endS),
      `${at}.outcomeAtS`, '结局可用时刻应在搬运结束后且位于尝试时段内');
    return {
      id, atomId, fromSiteId, toSiteId, ...time, outcome, outcomeAtS, outcomeSourceRef,
      sourceRef: ref(raw.sourceRef, `${at}.sourceRef`), path: movePath(raw.path, `${at}.path`, time, sourceKind, ref),
    };
  });
  for (const [atomId, intervals] of atomIntervals) {
    intervals.sort((a, b) => a.startS - b.startS || a.endS - b.endS);
    requireValue(intervals.every((interval, index) => index === 0 || interval.startS >= intervals[index - 1].endS),
      field, `同一原子 ${atomId} 的搬运时段重叠`);
  }
  return moves;
}

function readAttempt(
  value: unknown, field: string, siteIds: ReadonlySet<string>, sourceKind: SourceKind, ref: ReadReference,
): SenooTransportAttempt {
  const raw = object(value, field);
  const attempt = window(raw, field);
  const loadRaw = raw.load == null ? null : object(raw.load, `${field}.load`);
  const load = loadRaw && {
    ...window(loadRaw, `${field}.load`, attempt), sourceRef: ref(loadRaw.sourceRef, `${field}.load.sourceRef`),
  };
  const initial = snapshot(raw.initial, `${field}.initial`, attempt, siteIds, ref);
  const final = snapshot(raw.final, `${field}.final`, attempt, siteIds, ref);
  requireValue(!initial || !load || initial.availableAtS >= load.endS, `${field}.initial.availableAtS`, '装载前后的时标顺序不符');
  requireValue(!final || ((!load || final.availableAtS >= load.endS) && (!initial || final.availableAtS >= initial.availableAtS)),
    `${field}.final.availableAtS`, '末端占位应在装载及初始占位之后可用');

  const transport = transportStage(raw.transport, `${field}.transport`, attempt, ref);
  const entries = array(raw.moves, `${field}.moves`);
  if (transport.status === 'skipped') {
    requireValue(entries.length === 0, `${field}.moves`, '跳过输运的尝试没有已执行搬运记录');
  } else {
    requireValue((!load || transport.startS >= load.endS) && (!initial || transport.startS >= initial.availableAtS),
      `${field}.transport.startS`, '输运应在装载结束和已有初始占位结果可用后开始');
    requireValue(!final || final.availableAtS >= transport.endS,
      `${field}.final.availableAtS`, '末端占位应在输运结束后可用');
  }
  const moves = transport.status === 'skipped' ? []
    : movesForAttempt(entries, `${field}.moves`, attempt, transport, siteIds, sourceKind, ref);
  return {
    attemptId: text(raw.attemptId, `${field}.attemptId`), sourceRef: ref(raw.sourceRef, `${field}.sourceRef`),
    ...attempt, load, initial, final, transport, moves,
  };
}

export function parseSenooTransportRun(textInput: string): SenooTransportRun {
  let value: unknown;
  try {
    value = JSON.parse(textInput.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Senoo 装载与输运文件的 JSON 无效。');
  }
  const raw = object(value, 'Senoo 装载与输运记录');
  requireValue(raw.kind === 'senoo-transport-run' && raw.schemaVersion === 1, 'schemaVersion', '请选择 Senoo 装载与输运 v1 JSON');
  requireValue(raw.isotope === 171, 'isotope', '应为 ¹⁷¹Yb 的整数质量数 171');
  const sourceKind = choice(raw.sourceKind, ['synthetic', 'measured'] as const, 'sourceKind');
  const ref: ReadReference = (value, field) => {
    const source = text(value, field);
    requireValue(sourceKind !== 'measured' || !/^(synthetic|simulation|literature|control-setpoint):/i.test(source),
      field, '实测来源不得引用合成、文献或指令设定作为观测证据');
    return source;
  };
  const trapWavelengthM = finite(raw.trapWavelengthM, 'trapWavelengthM');
  requireValue(trapWavelengthM > 0, 'trapWavelengthM', '应为正的米制波长');
  const sites = array(raw.sites, 'sites').map((site, index) => readSite(site, `sites[${index}]`));
  const siteIds = new Set(sites.map(site => site.id));
  requireValue(siteIds.size > 0 && siteIds.size === sites.length, 'sites', '须登记至少一个位点且 ID 不得重复');
  const expectedAttempts = finite(raw.expectedAttempts, 'expectedAttempts');
  const rawAttempts = array(raw.attempts, 'attempts');
  requireValue(Number.isSafeInteger(expectedAttempts) && expectedAttempts > 0, 'expectedAttempts', '应为正的尝试总数');
  requireValue(rawAttempts.length === expectedAttempts, 'attempts', '尝试条数须与 expectedAttempts 相同');
  const attempts = rawAttempts.map((attempt, index) => readAttempt(attempt, `attempts[${index}]`, siteIds, sourceKind, ref));
  requireValue(new Set(attempts.map(attempt => attempt.attemptId)).size === attempts.length, 'attempts', '尝试 ID 不得重复');
  return {
    kind: 'senoo-transport-run', schemaVersion: 1, isotope: 171, sourceKind, sourceRef: ref(raw.sourceRef, 'sourceRef'),
    apparatusVersion: text(raw.apparatusVersion, 'apparatusVersion'), workingPoint: text(raw.workingPoint, 'workingPoint'),
    trapWavelengthM, acquisitionRunId: text(raw.acquisitionRunId, 'acquisitionRunId'), clockId: text(raw.clockId, 'clockId'),
    timeOriginRef: ref(raw.timeOriginRef, 'timeOriginRef'), coordinateFrameRef: ref(raw.coordinateFrameRef, 'coordinateFrameRef'),
    expectedAttempts, sites, attempts,
  };
}
