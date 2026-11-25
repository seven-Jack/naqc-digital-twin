import { describe, expect, it } from 'vitest';
import { MUNIZ_DEMO_PROFILE } from '../src/data/machineProfile';
import { getDemoClockBinding } from '../src/data/yb171AtomicSnapshot';
import { importMachineRun } from '../src/physics/machineRunImport';
import { createMachineRun, machineExport, machineFrame } from '../src/physics/quantumComputer';

function bellRun(loadProbability = 0.62) {
  return createMachineRun({ shots: 64, seed: 171, loadProbability, readoutError: 0 },
    MUNIZ_DEMO_PROFILE, 'bell-replenishment');
}

describe('local machine run import', () => {
  it.each([0.62, 0.02])('round trips v3 saved events, geometry and counts at load probability %s', loadProbability => {
    const run = bellRun(loadProbability);
    const saved = JSON.stringify(machineExport(run));
    const imported = importMachineRun(saved);
    expect(JSON.parse(JSON.stringify(machineExport(imported)))).toEqual(JSON.parse(saved));
    for (const time of [0, 1800, 3400, 5000, 5900, 7350, 7550, 10930, 13279, 15200]) {
      expect(machineFrame(imported, time)).toEqual(machineFrame(run, time));
    }
    expect(imported.attempts[0].status).toBe(loadProbability === 0.62 ? 'measured' : 'assembly-failed');
  });

  it('keeps older v3 observation data and leaves the absent per-round load geometry unspecified', () => {
    const run = bellRun();
    const saved = {
      ...machineExport(run),
      atomicReference: undefined,
      records: run.records.map(({ events, ...record }) => {
        const { loadedAtoms: _atoms, initialMoves: _moves, ...legacyRecord } = record;
        return {
          ...legacyRecord,
          events: events.filter(event => !event.id.endsWith(':science-460')).map(({ schedule: _schedule, ...event }) => ({
            ...event, dependsOn: event.dependsOn.filter(id => !id.endsWith(':science-460')),
          })),
        };
      }),
    };
    const imported = importMachineRun(JSON.stringify(saved));
    expect(imported.records[1].loadedAtoms).toBeUndefined();
    expect(imported.records[1].initialMoves).toBeUndefined();
    expect(machineFrame(imported, 3400, 1)).toMatchObject({ geometryRecorded: false, activeMove: null });
    expect(imported.records[1].observations).toEqual(run.records[1].observations);
    expect(imported.records[1].events.filter(event => event.stageId === 'transfer')).toHaveLength(1);
    expect(imported).not.toHaveProperty('atomicReference');
  });

  it.each([
    ['transfer', 'gates'],
    ['return', 'readout'],
  ] as const)('preserves concurrent %s and requires both optical channels to finish before %s', (stage, next) => {
    const run = bellRun();
    const saved = machineExport(run);
    const imported = importMachineRun(JSON.stringify(saved));
    const [first, ...later] = imported.records;
    const handoff = first.events.filter(event => event.stageId === stage);
    expect(handoff.map(event => event.schedule?.resourceIds)).toEqual([['reservoir-483'], ['science-460']]);
    const successor = first.events.find(event => event.stageId === next)!;
    expect(successor.dependsOn).toEqual(handoff.map(event => event.id));
    const missingHandoffDependency = first.events.map(event => event.id === successor.id
      ? { ...event, dependsOn: [handoff[0].id] } : event);
    expect(() => importMachineRun(JSON.stringify({
      ...saved, records: [{ ...first, events: missingHandoffDependency }, ...later],
    }))).toThrow(/双光路换阱完成/);
    const overlappingSameResource = first.events.map(event => event.id === handoff[1].id
      ? { ...event, schedule: { ...event.schedule, resourceIds: ['reservoir-483'] } } : event);
    expect(() => importMachineRun(JSON.stringify({
      ...saved, records: [{ ...first, events: overlappingSameResource }, ...later],
    }))).toThrow(/资源 reservoir-483 冲突/);
  });

  it('preserves supported atomic snapshot provenance and rejects unknown bindings', () => {
    const reference = getDemoClockBinding(MUNIZ_DEMO_PROFILE.id)!;
    const saved = { ...machineExport(bellRun()), atomicReference: reference };
    expect(importMachineRun(JSON.stringify(saved))).toHaveProperty('atomicReference', reference);
    expect(() => importMachineRun(JSON.stringify({
      ...saved, atomicReference: { ...reference, snapshotVersion: 'unknown' },
    }))).toThrow(/atomicReference.*原子快照/);
  });

  it('plays the saved v2 representative geometry and statistics', () => {
    const run = createMachineRun({ circuit: 'ghz', basis: 'X', shots: 16, seed: 171 });
    const saved = JSON.stringify(machineExport(run));
    const imported = importMachineRun(saved);
    expect(imported.records).toEqual([]);
    expect(JSON.parse(JSON.stringify(machineExport(imported)))).toEqual(JSON.parse(saved));
    expect(machineFrame(imported, 12000)).toEqual(machineFrame(run, 12000));
  });

  it('validates replay metadata and preserves saved results without drawing again from the seed', () => {
    const run = bellRun();
    const saved = {
      ...machineExport(run), config: { ...run.config, seed: 999 },
      provenance: { kind: 'synthetic', protocol: run.plan.protocol, seed: 999, randomAlgorithm: 'mulberry32' },
    };
    const imported = importMachineRun(JSON.stringify(saved));
    expect(imported.config.seed).toBe(999);
    expect(imported.attempts).toEqual(run.attempts);
    expect(imported.samples).toEqual(run.samples);
  });

  it('rejects inconsistent counters, path endpoints and feedback references with field names', () => {
    const run = bellRun();
    const saved = machineExport(run);
    expect(() => importMachineRun(JSON.stringify({ ...saved, completedShots: 1 }))).toThrow(/completedShots/);
    expect(() => importMachineRun(JSON.stringify({
      ...saved, moves: run.moves.map(move => ({ ...move, path: [move.from] })),
    }))).toThrow(/moves\[0\]/);
    const [first, ...later] = run.records;
    const badDependency = {
      ...first, events: first.events.map(event => event.stageId === 'replenishment'
        ? { ...event, dependsOn: ['missing-decision'] } : event),
    };
    expect(() => importMachineRun(JSON.stringify({ ...saved, records: [badDependency, ...later] })))
      .toThrow(/records\[0\]\.events\[\d+\]\.dependsOn/);
    expect(() => importMachineRun('{"kind":')).toThrow(/有效的运行 JSON/);
  });
});
