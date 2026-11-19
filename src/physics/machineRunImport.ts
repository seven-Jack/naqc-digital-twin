import { MUNIZ_DEMO_PROFILE, type MachineStage } from '../data/machineProfile';
import { getDemoClockBinding } from '../data/yb171AtomicSnapshot';
import { compileMachineProtocol, postCheckStages, type MachineAttemptRecord, type MachineEvent } from './machineProtocol';
import { validateMachineSchedule, type MachineEventSchedule } from './machineSchedule';
import { CIRCUITS, type MachineAtom, type MachineAttempt, type MachineMove, type MachineRun, type MachineSite } from './quantumComputer';

type JsonObject = Record<string, unknown>;

function requireValue(condition: unknown, path: string, issue: string): asserts condition {
  if (!condition) throw new Error(`${path}：${issue}`);
}

function object(value: unknown, path: string): JsonObject {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), path, '应为对象');
  return value as JsonObject;
}

function list(value: unknown, path: string, maximum: number): unknown[] {
  requireValue(Array.isArray(value) && value.length <= maximum, path, `应为长度不超过 ${maximum} 的数组`);
  return value;
}

function number(value: unknown, path: string, minimum: number, maximum: number, integer = false): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    && (!integer || Number.isInteger(value)), path, `应为 ${minimum}–${maximum} 范围内的${integer ? '整数' : '有限数值'}`);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  requireValue(typeof value === 'boolean', path, '应为布尔值');
  return value;
}

function string(value: unknown, path: string): string {
  requireValue(typeof value === 'string' && value.trim() !== '', path, '应为非空字符串');
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  const selected = options.find(option => option === value);
  requireValue(selected !== undefined, path, `应为 ${options.join('、')} 之一`);
  return selected;
}

// Compare known profile and plan fields without depending on JSON property order.
function matches(value: unknown, reference: unknown): boolean {
  if (Array.isArray(reference)) {
    return Array.isArray(value) && value.length === reference.length
      && reference.every((element, index) => matches(value[index], element));
  }
  if (reference && typeof reference === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const source = value as JsonObject;
    return Object.entries(reference).every(([key, expected]) => matches(source[key], expected));
  }
  return value === reference;
}

const { rows, columns, registerRow } = MUNIZ_DEMO_PROFILE.array;
const siteCount = rows * columns;

function readSites(raw: unknown, qubits: number): MachineSite[] {
  const sites = list(raw, 'sites', siteCount);
  requireValue(sites.length === siteCount, 'sites', '阵列位点不完整');
  const firstRegister = registerRow * columns + Math.floor((columns - qubits) / 2);
  return sites.map((value, index) => {
    const path = `sites[${index}]`;
    const row = Math.floor(index / columns);
    const column = index % columns;
    const id = `${String.fromCharCode(65 + row)}${column + 1}`;
    const qubit = index >= firstRegister && index < firstRegister + qubits ? index - firstRegister : undefined;
    const site = object(value, path);
    requireValue(matches(site, { id, row, column, qubit }), path, '位点或比特与演示阵列不一致');
    return { id, row, column, loaded: boolean(site.loaded, `${path}.loaded`), ...(qubit === undefined ? {} : { qubit }) };
  });
}

function readAtoms(
  raw: unknown, path: string, sites: readonly MachineSite[], phase: 'loaded' | 'arranged',
): MachineAtom[] {
  const ids = new Set<string>();
  const slots = new Set<number>();
  return list(raw, path, siteCount).map((value, index) => {
    const at = `${path}[${index}]`;
    const atom = object(value, at);
    const id = string(atom.id, `${at}.id`);
    const row = number(atom.row, `${at}.row`, 0, rows - 1, true);
    const column = number(atom.column, `${at}.column`, 0, columns - 1, true);
    const slot = row * columns + column;
    requireValue(sites.some(site => site.id === id) && !ids.has(id) && !slots.has(slot), at, '原子身份或位点无效、重复');
    if (phase === 'loaded') requireValue(sites[slot].id === id, at, '装载原子应位于其起始位点');
    const qubit = phase === 'arranged' ? sites[slot].qubit : undefined;
    requireValue(atom.qubit === qubit, at, '原子比特与所在位点不一致');
    ids.add(id);
    slots.add(slot);
    return { id, row, column, ...(qubit === undefined ? {} : { qubit }) };
  });
}

