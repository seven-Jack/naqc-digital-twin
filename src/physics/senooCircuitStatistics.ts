import { classifyDualExposureBrightness, type ReadoutOutcome } from './dualExposureReadout';
import { acquiredSenooFrameRefs, type SenooFrozenMeasuredReadout, type SenooMeasuredCandidate } from './senooMeasuredReadout';
import type { SenooCircuitBatch, SenooCircuitFrame } from './senooCircuitBatch';

function checkFrozenReadout(batch: SenooCircuitBatch, frozen: SenooFrozenMeasuredReadout) {
  const calibration = frozen.assessment;
  if (batch.acquisitionRunId === calibration.runId) throw new Error('整机留出批次与读出标定须来自不同采集运行。');
  const fields = {
    apparatus_version: batch.apparatusVersion, protocol_version: batch.protocolVersion,
    camera_config_ref: batch.cameraConfigRef, roi_map_version: batch.roiMapVersion,
    count_processing_ref: batch.countProcessingRef, outcome_policy: batch.outcomePolicy,
    screening_rule_ref: batch.screeningRuleRef,
  };
  const mismatch = (Object.keys(fields) as Array<keyof typeof fields>).find(field => fields[field] !== frozen.conditions[field]);
  if (mismatch) throw new Error(`整机批次与冻结读出的 ${mismatch} 不一致。`);
  if (batch.workingPoint !== calibration.workingPoint || batch.countUnit !== calibration.countUnit) {
    throw new Error('整机批次与冻结读出的工况或计数单位不一致。');
  }
  const used = new Set(calibration.records.flatMap(site => acquiredSenooFrameRefs(site.frames)));
  const overlap = batch.attempts.find(attempt => attempt.sites.some(site =>
    acquiredSenooFrameRefs(site.frames).some(ref => used.has(ref))));
  if (overlap) throw new Error(`整机尝试 ${overlap.attemptId} 与读出标定共用原始帧引用。`);
}

function decide(first: SenooCircuitFrame, second: SenooCircuitFrame, candidate: SenooMeasuredCandidate | null): ReadoutOutcome | null {
  if (first.status !== 'valid' || second.status !== 'valid') return null;
  const firstThreshold = candidate?.first ?? first.actualThreshold!;
  const secondThreshold = candidate?.second ?? second.actualThreshold!;
  const firstComparison = candidate?.firstComparison ?? first.comparison!;
  const secondComparison = candidate?.secondComparison ?? second.comparison!;
  const firstHigh = firstComparison === 'ge' ? first.count! >= firstThreshold : first.count! > firstThreshold;
  const secondHigh = secondComparison === 'ge' ? second.count! >= secondThreshold : second.count! > secondThreshold;
  return classifyDualExposureBrightness(firstHigh, secondHigh).outcome;
}

function ratio(numerator: number, denominator: number) {
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}

function distribution(histogram: ReadonlyMap<string, number>, denominator: number) {
  return Array.from(histogram, ([bitstring, count]) => ({ bitstring, count, probability: count / denominator }))
    .sort((left, right) => left.bitstring.localeCompare(right.bitstring));
}

