import { C } from '../physics/constants';
import { nm } from '../physics/units';

const clockFrequencyHz = 518_295_836_590_863.632;
export const atomicData = {
  version: 'R009-rounded-532-v1',
  evidence: 'conditional_theory',
  trapWavelengthM: nm(532),
  clockWavelengthM: C / clockFrequencyHz,
  clockFrequencyHz,
  clockFrequencyCipmText: '518295836590863.632',
  alphaGroundAu: 257.91,
  alphaExcitedAu: 99.98,
  source: '极化率取自 Calculation R009 对 Höhn 等 ¹⁷⁴Yb 经验模型的计算，舍入后作为 ¹⁷¹Yb 的近似输入',
  sourceUrl: 'https://doi.org/10.1103/PhysRevA.108.053325',
  calculationUrl: 'https://github.com/seven-Jack/Calculation/issues/23',
  referenceRun: 'R009_yb171_clock_polarizability/results/20261031T112331.757267Z',
  uncertainty: '¹⁷¹Yb 的完整标准不确定度仍待确定',
} as const;

export const assumptions = [
  '钟激光以 π 偏振驱动 ¹⁷¹Yb 的 ¹S₀ ↔ ³P₀ 跃迁，两态均取 F = ½、mF = +½。',
  '532 nm 光镊为圆对称高斯光束，采用理想线偏振与标量极化率。',
  '各位点独立且参数相同，原子位于各自的束腰处。578 nm 驱动在空间上均匀。',
  '原子静止于焦点。封闭两能级系统受方波脉冲驱动，采用旋波近似。',
  '阱频与振动能级由焦点附近的谐振近似估算。',
  '模型忽略塞曼频移、运动相关耦合、散射、加热、退相干与探测过程。',
];
