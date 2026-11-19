import type { SenooCzBenchmark, SenooCzBenchmarkAttempt, SenooCzBenchmarkSequence } from './senooCzBenchmark';
import { summarizeSenooCzBenchmark } from './senooCzBenchmarkStatistics';
import { auditCzPilotRows, parseCzPilotRows, type CzPilotDifference } from './senooCzPilotSchedule';
import { SENOO_CZ_RESPONSE_INPUTS } from './senooCzResponse';

const pilotHeader = [
  'planned_id', 'planned_block', 'slot_in_block', 'planned_depth', 'sequence_id', 'seed',
  'target_bitstring', 'actual_run_id', 'actual_attempt_id', 'actual_pair_id',
  'actual_analysis_block_id', 'actual_log_ref',
];
const depths = [0, 4, 8, 12, 16, 20];
const layout = [0, 2, 4, 1].map(offset => depths.map((_, index) => String(depths[(index + offset) % depths.length])));

export function parseSenooCzBenchmarkPilotSchedule(text: string) {
  return parseCzPilotRows(text, pilotHeader, layout, 'CZB').map(({ plannedValue, fields, ...row }) => {
    const [sequenceId, seed, targetBitstring, ...actualFields] = fields;
    const [runId, attemptId, pairId, analysisBlockId, sourceRef] = actualFields;
    const actual = actualFields.some(Boolean) ? { runId, attemptId, pairId, analysisBlockId, sourceRef } : null;
    return { ...row, plannedDepth: Number(plannedValue), sequenceId, seed, targetBitstring, actual };
  });
}

type BenchmarkPilotRow = ReturnType<typeof parseSenooCzBenchmarkPilotSchedule>[number];

function compareBenchmarkRow(row: BenchmarkPilotRow, attempt: SenooCzBenchmarkAttempt, sequence: SenooCzBenchmarkSequence) {
  const issues: CzPilotDifference[] = [];
  const compiled = [
    { field: 'sequence_id', expected: row.sequenceId, observed: sequence.sequenceId, code: 'sequence-mismatch' },
    { field: 'seed', expected: row.seed, observed: sequence.seed, code: 'seed-mismatch' },
    { field: 'target_bitstring', expected: row.targetBitstring, observed: sequence.target, code: 'target-mismatch' },
  ];
  for (const { field, expected, observed, code } of compiled) {
    if (!expected) {
      issues.push({ code: 'missing-compiler-field', field, expected: null, observed, detail: '须回查开采前冻结的线路清单。' });
    } else if (field === 'target_bitstring' && !SENOO_CZ_RESPONSE_INPUTS.some(bits => bits === expected)) {
      issues.push({ code: 'invalid-target-bitstring', field, expected, observed, detail: '目标位串须保存为两位文本。' });
    } else if (expected !== observed) {
      issues.push({ code, field, expected, observed });
    }
  }
  if (row.plannedDepth !== sequence.depth) {
    issues.push({ code: 'depth-mismatch', field: 'planned_depth', expected: row.plannedDepth, observed: sequence.depth });
  }
  const analysisBlockId = row.actual?.analysisBlockId;
  if (analysisBlockId !== attempt.blockId) {
    issues.push({
      code: analysisBlockId ? 'analysis-block-mismatch' : 'missing-analysis-block',
      field: 'actual_analysis_block_id', expected: attempt.blockId, observed: analysisBlockId || null,
    });
  }
  return issues;
}

export function auditSenooCzBenchmarkPilotSchedule(schedule: readonly BenchmarkPilotRow[], batch: SenooCzBenchmark) {
  const sequences = new Map(batch.sequences.map(sequence => [sequence.sequenceId, sequence]));
  const audit = auditCzPilotRows(schedule, batch.attempts, {
    runId: batch.acquisitionRunId,
    identify: record => ({ attemptId: record.attemptId, pairId: record.pairId, sourceRef: record.sourceRef }),
    compare: (row, record) => compareBenchmarkRow(row, record, sequences.get(record.sequenceId)!),
  });
  const matchedAttempts = audit.rows.flatMap(row => row.status === 'matched' && row.record ? [row.record] : []);
  const batchStatistics = summarizeSenooCzBenchmark(batch);
  const matchedStatistics = summarizeSenooCzBenchmark({ ...batch, expectedAttempts: matchedAttempts.length, attempts: matchedAttempts });
  const groups = depths.map(depth => {
    const rows = audit.rows.filter(row => row.plan.plannedDepth === depth);
    return {
      depth, planned: rows.length, mapped: rows.filter(row => row.plan.actual !== null).length,
      matched: rows.filter(row => row.status === 'matched').length,
      missing: rows.filter(row => row.status === 'missing').length,
      conflicting: rows.filter(row => row.status === 'conflict').length,
      recorded: batchStatistics.rows.find(row => row.depth === depth)?.started ?? 0,
    };
  });
  return {
    ...audit, groups, batchStatistics, matchedStatistics,
    rows: audit.rows.map(row => ({ ...row, sequence: row.record ? sequences.get(row.record.sequenceId)! : null })),
    unplanned: audit.unplanned.map(row => ({ ...row, sequence: sequences.get(row.record.sequenceId)! })),
  };
}
