import { classifyDualExposureBrightness, type ReadoutOutcome } from './dualExposureReadout';
import { summarizeSenooMeasurementSites, type SenooMeasurementReport } from './senooMeasurements';
import { assessSenooReadoutAcceptance, parseSenooReadoutAcceptancePlan, type SenooReadoutAcceptancePlan } from './senooReadoutAcceptance';
import { scanDualExposureCalibrationThresholds, type SenooReadoutScanOptions } from './senooReadoutThresholdScan';

type Batch = SenooMeasurementReport['batches'][number];
type Site = SenooMeasurementReport['records'][number];
type Frame = Site['frames'][number];
type Role = Batch['role'];
type Comparison = 'ge' | 'gt';
type MeasuredInput = {
  batch: Pick<Batch, 'id' | 'acquisitionRunId' | 'countUnit' | 'clockId' | 'timeOrigin' | 'metadata'>;
  records: Site[];
  filename: string;
  sha256: string;
};

export interface SenooMeasuredWorkbook {
  filename: string;
  sha256: string | null;
  report: SenooMeasurementReport;
}

export interface SenooMeasuredCandidate {
  readonly first: number;
  readonly second: number;
  readonly firstComparison: Comparison;
  readonly secondComparison: Comparison;
}

const groups = ['m1', 'm0', 'empty_control'] as const;
const labels = { m1: 'm₁', m0: 'm₀', empty_control: '空位' } as const;
const targetOutcome = { m1: 'm1', m0: 'm0', empty_control: 'no-atom' } as const;
const comparableFields = [
  'apparatus_version', 'protocol_version', 'camera_config_ref', 'roi_map_version',
  'count_processing_ref', 'outcome_policy', 'screening_rule_ref',
] as const;
const requiredFields = [...comparableFields, 'working_point', 'acquired_at_utc', 'readout_rule_ref'] as const;
type Conditions = Readonly<Record<typeof comparableFields[number], string>>;

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const realReference = (value: unknown): value is string => nonempty(value) && !/^synthetic:/i.test(value.trim());
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const isUtc = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));

function candidateRule(value: SenooMeasuredCandidate): SenooMeasuredCandidate {
  if (!finite(value.first) || !finite(value.second)
      || !['ge', 'gt'].includes(value.firstComparison) || !['ge', 'gt'].includes(value.secondComparison)) {
    throw new Error('请为两帧填写有限的候选阈值及大于或大于等于的比较规则。');
  }
  return Object.freeze({
    first: value.first, second: value.second, firstComparison: value.firstComparison, secondComparison: value.secondComparison,
  });
}

function eligibleFrames(site: Site) {
  if (site.analysisStatus !== 'included') return null;
  const first = site.frames.find(frame => frame.imageNo === 1 && frame.status === 'valid');
  const second = site.frames.find(frame => frame.imageNo === 2 && frame.status === 'valid');
  return first && second ? { first, second } : null;
}

export function eligibleReadout(site: Site) {
  const frames = eligibleFrames(site);
  if (!frames || !finite(frames.first.decisionCount) || !finite(frames.second.decisionCount)) return null;
  return { frames, counts: { first: frames.first.decisionCount, second: frames.second.decisionCount } };
}

function sourceDenominators(sites: readonly Site[], evaluated: number) {
  const frameCounts = { valid: 0, missing: 0, skipped: 0, invalid: 0, unknown: 0 };
  for (const site of sites) for (const frame of site.frames) frameCounts[frame.status]++;
  return {
    ...summarizeSenooMeasurementSites(sites),
    uniqueAttempts: new Set(sites.map(site => site.attemptId)).size,
    evaluated,
    missingFrames: frameCounts.missing,
    skippedFrames: frameCounts.skipped,
    invalidFrames: frameCounts.invalid,
    unknownFrames: frameCounts.unknown,
  };
}