function readMove(raw: unknown, path: string, sites: readonly MachineSite[]): MachineMove {
  const move = object(raw, path);
  const atomId = string(move.atomId, `${path}.atomId`);
  requireValue(sites.some(site => site.id === atomId), `${path}.atomId`, '原子身份不在阵列中');
  const readSite = (rawSite: unknown, locator: string) => {
    const site = object(rawSite, locator);
    const reference = sites.find(candidate => candidate.id === site.id);
    requireValue(reference && matches(site, {
      id: reference.id, row: reference.row, column: reference.column, qubit: reference.qubit,
    }), locator, '搬运路径包含不匹配的位点');
    return { ...reference, loaded: boolean(site.loaded, `${locator}.loaded`) };
  };
  const route = list(move.path, `${path}.path`, siteCount)
    .map((value, index) => readSite(value, `${path}.path[${index}]`));
  const from = readSite(move.from, `${path}.from`);
  const to = readSite(move.to, `${path}.to`);
  requireValue(route.length >= 2 && matches(from, route[0]) && matches(to, route.at(-1))
    && new Set(route.map(site => site.id)).size === route.length
    && route.slice(1).every((site, index) =>
      Math.abs(site.row - route[index].row) + Math.abs(site.column - route[index].column) === 1),
  path, '搬运路径的端点、邻接或位点顺序无效');
  return { atomId, from, to, path: route };
}

function verifyMoves(
  before: readonly MachineAtom[], after: readonly MachineAtom[], moves: readonly MachineMove[],
  path: string, sites: readonly MachineSite[],
) {
  const positions = new Map(before.map(atom => [atom.id, atom.row * columns + atom.column]));
  const occupied = new Set(positions.values());
  for (const move of moves) {
    const start = move.from.row * columns + move.from.column;
    const end = move.to.row * columns + move.to.column;
    requireValue(positions.get(move.atomId) === start
      && move.path.slice(1).every(site => !occupied.has(site.row * columns + site.column)), path, '搬运起点无对应原子或路径受占用');
    occupied.delete(start);
    occupied.add(end);
    positions.set(move.atomId, end);
  }
  requireValue(after.length === before.length && after.every(atom => {
    const slot = atom.row * columns + atom.column;
    return positions.get(atom.id) === slot && sites[slot].qubit === atom.qubit;
  }), path, '搬运前后原子身份或布局不一致');
}

function readEvent(raw: unknown, path: string, stages: Map<string, MachineStage>, earlier: Map<string, MachineEvent>): MachineEvent {
  const value = object(raw, path);
  const id = string(value.id, `${path}.id`);
  requireValue(!earlier.has(id), `${path}.id`, '事件 ID 重复');
  const stage = stages.get(string(value.stageId, `${path}.stageId`));
  requireValue(stage, `${path}.stageId`, '阶段不存在');
  const kind = choice(value.kind, ['operation', 'observe', 'decide'], `${path}.kind`);
  const status = choice(value.status, ['executed', 'skipped'], `${path}.status`);
  const startMs = number(value.startMs, `${path}.startMs`, stage.startMs, stage.endMs);
  const endMs = number(value.endMs, `${path}.endMs`, startMs, stage.endMs);
  const dependsOn = list(value.dependsOn, `${path}.dependsOn`, earlier.size).map(entry => {
    const dependency = string(entry, `${path}.dependsOn`);
    const prior = earlier.get(dependency);
    requireValue(prior && prior.endMs <= startMs, `${path}.dependsOn`, '依赖事件不存在或尚未结束');
    return dependency;
  });
  requireValue(endMs > startMs && new Set(dependsOn).size === dependsOn.length, path, '事件时长无效或依赖重复');
  const reason = status === 'skipped'
    ? choice(value.reason, ['filled', 'vacant', 'no-source', 'atom-lost'], `${path}.reason`)
    : undefined;
  const schedule = value.schedule === undefined ? undefined
    : object(value.schedule, `${path}.schedule`) as unknown as MachineEventSchedule;
  const event: MachineEvent = {
    id, stageId: stage.id, kind, status, startMs, endMs, dependsOn,
    ...(reason ? { reason } : {}), ...(schedule ? { schedule } : {}),
  };
  earlier.set(id, event);
  return event;
}

