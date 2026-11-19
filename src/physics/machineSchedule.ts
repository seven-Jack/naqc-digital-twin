import type { MachineEvent } from './machineProtocol';

export interface MachineTimeSpan {
  readonly startMs: number;
  readonly endMs: number;
}

export interface MachineEventSchedule {
  readonly clockId: string;
  readonly targetIds: readonly string[];
  /** Exclusive hardware claims. A shared target can use distinct resources. */
  readonly resourceIds: readonly string[];
  readonly planned: MachineTimeSpan;
  readonly exposure?: MachineTimeSpan;
  readonly availableMs?: number;
}

type ScheduledEvent = MachineEvent & { readonly schedule?: MachineEventSchedule };

interface ScheduleOptions {
  readonly durationMs?: number;
  readonly clockId?: string;
}

function validTime(value: number, durationMs: number) {
  return Number.isFinite(value) && value >= 0 && value <= durationMs;
}

function validateSpan(span: MachineTimeSpan | undefined, durationMs: number, context: string) {
  if (!span || !validTime(span.startMs, durationMs) || !validTime(span.endMs, durationMs) || span.endMs < span.startMs) {
    throw new Error(`${context}的时间区间无效。`);
  }
}

function validateIds(ids: readonly string[], context: string) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error(`${context}含空、无效或重复 ID。`);
  }
}

export function validateMachineSchedule(events: readonly ScheduledEvent[], options: ScheduleOptions = {}): void {
  const durationMs = options.durationMs ?? Infinity;
  if (options.durationMs !== undefined && !validTime(options.durationMs, Infinity)) {
    throw new Error('调度时长无效。');
  }
  const clockId = options.clockId ?? events.find(event => event.schedule)?.schedule?.clockId;
  const byId = new Map<string, ScheduledEvent>();
  const claims = new Map<string, ScheduledEvent[]>();
  for (const event of events) {
    if (typeof event.id !== 'string' || !event.id.trim() || byId.has(event.id)) {
      throw new Error(`事件 ID 为空或重复：${event.id}`);
    }
    byId.set(event.id, event);
    validateSpan(event, durationMs, `事件 ${event.id}`);
    validateIds(event.dependsOn, `事件 ${event.id} 的依赖`);
    const schedule = event.schedule;
    if (schedule === undefined) continue;
    if (!schedule || typeof schedule.clockId !== 'string' || !schedule.clockId.trim() || schedule.clockId !== clockId) {
      throw new Error(`事件 ${event.id} 的时钟未与运行时基对齐。`);
    }
    validateSpan(schedule.planned, durationMs, `事件 ${event.id} 的计划`);
    validateIds(schedule.targetIds, `事件 ${event.id} 的目标`);
    validateIds(schedule.resourceIds, `事件 ${event.id} 的资源`);
    if (schedule.exposure !== undefined) {
      validateSpan(schedule.exposure, durationMs, `事件 ${event.id} 的曝光`);
      if (event.kind !== 'observe' || schedule.exposure.startMs < event.startMs || schedule.exposure.endMs > event.endMs) {
        throw new Error(`事件 ${event.id} 的曝光与观测执行区间不一致。`);
      }
    }
    if (schedule.availableMs !== undefined) {
      if (!validTime(schedule.availableMs, durationMs) || schedule.availableMs < event.endMs) {
        throw new Error(`事件 ${event.id} 的结果可用时刻早于事件结束或超出运行时段。`);
      }
    }
    if (event.status === 'executed' && event.startMs < event.endMs) {
      for (const resource of schedule.resourceIds) {
        const active = claims.get(resource) ?? [];
        active.push(event);
        claims.set(resource, active);
      }
    }
  }

  const remaining = new Map<string, number>();
  const consumers = new Map<string, string[]>();
  for (const event of events) {
    remaining.set(event.id, event.dependsOn.length);
    let usesObservation = false;
    for (const id of event.dependsOn) {
      const dependency = byId.get(id);
      if (!dependency) throw new Error(`事件 ${event.id} 引用缺失依赖 ${id}。`);
      if ((dependency.schedule?.availableMs ?? dependency.endMs) > event.startMs) {
        throw new Error(`事件 ${event.id} 在依赖 ${id} 可用前开始。`);
      }
      usesObservation ||= dependency.kind === 'observe' && dependency.status === 'executed';
      const downstream = consumers.get(id) ?? [];
      downstream.push(event.id);
      consumers.set(id, downstream);
    }
    if (event.kind === 'decide' && event.status === 'executed' && !usesObservation) {
      throw new Error(`判决 ${event.id} 缺少已执行的观测依赖。`);
    }
  }

  const ordered = events.filter(event => event.dependsOn.length === 0).map(event => event.id);
  for (let index = 0; index < ordered.length; index++) {
    for (const id of consumers.get(ordered[index]) ?? []) {
      const count = remaining.get(id)! - 1;
      remaining.set(id, count);
      if (count === 0) ordered.push(id);
    }
  }
  if (ordered.length !== events.length) {
    const id = events.find(event => remaining.get(event.id)! > 0)?.id;
    throw new Error(`事件 ${id} 的依赖存在循环。`);
  }

  for (const [resource, active] of claims) {
    active.sort((left, right) => left.startMs - right.startMs);
    for (let index = 1; index < active.length; index++) {
      const previous = active[index - 1];
      const next = active[index];
      if (next.startMs < previous.endMs) {
        throw new Error(`资源 ${resource} 冲突：${previous.id} 与 ${next.id} 同时占用。`);
      }
    }
  }
}