function screeningIssues(sites: readonly Site[]) {
  const issues: string[] = [];
  for (const site of sites) {
    const label = `尝试 ${site.attemptId} 位点 ${site.siteId}`;
    if (site.analysisStatus === 'included' && site.prepErasureStatus === 'fail') {
      issues.push(`${label}的制备擦除失败与原记录纳入冲突。`);
    }
    if (site.analysisStatus !== 'included') continue;
    const frames = eligibleFrames(site);
    if (!frames) {
      issues.push(`${label}纳入分析但缺少有效双帧。`);
      continue;
    }
    for (const frame of [frames.first, frames.second]) {
      const missing = [
        !realReference(frame.sourceRef) && 'raw_ref',
        !nonempty(frame.exposureId) && 'exposure_id',
        !nonempty(frame.roiId) && 'roi_id',
        !finite(frame.decisionCount) && 'decision_count',
        !finite(frame.actualThreshold) && 'actual_threshold',
        frame.thresholdOp === null && 'threshold_op',
        !finite(frame.triggerUs) && 'trigger_us',
        !finite(frame.startUs) && 'exposure_start_us',
        !finite(frame.endUs) && 'exposure_end_us',
      ].filter(Boolean);
      if (missing.length) issues.push(`${label}第 ${frame.imageNo} 帧缺有效 ${missing.join('、')}。`);
    }
  }
  const available = new Set(sites.filter(site => eligibleReadout(site)).map(site => site.preparedGroup));
  for (const group of groups) if (!available.has(group)) issues.push(`批次缺少 ${labels[group]} 组可评估配对。`);
  return issues;
}

export function inspectSenooMeasuredBatch(workbook: SenooMeasuredWorkbook, batchId: string, role: Role) {
  const batch = workbook.report.batches.find(value => value.id === batchId);
  const sites = workbook.report.records.filter(site => site.batchId === batchId);
  const denominators = sourceDenominators(sites, sites.filter(site => eligibleReadout(site)).length);
  const issues: string[] = workbook.report.issues.filter(issue => issue.severity === 'error')
    .map(issue => `${issue.sheet} 第 ${issue.row} 行 ${issue.field} · ${issue.message}`);
  if (!batch || batch.role !== role || batch.sourceKind !== 'measured') {
    issues.push(role === 'calibration' ? '请选择来源声明为 measured 的标定批次。' : '请选择来源声明为 measured 的独立验证批次。');
    return { issues, denominators };
  }
  if (!isDigest(workbook.sha256) || !nonempty(workbook.filename)) issues.push('工作簿名或 SHA-256 缺失，请重新导入。');
  if (!realReference(batch.acquisitionRunId)) issues.push('acquisition_run_id 缺少有效实测来源。');
  for (const field of requiredFields) {
    if (!realReference(batch.metadata[field])) issues.push(`批次缺有效 ${field}。`);
  }
  if (nonempty(batch.metadata.acquired_at_utc) && !isUtc(batch.metadata.acquired_at_utc)) {
    issues.push('acquired_at_utc 须为 UTC 日期。');
  }
  for (const [field, value] of [['count_unit', batch.countUnit], ['clock_id', batch.clockId], ['t0_ref', batch.timeOrigin]] as const) {
    if (!realReference(value)) issues.push(`批次缺有效 ${field}。`);
  }
  const syntheticEvidence = [
    ...Object.values(batch.metadata),
    ...workbook.report.events.filter(event => event.batchId === batchId).map(event => event.sourceRef),
    ...sites.flatMap(site => [site.attemptLogRef, site.previousAttemptRef, ...site.frames.map(frame => frame.sourceRef)]),
  ].some(value => nonempty(value) && /^synthetic:/i.test(value.trim()));
  if (syntheticEvidence) issues.push('批次含 synthetic:// 来源，需要核对实验原始记录。');
  issues.push(...screeningIssues(sites));
  return { issues, denominators };
}

function measuredInput(workbook: SenooMeasuredWorkbook, batchId: string, role: Role): MeasuredInput {
  const { issues } = inspectSenooMeasuredBatch(workbook, batchId, role);
  if (issues.length) throw new Error(issues.join('\n'));
  const batch = workbook.report.batches.find(value => value.id === batchId)!;
  return {
    batch, records: workbook.report.records.filter(site => site.batchId === batchId),
    filename: workbook.filename, sha256: workbook.sha256!.toLowerCase(),
  };
}

