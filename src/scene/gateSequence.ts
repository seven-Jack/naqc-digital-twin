import type { MachineGate } from '../physics/quantumComputer';
import type { MachineStage } from '../data/machineProfile';
import { munizEvidence } from '../data/hardwareEvidence';

// Muniz et al., Fig. 3a. The thirds are illustrative fractions of the replay clock.
const sequences = {
  H: ['raman'],
  CZ: ['clock-shelve', 'rydberg', 'clock-return'],
} as const;

export type GatePulse = typeof sequences[keyof typeof sequences][number];

export const pulseDetails = {
  raman: {
    label: '局域拉曼旋转', light: '双光子 Raman', transition: '|0⟩ ↔ |1⟩',
    description: '两束局域光经虚能级耦合 ¹S₀ 的两个核自旋态。一次拉曼 X(π/2) 旋转配合前后的虚拟 Z(π/2) 旋转，实现 H 门。',
  },
  'clock-shelve': {
    label: '钟跃迁转存', light: `${munizEvidence.shelvingNm} nm`, transition: '|1⟩ → |c⟩',
    description: '对参与的两个比特同时施加 578 nm 钟光。实验用 Blackman 整形的 Y(π/2) → X(π) → Y(π/2) 复合脉冲将 |1⟩ 转入亚稳钟态 |c⟩，|0⟩ 留在基态。',
  },
  rydberg: {
    label: '里德堡激发与阻塞', light: `${munizEvidence.rydbergNm} nm`, transition: '|c⟩ ↔ |r⟩',
    description: '相位调制的紫外脉冲耦合 |c⟩ 和 |r⟩。里德堡阻塞抑制双激发 |rr⟩，使 |cc⟩ 主要耦合到对称的单激发态。理想脉冲结束时，各分量回到原能级，两比特积累 π 条件相位。',
  },
  'clock-return': {
    label: '钟跃迁返回', light: `${munizEvidence.shelvingNm} nm`, transition: '|c⟩ → |1⟩',
    description: '第二个复合钟脉冲将 |c⟩ 送回 |1⟩。用虚拟 Z 旋转补偿单比特相位后，理想 CZ 使 |11⟩ 变为 −|11⟩，其余三个计算基分量的系数保持原值。',
  },
} as const satisfies Record<GatePulse, { label: string; light: string; transition: string; description: string }>;

export function gatePulses(gate: MachineGate['name']) {
  return sequences[gate];
}

export function pulseAt(gate: MachineGate['name'], gateProgress: number) {
  const pulses = gatePulses(gate);
  return pulses[Math.max(0, Math.min(pulses.length - 1, Math.floor(gateProgress * pulses.length)))];
}

/** Inclusive whole-millisecond interval on the existing, half-open machine timeline. */
export function gateClip(stage: MachineStage, gateCount: number, gateIndex: number, stepIndex = 0, stepCount = 1) {
  const intervals = gateCount * stepCount;
  const position = gateIndex * stepCount + stepIndex;
  const boundary = (i: number) => stage.startMs + Math.ceil(stage.durationMs * i / intervals);
  return { startMs: boundary(position), endMs: boundary(position + 1) - 1 };
}
