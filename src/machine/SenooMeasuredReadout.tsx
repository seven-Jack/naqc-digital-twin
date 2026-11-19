import { useMemo, useRef, useState } from 'react';
import {
  assessSenooMeasuredCandidate, freezeSenooMeasuredReadout, inspectSenooMeasuredBatch,
  checkSenooMeasuredVerificationWorkbook, createSenooMeasuredVerificationReport,
  parseSenooFrozenMeasuredReadout, parseSenooMeasuredVerificationReport,
  type SenooFrozenMeasuredReadout, type SenooMeasuredAssessment, type SenooMeasuredCandidate,
  type SenooMeasuredVerificationReport, type SenooMeasuredWorkbook,
} from '../physics/senooMeasuredReadout';
import { decisionLabels, groupLabels } from './senooMeasurementLabels';
import { SenooCalibrationThresholdScan } from './SenooCalibrationThresholdScan';
import {
  createSenooReadoutAcceptanceDraft, readSenooReadoutAcceptanceDraft,
  SenooReadoutAcceptanceEditor, SenooReadoutAcceptanceResult, SenooReadoutAcceptanceSummary,
} from './SenooReadoutAcceptancePanel';
import './senoo-synthetic-workflow.css';
import './senoo-measured-readout.css';

type ThresholdDraft = Omit<SenooMeasuredCandidate, 'first' | 'second'> & { first: string; second: string };
const emptyDraft: ThresholdDraft = { first: '', second: '', firstComparison: 'ge', secondComparison: 'ge' };
const comparisonLabels = { ge: '≥', gt: '>' };
const outcomeLabels = { m0: 'm₀', m1: 'm₁', 'no-atom': '双暗', ambiguous: '歧义' };

function fraction(numerator: number, denominator: number) {
  return denominator ? `${numerator}/${denominator}` : '分母为 0';
}

function saveJson(filename: string, value: unknown) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function BatchIssues({ issues }: { issues: readonly string[] }) {
  if (!issues.length) return null;
  return <details className="smf-issues" open={issues.length <= 3}>
    <summary>待核对输入（{issues.length} 项）</summary>
    <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
  </details>;
}