function scoredSite(site: Site, candidate: SenooMeasuredCandidate) {
  const readout = eligibleReadout(site);
  if (!readout) return [];
  const { frames, counts } = readout;
  const firstHigh = candidate.firstComparison === 'ge' ? counts.first >= candidate.first : counts.first > candidate.first;
  const secondHigh = candidate.secondComparison === 'ge' ? counts.second >= candidate.second : counts.second > candidate.second;
  return [{
    attemptId: site.attemptId, siteId: site.siteId, preparedGroup: site.preparedGroup, counts, frames,
    sourceRefs: { first: frames.first.sourceRef!, second: frames.second.sourceRef! },
    attemptLogRef: site.attemptLogRef, originalDecision: site.instrumentDecision, decisionReadyUs: site.decisionReadyUs,
    outcome: classifyDualExposureBrightness(firstHigh, secondHigh).outcome,
  }];
}

const ratio = (numerator: number, denominator: number) => ({
  numerator, denominator, rate: denominator === 0 ? null : numerator / denominator,
});

function inputIdentity({ batch, filename, sha256 }: MeasuredInput) {
  return {
    batchId: batch.id, runId: batch.acquisitionRunId, filename, sha256, countUnit: batch.countUnit!,
    workingPoint: batch.metadata.working_point!,
  };
}

function summarize(input: MeasuredInput, candidate: SenooMeasuredCandidate) {
  const { batch, records } = input;
  const samples = records.flatMap(site => scoredSite(site, candidate));
  const groupSummaries = groups.map(preparedGroup => {
    const selected = samples.filter(sample => sample.preparedGroup === preparedGroup);
    const counts: Record<ReadoutOutcome, number> = { m1: 0, m0: 0, 'no-atom': 0, ambiguous: 0 };
    for (const sample of selected) counts[sample.outcome]++;
    const expected = targetOutcome[preparedGroup];
    return {
      preparedGroup, ...sourceDenominators(records.filter(site => site.preparedGroup === preparedGroup), selected.length),
      wrongLabel: counts.m1 + counts.m0 - (preparedGroup === 'empty_control' ? 0 : counts[preparedGroup]),
      reportedLoss: counts['no-atom'], ambiguous: counts.ambiguous, correct: counts[expected], counts,
    };
  });
  const [spin1, spin0, empty] = groupSummaries;
  const totals = {
    evaluated: samples.length,
    spinEvaluated: spin1.evaluated + spin0.evaluated,
    wrongSpin: spin1.wrongLabel + spin0.wrongLabel,
    falseLoss: spin1.reportedLoss + spin0.reportedLoss,
    ambiguous: spin1.ambiguous + spin0.ambiguous + empty.ambiguous,
    emptyEvaluated: empty.evaluated,
    emptyFalsePositive: empty.wrongLabel,
    correct: spin1.correct + spin0.correct + empty.correct,
    reportedLoss: spin1.reportedLoss + spin0.reportedLoss + empty.reportedLoss,
  };
  const attemptGroups = new Map<string, Site[]>();
  for (const site of records) {
    if (!attemptGroups.has(site.attemptId)) attemptGroups.set(site.attemptId, []);
    attemptGroups.get(site.attemptId)!.push(site);
  }
  const scoredByAttempt = new Map<string, number>();
  for (const sample of samples) scoredByAttempt.set(sample.attemptId, (scoredByAttempt.get(sample.attemptId) ?? 0) + 1);
  const attempts = Array.from(attemptGroups, ([attemptId, sites]) => ({
    attemptId, ...sourceDenominators(sites, scoredByAttempt.get(attemptId) ?? 0),
  }));
  return {
    ...inputIdentity(input), acquiredAtUtc: batch.metadata.acquired_at_utc!,
    roleAssignedAtUtc: batch.metadata.role_assigned_at_utc ?? null, clockId: batch.clockId!, timeOrigin: batch.timeOrigin!,
    readoutRuleRef: batch.metadata.readout_rule_ref!, clockAlignmentRef: batch.metadata.clock_alignment_ref ?? null,
    denominators: sourceDenominators(records, samples.length), groups: groupSummaries, totals, samples, attempts, records,
    rates: {
      wrongSpin: ratio(totals.wrongSpin, totals.spinEvaluated),
      spinLoss: ratio(totals.falseLoss, totals.spinEvaluated),
      ambiguity: ratio(totals.ambiguous, totals.evaluated),
      emptyFalsePositive: ratio(totals.emptyFalsePositive, totals.emptyEvaluated),
    },
  };
}

