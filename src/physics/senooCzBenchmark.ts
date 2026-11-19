import { SENOO_CZ_RESPONSE_INPUTS, type SenooCzResponseInput } from './senooCzResponse';
import { assessSenooCzWaveform, type SenooCzWaveform } from './senooCzWaveform';

export const SENOO_CZ_BENCHMARK_MASKS = ['prep', 'decay', 'loss'] as const;
const survivalStates = ['present', 'lost', 'unknown'] as const;
const modes = ['non-echo', 'echo'] as const;

type SourceKind = 'measured' | 'synthetic';
export type SenooCzBenchmarkMode = typeof modes[number];
export type SenooCzBenchmarkMask = typeof SENOO_CZ_BENCHMARK_MASKS[number];
export type SenooCzBenchmarkSurvival = typeof survivalStates[number];
export type SenooCzBenchmarkBitstring = SenooCzResponseInput;

export interface SenooCzBenchmarkSequence {
  readonly sequenceId: string;
  readonly seed: string;
  readonly depth: number;
  readonly target: SenooCzBenchmarkBitstring;
  readonly sourceRef: string;
}

export interface SenooCzBenchmarkAttempt {
  readonly attemptId: string;
  readonly pairId: string;
  readonly blockId: string;
  readonly sequenceId: string;
  readonly siteIds: readonly [string, string];
  readonly masks: Readonly<Record<SenooCzBenchmarkMask, boolean>>;
  readonly bitstring: SenooCzBenchmarkBitstring | null;
  readonly survival: readonly [SenooCzBenchmarkSurvival, SenooCzBenchmarkSurvival];
  readonly sourceRef: string;
  readonly survivalRef: string | null;
}

export interface SenooCzBenchmark {
  readonly kind: 'senoo-cz-benchmark';
  readonly schemaVersion: 1;
  readonly sourceKind: SourceKind;
  readonly sourceRef: string;
  readonly waveformSha256: string;
  readonly apparatusVersion: string;
  readonly gateVersion: string;
  readonly workingPoint: string;
  readonly acquisitionRunId: string;
  readonly protocolRef: string;
  readonly maskRef: string;
  readonly readoutCalibrationRef: string;
  readonly survivalProtocolRef: string;
  readonly independenceRef: string;
  readonly confidenceLevel: number;
  readonly expectedAttempts: number;
  readonly mode: SenooCzBenchmarkMode;
  readonly sequences: readonly SenooCzBenchmarkSequence[];
  readonly attempts: readonly SenooCzBenchmarkAttempt[];
}

export function associateSenooCzBenchmarkWaveform(batch: SenooCzBenchmark, waveform: SenooCzWaveform | null, sha256: string | null) {
  if (!waveform) return { status: 'awaiting-waveform' as const, message: '待核对同门波形', sameOrderedPairs: null };
  const assessment = assessSenooCzWaveform(waveform);
  const sameIdentity = sha256 === batch.waveformSha256 && waveform.isotope === 171
    && (batch.sourceKind === 'measured' ? assessment.readyForModelInput : assessment.coverage.coversWindow)
    && waveform.apparatusVersion === batch.apparatusVersion && waveform.gateVersion === batch.gateVersion
    && waveform.workingPoint === batch.workingPoint;
  if (!sameIdentity || !waveform.acquisitionRunId || waveform.acquisitionRunId === batch.acquisitionRunId) {
    return { status: 'mismatch' as const, message: '波形、门工况或独立采集运行不匹配', sameOrderedPairs: null };
  }
  const sameOrderedPairs = new Set(batch.attempts.filter(attempt =>
    attempt.siteIds.every((id, index) => id === waveform.siteIds?.[index])).map(attempt => attempt.pairId)).size;
  return { status: 'associated' as const, message: '已关联同门波形与独立采集运行', sameOrderedPairs };
}

