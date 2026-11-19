import { describe, expect, it } from 'vitest';
import { assessSenooCircuitReadoutEvidence } from '../src/physics/senooCircuitReadoutEvidence';
import {
  createSenooMeasuredVerificationReport, freezeSenooMeasuredReadout, parseSenooMeasuredVerificationReport,
  type SenooMeasuredWorkbook,
} from '../src/physics/senooMeasuredReadout';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import type { SenooReadoutAcceptancePlan } from '../src/physics/senooReadoutAcceptance';
import { circuitFixture } from './helpers/senooCircuitFixture';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

function engineeringConditions(limits = 1, crossWorkpoint = false) {
  const sheets = freshSheets();
  for (const rows of Object.values(sheets)) for (const row of rows) for (const [index, value] of row.entries()) {
    if (typeof value === 'string') row[index] = value.replaceAll('synthetic://', 'engineering-readout-fixture://');
  }
  setCell(sheets, '批次配置', 2, 'source_kind', 'measured');
  setCell(sheets, '批次配置', 3, 'source_kind', 'measured');
  if (crossWorkpoint) setCell(sheets, '批次配置', 3, 'working_point', 'engineering-readout-alternate-workpoint');
  const workbook = {
    report: validateSenooMeasurements(sheets), filename: 'engineering-readout-only.xlsx', sha256: 'a'.repeat(64),
  } satisfies SenooMeasuredWorkbook;
  const plan: SenooReadoutAcceptancePlan = {
    confidenceLevel: 0.95, independenceRef: 'engineering-readout-fixture://independence',
    minAttemptsPerGroup: 1, minEvaluableFraction: 1,
    limits: { m1Wrong: limits, m1Loss: limits, m1Ambiguity: limits, m0Wrong: limits, m0Loss: limits,
      m0Ambiguity: limits, emptyFalsePositive: limits, emptyAmbiguity: limits },
  };
  const frozen = freezeSenooMeasuredReadout(workbook, 'SYN-CAL',
    { first: 40, second: 40, firstComparison: 'ge', secondComparison: 'ge' }, '2026-11-01T00:00:00Z',
    'engineering-readout-fixture://plan', plan);
  const report = parseSenooMeasuredVerificationReport(JSON.stringify(
    createSenooMeasuredVerificationReport(frozen, { ...workbook, sha256: 'b'.repeat(64) }, 'SYN-VAL'),
  ));
  const conditions = frozen.conditions;
  const circuit = {
    ...circuitFixture('measured'), apparatusVersion: conditions.apparatus_version, protocolVersion: conditions.protocol_version,
    workingPoint: frozen.assessment.workingPoint, cameraConfigRef: conditions.camera_config_ref,
    roiMapVersion: conditions.roi_map_version, countProcessingRef: conditions.count_processing_ref,
    outcomePolicy: conditions.outcome_policy, screeningRuleRef: conditions.screening_rule_ref,
  };
  return { frozen, report, circuit };
}

describe('Senoo circuit readout evidence', () => {
  it('applies the embedded rule but only counts v3 same-workpoint passing reports as evidence', () => {
    const { frozen, report, circuit } = engineeringConditions();
    expect(report.verification.acceptance?.status).toBe('pass');
    expect(assessSenooCircuitReadoutEvidence(circuit, null, report)).toMatchObject({
      evidence: 'criteria-met', appliedRule: frozen, stats: { counts: { validReadout: 3 } }, issue: null,
    });
    expect(assessSenooCircuitReadoutEvidence(circuit, frozen, report).evidence).toBe('criteria-met');

    const legacy = parseSenooMeasuredVerificationReport(JSON.stringify({
      schemaVersion: 2, frozen, verification: report.verification,
    }));
    for (const candidate of [legacy, engineeringConditions(0.1).report, engineeringConditions(1, true).report]) {
      expect(assessSenooCircuitReadoutEvidence(circuit, null, candidate)).toMatchObject({
        evidence: 'replayed-insufficient', stats: { counts: { validReadout: 3 } }, issue: null,
      });
    }
    expect(assessSenooCircuitReadoutEvidence(circuit, frozen, null)).toMatchObject({
      evidence: 'none', stats: { counts: { validReadout: 3 } },
    });
  });

  it('withholds circuit readout for conflicting calibration identity, reused run, or shared holdout frames', () => {
    const { frozen, report, circuit } = engineeringConditions();
    const conflict = { ...frozen, acceptancePlanRef: 'engineering-readout-fixture://a-different-plan' };
    expect(assessSenooCircuitReadoutEvidence(circuit, conflict, report)).toMatchObject({
      evidence: 'incompatible', appliedRule: null, stats: { counts: { validReadout: null } }, issue: expect.stringContaining('预设判据'),
    });
    expect(assessSenooCircuitReadoutEvidence({ ...circuit, acquisitionRunId: report.verification.runId }, frozen, report)).toMatchObject({
      evidence: 'incompatible', appliedRule: null, issue: expect.stringContaining('不同采集运行'),
    });
    const reused = structuredClone(circuit);
    // Preserve a diagnostic frame even though its failed transport removes it from circuit scoring.
    expect(Reflect.set(reused.attempts[4].sites[0].frames[0], 'sourceRef', report.verification.samples[0].sourceRefs.first)).toBe(true);
    expect(assessSenooCircuitReadoutEvidence(reused, frozen, report)).toMatchObject({
      evidence: 'incompatible', appliedRule: null, issue: expect.stringContaining('共用原始帧引用'),
    });
    expect(assessSenooCircuitReadoutEvidence({ ...circuit, workingPoint: 'engineering-circuit-alternate-workpoint' }, frozen, report))
      .toMatchObject({ evidence: 'incompatible', appliedRule: null, issue: expect.stringContaining('工况') });
  });

  it('keeps synthetic circuit statistics separate from measured readout evidence', () => {
    const { frozen, report } = engineeringConditions();
    expect(assessSenooCircuitReadoutEvidence(circuitFixture(), frozen, report)).toMatchObject({
      evidence: 'none', appliedRule: null, stats: { readout: { status: 'synthetic' }, counts: { validReadout: 3 } }, issue: null,
    });
  });
});