export type SenooMeasuredAssessment = ReturnType<typeof summarize>;

export function assessSenooMeasuredCandidate(workbook: SenooMeasuredWorkbook, batchId: string, candidate: SenooMeasuredCandidate) {
  return summarize(measuredInput(workbook, batchId, 'calibration'), candidateRule(candidate));
}

export function scanSenooMeasuredCalibration(workbook: SenooMeasuredWorkbook, batchId: string, options: SenooReadoutScanOptions) {
  const input = measuredInput(workbook, batchId, 'calibration');
  const samples = input.records.flatMap(site => {
    const eligible = eligibleReadout(site);
    return eligible ? [{ preparedGroup: site.preparedGroup, ...eligible.counts }] : [];
  });
  return Object.freeze({ ...inputIdentity(input), ...scanDualExposureCalibrationThresholds(samples, options) });
}

export type SenooMeasuredCalibrationScan = ReturnType<typeof scanSenooMeasuredCalibration>;

function conditions(batch: Pick<Batch, 'metadata'>): Conditions {
  return Object.freeze(Object.fromEntries(comparableFields.map(field => [field, batch.metadata[field]!])) as Conditions);
}

function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => snapshot(item))) as T;
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]))) as T;
  }
  return value;
}

interface SenooFrozenMeasuredReadoutBase {
  readonly evidence: 'declared-measured-calibration';
  readonly method: 'explicit-dual-threshold-candidate';
  readonly frozenAtUtc: string;
  readonly acceptancePlanRef: string | null;
  readonly candidate: SenooMeasuredCandidate;
  readonly conditions: Conditions;
  readonly assessment: SenooMeasuredAssessment;
}

export type SenooFrozenMeasuredReadout = SenooFrozenMeasuredReadoutBase & (
  | { readonly schemaVersion: 1; readonly acceptancePlan?: never }
  | { readonly schemaVersion: 2; readonly acceptancePlan: SenooReadoutAcceptancePlan }
);

export function freezeSenooMeasuredReadout(
  workbook: SenooMeasuredWorkbook, batchId: string, candidate: SenooMeasuredCandidate, frozenAtUtc: string, acceptancePlanRef?: string,
  acceptancePlan?: SenooReadoutAcceptancePlan | null,
): SenooFrozenMeasuredReadout {
  if (!isUtc(frozenAtUtc)) throw new Error('冻结时标须为有效的 UTC 时间。');
  const input = measuredInput(workbook, batchId, 'calibration');
  const rule = candidateRule(candidate);
  const base: SenooFrozenMeasuredReadoutBase = {
    evidence: 'declared-measured-calibration', method: 'explicit-dual-threshold-candidate',
    frozenAtUtc, acceptancePlanRef: acceptancePlanRef?.trim() || null, candidate: rule,
    conditions: conditions(input.batch), assessment: summarize(input, rule),
  };
  return acceptancePlan
    ? snapshot({ ...base, schemaVersion: 2, acceptancePlan: parseSenooReadoutAcceptancePlan(acceptancePlan) })
    : snapshot({ ...base, schemaVersion: 1 });
}

export function acquiredSenooFrameRefs(frames: readonly Pick<Frame, 'status' | 'sourceRef'>[]) {
  return frames.flatMap(frame =>
    (frame.status === 'valid' || frame.status === 'invalid') && frame.sourceRef ? [frame.sourceRef.trim()] : []);
}

export function verifySenooMeasuredReadout(frozen: SenooFrozenMeasuredReadout, workbook: SenooMeasuredWorkbook, batchId: string) {
  return verifyMeasuredInput(frozen, measuredInput(workbook, batchId, 'validation'));
}

