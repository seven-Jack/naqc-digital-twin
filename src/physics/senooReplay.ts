import { SENOO_APPARATUS_PROFILE, SENOO_REPLAY_LENGTH, SENOO_REPLAY_STAGES } from '../data/senooApparatus';
import { DEFAULT_EXPLORATORY_THRESHOLDS } from '../data/senooReadoutEvaluation';
import { SENOO_READOUT_SOURCE, type SenooReadoutGroup } from '../data/senooReadoutSource';
import { classifyDualExposure, createDualExposureRule } from './dualExposureReadout';

export type SenooApparatusState = 'unknown' | 'm0' | 'm1' | 'g0' | 'empty' | 'removed';
type GroupId = SenooReadoutGroup['id'];

export const SENOO_REPLAY_RULE = createDualExposureRule(DEFAULT_EXPLORATORY_THRESHOLDS);
const { source, groups } = SENOO_READOUT_SOURCE;
type StageId = typeof SENOO_REPLAY_STAGES[number]['id'];
const nominalStates: Record<StageId, readonly [SenooApparatusState, SenooApparatusState]> = {
  loading: ['unknown', 'unknown'],
  preimage: ['unknown', 'unknown'],
  rearrange: ['unknown', 'unknown'],
  prepare: ['m0', 'm1'],
  'clock-1': ['m0', 'g0'],
  'image-1': ['m0', 'g0'],
  rotate: ['m1', 'removed'],
  'clock-2': ['g0', 'removed'],
  'image-2': ['g0', 'removed'],
  decision: ['removed', 'removed'],
};
const firstExposureComplete = SENOO_REPLAY_STAGES.findIndex(stage => stage.id === 'rotate');

export function senooReplaySample(groupId: GroupId, sourceIndex: number) {
  const group = groups.find(candidate => candidate.id === groupId);
  const point = group?.points[sourceIndex];
  if (!group || !point) throw new RangeError('图 2b 的制备组或样本序号无效。');
  return {
    groupId,
    pointId: point.id,
    sourceIndex: point.sourceIndex,
    sheet: group.sheet,
    cells: { first: `${point.sourceColumn}2`, second: `${point.sourceColumn}3` },
    counts: { first: point.first, second: point.second },
  };
}

type ReplaySample = ReturnType<typeof senooReplaySample>;

export function senooReplayFrame(sample: ReplaySample, position: number) {
  const cursor = Number.isFinite(position) ? Math.max(0, Math.min(SENOO_REPLAY_LENGTH, position)) : 0;
  const index = Math.min(SENOO_REPLAY_LENGTH - 1, Math.floor(cursor));
  const stage = SENOO_REPLAY_STAGES[index];
  const [spin0, spin1] = nominalStates[stage.id];
  const state = sample.groupId === 'spin1' ? spin1 : sample.groupId === 'loss' && spin0 !== 'unknown' ? 'empty' : spin0;
  const secondReady = stage.id === 'decision';
  return {
    position: cursor,
    index,
    stage,
    state,
    firstCount: index >= firstExposureComplete ? sample.counts.first : null,
    secondCount: secondReady ? sample.counts.second : null,
    decision: secondReady ? classifyDualExposure(sample.counts, SENOO_REPLAY_RULE) : null,
  };
}

export function createSenooReplayRecord(sample: ReplaySample, position: number) {
  return {
    schema: 'senoo-literature-replay',
    version: 1,
    apparatus: { id: SENOO_APPARATUS_PROFILE.id, version: SENOO_APPARATUS_PROFILE.version },
    timebase: 'illustrative-stage-position',
    source: { doi: source.doi, figure: source.figure, workbook: source.workbook },
    sample,
    position: senooReplayFrame(sample, position).position,
    rule: SENOO_REPLAY_RULE,
  } as const;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function importSenooReplayRecord(text: string) {
  let value: Record<string, unknown>;
  try {
    value = object(JSON.parse(text));
  } catch {
    throw new Error('文件中的 JSON 无效。');
  }
  if (value.schema !== 'senoo-literature-replay' || value.version !== 1) {
    throw new Error('请选择 Senoo 文献回放 v1 JSON。');
  }
  const { id, version } = object(value.apparatus);
  if (id !== SENOO_APPARATUS_PROFILE.id || version !== SENOO_APPARATUS_PROFILE.version
      || value.timebase !== 'illustrative-stage-position') {
    throw new Error('装置版本或回放时基不匹配。');
  }
  const savedSource = object(value.source);
  const workbook = object(savedSource.workbook);
  if (savedSource.doi !== source.doi || savedSource.figure !== source.figure
      || workbook.file !== source.workbook.file || workbook.sha256 !== source.workbook.sha256) {
    throw new Error('图源版本或工作簿哈希不匹配。');
  }
  const { groupId, sourceIndex, pointId, sheet, cells, counts } = object(value.sample);
  if ((groupId !== 'loss' && groupId !== 'spin0' && groupId !== 'spin1')
      || typeof sourceIndex !== 'number' || !Number.isInteger(sourceIndex)) {
    throw new Error('图 2b 的制备组或样本序号无效。');
  }
  const sample = senooReplaySample(groupId, sourceIndex);
  if (pointId !== sample.pointId || sheet !== sample.sheet
      || object(cells).first !== sample.cells.first || object(cells).second !== sample.cells.second
      || object(counts).first !== sample.counts.first || object(counts).second !== sample.counts.second) {
    throw new Error('样本计数或单元格与图 2b 源表不匹配。');
  }
  const rule = object(value.rule);
  if (rule.id !== SENOO_REPLAY_RULE.id || rule.version !== SENOO_REPLAY_RULE.version
      || rule.mode !== SENOO_REPLAY_RULE.mode || rule.highComparison !== SENOO_REPLAY_RULE.highComparison
      || object(rule.thresholds).first !== SENOO_REPLAY_RULE.thresholds.first
      || object(rule.thresholds).second !== SENOO_REPLAY_RULE.thresholds.second
      || Object.entries(SENOO_REPLAY_RULE.outcomes).some(([key, outcome]) => object(rule.outcomes)[key] !== outcome)) {
    throw new Error('探索判决规则与当前回放版本不匹配。');
  }
  const position = value.position;
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > SENOO_REPLAY_LENGTH) {
    throw new Error('回放进度超出范围。');
  }
  return createSenooReplayRecord(sample, position);
}
