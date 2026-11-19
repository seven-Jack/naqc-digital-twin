import { MUNIZ_DEMO_PROFILE, type MachineProfile, type MachineStage } from '../data/machineProfile';
import { getDemoClockBinding } from '../data/yb171AtomicSnapshot';
import {
  compileMachineProtocol, postCheckStages, type MachineProtocol, type MachinePlan,
  type MachineAttemptRecord, type MachineEvent, type OccupancyObservation, type OccupancyDecision, type OccupancyPlayback,
} from './machineProtocol';
import { validateMachineSchedule } from './machineSchedule';

export type { MachineStage, MachineStageId } from '../data/machineProfile';
export type { MachineProtocol } from './machineProtocol';
export const { rows: MACHINE_ROWS, columns: MACHINE_COLUMNS } = MUNIZ_DEMO_PROFILE.array;
export const { stages: MACHINE_STAGES, durationMs: MACHINE_DURATION_MS } = MUNIZ_DEMO_PROFILE.timeline;

export type CircuitId = 'bell' | 'ghz' | 'superposition';
export type MeasurementBasis = 'Z' | 'X';

export interface MachineGate {
  name: 'H' | 'CZ';
  qubits: readonly number[];
}

export interface MachineCircuit {
  id: CircuitId;
  label: string;
  qubits: number;
  gates: readonly MachineGate[];
}

const hadamard = (qubit: number): MachineGate => ({ name: 'H', qubits: [qubit] });
const controlledNot = (control: number, target: number): MachineGate[] => [
  hadamard(target), { name: 'CZ', qubits: [control, target] }, hadamard(target),
];

export const CIRCUITS: readonly MachineCircuit[] = [
  { id: 'bell', label: 'Bell 态', qubits: 2, gates: [hadamard(0), ...controlledNot(0, 1)] },
  { id: 'ghz', label: 'GHZ 态', qubits: 3, gates: [hadamard(0), ...controlledNot(0, 1), ...controlledNot(1, 2)] },
  { id: 'superposition', label: '乘积叠加态', qubits: 2, gates: [hadamard(0), hadamard(1)] },
];

export interface MachineConfig {
  circuit: CircuitId;
  basis: MeasurementBasis;
  shots: number;
  loadProbability: number;
  readoutError: number;
  atomLossProbability: number;
  seed: number;
}

export const DEFAULT_MACHINE_CONFIG: MachineConfig = {
  circuit: 'bell', basis: 'Z', shots: 256, loadProbability: 0.62, readoutError: 0.025, atomLossProbability: 0, seed: 171,
};

export interface MachineSite {
  id: string;
  row: number;
  column: number;
  loaded: boolean;
  qubit?: number;
}

export interface MachineAtom {
  id: string;
  row: number;
  column: number;
  qubit?: number;
  bright?: boolean;
  moving?: boolean;
}

export interface MachineMove {
  atomId: string;
  from: MachineSite;
  to: MachineSite;
  path: readonly MachineSite[];
}

export interface MachineOutcome {
  bitstring: string;
  idealProbability: number;
  readoutProbability: number;
  count: number;
}

export interface MachineAttempt {
  loadedCount: number;
  activeQubits: number;
  status: 'assembly-failed' | 'atom-lost' | 'measured';
  lostQubits: readonly number[];
  bitstring: string | null;
}

export interface MachineRun {
  profile: MachineProfile;
  plan: MachinePlan;
  records: readonly MachineAttemptRecord[];
  atomicReference?: NonNullable<ReturnType<typeof getDemoClockBinding>>;
  config: MachineConfig;
  circuit: MachineCircuit;
  analysisGates: readonly MachineGate[];
  sites: readonly MachineSite[];
  moves: readonly MachineMove[];
  outcomes: readonly MachineOutcome[];
  loadedCount: number;
  activeQubits: number;
  attemptedShots: number;
  completedShots: number;
  rejectedShots: number;
  lostShots: number;
  attempts: readonly MachineAttempt[];
  samples: readonly string[];
  expectedAssemblyProbability: number;
  durationMs: number;
  loadedAtoms: readonly MachineAtom[];
  rearrangedAtoms: readonly MachineAtom[];
}

