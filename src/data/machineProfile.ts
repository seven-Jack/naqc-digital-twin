import { MUNIZ_DEMO_SCENE, MUNIZ_DEMO_WAVELENGTHS_NM, type MachineSceneProfile } from './machineSceneProfile';

const wavelengths = MUNIZ_DEMO_WAVELENGTHS_NM;
const stageDefinitions = [
  { id: 'cooling', label: '冷却与俘获', durationMs: 1100, description: '磁光阱汇集并冷却原子，为光镊装载准备原子样品。' },
  { id: 'loading', label: '光镊装载', durationMs: 1500, description: `装载 ${wavelengths.reservoir} nm 储备阱，并根据预先成像获得各位点的占据状态。` },
  { id: 'rearrangement', label: '原子重排', durationMs: 1750, description: '移动光镊沿空阱位搬运原子，填充电路所需的寄存器。' },
  { id: 'preparation', label: '量子态制备', durationMs: 1150, description: '在储备阱中进一步冷却，并用光抽运将已分配的原子制备到 |0⟩。' },
  { id: 'transfer', label: '转入计算阱', durationMs: 700, description: `同步降低储备阱光功率并提高同位置的 ${wavelengths.science} nm 计算阱光功率。` },
  { id: 'gates', label: '量子门操作', durationMs: 2450, description: '在计算阱内用拉曼光执行单比特门，用钟跃迁与里德堡相互作用实现 CZ。' },
  { id: 'analysis', label: '测量基旋转', durationMs: 600, description: 'X 基测量先做单比特基变换，再进行计算基荧光读出。Z 基直接读出。' },
  { id: 'return', label: '转回储备阱', durationMs: 700, description: '降低计算阱光功率并恢复同位置的储备阱，以便态选择性成像。' },
  { id: 'readout', label: '荧光读出', durationMs: 2050, description: '以态选择性荧光读出首轮寄存器，并累计各轮有效测量。' },
] as const;

export type MachineStageId = typeof stageDefinitions[number]['id']
  | 'occupancy-check' | 'replenishment' | 'occupancy-recheck';

export interface MachineStage {
  readonly id: MachineStageId;
  readonly label: string;
  readonly description: string;
  readonly durationMs: number;
  readonly startMs: number;
  readonly endMs: number;
}

export interface MachineProfile {
  readonly id: string;
  readonly label: string;
  readonly readoutBrightBit: '0' | '1';
  readonly array: {
    readonly rows: number;
    readonly columns: number;
    readonly registerRow: number;
  };
  readonly timeline: {
    readonly stages: readonly MachineStage[];
    readonly durationMs: number;
  };
  readonly scene: MachineSceneProfile;
}

export function buildTimeline(definitions: readonly Omit<MachineStage, 'startMs' | 'endMs'>[]): MachineProfile['timeline'] {
  let durationMs = 0;
  const stages = definitions.map(stage => {
    const startMs = durationMs;
    durationMs += stage.durationMs;
    return { ...stage, startMs, endMs: durationMs };
  });
  return { stages, durationMs };
}

// Schematic playback based on Muniz et al., Fig. 1 and Appendix A (10.1103/PRXQuantum.6.020334).
// The array layout, route and timings are illustrative. Wavelengths are literature context.
export const MUNIZ_DEMO_PROFILE: MachineProfile = {
  id: 'muniz-483-460-demo',
  label: `${wavelengths.reservoir}/${wavelengths.science} nm 演示配置`,
  readoutBrightBit: '0',
  array: { rows: 6, columns: 8, registerRow: 3 },
  timeline: buildTimeline(stageDefinitions),
  scene: MUNIZ_DEMO_SCENE,
};
