import {
  classifyDualExposure, createDualExposureRule,
  type DualExposureThresholds, type ReadoutOutcome,
} from '../physics/dualExposureReadout';
import { SENOO_READOUT_SOURCE } from './senooReadoutSource';

export const DEFAULT_EXPLORATORY_THRESHOLDS: DualExposureThresholds = { first: 40, second: 40 };

const observationsByGroup = SENOO_READOUT_SOURCE.groups.map(group => ({
  groupId: group.id,
  label: group.label,
  observations: group.points.map(point => ({
    id: point.id,
    preparedGroup: group.id,
    counts: { first: point.first, second: point.second },
    source: {
      sheet: group.sheet,
      index: point.sourceIndex,
      column: point.sourceColumn,
      cells: { first: `${point.sourceColumn}2`, second: `${point.sourceColumn}3` },
    },
  })),
}));

export function evaluateSenooReadout(thresholds: DualExposureThresholds) {
  const rule = createDualExposureRule(thresholds);
  const evaluatedGroups = observationsByGroup.map(({ groupId, label, observations }) => {
    const counts: Record<ReadoutOutcome, number> = { m0: 0, m1: 0, 'no-atom': 0, ambiguous: 0 };
    const samples = observations.map(observation => {
      const decision = classifyDualExposure(observation.counts, rule);
      counts[decision.outcome]++;
      return { observation, decision };
    });
    return { row: { groupId, label, total: samples.length, counts }, samples };
  });
  return {
    schemaVersion: 1,
    kind: 'senoo-dual-exposure-decisions',
    source: { ...SENOO_READOUT_SOURCE.source, schemaVersion: SENOO_READOUT_SOURCE.schemaVersion },
    rule,
    rows: evaluatedGroups.map(group => group.row),
    samples: evaluatedGroups.flatMap(group => group.samples),
  } as const;
}
