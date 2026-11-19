import { describe, expect, it } from 'vitest';
import { parseSenooCircuitBatch } from '../src/physics/senooCircuitBatch';
import { summarizeSenooCircuitBatch } from '../src/physics/senooCircuitStatistics';
import { freezeSenooMeasuredReadout } from '../src/physics/senooMeasuredReadout';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { circuitFixture } from './helpers/senooCircuitFixture';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

function engineeringCalibration() {
  const sheets = freshSheets();
  for (const rows of Object.values(sheets)) for (const row of rows) {
    for (const [index, value] of row.entries()) {
      if (typeof value === 'string') row[index] = value.replaceAll('synthetic://', 'engineering-readout-fixture://');
    }
  }
  setCell(sheets, '批次配置', 2, 'source_kind', 'measured');
  return freezeSenooMeasuredReadout({ report: validateSenooMeasurements(sheets), filename: 'engineering-only.xlsx', sha256: 'a'.repeat(64) },
    'SYN-CAL', { first: 40, second: 40, firstComparison: 'ge', secondComparison: 'ge' }, '2026-11-01T00:00:00Z');
}

describe('Senoo recorded whole-circuit statistics', () => {
  it('keeps every attempt and excludes diagnostic, incomplete, ambiguous and double-dark rounds from bitstrings', () => {
    const result = summarizeSenooCircuitBatch(parseSenooCircuitBatch(JSON.stringify(circuitFixture())), null);
    expect(result.readout.status).toBe('synthetic');
    expect(result.counts).toEqual({
      attempted: 8, postTransportReady: 7, circuitExecuted: 6, readoutAttempted: 5, completeFramePairs: 4,
      missingOrInvalidFrames: 1, validReadout: 3, reportedLoss: 1, ambiguous: 1,
      analysisIncluded: 5, selectedCompleteFramePairs: 3, selectedValidReadout: 2,
    });
    expect(result.attempts.map(attempt => attempt.bitstring)).toEqual(['00', '11', null, null, null, null, null, '01']);
    expect(result.metrics).toMatchObject({
      validReadout: { numerator: 3, denominator: 8 }, validReadoutGivenGate: { numerator: 3, denominator: 6 },
      reportedLossGivenCompleteFrames: { numerator: 1, denominator: 4 }, ambiguityGivenCompleteFrames: { numerator: 1, denominator: 4 },
      targetBitstringPopulation: { numerator: 2, denominator: 2 }, parity: { numerator: 2, denominator: 2 },
    });
    expect(result.bitstrings.map(({ bitstring, count }) => [bitstring, count])).toEqual([['00', 1], ['01', 1], ['11', 1]]);
    expect(result.selectedBitstrings.map(({ bitstring, count }) => [bitstring, count])).toEqual([['00', 1], ['11', 1]]);
  });

  it('requires compatible frozen readout, rejects calibration overlap and preserves explicitly unscored denominators', () => {
    const frozen = engineeringCalibration();
    const conditions = frozen.conditions;
    const fixture = circuitFixture('measured');
    const batch = parseSenooCircuitBatch(JSON.stringify({
      ...fixture, apparatusVersion: conditions.apparatus_version, protocolVersion: conditions.protocol_version,
      workingPoint: frozen.assessment.workingPoint, cameraConfigRef: conditions.camera_config_ref,
      roiMapVersion: conditions.roi_map_version, countProcessingRef: conditions.count_processing_ref,
      outcomePolicy: conditions.outcome_policy, screeningRuleRef: conditions.screening_rule_ref,
    }));
    const unscored = summarizeSenooCircuitBatch(batch, null);
    expect(unscored.readout.status).toBe('awaiting-rule');
    expect(unscored.counts).toMatchObject({ attempted: 8, completeFramePairs: 4, validReadout: null });
    expect(unscored.metrics.validReadout).toBeNull();
    const result = summarizeSenooCircuitBatch(batch, frozen);
    expect(result.readout).toMatchObject({ status: 'evaluated', calibrationRunId: frozen.assessment.runId, candidate: frozen.candidate });
    expect(result.metrics.validReadout?.numerator).toBe(3);
    expect(() => summarizeSenooCircuitBatch({ ...batch, acquisitionRunId: frozen.assessment.runId }, frozen)).toThrow(/不同采集运行/);
    expect(() => summarizeSenooCircuitBatch({ ...batch, workingPoint: 'engineering-other-point' }, frozen)).toThrow(/工况/);
    const loggedRef = frozen.assessment.samples[0].sourceRefs.first;
    const overlap = structuredClone(batch);
    const firstFrame = overlap.attempts[4].sites[0].frames[0];
    expect(Reflect.set(firstFrame, 'sourceRef', loggedRef)).toBe(true);
    expect(() => summarizeSenooCircuitBatch(overlap, frozen)).toThrow(/共用原始帧引用/);
  });
});