function verifyMeasuredInput(frozen: SenooFrozenMeasuredReadout, input: MeasuredInput) {
  const { batch } = input;
  const calibration = frozen.assessment;
  if (batch.acquisitionRunId === calibration.runId
      || (input.sha256.toLowerCase() === calibration.sha256.toLowerCase() && batch.id === calibration.batchId)) {
    throw new Error('标定与验证须来自不同采集运行及批次。');
  }
  if (batch.countUnit !== calibration.countUnit) throw new Error('验证批次的 count_unit 与冻结规则不一致。');
  const mismatch = comparableFields.find(field => batch.metadata[field] !== frozen.conditions[field]);
  if (mismatch) throw new Error(`验证批次的 ${mismatch} 与冻结规则不一致。`);
  const assessment = summarize(input, candidateRule(frozen.candidate));
  // Count within-run camera sharing once for this check. Screened-out acquired frames also retain provenance.
  const used = new Set(calibration.records.flatMap(site => acquiredSenooFrameRefs(site.frames)));
  const overlap = assessment.records.find(site => acquiredSenooFrameRefs(site.frames).some(ref => used.has(ref)));
  if (overlap) throw new Error(`验证尝试 ${overlap.attemptId} 位点 ${overlap.siteId} 与标定批次共用原始帧引用。`);
  const crossWorkpoint = assessment.workingPoint !== calibration.workingPoint;
  return {
    ...assessment, crossWorkpoint,
    acceptance: frozen.schemaVersion === 2 ? assessSenooReadoutAcceptance(frozen.acceptancePlan, calibration, assessment, crossWorkpoint) : null,
  };
}

interface SenooMeasuredVerificationReportBase {
  readonly frozen: SenooFrozenMeasuredReadout;
  readonly verification: ReturnType<typeof verifySenooMeasuredReadout>;
}

interface SenooMeasuredVerificationReportV3 extends SenooMeasuredVerificationReportBase {
  readonly kind: 'senoo-measured-verification';
  readonly schemaVersion: 3;
  readonly holdoutConditions: Conditions;
}

export type SenooMeasuredVerificationReport = SenooMeasuredVerificationReportV3 | (
  SenooMeasuredVerificationReportBase & { readonly schemaVersion: 1 | 2; readonly kind?: never; readonly holdoutConditions?: never }
);

export function createSenooMeasuredVerificationReport(
  frozen: SenooFrozenMeasuredReadout, workbook: SenooMeasuredWorkbook, batchId: string,
): SenooMeasuredVerificationReportV3 {
  const input = measuredInput(workbook, batchId, 'validation');
  return snapshot({
    kind: 'senoo-measured-verification', schemaVersion: 3, frozen,
    holdoutConditions: conditions(input.batch), verification: verifyMeasuredInput(frozen, input),
  });
}

const invalidArtifact = () => new Error('实测冻结规则 JSON 的格式、证据引用或标定摘要不一致。');
const invalidVerification = () => new Error('独立验证报告 JSON 的格式、证据引用或重算结果不一致。');

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidArtifact();
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  if (!nonempty(value)) throw invalidArtifact();
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : readText(value);
}

function nullableNumber(value: unknown): number | null {
  if (value !== null && !finite(value)) throw invalidArtifact();
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[]): T {
  const result = options.find(option => option === value);
  if (!result) throw invalidArtifact();
  return result;
}

function nullableChoice<T extends string>(value: unknown, options: readonly T[]): T | null {
  return value === null ? null : choice(value, options);
}

function readFrame(value: unknown): Frame {
  const raw = object(value);
  const imageNo = raw.imageNo;
  if (imageNo !== 1 && imageNo !== 2) throw invalidArtifact();
  const frame: Frame = {
    imageNo, status: choice(raw.status, ['valid', 'invalid', 'missing', 'skipped', 'unknown']),
    exposureId: nullableText(raw.exposureId), sourceRef: nullableText(raw.sourceRef), roiId: nullableText(raw.roiId),
    decisionCount: nullableNumber(raw.decisionCount), rawRoiSum: nullableNumber(raw.rawRoiSum),
    actualThreshold: nullableNumber(raw.actualThreshold), thresholdOp: nullableChoice(raw.thresholdOp, ['ge', 'gt', 'other']),
    triggerUs: nullableNumber(raw.triggerUs), startUs: nullableNumber(raw.startUs), endUs: nullableNumber(raw.endUs),
    countReadyUs: nullableNumber(raw.countReadyUs), issue: nullableText(raw.issue),
  };
  const times = [frame.triggerUs, frame.startUs, frame.endUs, frame.countReadyUs].filter(value => value !== null);
  if (times.some((value, index) => index > 0 && value < times[index - 1])
      || ((frame.status === 'missing' || frame.status === 'skipped') && (frame.decisionCount !== null || frame.rawRoiSum !== null))) {
    throw invalidArtifact();
  }
  return frame;
}

