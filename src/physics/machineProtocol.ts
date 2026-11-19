import { buildTimeline, type MachineProfile, type MachineStageId } from '../data/machineProfile';
import type { MachineAtom, MachineMove } from './quantumComputer';
import type { MachineEventSchedule } from './machineSchedule';

export type MachineProtocol = 'standard' | 'bell-replenishment';

export interface MachinePlan {
  protocol: MachineProtocol;
  timeline: MachineProfile['timeline'];
}

export interface OccupancyObservation {
  id: string;
  phase: 'initial' | 'recheck';
  startedMs: number;
  availableMs: number;
  sites: readonly { id: string; row: number; column: number; occupied: boolean }[];
}

export interface OccupancyDecision {
  id: string;
  observationId: string;
  availableMs: number;
  result: 'replenish' | 'continue' | 'skip';
}

export interface MachineEvent {
  id: string;
  stageId: MachineStageId;
  kind: 'operation' | 'observe' | 'decide';
  status: 'executed' | 'skipped';
  startMs: number;
  endMs: number;
  dependsOn: readonly string[];
  reason?: 'filled' | 'vacant' | 'no-source' | 'atom-lost';
  schedule?: MachineEventSchedule;
}

export interface MachineAttemptRecord {
  attemptId: string;
  events: readonly MachineEvent[];
  observations: readonly OccupancyObservation[];
  decisions: readonly OccupancyDecision[];
  initialAtoms: readonly MachineAtom[];
  loadedAtoms?: readonly MachineAtom[];
  initialMoves?: readonly MachineMove[];
  replenishedAtoms: readonly MachineAtom[];
  move: MachineMove | null;
}

export interface OccupancyPlayback {
  observations: readonly OccupancyObservation[];
  decisions: readonly OccupancyDecision[];
  replenishment: 'pending' | 'moving' | 'moved' | 'no-source' | null;
  exposing: boolean;
}

export function compileMachineProtocol(profile: MachineProfile, protocol: MachineProtocol): MachinePlan {
  if (protocol === 'standard') return { protocol, timeline: profile.timeline };
  const stages = profile.timeline.stages.flatMap(stage => stage.id === 'rearrangement' ? [
    stage,
    { id: 'occupancy-check' as const, label: '检查占位', durationMs: 900, description: '合成曝光结束后生成占位观测，再判决是否需要补位。' },
    { id: 'replenishment' as const, label: '补位一次', durationMs: 1400, description: '若检测到空位，从储备阵列搬运一枚原子补位，至多执行一次。' },
    { id: 'occupancy-recheck' as const, label: '复查与判决', durationMs: 900, description: '复查寄存器，填满后继续；仍有空位则跳过制备、门和读出。' },
  ] : [stage]);
  return { protocol, timeline: buildTimeline(stages) };
}

export const postCheckStages: readonly MachineStageId[] = ['preparation', 'transfer', 'gates', 'analysis', 'return', 'readout'];