export interface MachineFrame {
  attemptIndex: number;
  geometryRecorded: boolean;
  parallelTrapHandoff: boolean;
  stage: MachineStage;
  stageIndex: number;
  stageStartMs: number;
  stageEndMs: number;
  elapsedMs: number;
  progress: number;
  stageProgress: number;
  complete: boolean;
  gateIndex: number | null;
  gateProgress: number | undefined;
  stageSkipped: boolean;
  stageSkipReason: MachineEvent['reason'] | null;
  occupancy: OccupancyPlayback | null;
  atoms: MachineAtom[];
  activeQubits: readonly number[];
  representativeReady: boolean;
  representativeBitstring: string | null;
  representativeLostQubits: readonly number[];
  visibleAttempts: number;
  visibleShots: number;
  visibleRejectedShots: number;
  visibleLostShots: number;
  outcomeCounts: number[];
  latestBitstring: string | null;
}

const finiteWithin = (value: number | undefined, min: number, max: number, fallback: number) =>
  value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function normalizeConfig(input: Partial<MachineConfig>): MachineConfig {
  const defaults = DEFAULT_MACHINE_CONFIG;
  return {
    circuit: CIRCUITS.find(circuit => circuit.id === input.circuit)?.id ?? defaults.circuit,
    basis: input.basis === 'X' ? 'X' : defaults.basis,
    shots: Math.round(finiteWithin(input.shots, 1, 4096, defaults.shots)),
    loadProbability: finiteWithin(input.loadProbability, 0, 1, defaults.loadProbability),
    readoutError: finiteWithin(input.readoutError, 0, 0.5, defaults.readoutError),
    atomLossProbability: finiteWithin(input.atomLossProbability, 0, 1, defaults.atomLossProbability),
    seed: Math.round(finiteWithin(input.seed, 0, 0xffffffff, defaults.seed)),
  };
}

// Mulberry32 keeps the lottery and readout repeatable across browser sessions.
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function neighbors(index: number, rows: number, columns: number) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const result = [];
  if (column > 0) result.push(index - 1);
  if (column < columns - 1) result.push(index + 1);
  if (row > 0) result.push(index - columns);
  if (row < rows - 1) result.push(index + columns);
  return result;
}

function routeToTarget(target: number, occupied: readonly boolean[], reserved: ReadonlySet<number>, adjacency: readonly number[][]) {
  // Search outward through free sites. The first unreserved atom supplies the target.
  const queue = [target];
  const towardsTarget = new Map([[target, target]]);
  for (let step = 0; step < queue.length; step++) {
    const index = queue[step];
    if (occupied[index]) {
      const path = [index];
      while (path.at(-1) !== target) path.push(towardsTarget.get(path.at(-1)!)!);
      return path;
    }
    for (const next of adjacency[index]) {
      if (reserved.has(next) || towardsTarget.has(next)) continue;
      towardsTarget.set(next, index);
      queue.push(next);
    }
  }
  return [];
}

function arrangeRegister(loaded: readonly boolean[], loadedCount: number, targets: readonly number[], adjacency: readonly number[][]) {
  const occupied = [...loaded];
  const reserved = new Set(targets);
  const routes: number[][] = [];
  let activeQubits = targets.filter(index => occupied[index]).length;
  const capacity = Math.min(loadedCount, targets.length);
  for (const target of targets) {
    if (activeQubits === capacity) break;
    if (occupied[target]) continue;
    const route = routeToTarget(target, occupied, reserved, adjacency);
    if (route.length === 0) continue;
    occupied[route[0]] = false;
    occupied[target] = true;
    activeQubits++;
    routes.push(route);
  }
  return { routes, activeQubits };
}

function representativeGeometry(sites: readonly MachineSite[], routes: readonly (readonly number[])[]) {
  const moves = routes.map((route): MachineMove => {
    const path = route.map(index => sites[index]);
    return { atomId: path[0].id, from: path[0], to: path.at(-1)!, path };
  });
  const destinations = new Map(moves.map(move => [move.atomId, move.to]));
  const sources = sites.filter(site => site.loaded);
  const loadedAtoms = sources.map(({ id, row, column }) => ({ id, row, column }));
  const rearrangedAtoms = sources.map(source => {
    const { row, column, qubit } = destinations.get(source.id) ?? source;
    return { id: source.id, row, column, qubit };
  });
  return { loadedAtoms, rearrangedAtoms, moves };
}