function readSite(value: unknown): Site {
  const raw = object(value);
  if (!Array.isArray(raw.frames) || raw.frames.length !== 2) throw invalidArtifact();
  const frames = raw.frames.map(readFrame);
  const [first, second] = frames;
  const decisionReadyUs = nullableNumber(raw.decisionReadyUs);
  if (first.imageNo !== 1 || second.imageNo !== 2
      || (first.endUs !== null && second.startUs !== null && first.endUs > second.startUs)
      || (first.triggerUs !== null && second.triggerUs !== null && first.triggerUs > second.triggerUs)
      || (decisionReadyUs !== null && frames.some(frame => (frame.countReadyUs ?? frame.endUs ?? -Infinity) > decisionReadyUs))) {
    throw invalidArtifact();
  }
  return {
    batchId: readText(raw.batchId), attemptId: readText(raw.attemptId), siteId: readText(raw.siteId),
    preparedGroup: choice(raw.preparedGroup, groups), prepErasureStatus: choice(raw.prepErasureStatus, ['pass', 'fail', 'not_run', 'unknown']),
    analysisStatus: choice(raw.analysisStatus, ['included', 'excluded', 'pending']),
    exclusionStage: nullableText(raw.exclusionStage), exclusionReason: nullableText(raw.exclusionReason),
    instrumentDecision: nullableText(raw.instrumentDecision), decisionReadyUs, attemptLogRef: nullableText(raw.attemptLogRef),
    previousAttemptRef: nullableText(raw.previousAttemptRef), frames,
  };
}

function matchesJson(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((value, index) => matchesJson(actual[index], value));
  if (!expected || typeof expected !== 'object' || !actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const fields = Object.entries(expected);
  const input = actual as Record<string, unknown>;
  return Object.keys(input).length === fields.length
    && fields.every(([key, value]) => Object.hasOwn(input, key) && matchesJson(input[key], value));
}

export function matchesSenooFrozenReadout(first: SenooFrozenMeasuredReadout, second: SenooFrozenMeasuredReadout): boolean {
  return matchesJson(first, second);
}

function readArchivedAssessmentInput(saved: Record<string, unknown>, comparable: Record<string, unknown>): MeasuredInput {
  const metadata = Object.fromEntries(comparableFields.map(field => [field, readText(comparable[field])]));
  metadata.working_point = readText(saved.workingPoint);
  metadata.acquired_at_utc = readText(saved.acquiredAtUtc);
  metadata.readout_rule_ref = readText(saved.readoutRuleRef);
  const batch = {
    id: readText(saved.batchId), acquisitionRunId: readText(saved.runId), countUnit: readText(saved.countUnit),
    clockId: readText(saved.clockId), timeOrigin: readText(saved.timeOrigin),
    metadata: {
      ...metadata, role_assigned_at_utc: nullableText(saved.roleAssignedAtUtc),
      clock_alignment_ref: nullableText(saved.clockAlignmentRef),
    },
  };
  if (!isDigest(saved.sha256) || !Array.isArray(saved.records) || !isUtc(metadata.acquired_at_utc)
      || (batch.metadata.role_assigned_at_utc !== null && !isUtc(batch.metadata.role_assigned_at_utc))
      || (batch.metadata.clock_alignment_ref !== null && !realReference(batch.metadata.clock_alignment_ref))
      || ![batch.acquisitionRunId, batch.countUnit, batch.clockId, batch.timeOrigin, ...Object.values(metadata)].every(realReference)) {
    throw invalidArtifact();
  }
  const records = saved.records.map(readSite);
  const keys = new Set<string>();
  for (const site of records) {
    const key = JSON.stringify([site.attemptId, site.siteId]);
    if (site.batchId !== batch.id || keys.has(key)
        || [site.attemptLogRef, site.previousAttemptRef, ...site.frames.map(frame => frame.sourceRef)]
          .some(ref => ref !== null && !realReference(ref))) throw invalidArtifact();
    keys.add(key);
  }
  if (screeningIssues(records).length) throw invalidArtifact();
  return { batch, records, filename: readText(saved.filename), sha256: saved.sha256 };
}

function readFrozenMeasuredReadout(raw: Record<string, unknown>): SenooFrozenMeasuredReadout {
  const { frozenAtUtc } = raw;
  if (raw.evidence !== 'declared-measured-calibration' || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)
      || raw.method !== 'explicit-dual-threshold-candidate' || !isUtc(frozenAtUtc)) throw invalidArtifact();
  if (raw.schemaVersion === 1 && Object.hasOwn(raw, 'acceptancePlan')) throw invalidArtifact();
  const rule = object(raw.candidate);
  if (!finite(rule.first) || !finite(rule.second)) throw invalidArtifact();
  const candidate = candidateRule({
    first: rule.first, second: rule.second,
    firstComparison: choice(rule.firstComparison, ['ge', 'gt']), secondComparison: choice(rule.secondComparison, ['ge', 'gt']),
  });
  const saved = object(raw.assessment);
  const input = readArchivedAssessmentInput(saved, object(raw.conditions));
  const assessment = summarize(input, candidate);
  if (!matchesJson(saved, assessment)) throw invalidArtifact();
  const base: SenooFrozenMeasuredReadoutBase = {
    evidence: 'declared-measured-calibration', method: 'explicit-dual-threshold-candidate',
    frozenAtUtc, acceptancePlanRef: nullableText(raw.acceptancePlanRef), candidate, conditions: conditions(input.batch), assessment,
  };
  return raw.schemaVersion === 2
    ? snapshot({ ...base, schemaVersion: 2, acceptancePlan: parseSenooReadoutAcceptancePlan(raw.acceptancePlan) })
    : snapshot({ ...base, schemaVersion: 1 });
}

