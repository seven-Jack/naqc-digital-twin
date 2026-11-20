import { describe, expect, it } from 'vitest';
import { evidenceKinds, evidenceRoute, resolveEvidenceRoute, twinSubsystems, type EvidenceFilter } from '../src/data/twinEvidence';

describe('整机子系统证据地址', () => {
  it('每个子系统及可用证据类型都能从其地址恢复', () => {
    const filters: EvidenceFilter[] = ['all', ...Object.keys(evidenceKinds) as (keyof typeof evidenceKinds)[]];
    for (const filter of filters) {
      const eligible = twinSubsystems.filter(system => filter === 'all' || system.records.some(record => record.kind === filter));
      expect(eligible.length).toBeGreaterThan(0);
      for (const entry of eligible) {
        const route = resolveEvidenceRoute(evidenceRoute(entry.id, filter));
        expect(route.filter).toBe(filter);
        expect(route.selected.id).toBe(entry.id);
        expect(route.visible).toEqual(eligible);
      }
    }
  });

  it('无效或不相容的分享地址能落在当前筛选的有效子系统', () => {
    expect(resolveEvidenceRoute('#evidence/bell?kind=comparison').selected.id).toBe('transport');
    expect(resolveEvidenceRoute('#evidence/obsolete?kind=comparison').selected.id).toBe('transport');
    expect(resolveEvidenceRoute('#evidence/bell?kind=constructor').filter).toBe('all');
    expect(resolveEvidenceRoute('#evidence/bell?kind=constructor').selected.id).toBe('bell');
    expect(resolveEvidenceRoute('#evidence').selected.id).toBe('array');
  });
});
