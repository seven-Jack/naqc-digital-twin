export const SENOO_CZ_RESPONSE_INPUTS = ['00', '01', '10', '11'] as const;
export const SENOO_CZ_RESPONSE_OUTCOMES = [
  'returned', 'other-logical', 'rydberg', 'first-site-loss', 'second-site-loss', 'pair-loss', 'ambiguous', 'unavailable',
] as const;

export type SenooCzResponseInput = typeof SENOO_CZ_RESPONSE_INPUTS[number];
export type SenooCzResponseOutcome = typeof SENOO_CZ_RESPONSE_OUTCOMES[number];
type SourceKind = 'measured' | 'synthetic';

export type SenooCzResponseAttempt = {
  readonly attemptId: string;
  readonly input: SenooCzResponseInput;
  readonly sourceRef: string;
} & ({ readonly prep: 'accepted'; readonly outcome: SenooCzResponseOutcome }
  | { readonly prep: 'rejected'; readonly outcome: null });

export interface SenooCzResponsePhase {
  readonly estimateRad: number;
  readonly halfWidthRad: number;
  readonly confidenceLevel: number;
  readonly sourceRef: string;
  readonly phaseReference: string;
}

export interface SenooCzResponse {
  readonly kind: 'senoo-cz-response';
  readonly schemaVersion: 1;
  readonly sourceKind: SourceKind;
  readonly sourceRef: string;
  readonly waveformSha256: string;
  readonly apparatusVersion: string;
  readonly gateVersion: string;
  readonly workingPoint: string;
  readonly acquisitionRunId: string;
  readonly clockId: string;
  readonly timeOriginRef: string;
  readonly expectedAttempts: number;
  readonly readoutCalibrationRef: string;
  readonly screeningRef: string;
  readonly observationProtocolRef: string;
  readonly independenceRef: string;
  readonly confidenceLevel: number;
  readonly siteIds: readonly [string, string];
  readonly phase: SenooCzResponsePhase | null;
  readonly attempts: readonly SenooCzResponseAttempt[];
}