function idealProbabilities(circuit: MachineCircuit, analysisGates: readonly MachineGate[]) {
  // These gates have real entries. q0 is the leftmost bit in each outcome.
  const amplitudes = Array<number>(2 ** circuit.qubits).fill(0);
  amplitudes[0] = 1;
  for (const gate of [...circuit.gates, ...analysisGates]) {
    const firstMask = 1 << (circuit.qubits - 1 - gate.qubits[0]);
    if (gate.name === 'CZ') {
      const secondMask = 1 << (circuit.qubits - 1 - gate.qubits[1]);
      for (let state = 0; state < amplitudes.length; state++) {
        if ((state & firstMask) && (state & secondMask)) amplitudes[state] *= -1;
      }
      continue;
    }
    for (let state = 0; state < amplitudes.length; state++) {
      if (state & firstMask) continue;
      const partner = state | firstMask;
      const zero = amplitudes[state];
      const one = amplitudes[partner];
      amplitudes[state] = (zero + one) * Math.SQRT1_2;
      amplitudes[partner] = (zero - one) * Math.SQRT1_2;
    }
  }
  return amplitudes.map(amplitude => amplitude ** 2);
}

function expectedReadout(ideal: readonly number[], error: number, qubits: number) {
  return ideal.map((_, observed) => ideal.reduce((sum, probability, actual) => {
    const differingBits = observed ^ actual;
    let conditional = 1;
    for (let bit = 0; bit < qubits; bit++) {
      conditional *= differingBits & (1 << bit) ? error : 1 - error;
    }
    return sum + probability * conditional;
  }, 0));
}

function sampleOutcome(probabilities: readonly number[], random: number) {
  let cumulative = 0;
  for (const [index, probability] of probabilities.entries()) {
    cumulative += probability;
    if (random < cumulative) return index;
  }
  return probabilities.length - 1;
}

function expectedAssembly(loadProbability: number, targetCount: number, siteCount: number) {
  // The contiguous targets lie inside the grid. Removing them leaves a connected
  // reservoir that touches every target, so any surplus atom can fill a vacancy.
  // Under independent loading, assembly succeeds exactly on the binomial tail.
  let combinations = 1;
  let probability = 0;
  for (let loaded = 0; loaded <= siteCount; loaded++) {
    if (loaded >= targetCount) probability += combinations * loadProbability ** loaded * (1 - loadProbability) ** (siteCount - loaded);
    combinations *= (siteCount - loaded) / (loaded + 1);
  }
  return Math.min(1, probability);
}

const operationResources: Partial<Record<MachineStage['id'], readonly string[]>> = {
  rearrangement: ['aod'], replenishment: ['aod'], readout: ['camera'],
};

