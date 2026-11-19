type Row = Record<string, unknown>;

function object(value: unknown, field: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 应为对象`);
  return value as Row;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} 应为非空文本`);
  return value;
}

function distinctStrings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${field} 应为非空列表`);
  const values = value.map(v => string(v, field));
  if (new Set(values).size !== values.length) throw new Error(`${field} 含重复值`);
  return values;
}

function optionalRef(value: unknown, field: string) {
  return value === null ? null : string(value, field);
}

function layout(value: unknown, field: string) {
  const row = object(value, field);
  const siteIds = distinctStrings(row.siteIds, field + '.siteIds');
  if (row.coordinates === null) return { siteIds, coordinates: null };
  const coords = object(row.coordinates, field + '.coordinates');
  const axes = distinctStrings(coords.axes, field + '.axes');
  if (!['camera-roi-px', 'measured-m', 'nominal-m'].includes(String(coords.kind)) || axes.length < 2 || axes.length > 3
    || !Array.isArray(coords.positions) || coords.positions.length !== siteIds.length
    || !coords.positions.every(point => Array.isArray(point) && point.length === axes.length && point.every(Number.isFinite))) {
    throw new Error(`${field} 坐标须给出口径，并与坐标轴和位点逐一对应`);
  }
  return { siteIds, coordinates: { kind: coords.kind, axes, positions: coords.positions, sourceRef: string(coords.sourceRef, field + '.sourceRef') } };
}

function frame(value: unknown, n: number, field: string, hasClock: boolean) {
  if (value === null) return null;
  const row = object(value, field);
  const rawFrameRef = optionalRef(row.rawFrameRef, field + '.rawFrameRef');
  const rawFrameSha256 = row.rawFrameSha256 ?? null;
  if (rawFrameSha256 !== null && (!rawFrameRef || typeof rawFrameSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(rawFrameSha256))) {
    throw new Error(`${field} 原帧 SHA-256 须对应已登记的原帧文件`);
  }
  const decisionRef = optionalRef(row.decisionRef, field + '.decisionRef');
  const occupancy = optionalRef(row.occupancy, field + '.occupancy');
  if (occupancy !== null && (!decisionRef || occupancy.length !== n || /[^01?]/.test(occupancy))) {
    throw new Error(`${field} 占位必须有判决来源，按照布局每个位点登记 0、1 或 ?`);
  }
  if (!rawFrameRef && !decisionRef) throw new Error(`${field} 缺少原帧和判读引用，缺测快照应填 null`);
  const timeS = row.timeS;
  if (timeS !== null && (!hasClock || typeof timeS !== 'number' || !Number.isFinite(timeS))) {
    throw new Error(`${field} 应提供实测秒及其共同参考时钟，缺时标填 null`);
  }
  return { rawFrameRef, rawFrameSha256, decisionRef, occupancy, timeS };
}

function moveList(value: unknown, field: string, before: string[], after: string[]) {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error(`${field} 应为已执行搬运记录数组，缺日志填 null`);
  const moves = value.map((item, index) => {
    const at = `${field}[${index}]`;
    const move = object(item, at);
    const id = string(move.id, at + '.id');
    const atomId = optionalRef(move.atomId, at + '.atomId');
    const fromSiteId = string(move.fromSiteId, at + '.fromSiteId');
    const toSiteId = string(move.toSiteId, at + '.toSiteId');
    if (!before.includes(fromSiteId) || !after.includes(toSiteId)) throw new Error(`${at} 端点不在对应布局中`);
    const outcome = move.outcome;
    const outcomeRef = optionalRef(move.outcomeRef, at + '.outcomeRef');
    if ((outcome !== 'survived' && outcome !== 'lost' && outcome !== 'unknown') || (outcome !== 'unknown' && (!atomId || !outcomeRef))) {
      throw new Error(`${at} 已判存活或丢失须引用同一原子的结局证据`);
    }
    return { id, atomId, fromSiteId, toSiteId, sourceRef: string(move.sourceRef, at + '.sourceRef'), outcome, outcomeRef };
  });
  if (new Set(moves.map(m => m.id)).size !== moves.length) throw new Error(`${field} 搬运 ID 重复`);
  return moves;
}

function counts(bits: string | null | undefined, n: number) {
  return { occupied: bits?.match(/1/g)?.length ?? 0, known: bits?.match(/[01]/g)?.length ?? 0, total: n };
}

function rate(numerator: number, denominator: number, total: number) {
  return { numerator, denominator, total, unknown: total - denominator };
}

type Trial = ReturnType<typeof readTrial>;

function readTrial(value: unknown, index: number, before: string[], after: string[], targetIndices: number[] | null, clock: boolean) {
  const field = `attempts[${index}]`;
  const row = object(value, field);
  const attemptId = string(row.attemptId, field + '.attemptId');
  const initial = frame(row.initial, before.length, field + '.initial', clock);
  const final = frame(row.final, after.length, field + '.final', clock);
  const missingTargets = targetIndices?.filter(i => final?.occupancy?.[i] === '0').map(i => after[i]) ?? [];
  const targetCounts = targetIndices === null ? null : counts(targetIndices.map(i => final?.occupancy?.[i] ?? '?').join(''), targetIndices.length);
  const allOccupied = targetCounts && targetCounts.occupied === targetCounts.total;
  const targetFilled = missingTargets.length ? false : allOccupied ? true : null;
  return {
    attemptId, sourceRef: string(row.sourceRef, field + '.sourceRef'),
    recordedTime: optionalRef(row.recordedTime ?? null, field + '.recordedTime'), initial, final,
    initialCounts: counts(initial?.occupancy, before.length), finalCounts: counts(final?.occupancy, after.length),
    targetFilled, targetCounts, missingTargets, moves: moveList(row.moves, field + '.moves', before, after),
  };
}

function statistics(trials: Trial[]) {
  const sum = (fn: (trial: Trial) => number) => trials.reduce((total, trial) => total + fn(trial), 0);
  const occupancy = (phase: 'initialCounts' | 'finalCounts' | 'targetCounts') =>
    rate(sum(t => t[phase]?.occupied ?? 0), sum(t => t[phase]?.known ?? 0), sum(t => t[phase]?.total ?? 0));
  const moves = trials.flatMap(t => t.moves ?? []);
  const unknownMoveLog = trials.filter(t => t.moves === null).length;
  return {
    attempts: trials.length, pairedRawFrames: sum(t => Number(!!t.initial?.rawFrameRef && !!t.final?.rawFrameRef)),
    pairedMeasuredTimes: sum(t => Number(t.initial?.timeS != null && t.final?.timeS != null)),
    loading: occupancy('initialCounts'), finalOccupancy: occupancy('finalCounts'),
    targetOccupancy: occupancy('targetCounts'),
    assembly: rate(sum(t => Number(t.targetFilled === true)), sum(t => Number(t.targetFilled !== null)), trials.length),
    survival: {
      numerator: moves.filter(m => m.outcome === 'survived').length, denominator: moves.filter(m => m.outcome !== 'unknown').length,
      loggedMoves: moves.length, unknownLoggedOutcomes: moves.filter(m => m.outcome === 'unknown').length,
      total: unknownMoveLog ? null : moves.length, attemptsWithoutMoveLog: unknownMoveLog,
    },
  };
}

export function auditPublicTransport(value: unknown) {
  const row = object(value, 'run');
  if (row.kind !== 'public-transport-run' || row.schemaVersion !== 1) throw new Error('请选择公开跨装置装载与输运 v1 JSON');
  const initialLayout = layout(row.initialLayout, 'initialLayout');
  const finalLayout = layout(row.finalLayout, 'finalLayout');
  const targets = object(row.finalLayout, 'finalLayout').targetSiteIds;
  const targetSiteIds = targets === null ? null : distinctStrings(targets, 'targetSiteIds');
  const indices = targetSiteIds?.map(site => finalLayout.siteIds.indexOf(site)) ?? null;
  if (indices?.some(i => i === -1)) throw new Error('目标位点不在终态布局内');
  const clockRef = optionalRef(row.clockRef, 'clockRef');
  const minimum = row.minimumInitialAtoms ?? null;
  if (minimum !== null && (typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 0 || minimum > initialLayout.siteIds.length)) {
    throw new Error('minimumInitialAtoms 需要落在初态位点数范围内');
  }
  if (!Array.isArray(row.attempts) || !row.attempts.length) throw new Error('需要至少一条有来源的尝试记录');
  const attempts = row.attempts.map((v, i) => readTrial(v, i, initialLayout.siteIds, finalLayout.siteIds, indices, clockRef !== null));
  if (new Set(attempts.map(t => t.attemptId)).size !== attempts.length) throw new Error('attemptId 重复');
  type Occurrence = { attemptId: string; phase: string };
  const references = new Map<string, Occurrence[]>();
  const hashes = new Map<string, Occurrence[]>();
  function index(map: Map<string, Occurrence[]>, key: string, item: Occurrence) {
    const occurrences = map.get(key) ?? [];
    occurrences.push(item);
    map.set(key, occurrences);
  }
  for (const trial of attempts) {
    for (const phase of ['initial', 'final'] as const) {
      const frame = trial[phase];
      const occurrence = { attemptId: trial.attemptId, phase };
      if (frame?.rawFrameRef) index(references, frame.rawFrameRef, occurrence);
      if (frame?.rawFrameSha256) index(hashes, frame.rawFrameSha256, occurrence);
    }
  }
  const ids = (predicate: (t: Trial) => boolean) => attempts.filter(predicate).map(t => t.attemptId);
  const findings = {
    reusedRawFrames: [...references].filter(([, uses]) => uses.length > 1).map(([rawFrameRef, uses]) => ({ rawFrameRef, uses })),
    repeatedRawFrameHashes: [...hashes].filter(([, uses]) => uses.length > 1).map(([sha256, uses]) => ({ sha256, uses })),
    missingInitialRawFrame: ids(t => !t.initial?.rawFrameRef), missingFinalRawFrame: ids(t => !t.final?.rawFrameRef),
    invertedFrameTimes: ids(t => t.initial?.timeS != null && t.final?.timeS != null && t.final.timeS < t.initial.timeS),
    incompleteInitialDecisions: ids(t => t.initialCounts.known < t.initialCounts.total),
    incompleteFinalDecisions: ids(t => t.finalCounts.known < t.finalCounts.total),
    missingTargetAtoms: ids(t => t.targetFilled === false),
  };
  let selection = null;
  if (typeof minimum === 'number') {
    const eligible = attempts.filter(t => t.initialCounts.occupied >= minimum);
    const excluded = ids(({ initialCounts: c }) => c.occupied + c.total - c.known < minimum);
    const undetermined = ids(({ initialCounts: c }) => c.occupied < minimum && c.occupied + c.total - c.known >= minimum);
    selection = { minimumInitialAtoms: minimum, excluded, undetermined, eligibleStatistics: statistics(eligible) };
  }
  return {
    kind: 'public-transport-acquisition-audit', schemaVersion: 1, evidence: 'cross-apparatus', status: 'source-review',
    apparatus: string(row.apparatus, 'apparatus'), species: string(row.species, 'species'), sourceRef: string(row.sourceRef, 'sourceRef'),
    selectionRef: string(row.selectionRef, 'selectionRef'), decisionRef: optionalRef(row.decisionRef, 'decisionRef'), clockRef,
    initialLayout, finalLayout: { ...finalLayout, targetSiteIds }, statistics: statistics(attempts), selection, findings, attempts,
  };
}