export function createSenooCzResponseTemplate() {
  return {
    kind: 'senoo-cz-response', schemaVersion: 1, sourceKind: null, sourceRef: null, waveformSha256: null,
    apparatusVersion: null, gateVersion: null, workingPoint: null, acquisitionRunId: null, clockId: null, timeOriginRef: null,
    expectedAttempts: null, readoutCalibrationRef: null, screeningRef: null, observationProtocolRef: null, independenceRef: null,
    confidenceLevel: null, siteIds: [], phase: null, attempts: [],
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

function sourceReference(value: unknown, path: string, sourceKind: SourceKind): string {
  const source = requiredText(value, path);
  if (sourceKind === 'measured' && /^(synthetic|control-setpoint|literature|simulation):/i.test(source)) {
    throw new Error(`${path} 的实测声明与来源类型冲突。`);
  }
  return source;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} 应为有限数值。`);
  return value;
}

function confidenceLevel(value: unknown, path: string): number {
  const level = number(value, path);
  if (level <= 0 || level >= 1) throw new Error(`${path} 应大于 0 且小于 1。`);
  return level;
}

function choice<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  const selected = choices.find(option => option === value);
  if (selected === undefined) throw new Error(`${path} 应为 ${choices.join('、')} 之一。`);
  return selected;
}

function readPhase(value: unknown, sourceKind: SourceKind): SenooCzResponsePhase | null {
  if (value === null) return null;
  const raw = object(value, 'phase');
  const halfWidthRad = number(raw.halfWidthRad, 'phase.halfWidthRad');
  if (halfWidthRad < 0 || halfWidthRad > Math.PI) throw new Error('phase.halfWidthRad 应在 0 至 π rad 之间。');
  return {
    estimateRad: number(raw.estimateRad, 'phase.estimateRad'), halfWidthRad,
    confidenceLevel: confidenceLevel(raw.confidenceLevel, 'phase.confidenceLevel'),
    sourceRef: sourceReference(raw.sourceRef, 'phase.sourceRef', sourceKind),
    phaseReference: sourceReference(raw.phaseReference, 'phase.phaseReference', sourceKind),
  };
}

function readAttempts(value: unknown, expectedAttempts: number, sourceKind: SourceKind): SenooCzResponseAttempt[] {
  if (!Array.isArray(value) || value.length !== expectedAttempts) {
    throw new Error('attempts 必须保留全部尝试，行数须等于 expectedAttempts。');
  }
  const seen = new Set<string>();
  return value.map((item: unknown, index) => {
    const path = `attempts[${index}]`;
    const raw = object(item, path);
    const attemptId = requiredText(raw.attemptId, `${path}.attemptId`);
    if (seen.has(attemptId)) throw new Error(`${path}.attemptId 重复。`);
    seen.add(attemptId);
    const input = choice(raw.input, SENOO_CZ_RESPONSE_INPUTS, `${path}.input`);
    const prep = choice(raw.prep, ['accepted', 'rejected'] as const, `${path}.prep`);
    const sourceRef = sourceReference(raw.sourceRef, `${path}.sourceRef`, sourceKind);
    if (prep === 'rejected') {
      if (raw.outcome !== null) throw new Error(`${path}.outcome 对制备未通过尝试应为 null。`);
      return { attemptId, input, prep, outcome: null, sourceRef };
    }
    const outcome = choice(raw.outcome, SENOO_CZ_RESPONSE_OUTCOMES, `${path}.outcome`);
    return { attemptId, input, prep, outcome, sourceRef };
  });
}

export function parseSenooCzResponse(text: string): SenooCzResponse {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('CZ 门响应不是有效的 JSON。');
  }
  const raw = object(input, 'CZ 门响应');
  if (raw.kind !== 'senoo-cz-response' || raw.schemaVersion !== 1) throw new Error('请选择 Senoo CZ 门响应 v1 JSON。');
  const sourceKind = choice(raw.sourceKind, ['measured', 'synthetic'] as const, 'sourceKind');
  const readText = (key: string) => requiredText(raw[key], key);
  const readReference = (key: string) => sourceReference(raw[key], key, sourceKind);
  const waveformSha256 = readText('waveformSha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(waveformSha256)) throw new Error('waveformSha256 应为 64 位十六进制 SHA-256。');
  if (!Array.isArray(raw.siteIds) || raw.siteIds.length !== 2) throw new Error('siteIds 应按波形位点顺序填写两个位点 ID。');
  const first = requiredText(raw.siteIds[0], 'siteIds[0]');
  const second = requiredText(raw.siteIds[1], 'siteIds[1]');
  if (first === second) throw new Error('siteIds 的两个位点 ID 应互异。');
  const expectedAttempts = number(raw.expectedAttempts, 'expectedAttempts');
  if (!Number.isSafeInteger(expectedAttempts) || expectedAttempts <= 0) throw new Error('expectedAttempts 应为正整数。');
  return {
    kind: 'senoo-cz-response', schemaVersion: 1, sourceKind, sourceRef: readReference('sourceRef'), waveformSha256,
    apparatusVersion: readText('apparatusVersion'), gateVersion: readText('gateVersion'), workingPoint: readText('workingPoint'),
    acquisitionRunId: readText('acquisitionRunId'), clockId: readText('clockId'), timeOriginRef: readReference('timeOriginRef'),
    expectedAttempts, readoutCalibrationRef: readReference('readoutCalibrationRef'), screeningRef: readReference('screeningRef'),
    observationProtocolRef: readReference('observationProtocolRef'), independenceRef: readReference('independenceRef'),
    confidenceLevel: confidenceLevel(raw.confidenceLevel, 'confidenceLevel'), siteIds: [first, second],
    phase: readPhase(raw.phase, sourceKind), attempts: readAttempts(raw.attempts, expectedAttempts, sourceKind),
  };
}
