import { describe, expect, it } from 'vitest';
import { createMachineRun, DEFAULT_MACHINE_CONFIG, machineFrame, type CircuitId } from '../src/physics/quantumComputer';
import { gateClip, gatePulses, pulseAt } from '../src/scene/gateSequence';
import { projectMachineScene } from '../src/scene/machineSceneFrame';

describe('电路门、门操作面板与三维光路的共同时间轴', () => {
  it.each<CircuitId>(['bell', 'ghz', 'superposition'])('%s 的每个脉冲起末帧对应正确的门、寻址比特与光路', circuit => {
    const run = createMachineRun({ ...DEFAULT_MACHINE_CONFIG, circuit });
    const stage = run.plan.timeline.stages.find(item => item.id === 'gates')!;
    const gates = run.circuit.gates;
    let nextMs = stage.startMs;
    for (const [i, gate] of gates.entries()) {
      const steps = gatePulses(gate.name);
      for (const [j, step] of steps.entries()) {
        const clip = gateClip(stage, gates.length, i, j, steps.length);
        expect(clip.startMs).toBe(nextMs);
        for (const t of [clip.startMs, clip.endMs]) {
          const frame = machineFrame(run, t);
          expect(frame.gateIndex).toBe(i);
          expect(frame.activeQubits).toEqual(gate.qubits);
          expect(pulseAt(gate.name, frame.gateProgress!)).toBe(step);
          expect(projectMachineScene(frame, run.profile).activePath?.id).toBe(step);
        }
        nextMs = clip.endMs + 1;
      }
    }
    expect(nextMs).toBe(stage.endMs);
  });
});