function readRecord(
  raw: unknown, index: number, attempt: MachineAttempt, sites: readonly MachineSite[], stages: Map<string, MachineStage>,
): MachineAttemptRecord {
  const path = `records[${index}]`;
  const value = object(raw, path);
  const attemptId = `attempt-${index + 1}`;
  requireValue(value.attemptId === attemptId, `${path}.attemptId`, '尝试编号与批次顺序不一致');
  const initialAtoms = readAtoms(value.initialAtoms, `${path}.initialAtoms`, sites, 'arranged');
  const replenishedAtoms = readAtoms(value.replenishedAtoms, `${path}.replenishedAtoms`, sites, 'arranged');
  const move = value.move === null ? null : readMove(value.move, `${path}.move`, sites);
  requireValue(!move || (move.to.qubit !== undefined && move.from.qubit === undefined),
    `${path}.move`, '补位应将储备原子移入计算寄存器');
  verifyMoves(initialAtoms, replenishedAtoms, move ? [move] : [], `${path}.move`, sites);
  requireValue(initialAtoms.length === attempt.loadedCount
    && replenishedAtoms.filter(atom => atom.qubit !== undefined).length === attempt.activeQubits,
  path, '原子数或计算位点与尝试结果不一致');

  const hasInitialGeometry = value.loadedAtoms !== undefined || value.initialMoves !== undefined;
  const loadedAtoms = hasInitialGeometry ? readAtoms(value.loadedAtoms, `${path}.loadedAtoms`, sites, 'loaded') : undefined;
  const initialMoves = hasInitialGeometry ? list(value.initialMoves, `${path}.initialMoves`, siteCount)
    .map((entry, moveIndex) => readMove(entry, `${path}.initialMoves[${moveIndex}]`, sites)) : undefined;
  if (loadedAtoms && initialMoves) verifyMoves(loadedAtoms, initialAtoms, initialMoves, `${path}.initialMoves`, sites);

  const beforeFull = initialAtoms.filter(atom => atom.qubit !== undefined).length === 2;
  const afterFull = attempt.activeQubits === 2;
  requireValue(!beforeFull || move === null, `${path}.move`, '已填满的寄存器不能补位');
  const targets = sites.filter(site => site.qubit !== undefined);
  const eventById = new Map<string, MachineEvent>();
  const events = list(value.events, `${path}.events`, stages.size + 4)
    .map((entry, eventIndex) => readEvent(entry, `${path}.events[${eventIndex}]`, stages, eventById));
  requireValue(events.every((event, index) => index === 0 || event.startMs >= events[index - 1].startMs),
    `${path}.events`, '事件未按开始时刻排序');
  try {
    validateMachineSchedule(events, { durationMs: stages.get('readout')?.endMs, clockId: 'illustrative-attempt-ms' });
  } catch (error) {
    throw new Error(`${path}.events：${error instanceof Error ? error.message : String(error)}`);
  }
  requireValue(events.every(event => event.schedule?.targetIds.every(id => sites.some(site => site.id === id)) ?? true),
    `${path}.events`, '操作目标不在阵列中');
  const expectedCount = beforeFull ? 1 : 2;
  const rawObservations = list(value.observations, `${path}.observations`, expectedCount);
  const rawDecisions = list(value.decisions, `${path}.decisions`, expectedCount);
  requireValue(rawObservations.length === expectedCount && rawDecisions.length === expectedCount,
    path, '占位观测或判决数量与补位分支不一致');
  const observations = rawObservations.map((entry, observationIndex) => {
    const locator = `${path}.observations[${observationIndex}]`;
    const observation = object(entry, locator);
    const phase = observationIndex === 0 ? 'initial' as const : 'recheck' as const;
    const id = string(observation.id, `${locator}.id`);
    const event = eventById.get(id);
    requireValue(observation.phase === phase && event?.kind === 'observe' && event.status === 'executed'
      && event.stageId === (phase === 'initial' ? 'occupancy-check' : 'occupancy-recheck')
      && observation.startedMs === event.startMs && observation.availableMs === (event.schedule?.availableMs ?? event.endMs),
    locator, '占位观测与曝光事件不匹配');
    const atoms = phase === 'initial' ? initialAtoms : replenishedAtoms;
    const observedSites = targets.map(({ id: siteId, row, column }) => ({
      id: siteId, row, column, occupied: atoms.some(atom => atom.row === row && atom.column === column),
    }));
    requireValue(matches(observation.sites, observedSites), `${locator}.sites`, '占位与记录的阵列布局不一致');
    return { id, phase, startedMs: event.startMs, availableMs: event.schedule?.availableMs ?? event.endMs, sites: observedSites };
  });
  const decisions = rawDecisions.map((entry, decisionIndex) => {
    const locator = `${path}.decisions[${decisionIndex}]`;
    const decision = object(entry, locator);
    const id = string(decision.id, `${locator}.id`);
    const event = eventById.get(id);
    const observation = observations[decisionIndex];
    const observationEvent = eventById.get(observation.id)!;
    const result = choice(decision.result, ['replenish', 'continue', 'skip'], `${locator}.result`);
    const expected = decisionIndex === 0 ? (beforeFull ? 'continue' : 'replenish') : (afterFull ? 'continue' : 'skip');
    requireValue(event?.kind === 'decide' && event.status === 'executed' && event.stageId === observationEvent.stageId
      && event.dependsOn.includes(observation.id) && decision.observationId === observation.id
      && decision.availableMs === (event.schedule?.availableMs ?? event.endMs) && result === expected,
    locator, '观测、判决时刻或补位分支不一致');
    return { id, observationId: observation.id, availableMs: event.schedule?.availableMs ?? event.endMs, result };
  });

  const eventsByStage = new Map<string, MachineEvent[]>();
  for (const event of events) {
    const group = eventsByStage.get(event.stageId) ?? [];
    group.push(event);
    eventsByStage.set(event.stageId, group);
  }
  for (const stage of stages.values()) {
    const group = eventsByStage.get(stage.id) ?? [];
    const locator = `${path}.events.${stage.id}`;
    const observation = stage.id === 'occupancy-check' ? observations[0]
      : stage.id === 'occupancy-recheck' ? observations[1] : undefined;
    if (observation) {
      const decision = decisions.find(candidate => candidate.observationId === observation.id)!;
      requireValue(group.length === 2 && group[0].id === observation.id && group[1].id === decision.id
        && group[0].startMs === stage.startMs && group[1].endMs === stage.endMs,
      locator, '曝光和判决事件未覆盖计划阶段');
      if (observation.phase === 'recheck') {
        requireValue(group[0].dependsOn.includes(eventsByStage.get('replenishment')?.[0]?.id ?? ''),
          locator, '复查应依赖补位阶段');
      }
      continue;
    }
    const [event, scienceEvent] = group;
    const handoffSuccessor = stage.id === 'transfer' ? 'gates' : stage.id === 'return' ? 'readout' : null;
    const parallelHandoff = handoffSuccessor !== null && group.length === 2;
    requireValue((group.length === 1 || parallelHandoff) && group.every(operation => operation.kind === 'operation'
      && operation.startMs === stage.startMs && operation.endMs === stage.endMs),
    locator, '操作事件与计划阶段不匹配');
    if (parallelHandoff) {
      const successors = eventsByStage.get(handoffSuccessor);
      const targetIds = targets.map(target => target.id);
      const planned = { startMs: stage.startMs, endMs: stage.endMs };
      requireValue(event.id === `${attemptId}:${stage.id}`
        && scienceEvent.id === `${attemptId}:${stage.id}:science-460`
        && matches(event.schedule?.resourceIds, ['reservoir-483'])
        && matches(scienceEvent.schedule?.resourceIds, ['science-460'])
        && matches(event.schedule?.targetIds, targetIds)
        && matches(scienceEvent.schedule?.targetIds, targetIds)
        && matches(event.schedule?.planned, planned)
        && matches(scienceEvent.schedule?.planned, planned)
        && matches(scienceEvent.dependsOn, event.dependsOn),
      locator, '并行换阱的光路、计划或依赖不一致');
      requireValue(successors?.length && successors.every(successor =>
        successor.dependsOn.includes(event.id) && successor.dependsOn.includes(scienceEvent.id)),
      locator, '后续操作应等待双光路换阱完成');
    }
    if (stage.id === 'replenishment') {
      requireValue(event.dependsOn.includes(decisions[0].id), locator, '补位应依赖初检判决');
    }
    if (stage.id === 'preparation' && event.status === 'executed') {
      requireValue(decisions.at(-1)!.availableMs <= event.startMs, locator, '制备早于最终占位判决');
    }
    let skipReason: MachineEvent['reason'];
    if (stage.id === 'replenishment' && !move) skipReason = beforeFull ? 'filled' : 'no-source';
    if (stage.id === 'occupancy-recheck' && beforeFull) skipReason = 'filled';
    if (postCheckStages.includes(stage.id) && !afterFull) skipReason = 'vacant';
    if (stage.id === 'readout' && attempt.status === 'atom-lost') skipReason = 'atom-lost';
    requireValue(group.every(operation => operation.status === (skipReason ? 'skipped' : 'executed')
      && operation.reason === skipReason),
      locator, '执行或跳过状态与记录的分支不一致');
  }
  return {
    attemptId, initialAtoms, replenishedAtoms, move, events, observations, decisions,
    ...(loadedAtoms && initialMoves ? { loadedAtoms, initialMoves } : {}),
  };
}

