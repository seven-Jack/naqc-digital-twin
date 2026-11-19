import {
  parseSenooTransportRun, type SenooTransportAttempt, type SenooTransportMove,
  type SenooTransportPosition, type SenooTransportRun, type SenooTransportSnapshot,
} from './senooTransportRun';

type Assembly = 'pending' | 'complete' | 'incomplete' | 'unknown';

function classifyAssembly(run: SenooTransportRun, snapshot: SenooTransportSnapshot | null): Exclude<Assembly, 'pending'> {
  if (!snapshot) return 'unknown';
  const targets = new Set(run.sites.filter(site => site.target).map(site => site.id));
  const states = snapshot.sites.filter(site => targets.has(site.siteId));
  if (states.some(site => site.state === 'empty')) return 'incomplete';
  return targets.size && states.length === targets.size && states.every(site => site.state === 'occupied') ? 'complete' : 'unknown';
}

function rate(numerator: number, denominator: number, total: number) {
  return { numerator, denominator, unknown: total - denominator, total };
}

export function summarizeSenooTransportRun(run: SenooTransportRun) {
  let loaded = 0;
  let loadKnown = 0;
  let assembled = 0;
  let assemblyKnown = 0;
  let survived = 0;
  let survivalKnown = 0;
  let moves = 0;
  let skippedAttempts = 0;
  for (const attempt of run.attempts) {
    for (const site of attempt.initial?.sites ?? []) {
      loaded += Number(site.state === 'occupied');
      loadKnown += Number(site.state !== 'unknown');
    }
    const assembly = classifyAssembly(run, attempt.final);
    assembled += Number(assembly === 'complete');
    assemblyKnown += Number(assembly !== 'unknown');
    moves += attempt.moves.length;
    skippedAttempts += Number(attempt.transport.status === 'skipped');
    for (const move of attempt.moves) {
      survived += Number(move.outcome === 'survived');
      survivalKnown += Number(move.outcome !== 'unknown');
    }
  }
  return {
    loading: rate(loaded, loadKnown, run.sites.length * run.attempts.length),
    assembly: rate(assembled, assemblyKnown, run.sites.some(site => site.target) ? run.attempts.length : 0),
    survival: rate(survived, survivalKnown, moves), skippedAttempts,
  };
}

export function senooTransportCheckpoints(attempt: SenooTransportAttempt) {
  const { startS, endS, initial, final, transport, load, moves } = attempt;
  const timeline = [
    startS, endS, load?.startS, load?.endS, initial?.availableAtS, final?.availableAtS, transport.startS, transport.endS,
    ...moves.flatMap(move => [move.startS, move.endS, move.outcomeAtS, ...(move.path?.samples.map(sample => sample.timeS) ?? [])]),
  ];
  return [...new Set(timeline.filter((time): time is number => time !== null && time !== undefined))].sort((a, b) => a - b);
}

function captureMove(move: SenooTransportMove, timeS: number) {
  const active = timeS < move.endS;
  const pathKind = move.path?.kind ?? null;
  const samples = move.path?.samples ?? [];
  const available = pathKind === 'commanded' ? samples : samples.filter(sample => sample.timeS <= timeS);
  const pathM = available.map(sample => sample.positionM);
  let positionM: SenooTransportPosition | null = null;
  const last = available.at(-1);
  if (active && pathKind === 'tracked' && last) {
    const next = samples[available.length];
    if (last.timeS === timeS) positionM = last.positionM;
    else if (next) {
      const part = (timeS - last.timeS) / (next.timeS - last.timeS);
      const [x, y, z] = last.positionM;
      positionM = [
        x * (1 - part) + next.positionM[0] * part,
        y * (1 - part) + next.positionM[1] * part,
        z * (1 - part) + next.positionM[2] * part,
      ];
      pathM.push(positionM);
    }
  }
  return {
    id: move.id, atomId: move.atomId, positionM, pathM, pathKind, active,
    outcome: timeS >= (move.outcomeAtS ?? move.endS) ? move.outcome : null,
    fromSiteId: move.fromSiteId, toSiteId: move.toSiteId, sourceRef: move.sourceRef,
    pathSourceRef: move.path?.sourceRef ?? null, outcomeSourceRef: timeS >= (move.outcomeAtS ?? move.endS) ? move.outcomeSourceRef : null,
  };
}