/** Reduces one recorded circuit/basis. A valid bitstring requires every declared target site. */
export function summarizeSenooCircuitBatch(batch: SenooCircuitBatch, frozen: SenooFrozenMeasuredReadout | null) {
  const synthetic = batch.sourceKind === 'synthetic';
  if (!synthetic && frozen) checkFrozenReadout(batch, frozen);
  const calibration = synthetic ? null : frozen;
  const candidate = calibration?.candidate ?? null;
  const scoring = synthetic || candidate !== null;
  const readout = {
    status: synthetic ? 'synthetic' as const : calibration ? 'evaluated' as const : 'awaiting-rule' as const,
    calibrationRunId: calibration?.assessment.runId ?? null,
    calibrationSha256: calibration?.assessment.sha256 ?? null,
    candidate,
  };

  let postTransportReady = 0;
  let circuitExecuted = 0;
  let readoutAttempted = 0;
  let completeFramePairs = 0;
  let analysisIncluded = 0;
  let selectedCompleteFramePairs = 0;
  let validReadout = 0;
  let selectedValidReadout = 0;
  let reportedLoss = 0;
  let ambiguous = 0;
  let paritySum = 0;
  let targetCount = 0;
  const histogram = new Map<string, number>();
  const selectedHistogram = new Map<string, number>();
  const targetStrings = new Set(batch.targetBitstrings);
  const attempts = batch.attempts.map(attempt => {
    const occupied = new Set(attempt.postTransportOccupiedSiteIds);
    const ready = attempt.stages.transport.status !== 'failed' && batch.siteIds.every(site => occupied.has(site));
    const executed = attempt.stages.gate.status === 'executed';
    const selected = executed && attempt.selection.status === 'included';
    const triedReadout = executed && attempt.stages.readout.status !== 'skipped';
    const complete = triedReadout && attempt.sites.every(site => site.frames.every(frame => frame.status === 'valid'));
    const sites = new Map(attempt.sites.map(site => [site.siteId, site]));
    const outcomes = batch.siteIds.map(siteId => {
      const site = sites.get(siteId)!;
      const decision = scoring && triedReadout ? decide(site.frames[0], site.frames[1], candidate) : null;
      return { siteId, decision };
    });
    const allBits = complete && outcomes.every(({ decision }) => decision === 'm0' || decision === 'm1');
    const bitstring = allBits ? outcomes.map(({ decision }) => decision === 'm1' ? '1' : '0').join('') : null;

    postTransportReady += Number(ready);
    circuitExecuted += Number(executed);
    readoutAttempted += Number(triedReadout);
    completeFramePairs += Number(complete);
    analysisIncluded += Number(selected);
    selectedCompleteFramePairs += Number(selected && complete);
    reportedLoss += Number(complete && outcomes.some(outcome => outcome.decision === 'no-atom'));
    ambiguous += Number(complete && outcomes.some(outcome => outcome.decision === 'ambiguous'));
    if (bitstring !== null) {
      validReadout++;
      histogram.set(bitstring, (histogram.get(bitstring) ?? 0) + 1);
      if (selected) {
        selectedValidReadout++;
        selectedHistogram.set(bitstring, (selectedHistogram.get(bitstring) ?? 0) + 1);
        if (targetStrings.has(bitstring)) targetCount++;
        const ones = outcomes.filter(outcome => outcome.decision === 'm1').length;
        paritySum += ones % 2 === 0 ? 1 : -1;
      }
    }
    return {
      attemptId: attempt.attemptId, postTransportReady: ready, circuitExecuted: executed,
      readoutAttempted: triedReadout, completeFramePairs: complete, analysisIncluded: selected, outcomes, bitstring,
    };
  });

  const attempted = attempts.length;
  const counts = {
    attempted, postTransportReady, circuitExecuted, readoutAttempted, completeFramePairs,
    analysisIncluded, selectedCompleteFramePairs, selectedValidReadout: scoring ? selectedValidReadout : null,
    missingOrInvalidFrames: readoutAttempted - completeFramePairs,
    validReadout: scoring ? validReadout : null, reportedLoss: scoring ? reportedLoss : null,
    ambiguous: scoring ? ambiguous : null,
  };
  const bitstrings = distribution(histogram, validReadout);
  const selectedBitstrings = distribution(selectedHistogram, selectedValidReadout);
  const metrics = {
    postTransportReady: ratio(postTransportReady, attempted),
    circuitExecuted: ratio(circuitExecuted, attempted),
    validReadout: scoring ? ratio(validReadout, attempted) : null,
    validReadoutGivenGate: scoring ? ratio(validReadout, circuitExecuted) : null,
    reportedLossGivenCompleteFrames: scoring ? ratio(reportedLoss, completeFramePairs) : null,
    ambiguityGivenCompleteFrames: scoring ? ratio(ambiguous, completeFramePairs) : null,
    targetBitstringPopulation: scoring && targetStrings.size ? ratio(targetCount, selectedValidReadout) : null,
    parity: scoring ? ratio(paritySum, selectedValidReadout) : null,
  };
  return { counts, readout, attempts, bitstrings, selectedBitstrings, metrics };
}

export type SenooCircuitStatistics = ReturnType<typeof summarizeSenooCircuitBatch>;
