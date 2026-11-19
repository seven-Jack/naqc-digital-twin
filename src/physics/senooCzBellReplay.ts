import {
  SENOO_CZ_BELL_OBSERVATIONS, SENOO_CZ_BELL_SOURCE, type SenooCzBellObservationStageId,
} from '../data/senooCzBellSource';
import type { SenooPxpPoint } from '../data/senooPxpSource';

export type { SenooCzBellObservationStageId } from '../data/senooCzBellSource';
export type SenooCzBellStageId = 'prepare' | 'cz' | SenooCzBellObservationStageId;

export const SENOO_CZ_BELL_STAGES = [
  {
    id: 'prepare', label: 'X(π/2) 制备', state: 'metastable-pair', channels: ['raman'],
    description: '图 1b 的初态为 m₁m₁。先对两原子共同施加 X(π/2) 旋转。',
  },
  {
    id: 'cz', label: 'CZ 驱动', state: 'metastable-pair', channels: ['rydberg'],
    description: '用 302 nm 里德堡驱动实现目标 CZ。实际控制波形和门时标待测。',
  },
  {
    id: 'measure-m', label: '亚稳态 Bell 分析', state: 'metastable-even-pair', channels: ['raman'],
    description: '在 CZ 后施加虚拟 Z(π/2) 和共同 X(π/2)。图 1b–c 的亚稳态支路提供布居和奇偶观测。',
  },
  {
    id: 'm-to-o', label: 'm→o 映射', state: 'clock-pair', channels: ['clock', 'raman'],
    description: '依次施加钟比特 π 脉冲、亚稳态 π 脉冲。图 1d 提供钟比特的布居和奇偶观测。',
  },
] as const;

export interface SenooCzBellReplaySelection {
  readonly stageId: SenooCzBellStageId;
  readonly pointIds: Readonly<Record<SenooCzBellObservationStageId, string>>;
}

const apparatus = { id: 'senoo-767nm-fig1cd', version: 1 } as const;
const timebase = 'protocol-step';
const { doi, figure, workbook, derivedTables, selection: lossSelection, countProvenance, fidelityCondition } = SENOO_CZ_BELL_SOURCE;
const source = { doi, figure, workbook, derivedTables, selection: lossSelection, countProvenance, fidelityCondition } as const;

export function createSenooCzBellSelection(): SenooCzBellReplaySelection {
  return {
    stageId: 'prepare',
    pointIds: {
      'measure-m': SENOO_CZ_BELL_OBSERVATIONS['measure-m'].points[0].id,
      'm-to-o': SENOO_CZ_BELL_OBSERVATIONS['m-to-o'].points[0].id,
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stageIndex(stageId: unknown) {
  const index = SENOO_CZ_BELL_STAGES.findIndex(stage => stage.id === stageId);
  if (index < 0) throw new Error('图 1c–d 的回放步骤无效。');
  return index;
}

function selectedPoint(stageId: SenooCzBellObservationStageId, id: unknown): SenooPxpPoint {
  const point = SENOO_CZ_BELL_OBSERVATIONS[stageId].points.find(candidate => candidate.id === id);
  if (!point) throw new Error('所选观测与该步骤的图 1c–d 源单元格不符。');
  return point;
}

export function senooCzBellReplayFrame(selection: SenooCzBellReplaySelection) {
  const index = stageIndex(selection.stageId);
  const stage = SENOO_CZ_BELL_STAGES[index];
  if (stage.id === 'prepare' || stage.id === 'cz') return { stage, index, observations: null, point: null };
  return {
    stage, index, observations: SENOO_CZ_BELL_OBSERVATIONS[stage.id], point: selectedPoint(stage.id, selection.pointIds[stage.id]),
  };
}

function replayRecord(stageId: unknown, pointIds: Record<string, unknown>) {
  const stage = SENOO_CZ_BELL_STAGES[stageIndex(stageId)];
  return {
    schema: 'senoo-cz-bell-replay',
    version: 1,
    apparatus,
    timebase,
    experimentalTimestampsS: null,
    source,
    selection: {
      stageId: stage.id,
      pointIds: {
        'measure-m': selectedPoint('measure-m', pointIds['measure-m']).id,
        'm-to-o': selectedPoint('m-to-o', pointIds['m-to-o']).id,
      },
    },
  } as const;
}

export function createSenooCzBellReplayRecord(selection: SenooCzBellReplaySelection) {
  return replayRecord(selection.stageId, selection.pointIds);
}

export function importSenooCzBellReplayRecord(text: string) {
  let value: Record<string, unknown>;
  try {
    value = object(JSON.parse(text));
  } catch {
    throw new Error('文件中的 JSON 无效。');
  }
  if (value.schema !== 'senoo-cz-bell-replay' || value.version !== 1) {
    throw new Error('请选择 Senoo 图 1c–d 回放 v1 JSON。');
  }
  const savedApparatus = object(value.apparatus);
  if (savedApparatus.id !== apparatus.id || savedApparatus.version !== apparatus.version
      || value.timebase !== timebase || value.experimentalTimestampsS !== null) {
    throw new Error('装置版本或图 1c–d 回放时基不匹配。');
  }
  const savedSource = object(value.source);
  const savedWorkbook = object(savedSource.workbook);
  const savedTables = object(savedSource.derivedTables);
  const matchingTables = Object.entries(derivedTables).every(([panel, expected]) => {
    const table = object(savedTables[panel]);
    return table.file === expected.file && table.sha256 === expected.sha256;
  });
  if (savedSource.doi !== doi || savedSource.figure !== figure
      || savedWorkbook.file !== workbook.file || savedWorkbook.sha256 !== workbook.sha256 || !matchingTables
      || savedSource.selection !== lossSelection || savedSource.countProvenance !== countProvenance
      || savedSource.fidelityCondition !== fidelityCondition) {
    throw new Error('图 1c–d 的工作簿、观测表或筛选条件不匹配。');
  }
  const selection = object(value.selection);
  return replayRecord(selection.stageId, object(selection.pointIds));
}