export function projectSenooTransportFrame(run: SenooTransportRun, attempt: SenooTransportAttempt, positionS: number) {
  const timeS = Number.isFinite(positionS) ? Math.max(attempt.startS, Math.min(attempt.endS, positionS)) : attempt.startS;
  const { initial, final, transport, load } = attempt;
  const initialAvailable = initial !== null && timeS >= initial.availableAtS;
  const finalAvailable = final !== null && timeS >= final.availableAtS;
  const snapshot = finalAvailable ? final : initialAvailable ? initial : null;
  const startedMoves = attempt.moves.filter(move => timeS >= move.startS);
  const touched = new Set(startedMoves.flatMap(move => [move.fromSiteId, move.toSiteId]));
  const observed = new Map(snapshot?.sites.map(site => [site.siteId, site]));
  const sites = run.sites.map(({ id: siteId }) => {
    const state = !finalAvailable && touched.has(siteId) ? undefined : observed.get(siteId);
    return { siteId, state: state?.state ?? 'unknown' as const, atomId: state?.atomId ?? null };
  });
  const transportStatus = transport.startS !== null && transport.endS !== null
    ? timeS < transport.startS ? 'pending' : timeS < transport.endS ? 'active' : transport.status
    : timeS >= attempt.endS || finalAvailable ? transport.status : 'pending';
  const phase = finalAvailable ? 'final' : transportStatus === 'active' ? 'transport'
    : transportStatus !== 'pending' ? 'await-final' : initialAvailable ? 'initial'
      : load && timeS >= load.startS && timeS < load.endS ? 'loading' : 'waiting';
  const assembly: Assembly = finalAvailable ? classifyAssembly(run, final) : timeS >= attempt.endS ? 'unknown' : 'pending';
  return {
    timeS, phase, sites, moves: startedMoves.map(move => captureMove(move, timeS)), assembly, transportStatus,
    occupancySourceRef: snapshot?.sourceRef ?? null,
    transportReason: transportStatus === 'failed' || transportStatus === 'skipped' ? transport.reason : null,
  } as const;
}

export type SenooTransportFrame = ReturnType<typeof projectSenooTransportFrame>;

export interface TransportReplayOrigin {
  readonly filename: string;
  readonly sha256: string | null;
}

export function createSenooTransportReplayRecord(
  run: SenooTransportRun, attemptId: string, timeS: number, input: TransportReplayOrigin,
) {
  return {
    kind: 'senoo-transport-replay', schemaVersion: 1, input, run, attemptId, timeS, statistics: summarizeSenooTransportRun(run),
  } as const;
}

export function parseSenooTransportImport(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('装载与输运文件中的 JSON 无效。');
  }
  if (!raw || typeof raw !== 'object' || !('kind' in raw) || raw.kind !== 'senoo-transport-replay') {
    const run = parseSenooTransportRun(text);
    return { run, cursor: null, origin: null };
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new Error('装载与输运回放版本无效。');
  const run = parseSenooTransportRun(JSON.stringify(record.run));
  const attempt = run.attempts.find(item => item.attemptId === record.attemptId);
  if (!attempt || typeof record.timeS !== 'number' || !Number.isFinite(record.timeS)
    || record.timeS < attempt.startS || record.timeS > attempt.endS) {
    throw new Error('装载与输运回放的轮号或游标无效。');
  }
  const origin = record.input as TransportReplayOrigin | null;
  if (!origin || typeof origin.filename !== 'string' || !origin.filename.trim()
    || (origin.sha256 !== null && (typeof origin.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(origin.sha256)))) {
    throw new Error('装载与输运回放的输入引用或 SHA-256 无效。');
  }
  return { run, cursor: { attemptId: attempt.attemptId, timeS: record.timeS }, origin };
}