function Assessment({ result, showSamples = false }: { result: SenooMeasuredAssessment; showSamples?: boolean }) {
  const { denominators, totals, groups, samples } = result;
  return <div className="ssw-result">
    <div className="smf-identity">
      <p>批次 <code>{result.batchId}</code> · 采集 <code>{result.runId}</code> · 工况 <code>{result.workingPoint}</code></p>
      <details><summary>工作簿来源</summary><p>{result.filename} · SHA-256 <code>{result.sha256}</code></p></details>
    </div>
    <dl className="ssw-denominators">
      <div><dt>尝试位点</dt><dd>{denominators.attemptedSites}</dd></div>
      <div><dt>制备通过</dt><dd>{denominators.prepPassed}</dd></div>
      <div><dt>有效配对</dt><dd>{denominators.validPairs}</dd></div>
      <div><dt>原记录纳入</dt><dd>{denominators.included}</dd></div>
      <div><dt>可评估</dt><dd>{denominators.evaluated}</dd></div>
    </dl>
    <dl className="ssw-denominators ssw-outcomes">
      <div><dt>自旋错标</dt><dd>{fraction(totals.wrongSpin, totals.spinEvaluated)}</dd></div>
      <div><dt>自旋判丢失</dt><dd>{fraction(totals.falseLoss, totals.spinEvaluated)}</dd></div>
      <div><dt>全组歧义</dt><dd>{fraction(totals.ambiguous, totals.evaluated)}</dd></div>
      <div><dt>空位误报</dt><dd>{fraction(totals.emptyFalsePositive, totals.emptyEvaluated)}</dd></div>
    </dl>
    <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="正式流程的制备组统计">
      <table className="ssw-table">
        <thead><tr><th scope="col">制备组</th><th scope="col">尝试位点</th><th scope="col">制备通过</th>
          <th scope="col">有效配对</th><th scope="col">原记录纳入</th><th scope="col">可评估</th>
          <th scope="col">错标／误报</th><th scope="col">双暗</th><th scope="col">歧义</th></tr></thead>
        <tbody>{groups.map(group => <tr key={group.preparedGroup}>
          <th scope="row">{groupLabels[group.preparedGroup]}</th><td>{group.attemptedSites}</td>
          <td>{group.prepPassed}</td><td>{group.validPairs}</td><td>{group.included}</td><td>{group.evaluated}</td>
          <td>{fraction(group.wrongLabel, group.evaluated)}</td><td>{fraction(group.reportedLoss, group.evaluated)}</td>
          <td>{fraction(group.ambiguous, group.evaluated)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {showSamples && <details className="ssw-samples">
      <summary>逐位点判读（{samples.length}）</summary>
      <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="独立验证逐位点判读">
        <table className="ssw-table">
          <thead><tr><th scope="col">尝试</th><th scope="col">位点</th><th scope="col">制备组</th>
            <th scope="col">两帧（{result.countUnit}）</th><th scope="col">原仪器判决</th><th scope="col">冻结规则判读</th></tr></thead>
          <tbody>{samples.map(sample => <tr key={JSON.stringify([sample.attemptId, sample.siteId])}>
            <th scope="row"><code>{sample.attemptId}</code></th><td><code>{sample.siteId}</code></td>
            <td>{groupLabels[sample.preparedGroup]}</td><td>{sample.counts.first} / {sample.counts.second}</td>
            <td>{sample.originalDecision ? decisionLabels[sample.originalDecision] : '未记录'}</td>
            <td>{sample.outcome === 'no-atom' ? (sample.preparedGroup === 'empty_control' ? '判空位' : '判丢失') : outcomeLabels[sample.outcome]}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </div>;
}

const workbookLabels = {
  'no-workbook': '待导入原始验证工作簿', 'different-workbook': '当前工作簿与报告来源不同',
  match: '原始验证工作簿及重算结果一致', conflict: '工作簿与报告记录冲突',
};

function VerificationReplay({ workbook }: { workbook: SenooMeasuredWorkbook | null }) {
  const [loaded, setLoaded] = useState<{ report: SenooMeasuredVerificationReport; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const workbookCheck = useMemo(() => {
    if (!loaded) return null;
    try {
      return { status: checkSenooMeasuredVerificationWorkbook(loaded.report, workbook), issue: null };
    } catch (problem) {
      return { status: 'conflict' as const, issue: problem instanceof Error ? problem.message : '与原始验证工作簿的核对失败。' };
    }
  }, [loaded, workbook]);

  async function load(file: File) {
    const generation = ++request.current;
    setError(null);
    try {
      const text = await file.text();
      if (generation !== request.current) return;
      setLoaded({ report: parseSenooMeasuredVerificationReport(text), filename: file.name });
    } catch (problem) {
      if (generation === request.current) setError(problem instanceof Error ? problem.message : '验证报告导入失败。');
    }
  }

  return <section className="smf-verification-replay" aria-label="重算独立验证报告" data-testid="senoo-measured-verification-replay"
    data-workbook-status={workbookCheck?.status} data-report-version={loaded?.report.schemaVersion}>
    <h4>重算独立验证报告</h4>
    <div className="ss-file-actions"><label>导入独立验证报告 JSON
      <input type="file" aria-label="导入独立验证报告 JSON" accept=".json,application/json" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void load(file);
      }} />
    </label></div>
    {error && <p className="smi-error" role="alert">导入新报告失败。{error}</p>}
    {loaded && workbookCheck && <>
      <p>当前报告 <code>{loaded.filename}</code> · v{loaded.report.schemaVersion} · 批次 <code>{loaded.report.verification.batchId}</code>
        {' · '}报告内部重算一致 · {workbookLabels[workbookCheck.status]}</p>
      {loaded.report.schemaVersion !== 3 && <p className="smi-note">旧版报告以嵌入记录重算，独立批次的工作条件由原始工作簿核对。</p>}
      {workbookCheck.issue && <p className="smi-error" role="alert">{workbookCheck.issue}</p>}
      <details className="smf-verification-detail"><summary>核对分母、区间及逐位点判读</summary>
        <SenooReadoutAcceptanceResult result={loaded.report.verification.acceptance} />
        <Assessment result={loaded.report.verification} showSamples />
      </details>
    </>}
  </section>;
}

export function SenooMeasuredReadout({ workbook }: { workbook: SenooMeasuredWorkbook | null }) {
  const [calibrationId, setCalibrationId] = useState('');
  const [validationId, setValidationId] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [acceptancePlanRef, setAcceptancePlanRef] = useState('');
  const [acceptanceDraft, setAcceptanceDraft] = useState(createSenooReadoutAcceptanceDraft);
  const [review, setReview] = useState<{
    workbook: SenooMeasuredWorkbook; draft: ThresholdDraft; candidate: SenooMeasuredCandidate; assessment: SenooMeasuredAssessment;
  } | null>(null);
  const [frozen, setFrozen] = useState<SenooFrozenMeasuredReadout | null>(null);
  const [verification, setVerification] = useState<{ workbook: SenooMeasuredWorkbook; report: SenooMeasuredVerificationReport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRequest = useRef(0);

  const measuredBatches = workbook?.report.batches.filter(batch => batch.sourceKind === 'measured') ?? [];
  const calibrations = measuredBatches.filter(batch => batch.role === 'calibration');
  const validations = measuredBatches.filter(batch => batch.role === 'validation');
  const calibration = calibrations.find(batch => batch.id === calibrationId) ?? calibrations[0];
  const validation = validations.find(batch => batch.id === validationId) ?? validations[0];
  const calibrationInput = useMemo(() => workbook && calibration
    ? inspectSenooMeasuredBatch(workbook, calibration.id, 'calibration') : null, [workbook, calibration]);
  const validationInput = useMemo(() => workbook && validation
    ? inspectSenooMeasuredBatch(workbook, validation.id, 'validation') : null, [workbook, validation]);
  const currentReview = review && review.workbook === workbook && review.draft === draft
    && review.assessment.batchId === calibration?.id ? review : null;
  const currentReport = verification && verification.workbook === workbook && verification.report.verification.batchId === validation?.id
    ? verification.report : null;
  const currentVerification = currentReport?.verification ?? null;
  const candidateEntered = draft.first.trim() !== '' && draft.second.trim() !== ''
    && Number.isFinite(Number(draft.first)) && Number.isFinite(Number(draft.second));

  function run(work: () => void) {
    setError(null);
    try {
      work();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '读出校验失败。');
    }
  }

  async function importFrozen(file: File) {
    const request = ++importRequest.current;
    setError(null);
    try {
      const text = await file.text();
      if (request !== importRequest.current) return;
      const artifact = parseSenooFrozenMeasuredReadout(text);
      setFrozen(artifact);
      setVerification(null);
      setReview(null);
    } catch (problem) {
      if (request === importRequest.current) setError(problem instanceof Error ? problem.message : '冻结规则导入失败。');
    }
  }

  return <section className="ssw-panel smf-panel" data-testid="senoo-measured-readout" aria-label="双曝光正式标定与独立验证">
    <div className="smf-header">
      <h3>双曝光正式标定与独立验证</h3>
      <span>{measuredBatches.length ? '工作簿实测声明待来源核对' : '待同装置实测'}</span>
    </div>
    <p className="smi-note">使用同装置的标定批次评估候选规则，冻结后再导入或选择独立验证批次。两次曝光的原阈值、比较关系和判决随结果归档。</p>
    <div className="ssw-steps">
      <section className="ssw-step" aria-label="正式标定候选">
        <h4>候选评估与冻结</h4>
        {calibration ? <div className="smi-detail-controls"><label>实测标定批次
          <select value={calibration.id} disabled={!!frozen} onChange={event => setCalibrationId(event.target.value)}>
            {calibrations.map(batch => <option key={batch.id} value={batch.id}>{batch.id}</option>)}
          </select>
        </label></div> : <p className="smi-note">等待实测标定工作簿中的 calibration 批次。</p>}
        {calibrationInput && <BatchIssues issues={calibrationInput.issues} />}
        {!frozen && <div className="smf-fields">
          {(['first', 'second'] as const).map((frame, index) => {
            const comparison = frame === 'first' ? 'firstComparison' : 'secondComparison';
            const label = `Image ${index + 1}`;
            return <div key={frame} className="smf-field">
              <label>{label} 候选阈值
                <input type="number" step="any" value={draft[frame]}
                  onChange={event => setDraft({ ...draft, [frame]: event.target.value })} />
              </label>
              <label>{label} 判亮
                <select value={draft[comparison]} onChange={event =>
                  setDraft({ ...draft, [comparison]: event.target.value === 'gt' ? 'gt' : 'ge' })}>
                  <option value="ge">≥ 阈值</option><option value="gt">&gt; 阈值</option>
                </select>
              </label>
            </div>;
          })}
          <label>验收方案引用（选填）<input type="text" value={acceptancePlanRef}
            onChange={event => setAcceptancePlanRef(event.target.value)} /></label>
          <SenooReadoutAcceptanceEditor draft={acceptanceDraft} onChange={setAcceptanceDraft} />
        </div>}
        <SenooCalibrationThresholdScan workbook={workbook} calibrationId={calibration?.id ?? null} locked={!!frozen}
          enabled={!!calibrationInput && calibrationInput.issues.length === 0}
          firstComparison={frozen?.candidate.firstComparison ?? draft.firstComparison}
          secondComparison={frozen?.candidate.secondComparison ?? draft.secondComparison}
          onChoose={candidate => setDraft({ ...candidate, first: String(candidate.first), second: String(candidate.second) })} />
        <div className="ssw-actions">
          <button type="button" disabled={!!frozen || !candidateEntered || !calibrationInput || !!calibrationInput.issues.length}
            onClick={() => workbook && calibration && run(() => {
              const candidate = { ...draft, first: Number(draft.first), second: Number(draft.second) };
              const assessment = assessSenooMeasuredCandidate(workbook, calibration.id, candidate);
              setReview({ workbook, draft, candidate, assessment });
            })}>评估候选阈值</button>
          <button type="button" disabled={!!frozen || !currentReview}
            onClick={() => currentReview && run(() => {
              const acceptancePlan = readSenooReadoutAcceptanceDraft(acceptanceDraft);
              importRequest.current++;
              setFrozen(freezeSenooMeasuredReadout(currentReview.workbook, currentReview.assessment.batchId,
                currentReview.candidate, new Date().toISOString(), acceptancePlanRef, acceptancePlan));
              setVerification(null);
            })}>冻结已评估规则</button>
        </div>
      </section>
      <section className="ssw-step" aria-label="正式独立验证">
        <h4>独立批次判读</h4>
        {validation ? <div className="smi-detail-controls"><label>实测验证批次
          <select value={validation.id} onChange={event => setValidationId(event.target.value)}>
            {validations.map(batch => <option key={batch.id} value={batch.id}>{batch.id}</option>)}
          </select>
        </label></div> : <p className="smi-note">等待独立采集的 validation 批次。</p>}
        {validationInput && <BatchIssues issues={validationInput.issues} />}
        <div className="ssw-actions">
          <button type="button" disabled={!frozen || !validationInput || !!validationInput.issues.length || !!currentVerification}
            onClick={() => workbook && validation && frozen && run(() =>
              setVerification({ workbook, report: createSenooMeasuredVerificationReport(frozen, workbook, validation.id) }))}>运行独立验证</button>
          <div className="ss-file-actions"><label>导入冻结规则 JSON
            <input type="file" aria-label="导入冻结规则 JSON" accept=".json,application/json"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void importFrozen(file);
              }} />
          </label></div>
        </div>
      </section>
    </div>
    {error && <p className="smi-error" role="alert">{error}</p>}
    {currentReview && !frozen && <div className="smf-review"><h4>标定批次候选评估</h4><Assessment result={currentReview.assessment} /></div>}
    {frozen && <div className="ssw-frozen" data-testid="senoo-measured-frozen">
      <h4>已冻结规则</h4>
      <p>Image 1 {comparisonLabels[frozen.candidate.firstComparison]} <strong>{frozen.candidate.first}</strong>
        {' · '}Image 2 {comparisonLabels[frozen.candidate.secondComparison]} <strong>{frozen.candidate.second}</strong> {frozen.assessment.countUnit}</p>
      <p className="smi-note">冻结时间 <code>{frozen.frozenAtUtc}</code> · 验收方案 <code>{frozen.acceptancePlanRef ?? '未登记'}</code></p>
      <SenooReadoutAcceptanceSummary plan={frozen.acceptancePlan ?? null} />
      <Assessment result={frozen.assessment} />
    </div>}
    {currentVerification && <div className="smf-review" data-testid="senoo-measured-verification">
      <h4>独立批次判读结果</h4>
      {currentVerification.crossWorkpoint && <p className="smi-note">跨工况验证。适用范围按该独立批次工况另行核对。</p>}
      <SenooReadoutAcceptanceResult result={currentVerification.acceptance} />
      <Assessment result={currentVerification} showSamples />
    </div>}
    <p className="smi-note">结果按原记录纳入、两帧有效且计数可用的位点报告。正式验收需核对来源、预设指标和同轮位点相关性。</p>
    <div className="ssw-actions">
      <button type="button" disabled={!frozen}
        onClick={() => frozen && saveJson(`senoo-measured-frozen-v${frozen.schemaVersion}.json`, frozen)}>导出冻结规则 JSON</button>
      {currentReport && <button type="button" onClick={() =>
        saveJson(`senoo-measured-verification-v${currentReport.schemaVersion}.json`, currentReport)}>导出独立验证 JSON</button>}
      {frozen && <button type="button" onClick={() => {
        importRequest.current++;
        setFrozen(null);
        setVerification(null);
        setReview(null);
        setError(null);
      }}>清除当前冻结规则</button>}
    </div>
    <VerificationReplay workbook={workbook} />
  </section>;
}