export function parseSenooFrozenMeasuredReadout(text: string): SenooFrozenMeasuredReadout {
  let raw: Record<string, unknown>;
  try {
    raw = object(JSON.parse(text));
  } catch {
    throw invalidArtifact();
  }
  return readFrozenMeasuredReadout(raw);
}

export function parseSenooMeasuredVerificationReport(text: string): SenooMeasuredVerificationReport {
  try {
    const raw = object(JSON.parse(text));
    const { schemaVersion } = raw;
    if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3) throw invalidVerification();
    const frozen = readFrozenMeasuredReadout(object(raw.frozen));
    const modern = schemaVersion === 3;
    if (modern ? raw.kind !== 'senoo-measured-verification' : schemaVersion !== frozen.schemaVersion) throw invalidVerification();

    const saved = object(raw.verification);
    // Legacy files preserved outcomes and records, with only the calibration conditions in the envelope.
    const input = readArchivedAssessmentInput(saved, modern ? object(raw.holdoutConditions) : frozen.conditions);
    const verification = verifyMeasuredInput(frozen, input);
    const report: SenooMeasuredVerificationReport = modern ? {
      kind: 'senoo-measured-verification', schemaVersion, frozen, holdoutConditions: conditions(input.batch), verification,
    } : { schemaVersion, frozen, verification };
    // The first v1 exports predated numerical acceptance criteria and omitted this field.
    const archived = schemaVersion === 1 && !Object.hasOwn(saved, 'acceptance')
      ? { ...raw, verification: { ...saved, acceptance: null } }
      : raw;
    if (!matchesJson(archived, report)) throw invalidVerification();
    return snapshot(report);
  } catch {
    throw invalidVerification();
  }
}

export function checkSenooMeasuredVerificationWorkbook(
  report: SenooMeasuredVerificationReport, workbook: SenooMeasuredWorkbook | null,
): 'match' | 'different-workbook' | 'no-workbook' {
  if (!workbook) return 'no-workbook';
  const saved = report.verification;
  if (!isDigest(workbook.sha256) || workbook.sha256.toLowerCase() !== saved.sha256.toLowerCase()) return 'different-workbook';

  const input = measuredInput(workbook, saved.batchId, 'validation');
  // A renamed copy still has the same bytes; retain the archived filename for the record comparison.
  const replayed = verifyMeasuredInput(report.frozen, { ...input, filename: saved.filename, sha256: saved.sha256 });
  if (!matchesJson(saved, replayed)
      || (report.schemaVersion === 3 && !matchesJson(report.holdoutConditions, conditions(input.batch)))) {
    throw new Error('工作簿 SHA-256 相符，但独立验证报告与工作簿的逐轮记录或条件不一致。');
  }
  return 'match';
}