function recordReplenishment(
  plan: MachinePlan, index: number, sites: readonly MachineSite[], initialRoutes: readonly number[][],
  targets: readonly number[], adjacency: readonly number[][],
): MachineAttemptRecord {
  const attemptId = `attempt-${index + 1}`;
  const { loadedAtoms, moves: initialMoves, rearrangedAtoms: initialAtoms } = representativeGeometry(sites, initialRoutes);
  const occupied = sites.map(site => initialAtoms.some(atom => atom.row === site.row && atom.column === site.column));
  const vacant = targets.filter(target => !occupied[target]);
  const route = vacant.length ? routeToTarget(vacant[0], occupied, new Set(targets), adjacency) : [];
  const source = route.length ? initialAtoms.find(atom => atom.row === sites[route[0]].row && atom.column === sites[route[0]].column)! : null;
  const path = route.map(siteIndex => sites[siteIndex]);
  const move: MachineMove | null = source ? { atomId: source.id, from: path[0], to: path.at(-1)!, path } : null;
  const replenishedAtoms = initialAtoms.map(atom => atom.id === move?.atomId
    ? { ...atom, row: move.to.row, column: move.to.column, qubit: move.to.qubit } : atom);
  const initiallyFull = vacant.length === 0;
  const full = replenishedAtoms.filter(atom => atom.qubit !== undefined).length === targets.length;
  const observations: OccupancyObservation[] = [];
  const decisions: OccupancyDecision[] = [];
  const events: MachineEvent[] = [];
  let previousIds: readonly string[] = [];

  for (const stage of plan.timeline.stages) {
    const recheck = stage.id === 'occupancy-recheck';
    if (stage.id === 'occupancy-check' || (recheck && !initiallyFull)) {
      const phase = recheck ? 'recheck' : 'initial';
      const atoms = recheck ? replenishedAtoms : initialAtoms;
      const observation: OccupancyObservation = {
        id: `${attemptId}:${phase}-observation`, phase,
        startedMs: stage.startMs, availableMs: stage.startMs + stage.durationMs * 2 / 3,
        sites: targets.map(target => {
          const site = sites[target];
          return { id: site.id, row: site.row, column: site.column, occupied: atoms.some(atom => atom.qubit === site.qubit) };
        }),
      };
      const decision: OccupancyDecision = {
        id: `${attemptId}:${phase}-decision`, observationId: observation.id, availableMs: stage.endMs,
        result: recheck ? full ? 'continue' : 'skip' : initiallyFull ? 'continue' : 'replenish',
      };
      observations.push(observation);
      decisions.push(decision);
      events.push(
        { id: observation.id, stageId: stage.id, kind: 'observe', status: 'executed', startMs: observation.startedMs,
          endMs: observation.availableMs, dependsOn: previousIds },
        { id: decision.id, stageId: stage.id, kind: 'decide', status: 'executed', startMs: observation.availableMs,
          endMs: decision.availableMs, dependsOn: [observation.id] },
      );
      previousIds = [decision.id];
      continue;
    }
    const refillSkipped = stage.id === 'replenishment' && !move;
    const skipped = refillSkipped || (recheck && initiallyFull) || (!full && postCheckStages.includes(stage.id));
    const event: MachineEvent = {
      id: `${attemptId}:${stage.id}`, stageId: stage.id, kind: 'operation',
      status: skipped ? 'skipped' : 'executed', startMs: stage.startMs, endMs: stage.endMs,
      dependsOn: previousIds,
    };
    if (skipped) event.reason = initiallyFull ? 'filled' : refillSkipped ? 'no-source' : 'vacant';
    events.push(event);
    if (stage.id === 'transfer' || stage.id === 'return') {
      const scienceRamp = { ...event, id: `${event.id}:science-460` };
      events.push(scienceRamp);
      previousIds = [event.id, scienceRamp.id];
    } else {
      previousIds = [event.id];
    }
  }
  const registerIds = targets.map(target => sites[target].id);
  for (const event of events) {
    const transports = event.stageId === 'rearrangement' ? initialMoves : event.stageId === 'replenishment' && move ? [move] : [];
    const handoff = event.stageId === 'transfer' || event.stageId === 'return';
    const resourceIds = handoff ? [event.id.endsWith(':science-460') ? 'science-460' : 'reservoir-483']
      : event.kind === 'observe' ? ['camera'] : operationResources[event.stageId] ?? [];
    event.schedule = {
      clockId: 'illustrative-attempt-ms',
      targetIds: transports.length ? [...new Set(transports.flatMap(transport => transport.path.map(site => site.id)))] : registerIds,
      resourceIds,
      planned: { startMs: event.startMs, endMs: event.endMs },
      ...(event.kind === 'observe' ? { exposure: { startMs: event.startMs, endMs: event.endMs } } : {}),
      ...(event.kind !== 'operation' ? { availableMs: event.endMs } : {}),
    };
  }
  return { attemptId, events, observations, decisions, loadedAtoms, initialMoves, initialAtoms, replenishedAtoms, move };
}

