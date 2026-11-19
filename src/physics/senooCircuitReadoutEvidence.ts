import type { SenooCircuitBatch } from './senooCircuitBatch';
import { summarizeSenooCircuitBatch } from './senooCircuitStatistics';
import {
  acquiredSenooFrameRefs, matchesSenooFrozenReadout,
  type SenooFrozenMeasuredReadout, type SenooMeasuredVerificationReport,
} from './senooMeasuredReadout';

export type SenooCircuitReadoutEvidenceStatus = 'none' | 'replayed-insufficient' | 'criteria-met' | 'incompatible';

export function senooCircuitReadoutVerificationScope(report: SenooMeasuredVerificationReport) {
  if (report.schemaVersion !== 3) return 'legacy-replay';
  return report.verification.crossWorkpoint ? 'cross-workpoint' : 'same-workpoint';
}

function checkIndependentCircuitHoldout(batch: SenooCircuitBatch, report: SenooMeasuredVerificationReport) {
  if (batch.acquisitionRunId === report.verification.runId.trim()) {
    throw new Error('整机批次与读出独立验证须来自不同采集运行。');
  }
  const used = new Set(report.verification.records.flatMap(site => acquiredSenooFrameRefs(site.frames)));
  const overlap = batch.attempts.find(attempt => attempt.sites.some(site =>
    acquiredSenooFrameRefs(site.frames).some(ref => used.has(ref))));
  if (overlap) throw new Error(`整机尝试 ${overlap.attemptId} 与读出独立验证共用原始帧引用。`);
}

export function assessSenooCircuitReadoutEvidence(
  batch: SenooCircuitBatch,
  explicitRule: SenooFrozenMeasuredReadout | null,
  report: SenooMeasuredVerificationReport | null,
): {
  stats: ReturnType<typeof summarizeSenooCircuitBatch>;
  appliedRule: SenooFrozenMeasuredReadout | null;
  evidence: SenooCircuitReadoutEvidenceStatus;
  issue: string | null;
} {
  if (batch.sourceKind === 'synthetic') {
    return { stats: summarizeSenooCircuitBatch(batch, null), appliedRule: null, evidence: 'none', issue: null };
  }
  try {
    if (report) {
      if (explicitRule && !matchesSenooFrozenReadout(explicitRule, report.frozen)) {
        throw new Error('导入的冻结读出规则与验证报告内的标定记录或预设判据不一致。');
      }
      checkIndependentCircuitHoldout(batch, report);
    }
    const appliedRule = explicitRule ?? report?.frozen ?? null;
    const stats = summarizeSenooCircuitBatch(batch, appliedRule);
    const criteriaMet = report && senooCircuitReadoutVerificationScope(report) === 'same-workpoint'
      && batch.workingPoint === report.verification.workingPoint && report.verification.acceptance?.status === 'pass';
    const evidence = criteriaMet ? 'criteria-met' : report ? 'replayed-insufficient' : 'none';
    return { stats, appliedRule, evidence, issue: null };
  } catch (error) {
    return {
      stats: summarizeSenooCircuitBatch(batch, null), appliedRule: null, evidence: report ? 'incompatible' : 'none',
      issue: error instanceof Error ? error.message : '读出证据与整机批次不匹配。',
    };
  }
}