export function createSenooCzBenchmarkTemplate() {
  return {
    kind: 'senoo-cz-benchmark', schemaVersion: 1, sourceKind: null, sourceRef: null, waveformSha256: null,
    apparatusVersion: null, gateVersion: null, workingPoint: null, acquisitionRunId: null, protocolRef: null,
    maskRef: null, readoutCalibrationRef: null, survivalProtocolRef: null, independenceRef: null, confidenceLevel: null,
    expectedAttempts: null, mode: null, sequences: [], attempts: [],
  } as const;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} 应为 JSON 对象。`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 应为非空文本。`);
  return value.trim();
}

function reference(value: unknown, path: string, sourceKind: SourceKind): string {
  const text = requiredText(value, path);
  if (sourceKind === 'measured' && /^(synthetic|control-setpoint|literature|simulation):/i.test(text)) {
    throw new Error(`${path} 的实测声明与来源类型冲突。`);
  }
  return text;
}

function integer(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${path} 应为不小于 ${minimum} 的安全整数。`);
  }
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  const selected = choices.find(option => option === value);
  if (selected === undefined) throw new Error(`${path} 应为 ${choices.join('、')} 之一。`);
  return selected;
}

function readSequences(value: unknown, sourceKind: SourceKind): SenooCzBenchmarkSequence[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('sequences 应为非空线路数组。');
  const sequenceIds = new Set<string>();
  return value.map((item: unknown, index) => {
    const path = `sequences[${index}]`;
    const raw = object(item, path);
    const sequenceId = requiredText(raw.sequenceId, `${path}.sequenceId`);
    if (sequenceIds.has(sequenceId)) throw new Error(`${path}.sequenceId 重复。`);
    sequenceIds.add(sequenceId);
    return {
      sequenceId, seed: requiredText(raw.seed, `${path}.seed`), depth: integer(raw.depth, `${path}.depth`, 0),
      target: choice(raw.target, SENOO_CZ_RESPONSE_INPUTS, `${path}.target`),
      sourceRef: reference(raw.sourceRef, `${path}.sourceRef`, sourceKind),
    };
  });
}

function readSiteIds(value: unknown, path: string): SenooCzBenchmarkAttempt['siteIds'] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${path} 应包含两个有序位点 ID。`);
  const first = requiredText(value[0], `${path}[0]`);
  const second = requiredText(value[1], `${path}[1]`);
  if (first === second) throw new Error(`${path} 的两个位点应互异。`);
  return [first, second];
}

function readMasks(value: unknown, path: string): SenooCzBenchmarkAttempt['masks'] {
  const { prep, decay, loss } = object(value, path);
  if (typeof prep !== 'boolean' || typeof decay !== 'boolean' || typeof loss !== 'boolean') {
    throw new Error(`${path} 的 prep、decay、loss 应分别为布尔值。`);
  }
  return { prep, decay, loss };
}