export function createMachineRun(
  input: Partial<MachineConfig> = {}, profile: MachineProfile = MUNIZ_DEMO_PROFILE, protocol: MachineProtocol = 'standard',
): MachineRun {
  const config = normalizeConfig(protocol === 'bell-replenishment' ? { ...input, circuit: 'bell' } : input);
  const plan = compileMachineProtocol(profile, protocol);
  const circuit = CIRCUITS.find(candidate => candidate.id === config.circuit)!;
  const { rows, columns, registerRow } = profile.array;
  const siteCount = rows * columns;
  const adjacency = Array.from({ length: siteCount }, (_, index) => neighbors(index, rows, columns));
  const loadRandom = seededRandom(config.seed);
  const readoutRandom = seededRandom(config.seed ^ 0x9e3779b9);
  const lossRandom = seededRandom(config.seed ^ 0x85ebca6b);
  const registerStart = registerRow * columns + Math.floor((columns - circuit.qubits) / 2);
  const qubits = Array.from({ length: circuit.qubits }, (_, qubit) => qubit);
  const targets = qubits.map(qubit => registerStart + qubit);
  const load = () => Array.from({ length: siteCount }, () => loadRandom() < config.loadProbability);
  const firstLoad = load();
  const firstLoadedCount = firstLoad.filter(Boolean).length;
  const arrangeInitial = (loaded: readonly boolean[], loadedCount: number) => {
    const arrangement = arrangeRegister(loaded, loadedCount, targets, adjacency);
    if (protocol === 'standard') return arrangement;
    // Keep the second Bell site as observed after loading. The first is assembled
    // from the reservoir so the subsequent feedback has an explicit vacancy.
    const routes = arrangement.routes.filter(route => route.at(-1) === targets[0]);
    return { routes, activeQubits: targets.filter(target => loaded[target]).length + routes.length };
  };
  const firstArrangement = arrangeInitial(firstLoad, firstLoadedCount);
  const sites = firstLoad.map((loaded, index): MachineSite => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const qubit = targets.indexOf(index);
    return {
      id: `${String.fromCharCode(65 + row)}${column + 1}`,
      row, column, loaded, qubit: qubit < 0 ? undefined : qubit,
    };
  });
  const geometry = representativeGeometry(sites, firstArrangement.routes);
  const analysisGates = config.basis === 'X' ? qubits.map(hadamard) : [];
  const ideal = idealProbabilities(circuit, analysisGates);
  const readout = expectedReadout(ideal, config.readoutError, circuit.qubits);
  const outcomes = ideal.map((idealProbability, index): MachineOutcome => ({
    bitstring: index.toString(2).padStart(circuit.qubits, '0'), idealProbability,
    readoutProbability: readout[index], count: 0,
  }));
  const samples: string[] = [];
  let rejectedShots = 0;
  let lostShots = 0;
  const records: MachineAttemptRecord[] = [];
  const attempts = Array.from({ length: config.shots }, (_, index): MachineAttempt => {
    const loaded = index === 0 ? firstLoad : load();
    const loadedCount = index === 0 ? firstLoadedCount : loaded.filter(Boolean).length;
    const arrangement = index === 0 ? firstArrangement : arrangeInitial(loaded, loadedCount);
    let activeQubits = arrangement.activeQubits;
    if (protocol === 'bell-replenishment') {
      const attemptSites = sites.map((site, siteIndex) => ({ ...site, loaded: loaded[siteIndex] }));
      const record = recordReplenishment(plan, index, attemptSites, arrangement.routes, targets, adjacency);
      records.push(record);
      activeQubits = record.replenishedAtoms.filter(atom => atom.qubit !== undefined).length;
    }
    // Fixed random draws per attempt preserve pairing when comparing settings.
    const randomOutcome = readoutRandom();
    const lostQubits = qubits.filter(() => lossRandom() < config.atomLossProbability);
    if (activeQubits < circuit.qubits) {
      rejectedShots++;
      return { loadedCount, activeQubits, status: 'assembly-failed', lostQubits: [], bitstring: null };
    }
    if (lostQubits.length > 0) {
      lostShots++;
      return { loadedCount, activeQubits, status: 'atom-lost', lostQubits, bitstring: null };
    }
    const outcome = outcomes[sampleOutcome(readout, randomOutcome)];
    outcome.count++;
    samples.push(outcome.bitstring);
    return { loadedCount, activeQubits, status: 'measured', lostQubits, bitstring: outcome.bitstring };
  });
  if (protocol === 'bell-replenishment') {
    records.forEach((record, index) => {
      if (attempts[index].status === 'atom-lost') {
        const readout = record.events.find(event => event.stageId === 'readout');
        if (readout) {
          readout.status = 'skipped';
          readout.reason = 'atom-lost';
        }
      }
      validateMachineSchedule(record.events, { durationMs: plan.timeline.durationMs, clockId: 'illustrative-attempt-ms' });
    });
  }
  const finalGeometry = records[0]?.replenishedAtoms ?? geometry.rearrangedAtoms;
  const atomicReference = protocol === 'bell-replenishment' ? getDemoClockBinding(profile.id) : null;
  return {
    profile, plan, records, config, circuit, analysisGates, sites, ...geometry,
    ...(atomicReference ? { atomicReference } : {}),
    rearrangedAtoms: finalGeometry, outcomes, attempts, samples,
    attemptedShots: config.shots, completedShots: samples.length, rejectedShots, lostShots,
    expectedAssemblyProbability: expectedAssembly(config.loadProbability, circuit.qubits, siteCount),
    loadedCount: firstLoadedCount, activeQubits: attempts[0].activeQubits, durationMs: plan.timeline.durationMs,
  };
}