export function importMachineRun(text: string): MachineRun {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的运行 JSON');
  }
  const saved = object(json, '运行记录');
  requireValue(saved.kind === 'neutral-atom-quantum-computer-simulation', 'kind', '未识别整机运行记录');
  requireValue(saved.modelVersion === 2 || saved.modelVersion === 3, 'modelVersion', '支持版本 2 和 3');
  const isV3 = saved.modelVersion === 3;
  const profile = MUNIZ_DEMO_PROFILE;
  const protocol = isV3 ? 'bell-replenishment' : 'standard';
  const plan = compileMachineProtocol(profile, protocol);
  const hasAtomicReference = isV3 && saved.atomicReference !== undefined;
  const atomicReference = hasAtomicReference ? getDemoClockBinding(profile.id) : null;
  if (isV3) {
    requireValue(saved.schemaVersion === 3 && saved.timebase === 'illustrative-attempt-ms',
      'schemaVersion / timebase', '未识别版本 3 的数据结构或时间基准');
    requireValue(matches(saved.profile, profile), 'profile', '此记录的装置配置与本机 483/460 nm 演示不匹配');
    requireValue(matches(saved.plan, plan), 'plan', '此记录的协议或阶段时间与本机演示不匹配');
    if (hasAtomicReference) requireValue(atomicReference && matches(saved.atomicReference, atomicReference),
      'atomicReference', '此记录使用的原子快照或 578 nm 参数引用与本机版本不匹配');
  }
  const configData = object(saved.config, 'config');
  const circuit = CIRCUITS.find(candidate => candidate.id === configData.circuit);
  requireValue(circuit && (!isV3 || circuit.id === 'bell') && matches(saved.circuit, circuit),
    'circuit', '不支持此电路或其门顺序');
  const config = {
    circuit: circuit.id,
    basis: choice(configData.basis, ['Z', 'X'], 'config.basis'),
    shots: number(configData.shots, 'config.shots', 1, 4096, true),
    loadProbability: number(configData.loadProbability, 'config.loadProbability', 0, 1),
    readoutError: number(configData.readoutError, 'config.readoutError', 0, 0.5),
    atomLossProbability: number(configData.atomLossProbability, 'config.atomLossProbability', 0, 1),
    seed: number(configData.seed, 'config.seed', 0, 0xffffffff, true),
  };
  if (isV3) requireValue(matches(saved.provenance, { kind: 'synthetic', protocol, seed: config.seed, randomAlgorithm: 'mulberry32' }),
    'provenance', '模拟来源、协议或种子不一致');
  const analysisGates = config.basis === 'X'
    ? Array.from({ length: circuit.qubits }, (_, qubit) => ({ name: 'H' as const, qubits: [qubit] })) : [];
  requireValue(matches(saved.analysisGates, analysisGates), 'analysisGates', '测量基旋转与所选测量基不一致');
  requireValue(saved.attemptedShots === config.shots, 'attemptedShots', '尝试总数与配置不一致');
  requireValue(saved.durationMs === plan.timeline.durationMs, 'durationMs', '运行时长与计划不一致');
  const sites = readSites(saved.sites, circuit.qubits);
  const loadedAtoms = readAtoms(saved.loadedAtoms, 'loadedAtoms', sites, 'loaded');
  const rearrangedAtoms = readAtoms(saved.rearrangedAtoms, 'rearrangedAtoms', sites, 'arranged');
  const moves = list(saved.moves, 'moves', circuit.qubits).map((entry, index) => readMove(entry, `moves[${index}]`, sites));
  const loadedCount = sites.filter(site => site.loaded).length;
  requireValue(saved.loadedCount === loadedCount && loadedAtoms.length === loadedCount
    && loadedAtoms.every(atom => sites[atom.row * columns + atom.column].loaded), 'loadedAtoms', '首轮装载与阵列标记不一致');
  const activeQubits = rearrangedAtoms.filter(atom => atom.qubit !== undefined).length;
  requireValue(saved.activeQubits === activeQubits, 'activeQubits', '首轮比特数与布局不一致');

  const outcomeKeys = Array.from({ length: 2 ** circuit.qubits }, (_, index) => index.toString(2).padStart(circuit.qubits, '0'));
  const attempts = list(saved.attempts, 'attempts', config.shots).map((entry, index): MachineAttempt => {
    const path = `attempts[${index}]`;
    const attempt = object(entry, path);
    const status = choice(attempt.status, ['assembly-failed', 'atom-lost', 'measured'], `${path}.status`);
    const count = number(attempt.loadedCount, `${path}.loadedCount`, 0, siteCount, true);
    const active = number(attempt.activeQubits, `${path}.activeQubits`, 0, Math.min(count, circuit.qubits), true);
    const lostQubits = list(attempt.lostQubits, `${path}.lostQubits`, active)
      .map(qubit => number(qubit, `${path}.lostQubits`, 0, circuit.qubits - 1, true));
    const bitstring = status === 'measured' ? choice(attempt.bitstring, outcomeKeys, `${path}.bitstring`) : null;
    requireValue(attempt.bitstring === bitstring && new Set(lostQubits).size === lostQubits.length
      && (active < circuit.qubits) === (status === 'assembly-failed') && (lostQubits.length > 0) === (status === 'atom-lost'),
    path, '尝试状态、位串、丢失比特或寄存器装配不一致');
    return { loadedCount: count, activeQubits: active, status, lostQubits, bitstring };
  });
  requireValue(attempts.length === config.shots && attempts[0].loadedCount === loadedCount
    && attempts[0].activeQubits === activeQubits, 'attempts', '逐轮记录数或首轮布局不一致');
  const samples = attempts.flatMap(attempt => attempt.bitstring === null ? [] : [attempt.bitstring]);
  const rejectedShots = attempts.filter(attempt => attempt.status === 'assembly-failed').length;
  const lostShots = attempts.filter(attempt => attempt.status === 'atom-lost').length;
  requireValue(matches(saved, { samples, completedShots: samples.length, rejectedShots, lostShots }),
    'samples / completedShots / rejectedShots / lostShots', '批次统计与逐轮记录不一致');
  const outcomeCounts = new Map(outcomeKeys.map(key => [key, 0]));
  for (const sample of samples) outcomeCounts.set(sample, outcomeCounts.get(sample)! + 1);
  const outcomes = list(saved.outcomes, 'outcomes', outcomeKeys.length).map((entry, index) => {
    const path = `outcomes[${index}]`;
    const outcome = object(entry, path);
    const bitstring = outcomeKeys[index];
    const count = outcomeCounts.get(bitstring)!;
    requireValue(outcome.bitstring === bitstring && outcome.count === count, path, '位序或计数与逐轮记录不一致');
    return {
      bitstring, count,
      idealProbability: number(outcome.idealProbability, `${path}.idealProbability`, 0, 1),
      readoutProbability: number(outcome.readoutProbability, `${path}.readoutProbability`, 0, 1),
    };
  });
  requireValue(outcomes.length === outcomeKeys.length
    && Math.abs(outcomes.reduce((sum, outcome) => sum + outcome.idealProbability, 0) - 1) < 1e-10
    && Math.abs(outcomes.reduce((sum, outcome) => sum + outcome.readoutProbability, 0) - 1) < 1e-10,
  'outcomes', '概率分布不完整或未归一');

  const stages = new Map(plan.timeline.stages.map(stage => [stage.id, stage]));
  const records = isV3 ? list(saved.records, 'records', config.shots)
    .map((entry, index) => readRecord(entry, index, attempts[index], sites, stages)) : [];
  if (isV3) {
    requireValue(records.length === config.shots && matches(records[0].replenishedAtoms, rearrangedAtoms),
      'records', '逐轮事件数量或首轮补位布局不一致');
    const firstRecord = records[0];
    if (firstRecord.loadedAtoms && firstRecord.initialMoves) {
      requireValue(matches(firstRecord.loadedAtoms, loadedAtoms) && matches(firstRecord.initialMoves, moves),
        'records[0]', '首轮装载或重排路径与运行记录不一致');
    }
  }
  verifyMoves(loadedAtoms, records[0]?.initialAtoms ?? rearrangedAtoms, moves, 'moves', sites);
  return {
    profile, plan, records, config, circuit, analysisGates, sites, moves, ...(atomicReference ? { atomicReference } : {}),
    outcomes, loadedCount, activeQubits, attemptedShots: config.shots, attempts,
    completedShots: samples.length, rejectedShots, lostShots, samples, loadedAtoms, rearrangedAtoms,
    expectedAssemblyProbability: number(saved.expectedAssemblyProbability, 'expectedAssemblyProbability', 0, 1),
    durationMs: plan.timeline.durationMs,
  };
}
