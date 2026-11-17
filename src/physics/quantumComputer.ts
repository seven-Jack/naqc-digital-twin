export const MACHINE_ROWS = 6;
export const MACHINE_COLUMNS = 8;

const stageDefinitions = [
  { id: 'cooling', label: '冷却与俘获', durationMs: 1100, description: '磁光阱汇集并冷却原子，为光镊装载准备原子样品。' },
  { id: 'loading', label: '光镊装载', durationMs: 1500, description: '装载 483 nm 储备阱，并根据预先成像获得各位点的占据状态。' },
  { id: 'rearrangement', label: '原子重排', durationMs: 1750, description: '移动光镊沿空阱位搬运原子，填充电路所需的寄存器。' },
  { id: 'preparation', label: '量子态制备', durationMs: 1150, description: '在储备阱中进一步冷却，并用光抽运将已分配的原子制备到 |0⟩。' },
  { id: 'transfer', label: '转入计算阱', durationMs: 700, description: '同步降低储备阱光功率并提高同位置的 460 nm 计算阱光功率。' },
  { id: 'gates', label: '量子门操作', durationMs: 2450, description: '在计算阱内用拉曼光执行单比特门，用钟跃迁与里德堡相互作用实现 CZ。' },
  { id: 'analysis', label: '测量基旋转', durationMs: 600, description: 'X 基测量先做单比特基变换，再进行计算基荧光读出。Z 基直接读出。' },
  { id: 'return', label: '转回储备阱', durationMs: 700, description: '降低计算阱光功率并恢复同位置的储备阱，以便态选择性成像。' },
  { id: 'readout', label: '荧光读出', durationMs: 2050, description: '以态选择性荧光读出首轮寄存器，并累计各轮有效测量。' },
] as const;

export type MachineStageId = typeof stageDefinitions[number]['id'];
export type MachineStage = typeof stageDefinitions[number] & { startMs: number; endMs: number };

let stageStartMs = 0;
export const MACHINE_STAGES: readonly MachineStage[] = stageDefinitions.map(stage => {
  const startMs = stageStartMs;
  stageStartMs += stage.durationMs;
  return { ...stage, startMs, endMs: stageStartMs };
});
export const MACHINE_DURATION_MS = stageStartMs;

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
  stage: MachineStage;
  stageIndex: number;
  stageStartMs: number;
  stageEndMs: number;
  elapsedMs: number;
  progress: number;
  stageProgress: number;
  complete: boolean;
  gateIndex: number | null;
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

function neighbors(index: number) {
  const row = Math.floor(index / MACHINE_COLUMNS);
  const column = index % MACHINE_COLUMNS;
  const result = [];
  if (column > 0) result.push(index - 1);
  if (column < MACHINE_COLUMNS - 1) result.push(index + 1);
  if (row > 0) result.push(index - MACHINE_COLUMNS);
  if (row < MACHINE_ROWS - 1) result.push(index + MACHINE_COLUMNS);
  return result;
}

const siteCount = MACHINE_ROWS * MACHINE_COLUMNS;
const adjacency = Array.from({ length: siteCount }, (_, index) => neighbors(index));