export function machineExportV2({ profile: _profile, plan: _plan, records: _records, atomicReference: _atomicReference, ...run }: MachineRun) {
  return { kind: 'neutral-atom-quantum-computer-simulation', modelVersion: 2, ...run };
}

export function machineExport(run: MachineRun) {
  if (run.plan.protocol === 'standard') return machineExportV2(run);
  return {
    kind: 'neutral-atom-quantum-computer-simulation',
    schemaVersion: 3, modelVersion: 3, timebase: 'illustrative-attempt-ms',
    provenance: { kind: 'synthetic', protocol: run.plan.protocol, seed: run.config.seed, randomAlgorithm: 'mulberry32' },
    ...run,
  };
}

function movingAtoms(
  loadedAtoms: readonly MachineAtom[], rearrangedAtoms: readonly MachineAtom[], routes: readonly MachineMove[], progress: number,
): MachineAtom[] {
  const destinations = new Map(rearrangedAtoms.map(atom => [atom.id, atom]));
  const moves = new Map(routes.map((move, index) => [move.atomId, { move, index }]));
  return loadedAtoms.map(atom => {
    const transport = moves.get(atom.id);
    const destination = destinations.get(atom.id)!;
    if (!transport) return destination;
    const localProgress = progress * routes.length - transport.index;
    if (localProgress <= 0) return atom;
    if (localProgress >= 1) return destination;
    const path = transport.move.path;
    const travelled = localProgress * (path.length - 1);
    const step = Math.min(path.length - 2, Math.floor(travelled));
    const fraction = travelled - step;
    return {
      id: atom.id,
      row: path[step].row + (path[step + 1].row - path[step].row) * fraction,
      column: path[step].column + (path[step + 1].column - path[step].column) * fraction,
      moving: true,
    };
  });
}

