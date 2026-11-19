import { describe, expect, it } from 'vitest';
import type { MachineEvent } from '../src/physics/machineProtocol';
import { validateMachineSchedule, type MachineEventSchedule } from '../src/physics/machineSchedule';

type Event = MachineEvent & { schedule: MachineEventSchedule };
const clockId = 'illustrative-attempt-ms';
const options = { clockId, durationMs: 1500 };

function operation(id: string, startMs: number, endMs: number, ...resourceIds: string[]): Event {
  return {
    id, stageId: 'transfer', kind: 'operation', status: 'executed', startMs, endMs, dependsOn: [],
    schedule: { clockId, planned: { startMs, endMs }, targetIds: ['A2'], resourceIds },
  };
}

describe('machine schedule validation', () => {
  it('allows two handoff beams at one target and updates serial actions on the same boundary', () => {
    const reservoir = operation('reservoir-ramp', 20, 80, 'reservoir-beam');
    const science = operation('science-ramp', 20, 80, 'science-beam');
    const stable = operation('stable-science-trap', 80, 150, 'science-beam');
    stable.dependsOn = [reservoir.id, science.id];
    const skipped: Event = { ...operation('unused-science-trap', 30, 100, 'science-beam'), status: 'skipped' };
    expect(() => validateMachineSchedule([stable, science, skipped, reservoir], options)).not.toThrow();
  });

  it('detects overlap on an AOD or camera even at distinct targets', () => {
    for (const resourceId of ['aod', 'camera']) {
      const first = operation('first', 30, 90, resourceId);
      const second = operation('second', 89, 115, resourceId);
      second.schedule = { ...second.schedule, targetIds: ['A3'] };
      expect(() => validateMachineSchedule([first, second], options)).toThrow(`资源 ${resourceId} 冲突：first 与 second`);
    }
  });

  it('requires a real observation and waits separately for available data and decision', () => {
    const observation: Event = {
      ...operation('observe', 100, 200, 'camera'), stageId: 'occupancy-check', kind: 'observe',
      schedule: {
        clockId, planned: { startMs: 90, endMs: 190 }, exposure: { startMs: 120, endMs: 180 }, availableMs: 230,
        targetIds: ['A2'], resourceIds: ['camera'],
      },
    };
    const decision: Event = {
      ...operation('decide', 220, 250), stageId: 'occupancy-check', kind: 'decide', dependsOn: [observation.id],
    };
    const refill: Event = {
      ...operation('refill', 250, 350, 'aod'), stageId: 'replenishment', dependsOn: [decision.id],
    };
    expect(() => validateMachineSchedule([observation, decision, refill], options)).toThrow('事件 decide 在依赖 observe 可用前开始');

    decision.startMs = 230;
    decision.schedule = { ...decision.schedule, availableMs: 270 };
    expect(() => validateMachineSchedule([observation, decision, refill], options)).toThrow('事件 refill 在依赖 decide 可用前开始');

    refill.startMs = 270;
    expect(() => validateMachineSchedule([observation, decision, refill], options)).not.toThrow();
    expect(() => validateMachineSchedule([{ ...observation, status: 'skipped' }, decision, refill], options))
      .toThrow('判决 decide 缺少已执行的观测依赖');
  });

  it('rejects missing dependencies, zero-duration cycles and clocks without alignment', () => {
    const a: Event = { ...operation('a', 20, 20), dependsOn: ['b'] };
    const b: Event = { ...operation('b', 20, 20), dependsOn: ['a'] };
    expect(() => validateMachineSchedule([a], options)).toThrow('缺失依赖 b');
    expect(() => validateMachineSchedule([a, b], options)).toThrow('存在循环');

    const offClock = operation('other-clock', 30, 50, 'camera');
    offClock.schedule = { ...offClock.schedule, clockId: 'camera-trigger' };
    expect(() => validateMachineSchedule([offClock], options)).toThrow('时钟未与运行时基对齐');
  });
});