function routeToTarget(target: number, occupied: readonly boolean[], reserved: ReadonlySet<number>) {
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

function arrangeRegister(loaded: readonly boolean[], loadedCount: number, targets: readonly number[]) {
  const occupied = [...loaded];
  const reserved = new Set(targets);
  const routes: number[][] = [];
  let activeQubits = targets.filter(index => occupied[index]).length;
  const capacity = Math.min(loadedCount, targets.length);
  for (const target of targets) {
    if (activeQubits === capacity) break;
    if (occupied[target]) continue;
    const route = routeToTarget(target, occupied, reserved);
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

function expectedAssembly(loadProbability: number, targetCount: number) {
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

export function createMachineRun(input: Partial<MachineConfig> = {}): MachineRun {
  const config = normalizeConfig(input);
  const circuit = CIRCUITS.find(candidate => candidate.id === config.circuit)!;
  const loadRandom = seededRandom(config.seed);
  const readoutRandom = seededRandom(config.seed ^ 0x9e3779b9);
  const lossRandom = seededRandom(config.seed ^ 0x85ebca6b);
  const registerStart = Math.floor(MACHINE_ROWS / 2) * MACHINE_COLUMNS + Math.floor((MACHINE_COLUMNS - circuit.qubits) / 2);
  const qubits = Array.from({ length: circuit.qubits }, (_, qubit) => qubit);
  const targets = qubits.map(qubit => registerStart + qubit);
  const load = () => Array.from({ length: siteCount }, () => loadRandom() < config.loadProbability);
  const firstLoad = load();
  const firstLoadedCount = firstLoad.filter(Boolean).length;
  const firstArrangement = arrangeRegister(firstLoad, firstLoadedCount, targets);
  const sites = firstLoad.map((loaded, index): MachineSite => {
    const row = Math.floor(index / MACHINE_COLUMNS);
    const column = index % MACHINE_COLUMNS;
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
  const attempts = Array.from({ length: config.shots }, (_, index): MachineAttempt => {
    const loaded = index === 0 ? firstLoad : load();
    const loadedCount = index === 0 ? firstLoadedCount : loaded.filter(Boolean).length;
    const { activeQubits } = index === 0 ? firstArrangement : arrangeRegister(loaded, loadedCount, targets);
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
  return {
    config, circuit, analysisGates, sites, ...geometry, outcomes, attempts, samples,
    attemptedShots: config.shots, completedShots: samples.length, rejectedShots, lostShots,
    expectedAssemblyProbability: expectedAssembly(config.loadProbability, circuit.qubits),
    loadedCount: firstLoadedCount, activeQubits: firstArrangement.activeQubits, durationMs: MACHINE_DURATION_MS,
  };
}

function movingAtoms(run: MachineRun, progress: number): MachineAtom[] {
  const destinations = new Map(run.rearrangedAtoms.map(atom => [atom.id, atom]));
  const moves = new Map(run.moves.map((move, index) => [move.atomId, { move, index }]));
  return run.loadedAtoms.map(atom => {
    const transport = moves.get(atom.id);
    const destination = destinations.get(atom.id)!;
    if (!transport) return destination;
    const localProgress = progress * run.moves.length - transport.index;
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

export function machineFrame(run: MachineRun, timeMs: number): MachineFrame {
  const elapsedMs = finiteWithin(timeMs, 0, run.durationMs, 0);
  const complete = elapsedMs >= run.durationMs;
  const stageIndex = complete ? MACHINE_STAGES.length - 1 : MACHINE_STAGES.findIndex(stage => elapsedMs < stage.endMs);
  const stage = MACHINE_STAGES[stageIndex];
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

  const representative = visibleAttempts > 0 ? run.attempts[0] : undefined;
  const representativeReady = run.activeQubits === run.circuit.qubits;
  const representativeBitstring = representative?.bitstring ?? null;
  const representativeLostQubits = representative?.lostQubits ?? [];
  let atoms = [...run.rearrangedAtoms];
  if (stage.id === 'cooling') atoms = [];
  if (stage.id === 'loading') atoms = run.loadedAtoms.slice(0, Math.floor(stageProgress * run.loadedCount));
  if (stage.id === 'rearrangement') atoms = movingAtoms(run, stageProgress);
  if (representativeLostQubits.length > 0) {
    atoms = atoms.filter(atom => atom.qubit === undefined || !representativeLostQubits.includes(atom.qubit));
  }
  if (representativeBitstring !== null) {
    atoms = atoms.map(atom => atom.qubit === undefined ? atom : { ...atom, bright: representativeBitstring[atom.qubit] === '0' });
  }

  const gateIndex = stage.id === 'gates' && representativeReady
    ? Math.min(run.circuit.gates.length - 1, Math.floor(stageProgress * run.circuit.gates.length))
    : null;
  const allPrepared = atoms.flatMap(atom => atom.qubit === undefined ? [] : [atom.qubit]).sort((a, b) => a - b);
  let activeQubits: readonly number[] = [];
  if (representativeReady && (
    stage.id === 'preparation' || stage.id === 'transfer' || stage.id === 'return'
    || (stage.id === 'analysis' && run.analysisGates.length > 0) || representativeBitstring !== null
  )) activeQubits = allPrepared;
  if (gateIndex !== null) activeQubits = run.circuit.gates[gateIndex].qubits;

  return {
    stage, stageIndex, stageStartMs: stage.startMs, stageEndMs: stage.endMs,
    elapsedMs, progress: elapsedMs / run.durationMs, stageProgress, complete, atoms,
    activeQubits, gateIndex, representativeReady, representativeBitstring, representativeLostQubits,
    visibleAttempts, visibleShots, visibleRejectedShots, visibleLostShots, outcomeCounts, latestBitstring,
  };
}