function readSurvival(value: unknown, path: string): SenooCzBenchmarkAttempt['survival'] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${path} 应按位点顺序填写两个存活状态。`);
  return [choice(value[0], survivalStates, `${path}[0]`), choice(value[1], survivalStates, `${path}[1]`)];
}

function readAttempts(
  value: unknown, expectedAttempts: number, sequenceIds: ReadonlySet<string>, sourceKind: SourceKind,
): SenooCzBenchmarkAttempt[] {
  if (!Array.isArray(value) || value.length !== expectedAttempts) {
    throw new Error('attempts 必须保留全部原子对尝试，行数须等于 expectedAttempts。');
  }
  const seen = new Set<string>();
  const attemptBlocks = new Map<string, string>();
  const pairSites = new Map<string, SenooCzBenchmarkAttempt['siteIds']>();
  return value.map((item: unknown, index) => {
    const path = `attempts[${index}]`;
    const raw = object(item, path);
    const attemptId = requiredText(raw.attemptId, `${path}.attemptId`);
    const pairId = requiredText(raw.pairId, `${path}.pairId`);
    const attemptPair = JSON.stringify([attemptId, pairId]);
    if (seen.has(attemptPair)) throw new Error(`${path} 的 attemptId 和 pairId 组合重复。`);
    seen.add(attemptPair);
    const blockId = requiredText(raw.blockId, `${path}.blockId`);
    const previousBlock = attemptBlocks.get(attemptId);
    if (previousBlock !== undefined && previousBlock !== blockId) {
      throw new Error(`${path}.blockId 与同一采集尝试的其他原子对行不一致。`);
    }
    attemptBlocks.set(attemptId, blockId);
    const sequenceId = requiredText(raw.sequenceId, `${path}.sequenceId`);
    if (!sequenceIds.has(sequenceId)) throw new Error(`${path}.sequenceId 在 sequences 中不存在。`);
    const siteIds = readSiteIds(raw.siteIds, `${path}.siteIds`);
    const previousSites = pairSites.get(pairId);
    if (previousSites && (previousSites[0] !== siteIds[0] || previousSites[1] !== siteIds[1])) {
      throw new Error(`${path}.siteIds 与该 pairId 已登记的位点或顺序不一致。`);
    }
    pairSites.set(pairId, siteIds);
    const bitstring = raw.bitstring === null ? null : choice(raw.bitstring, SENOO_CZ_RESPONSE_INPUTS, `${path}.bitstring`);
    const survival = readSurvival(raw.survival, `${path}.survival`);
    if (bitstring !== null && survival.includes('lost')) {
      throw new Error(`${path}.bitstring 与已确认的位点丢失冲突。`);
    }
    const survivalRef = raw.survivalRef === null ? null : reference(raw.survivalRef, `${path}.survivalRef`, sourceKind);
    if (survivalRef === null && survival.some(state => state !== 'unknown')) {
      throw new Error(`${path}.survivalRef 应引用已判明的位点存活或丢失证据。`);
    }
    return {
      attemptId, pairId, blockId, sequenceId, siteIds,
      masks: readMasks(raw.masks, `${path}.masks`), bitstring, survival,
      sourceRef: reference(raw.sourceRef, `${path}.sourceRef`, sourceKind), survivalRef,
    };
  });
}

export function parseSenooCzBenchmark(text: string): SenooCzBenchmark {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('CZ gRB 独立批次不是有效的 JSON。');
  }
  const raw = object(input, 'CZ gRB 独立批次');
  if (raw.kind !== 'senoo-cz-benchmark' || raw.schemaVersion !== 1) throw new Error('请选择 Senoo CZ gRB 独立批次 v1 JSON。');
  const sourceKind = choice(raw.sourceKind, ['measured', 'synthetic'] as const, 'sourceKind');
  const readText = (key: string) => requiredText(raw[key], key);
  const readReference = (key: string) => reference(raw[key], key, sourceKind);
  const waveformSha256 = readText('waveformSha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(waveformSha256)) throw new Error('waveformSha256 应为 64 位十六进制 SHA-256。');
  const confidenceLevel = raw.confidenceLevel;
  if (typeof confidenceLevel !== 'number' || !(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error('confidenceLevel 应大于 0 且小于 1。');
  }
  const expectedAttempts = integer(raw.expectedAttempts, 'expectedAttempts', 1);
  const sequences = readSequences(raw.sequences, sourceKind);
  return {
    kind: 'senoo-cz-benchmark', schemaVersion: 1, sourceKind, sourceRef: readReference('sourceRef'), waveformSha256,
    apparatusVersion: readText('apparatusVersion'), gateVersion: readText('gateVersion'), workingPoint: readText('workingPoint'),
    acquisitionRunId: readText('acquisitionRunId'), protocolRef: readReference('protocolRef'), maskRef: readReference('maskRef'),
    readoutCalibrationRef: readReference('readoutCalibrationRef'), survivalProtocolRef: readReference('survivalProtocolRef'),
    independenceRef: readReference('independenceRef'), confidenceLevel, expectedAttempts, mode: choice(raw.mode, modes, 'mode'),
    sequences, attempts: readAttempts(raw.attempts, expectedAttempts, new Set(sequences.map(row => row.sequenceId)), sourceKind),
  };
}
