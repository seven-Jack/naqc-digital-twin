import { auditCzPilotRows, parseCzPilotRows, type CzPilotDifference } from './senooCzPilotSchedule';
import {
  SENOO_CZ_RESPONSE_INPUTS, SENOO_CZ_RESPONSE_OUTCOMES,
  type SenooCzResponse, type SenooCzResponseAttempt, type SenooCzResponseOutcome,
} from './senooCzResponse';

const responseHeader = [
  'planned_id', 'planned_block', 'slot_in_block', 'planned_input', 'actual_run_id', 'actual_attempt_id',
  'actual_input', 'actual_prep', 'actual_outcome', 'actual_log_ref',
] as const;

const responseLayout = Array.from({ length: 12 }, (_, block) =>
  [0, 1, 3, 2].map(index => SENOO_CZ_RESPONSE_INPUTS[(index + block) % SENOO_CZ_RESPONSE_INPUTS.length]),
);

export function parseSenooCzResponsePilotSchedule(text: string) {
  return parseCzPilotRows(text, responseHeader, responseLayout, 'CZR').map(({ fields, ...plan }) => {
    const [runId, attemptId, input, prep, outcome, sourceRef] = fields;
    const actual = fields.some(Boolean) ? { runId, attemptId, input, prep, outcome, sourceRef } : null;
    return { ...plan, actual };
  });
}

type ResponsePlan = ReturnType<typeof parseSenooCzResponsePilotSchedule>[number];

function summarizeResponseAttempts(attempts: readonly SenooCzResponseAttempt[]) {
  const counts = Object.fromEntries(SENOO_CZ_RESPONSE_OUTCOMES.map(outcome => [outcome, 0])) as Record<SenooCzResponseOutcome, number>;
  let rejected = 0;
  for (const attempt of attempts) {
    if (attempt.prep === 'rejected') rejected++;
    else counts[attempt.outcome]++;
  }
  const unresolvedTerminal = counts.ambiguous + counts.unavailable;
  const physicalLoss = counts['first-site-loss'] + counts['second-site-loss'] + counts['pair-loss'];
  return {
    started: attempts.length, accepted: attempts.length - rejected, rejected, unresolvedTerminal, physicalLoss,
    comparisonUnresolved: unresolvedTerminal + physicalLoss, counts,
  };
}

export function auditSenooCzResponsePilotSchedule(schedule: readonly ResponsePlan[], batch: SenooCzResponse) {
  const audit = auditCzPilotRows(schedule, batch.attempts, {
    runId: batch.acquisitionRunId,
    identify: attempt => ({ attemptId: attempt.attemptId, sourceRef: attempt.sourceRef }),
    compare: ({ plannedValue, actual }, attempt) => {
      const differences: CzPilotDifference[] = [];
      if (plannedValue !== attempt.input) {
        differences.push({ code: 'input-mismatch', field: 'planned_input', expected: plannedValue, observed: attempt.input });
      }
      if (!actual) return differences;
      const comparisons = [
        ['actual_input', attempt.input, actual.input], ['actual_prep', attempt.prep, actual.prep],
        ['actual_outcome', attempt.outcome, actual.outcome || null],
      ] as const;
      for (const [field, expected, observed] of comparisons) {
        if (expected !== observed) differences.push({ code: 'record-field-mismatch', field, expected, observed });
      }
      return differences;
    },
  });
  const matchedAttempts = audit.rows.flatMap(row => row.status === 'matched' && row.record ? [row.record] : []);
  const groups = SENOO_CZ_RESPONSE_INPUTS.map(input => ({
    input, planned: schedule.filter(row => row.plannedValue === input).length,
    fullBatch: summarizeResponseAttempts(batch.attempts.filter(attempt => attempt.input === input)),
    matched: summarizeResponseAttempts(matchedAttempts.filter(attempt => attempt.input === input)),
  }));
  return { ...audit, groups, sourceKind: batch.sourceKind, acquisitionRunId: batch.acquisitionRunId, siteIds: batch.siteIds };
}
