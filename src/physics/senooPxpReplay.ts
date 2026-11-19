import {
  SENOO_PXP_OBSERVATIONS, SENOO_PXP_SOURCE, type SenooPxpObservationStageId, type SenooPxpPoint,
} from '../data/senooPxpSource';

export type { SenooPxpObservationStageId } from '../data/senooPxpSource';
export type SenooPxpStageId = 'pxp' | SenooPxpObservationStageId;

// The channel lists name the pulses used in each step. Composite steps list them in order.
export const SENOO_PXP_STAGES = [
  {
    id: 'pxp', label: 'PXP 阻塞制备', state: 'rydberg-pair', channels: ['rydberg'],
    description: '两原子在 302 nm 驱动下演化至目标单激发叠加态。映射前的四态布居和奇偶观测待补。',
  },
  {
    id: 'r-to-m', label: 'r→m 映射', state: 'metastable-odd-pair', channels: ['raman', 'rydberg'],
    description: '依次施加亚稳态 π 脉冲、里德堡 π 脉冲。此处展示映射后的亚稳态奇子空间布居。',
  },
  {
    id: 'rotate', label: 'X(π/2) 旋转', state: 'metastable-even-pair', channels: ['raman'],
    description: '对两原子共同施加 X(π/2)，将目标态转入亚稳态偶 Bell 子空间。图 2f 上方给出这一阶段的布居和奇偶。',
  },
  {
    id: 'm-to-o', label: 'm→o 映射', state: 'clock-pair', channels: ['clock', 'raman'],
    description: '依次施加钟比特 π 脉冲、亚稳态 π 脉冲。图 2f 右下给出钟比特偶 Bell 的布居和奇偶。',
  },
] as const;

export interface SenooPxpReplaySelection {
  readonly stageId: SenooPxpStageId;
  readonly pointIds: Readonly<Record<SenooPxpObservationStageId, string>>;
}

const apparatus = { id: 'senoo-767nm-fig2f', version: 1 } as const;
const timebase = 'protocol-step';
const { doi, figure, workbook, derivedTable, selection: lossSelection, countProvenance } = SENOO_PXP_SOURCE;
const source = { doi, figure, workbook, derivedTable, selection: lossSelection, countProvenance } as const;

export function createSenooPxpSelection(): SenooPxpReplaySelection {
  return {
    stageId: 'pxp',
    pointIds: {
      'r-to-m': SENOO_PXP_OBSERVATIONS['r-to-m'].points[0].id,
      rotate: SENOO_PXP_OBSERVATIONS.rotate.points[0].id,
      'm-to-o': SENOO_PXP_OBSERVATIONS['m-to-o'].points[0].id,
    },
  };
}

function selectedPoint(stageId: SenooPxpObservationStageId, id: unknown): SenooPxpPoint {
  const point = SENOO_PXP_OBSERVATIONS[stageId].points.find(candidate => candidate.id === id);
  if (!point) throw new Error('所选观测与该步骤的图 2f 源单元格不符。');
  return point;
}

export function senooPxpReplayFrame(selection: SenooPxpReplaySelection) {
  const index = SENOO_PXP_STAGES.findIndex(stage => stage.id === selection.stageId);
  if (index < 0) throw new Error('图 2f 的回放步骤无效。');
  const stage = SENOO_PXP_STAGES[index];
  if (stage.id === 'pxp') return { stage, index, observations: null, point: null };
  return {
    stage, index, observations: SENOO_PXP_OBSERVATIONS[stage.id], point: selectedPoint(stage.id, selection.pointIds[stage.id]),
  };
}

export function createSenooPxpReplayRecord(selection: SenooPxpReplaySelection) {
  const { stage } = senooPxpReplayFrame(selection);
  return {
    schema: 'senoo-fig2f-replay',
    version: 1,
    apparatus,
    timebase,
    experimentalTimestampsS: null,
    source,
    selection: {
      stageId: stage.id,
      pointIds: {
        'r-to-m': selectedPoint('r-to-m', selection.pointIds['r-to-m']).id,
        rotate: selectedPoint('rotate', selection.pointIds.rotate).id,
        'm-to-o': selectedPoint('m-to-o', selection.pointIds['m-to-o']).id,
      },
    },
  } as const;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function importSenooPxpReplayRecord(text: string) {
  let value: Record<string, unknown>;
  try {
    value = object(JSON.parse(text));
  } catch {
    throw new Error('文件中的 JSON 无效。');
  }
  if (value.schema !== 'senoo-fig2f-replay' || value.version !== 1) {
    throw new Error('请选择 Senoo 图 2f 回放 v1 JSON。');
  }

  const savedApparatus = object(value.apparatus);
  if (savedApparatus.id !== apparatus.id || savedApparatus.version !== apparatus.version
      || value.timebase !== timebase || value.experimentalTimestampsS !== null) {
    throw new Error('装置版本或图 2f 回放时基不匹配。');
  }
  const savedSource = object(value.source);
  const savedWorkbook = object(savedSource.workbook);
  const savedTable = object(savedSource.derivedTable);
  if (savedSource.doi !== doi || savedSource.figure !== figure
      || savedWorkbook.file !== workbook.file || savedWorkbook.sha256 !== workbook.sha256
      || savedTable.file !== derivedTable.file || savedTable.sha256 !== derivedTable.sha256
      || savedSource.selection !== lossSelection || savedSource.countProvenance !== countProvenance) {
    throw new Error('图 2f 的工作簿、观测表或筛选条件不匹配。');
  }

  const selection = object(value.selection);
  const stage = SENOO_PXP_STAGES.find(candidate => candidate.id === selection.stageId);
  if (!stage) throw new Error('图 2f 的回放步骤无效。');
  const pointIds = object(selection.pointIds);
  return createSenooPxpReplayRecord({
    stageId: stage.id,
    pointIds: {
      'r-to-m': selectedPoint('r-to-m', pointIds['r-to-m']).id,
      rotate: selectedPoint('rotate', pointIds.rotate).id,
      'm-to-o': selectedPoint('m-to-o', pointIds['m-to-o']).id,
    },
  });
}
