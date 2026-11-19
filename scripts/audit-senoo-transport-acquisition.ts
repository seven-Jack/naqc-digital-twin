import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseSenooTransportImport, summarizeSenooTransportRun } from '../src/physics/senooTransportReplay';
import type { SenooTransportAttempt, SenooTransportSnapshot } from '../src/physics/senooTransportRun';
import { auditPublicTransport } from './audit-public-transport';

function readInput(filename: string) {
  const path = resolve(filename);
  try {
    const bytes = readFileSync(path);
    const result = parseSenooTransportImport(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { path, sha256, ...result };
  } catch (error) {
    throw new Error(`${path}：${error instanceof Error ? error.message : String(error)}`);
  }
}

type Input = ReturnType<typeof readInput>;

function snapshotEvidence(frame: SenooTransportSnapshot | null) {
  if (!frame) return null;
  return {
    sourceRef: frame.sourceRef, availableAtS: frame.availableAtS,
    unknownSites: frame.sites.filter(site => site.state === 'unknown').map(site => site.siteId),
  };
}

function describeAttempt(attempt: SenooTransportAttempt) {
  const reviews: string[] = [];
  if (!attempt.load) reviews.push('缺装载时段。');
  for (const phase of ['initial', 'final'] as const) {
    const frame = attempt[phase];
    if (!frame) reviews.push(`${phase} 缺占位快照。`);
    else if (frame.sites.some(site => site.state === 'unknown')) reviews.push(`${phase} 有未判占位，见 unknownSites。`);
  }
  for (const move of attempt.moves) {
    if (!move.path) reviews.push(`${move.id} 缺路径。`);
    if (move.path?.kind === 'commanded') reviews.push(`${move.id} 仅有指令路径。`);
    if (!move.atomId) reviews.push(`${move.id} 缺原子身份关联。`);
    if (move.outcome === 'unknown') reviews.push(`${move.id} 存活结局未判。`);
  }
  return {
    attemptId: attempt.attemptId, sourceRef: attempt.sourceRef, loadRef: attempt.load?.sourceRef ?? null,
    transport: attempt.transport, initial: snapshotEvidence(attempt.initial), final: snapshotEvidence(attempt.final), reviews,
    moves: attempt.moves.map(move => ({
      moveId: move.id, sourceRef: move.sourceRef, atomId: move.atomId,
      pathKind: move.path?.kind ?? null, pathRef: move.path?.sourceRef ?? null,
      outcome: move.outcome, outcomeRef: move.outcomeSourceRef,
    })),
  };
}

function describeRun({ run, path, sha256, origin }: Input) {
  return {
    path, sha256, declaredReplayOrigin: origin, sourceKind: run.sourceKind,
    acquisitionRunId: run.acquisitionRunId, sourceRef: run.sourceRef,
    apparatusVersion: run.apparatusVersion, workingPoint: run.workingPoint, trapWavelengthM: run.trapWavelengthM,
    clockId: run.clockId, timeOriginRef: run.timeOriginRef, coordinateFrameRef: run.coordinateFrameRef,
    expectedAttempts: run.expectedAttempts, recordedAttempts: run.attempts.length,
    statistics: summarizeSenooTransportRun(run), attempts: run.attempts.map(describeAttempt),
  };
}

// A file-level reference can cover many trials. Return its trial IDs on both sides for inspection.
function evidenceIndex(input: Input) {
  const index = new Map<string, Set<string>>();
  for (const trial of input.run.attempts) {
    const refs = [
      trial.sourceRef, trial.load?.sourceRef, trial.initial?.sourceRef, trial.final?.sourceRef,
      trial.transport.sourceRef, ...trial.moves.flatMap(move => [move.sourceRef, move.path?.sourceRef, move.outcomeSourceRef]),
    ];
    for (const ref of refs) {
      if (!ref) continue;
      const ids = index.get(ref) ?? new Set<string>();
      ids.add(trial.attemptId);
      index.set(ref, ids);
    }
  }
  return index;
}

function compareRuns(first: Input, second: Input) {
  const conflicts: string[] = [];
  const reviews: string[] = [];
  if (first.sha256 === second.sha256) conflicts.push('同一份输入文件。');
  if (first.run.acquisitionRunId === second.run.acquisitionRunId) conflicts.push('采集运行 ID 相同。');
  if (first.run.sourceKind !== second.run.sourceKind) conflicts.push('两批来源类型不同。');
  if (first.run.apparatusVersion !== second.run.apparatusVersion) conflicts.push('两批装置版本不同。');
  if (first.run.workingPoint !== second.run.workingPoint || first.run.trapWavelengthM !== second.run.trapWavelengthM) {
    reviews.push('核查工况或光镊波长差异对可比性的影响。');
  }
  if (first.run.sourceRef === second.run.sourceRef) reviews.push('运行级引用相同，核查原始文件分配。');
  if (first.origin || second.origin) {
    const sourceHash = (input: Input) => input.origin ? input.origin.sha256 : input.sha256;
    const firstSourceHash = sourceHash(first);
    if (firstSourceHash && firstSourceHash === sourceHash(second)) reviews.push('回放登记的原输入哈希指向同一文件，核查原件。');
  }
  const secondIndex = evidenceIndex(second);
  const sharedTrialEvidence = [];
  for (const [sourceRef, ids] of evidenceIndex(first)) {
    const secondIds = secondIndex.get(sourceRef);
    if (secondIds) sharedTrialEvidence.push({ sourceRef, firstAttempts: [...ids], secondAttempts: [...secondIds] });
  }
  if (sharedTrialEvidence.length) reviews.push('逐轮引用存在重合，核查文件内帧号、记录段和样本分配。');
  return { conflicts, reviews, sharedTrialEvidence };
}

const usage = '用法 node audit-senoo-transport-acquisition.mjs 运行.json [独立运行.json]\n或 node audit-senoo-transport-acquisition.mjs --public-transport 公开跨装置记录.json';
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true, options: { help: { type: 'boolean' }, 'public-transport': { type: 'boolean' } },
  });
  if (values.help) {
    console.log(usage);
  } else if (positionals.length < 1 || positionals.length > (values['public-transport'] ? 1 : 2)) {
    console.error(usage);
    process.exitCode = 2;
  } else if (values['public-transport']) {
    const path = resolve(positionals[0]);
    const bytes = readFileSync(path);
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const report = auditPublicTransport(raw);
    console.log(JSON.stringify({ ...report, input: { path, sha256: createHash('sha256').update(bytes).digest('hex') } }, null, 2));
  } else {
    const runs = positionals.map(readInput);
    const comparison = runs.length === 2 ? compareRuns(runs[0], runs[1]) : null;
    const status = comparison?.conflicts.length ? 'conflict' : 'source-review';
    console.log(JSON.stringify({
      kind: 'senoo-transport-acquisition-audit', schemaVersion: 1, status, runs: runs.map(describeRun), comparison,
    }, null, 2));
    if (status === 'conflict') process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