export function machineFrame(run: MachineRun, timeMs: number, selectedAttempt = 0): MachineFrame {
  const { stages } = run.plan.timeline;
  const attemptIndex = run.records.length ? Math.trunc(finiteWithin(selectedAttempt, 0, run.records.length - 1, 0)) : 0;
  const elapsedMs = finiteWithin(timeMs, 0, run.durationMs, 0);
  const complete = elapsedMs >= run.durationMs;
  const stageIndex = complete ? stages.length - 1 : stages.findIndex(stage => elapsedMs < stage.endMs);
  const stage = stages[stageIndex];
  const stageProgress = (elapsedMs - stage.startMs) / stage.durationMs;
  const visibleAttempts = stage.id === 'readout' ? Math.floor(stageProgress * run.attemptedShots) : 0;
  let latestBitstring: string | null = null;
  let visibleShots = 0;
  let visibleRejectedShots = 0;
  let visibleLostShots = 0;
  const outcomeCounts = run.outcomes.map(() => 0);
  for (let index = 0; index < visibleAttempts; index++) {
    const attempt = run.attempts[index];
    if (attempt.status === 'assembly-failed') visibleRejectedShots++;
    if (attempt.status === 'atom-lost') visibleLostShots++;
    if (attempt.bitstring !== null) {
      visibleShots++;
      latestBitstring = attempt.bitstring;
      outcomeCounts[parseInt(attempt.bitstring, 2)]++;
    }
  }

  const representative = visibleAttempts > attemptIndex ? run.attempts[attemptIndex] : undefined;
  const record = run.records[attemptIndex];
  const observations = record?.observations.filter(observation => elapsedMs >= observation.availableMs) ?? [];
  const decisions = record?.decisions.filter(decision => elapsedMs >= decision.availableMs) ?? [];
  const lastDecision = decisions.at(-1);
  const representativeReady = record ? lastDecision?.result === 'continue' : run.activeQubits === run.circuit.qubits;
  const skippedEvent = record?.events.find(event => event.stageId === stage.id && event.status === 'skipped'
    && (event.reason !== 'atom-lost' || representative !== undefined));
  const stageSkipped = skippedEvent !== undefined;
  const parallelTrapHandoff = (stage.id === 'transfer' || stage.id === 'return') && !stageSkipped
    && record?.events.filter(event => event.stageId === stage.id && event.status === 'executed'
      && event.startMs <= elapsedMs && elapsedMs < event.endMs).length === 2;
  const representativeBitstring = representative?.bitstring ?? null;
  const representativeLostQubits = representative?.lostQubits ?? [];
  let atoms = [...run.rearrangedAtoms];
  const loadedAtoms = attemptIndex === 0 ? run.loadedAtoms : record?.loadedAtoms;
  const initialMoves = attemptIndex === 0 ? run.moves : record?.initialMoves;
  let geometryRecorded = true;
  let occupancy: OccupancyPlayback | null = null;
  if (record) {
    const replenishmentStage = stages.find(candidate => candidate.id === 'replenishment')!;
    atoms = [...(elapsedMs < replenishmentStage.endMs ? record.initialAtoms : record.replenishedAtoms)];
    if (stage.id === 'replenishment' && record.move) {
      atoms = movingAtoms(record.initialAtoms, record.replenishedAtoms, [record.move], stageProgress);
    }
    const replenishing = decisions[0]?.result === 'replenish';
    let replenishment: OccupancyPlayback['replenishment'] = null;
    if (replenishing) {
      replenishment = !record.move ? 'no-source' : elapsedMs < replenishmentStage.startMs
        ? 'pending' : elapsedMs < replenishmentStage.endMs ? 'moving' : 'moved';
    }
    occupancy = {
      observations, decisions, replenishment,
      exposing: record.observations.some(observation => elapsedMs >= observation.startedMs && elapsedMs < observation.availableMs),
    };
  }
  if (stage.id === 'cooling') atoms = [];
  if (stage.id === 'loading') {
    geometryRecorded = loadedAtoms !== undefined;
    atoms = loadedAtoms?.slice(0, Math.floor(stageProgress * loadedAtoms.length)) ?? [];
  }
  if (stage.id === 'rearrangement') {
    geometryRecorded = loadedAtoms !== undefined && initialMoves !== undefined;
    atoms = loadedAtoms && initialMoves
      ? movingAtoms(loadedAtoms, record?.initialAtoms ?? run.rearrangedAtoms, initialMoves, stageProgress)
      : [];
  }
  if (representativeLostQubits.length > 0) {
    atoms = atoms.filter(atom => atom.qubit === undefined || !representativeLostQubits.includes(atom.qubit));
  }
  if (representativeBitstring !== null) {
    atoms = atoms.map(atom => atom.qubit === undefined ? atom : {
      ...atom, bright: representativeBitstring[atom.qubit] === run.profile.readoutBrightBit,
    });
  }

  const gateIndex = stage.id === 'gates' && representativeReady
    ? Math.min(run.circuit.gates.length - 1, Math.floor(stageProgress * run.circuit.gates.length))
    : null;
  const gateProgress = gateIndex === null ? undefined : stageProgress * run.circuit.gates.length - gateIndex;
  const allPrepared = atoms.flatMap(atom => atom.qubit === undefined ? [] : [atom.qubit]).sort((a, b) => a - b);
  let activeQubits: readonly number[] = [];
  if (representativeReady && (
    stage.id === 'preparation' || stage.id === 'transfer' || stage.id === 'return'
    || (stage.id === 'analysis' && run.analysisGates.length > 0) || representativeBitstring !== null
  )) activeQubits = allPrepared;
  if (gateIndex !== null) activeQubits = run.circuit.gates[gateIndex].qubits;

  return {
    attemptIndex, geometryRecorded, parallelTrapHandoff,
    stage, stageIndex, stageStartMs: stage.startMs, stageEndMs: stage.endMs,
    elapsedMs, progress: elapsedMs / run.durationMs, stageProgress, complete, atoms,
    activeQubits, gateIndex, gateProgress, stageSkipped, stageSkipReason: skippedEvent?.reason ?? null, occupancy,
    representativeReady, representativeBitstring, representativeLostQubits,
    visibleAttempts, visibleShots, visibleRejectedShots, visibleLostShots, outcomeCounts, latestBitstring,
  };
}
