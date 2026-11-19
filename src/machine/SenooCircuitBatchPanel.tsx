import { Download, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { parseSenooBellObservations, type SenooBellObservations } from '../physics/senooBellObservations';
import { parseSenooBellAcquisitionSchedule, type SenooBellAcquisitionSchedule } from '../physics/senooBellAcquisition';
import { parseSenooBellPrediction, type SenooBellPrediction } from '../physics/senooBellPrediction';
import { createSenooCircuitBatchTemplate, parseSenooCircuitBatch, type SenooCircuitBatch } from '../physics/senooCircuitBatch';
import {
  compareSenooCircuitPrediction, createSenooCircuitPredictionTemplate, parseSenooCircuitPrediction,
  type SenooCircuitPrediction, type SenooCircuitPredictionComparison,
} from '../physics/senooCircuitPrediction';
import { assessSenooCircuitReadoutEvidence, senooCircuitReadoutVerificationScope } from '../physics/senooCircuitReadoutEvidence';
import { summarizeSenooCircuitBatch } from '../physics/senooCircuitStatistics';
import {
  parseSenooFrozenMeasuredReadout, parseSenooMeasuredVerificationReport,
  type SenooFrozenMeasuredReadout, type SenooMeasuredVerificationReport,
} from '../physics/senooMeasuredReadout';
import { SenooBellObservationsPanel, type CircuitImportNotice, type ImportedCircuitDocument } from './SenooBellObservations';
import './senoo-circuit-batch.css';

type Statistics = ReturnType<typeof summarizeSenooCircuitBatch>;
type Attempt = SenooCircuitBatch['attempts'][number];
type InputName = 'batch' | 'rule' | 'verification' | 'prediction' | 'bell' | 'bellSchedule' | 'bellPrediction';

const stages = { load: '装载', transport: '输运', gate: '电路门', readout: '读出' } as const;
const stageStatuses = { executed: '已执行', failed: '失败', skipped: '跳过' } as const;
const frameStatuses = { valid: '有效', missing: '缺帧', invalid: '无效', skipped: '跳过' } as const;
const decisions = { m0: 'm₀', m1: 'm₁', 'no-atom': '双暗', ambiguous: '歧义' } as const;
const countLabels = {
  attempted: '全部尝试',
  postTransportReady: '输运后目标位点齐备',
  circuitExecuted: '电路已执行',
  readoutAttempted: '电路后读出已尝试',
  completeFramePairs: '全位点有效双帧',
  validReadout: '全部有效位串',
  analysisIncluded: '电路已执行且纳入分析',
  selectedCompleteFramePairs: '纳入轮次的全位点有效双帧',
  selectedValidReadout: '纳入轮次的有效位串',
  reportedLoss: '双暗轮次',
  ambiguous: '双亮歧义轮次',
  missingOrInvalidFrames: '缺帧或无效帧轮次',
} as const;
const metricLabels = {
  postTransportReady: '输运后目标位点齐备率',
  circuitExecuted: '电路执行率',
  validReadout: '全尝试有效读出率',
  validReadoutGivenGate: '已执行电路的有效读出率',
  reportedLossGivenCompleteFrames: '双暗判丢失率（双帧齐全轮）',
  ambiguityGivenCompleteFrames: '双亮歧义率（双帧齐全轮）',
  targetBitstringPopulation: '目标位串布居（纳入的有效位串）',
  parity: '测量基奇偶相关（纳入的有效位串）',
} as const;
const readoutLabels = {
  'awaiting-rule': '待导入匹配的冻结读出规则',
  evaluated: '已按同工况冻结规则判读',
  synthetic: '合成记录判读',
} as const;
const inputLabels = { batch: '整机批次', rule: '读出冻结规则', verification: '读出验证报告', prediction: '整机预测' } as const;
const readoutEvidenceLabels = {
  none: '待整机批次核对',
  'replayed-insufficient': '报告已重算 · 适用证据不足',
  'criteria-met': '报告已重算 · 符合同工况读出判据',
  incompatible: '报告与整机输入冲突',
} as const;
const verificationDecisionLabels = {
  pass: '达到读出判据', fail: '超出读出判据', inconclusive: '读出证据不足', 'cross-workpoint': '跨工况对照',
} as const;
const comparisonLabels = {
  pass: '工况与区间满足预设判据',
  fail: '至少一项超出预设范围',
  inconclusive: '现有证据不足',
} as const;

function saveText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveJson(filename: string, value: unknown) {
  saveText(filename, JSON.stringify(value, null, 2), 'application/json');
}

function valueText(value: number | string | null | undefined, unit?: string) {
  if (value === undefined || value === null) return '未记录';
  return unit ? `${value} ${unit}` : String(value);
}

function valueRate(value: number | null, parity = false) {
  if (value === null) return '无可用分母';
  return parity ? value.toFixed(4) : `${(value * 100).toFixed(2)}%`;
}

function AttemptEvidence({ attempt, analysis, countUnit }: {
  attempt: Attempt;
  analysis: Statistics['attempts'][number];
  countUnit: string;
}) {
  return <div className="scb-attempt" data-testid="senoo-circuit-attempt-detail" data-attempt-id={attempt.attemptId}
    data-selection-status={attempt.selection.status}>
    <dl className="scb-facts">
      <div><dt>装载后占位</dt><dd>{attempt.initialOccupiedSiteIds.join('、') || '空'}</dd></div>
      <div><dt>输运后占位</dt><dd>{attempt.postTransportOccupiedSiteIds.join('、') || '空'}</dd></div>
      <div><dt>原始尝试日志</dt><dd><code>{attempt.sourceRef}</code></dd></div>
      <div><dt>有效位串</dt><dd><code>{analysis.bitstring ?? '未得到'}</code></dd></div>
      <div><dt>原记录的分析筛选</dt><dd>{attempt.selection.status === 'included' ? '纳入' : '筛除'}</dd></div>
      <div><dt>筛选依据</dt><dd><code>{attempt.selection.sourceRef}</code></dd></div>
      {attempt.selection.reason && <div><dt>筛选原因</dt><dd>{attempt.selection.reason}</dd></div>}
    </dl>
    <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="整机工序记录">
      <table className="smi-table scb-stage-table">
        <thead><tr><th scope="col">工序</th><th scope="col">状态</th><th scope="col">起点（s）</th>
          <th scope="col">终点（s）</th><th scope="col">日志与原因</th></tr></thead>
        <tbody>{(Object.keys(stages) as (keyof typeof stages)[]).map(stage => {
          const record = attempt.stages[stage];
          return <tr key={stage} data-stage={stage} data-stage-status={record.status}>
            <th scope="row">{stages[stage]}</th><td>{stageStatuses[record.status]}</td>
            <td>{valueText(record.startS)}</td><td>{valueText(record.endS)}</td>
            <td><code>{valueText(record.sourceRef)}</code>{record.reason && <p>{record.reason}</p>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="scb-sites">{attempt.sites.map((site, index) => {
      const outcome = analysis.outcomes[index]?.decision;
      return <section key={site.siteId} className="scb-site">
        <h4>位点 <code>{site.siteId}</code></h4>
        <p>原仪器判决 {site.instrumentDecision ? decisions[site.instrumentDecision] : '未记录'}
          {' · '}本次判读 {outcome ? decisions[outcome] : '未判读'}</p>
        <div className="smi-frames">{site.frames.map(frame => (
          <section className="smi-frame" key={frame.imageNo} data-status={frame.status}>
            <h4>Image {frame.imageNo}<span>{frameStatuses[frame.status]}</span></h4>
            <dl>
              <div><dt>曝光 ID</dt><dd>{valueText(frame.exposureId)}</dd></div>
              <div><dt>位点 ROI</dt><dd>{valueText(frame.roiId)}</dd></div>
              <div><dt>判决计数</dt><dd>{valueText(frame.count, countUnit)}</dd></div>
              <div><dt>实际阈值</dt><dd>{frame.comparison === 'ge' ? '≥ ' : frame.comparison === 'gt' ? '> ' : ''}
                {valueText(frame.actualThreshold, countUnit)}</dd></div>
              <div><dt>采集触发</dt><dd>{valueText(frame.triggerS, 's')}</dd></div>
              <div><dt>曝光起点</dt><dd>{valueText(frame.startS, 's')}</dd></div>
              <div><dt>曝光终点</dt><dd>{valueText(frame.endS, 's')}</dd></div>
              <div><dt>计数可用</dt><dd>{valueText(frame.countReadyS, 's')}</dd></div>
              <div><dt>原始帧或计数日志</dt><dd>{valueText(frame.sourceRef)}</dd></div>
            </dl>
          </section>
        ))}</div>
      </section>;
    })}</div>
  </div>;
}

function BitstringCounts({ label, outcomes }: { label: string; outcomes: Statistics['bitstrings'] }) {
  if (!outcomes.length) return <p className="smi-note">{label}为 0。</p>;
  return <details className="scb-detail">
    <summary>{label}（{outcomes.length} 种）</summary>
    <div className="smi-table-scroll" role="region" tabIndex={0} aria-label={label}>
      <table className="smi-table scb-metrics">
        <thead><tr><th scope="col">位串</th><th scope="col">计数</th><th scope="col">条件比例</th></tr></thead>
        <tbody>{outcomes.map(outcome => (
          <tr key={outcome.bitstring}><th scope="row"><code>{outcome.bitstring}</code></th>
            <td>{outcome.count}</td><td>{valueRate(outcome.probability)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  </details>;
}

function PredictionComparison({ comparison }: { comparison: SenooCircuitPredictionComparison }) {
  return <section className="scb-comparison" aria-label="整机批次与预先记录的预测对照"
    data-testid="senoo-circuit-prediction-comparison" data-comparison-status={comparison.status}>
    <div className="scb-header">
      <h4>独立批次与预测对照</h4>
      <span>{comparisonLabels[comparison.status]}</span>
    </div>
    <p className="smi-note">模型 <code>{comparison.modelVersion}</code> · 预测时标 <code>{comparison.predictedAtUtc}</code>
      {' · '}同时置信水平 {valueRate(comparison.confidenceLevel)} · {comparison.scope === 'synthetic' ? '合成核对' : '按声明的条件核对'}</p>
    <details className="scb-detail">
      <summary>查看观测区间、预测范围和残差</summary>
      <p className="scb-scroll-hint">左右滑动查看各列</p>
      <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="整机预测区间与残差">
        <table className="smi-table scb-comparison-table">
          <thead><tr><th scope="col">观测量</th><th scope="col">分子 / 分母</th><th scope="col">观测（区间）</th>
            <th scope="col">预测（判据范围）</th><th scope="col">观测减预测</th><th scope="col">结论</th></tr></thead>
          <tbody>{comparison.metrics.map(metric => {
            const parity = metric.key === 'parity';
            const residual = metric.residual === null ? '未估计'
              : parity ? metric.residual.toFixed(4) : `${(metric.residual * 100).toFixed(2)} 个百分点`;
            return <tr key={metric.key} data-prediction-metric={metric.key}>
              <th scope="row">{metricLabels[metric.key]}</th>
              <td>{metric.denominator === null ? '—' : `${metric.numerator} / ${metric.denominator}`}</td>
              <td>{metric.observed === null ? '未估计' : valueRate(metric.observed, parity)}
                {metric.lower !== null && metric.upper !== null && <small>
                  {valueRate(metric.lower, parity)} 至 {valueRate(metric.upper, parity)}
                </small>}</td>
              <td>{valueRate(metric.expected, parity)}<small>
                {valueRate(metric.bandLower, parity)} 至 {valueRate(metric.bandUpper, parity)}
              </small></td>
              <td>{residual}</td><td>{comparisonLabels[metric.status]}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </details>
  </section>;
}

export function SenooCircuitBatchPanel() {
  const [batch, setBatch] = useState<ImportedCircuitDocument<SenooCircuitBatch> | null>(null);
  const [rule, setRule] = useState<ImportedCircuitDocument<SenooFrozenMeasuredReadout> | null>(null);
  const [verification, setVerification] = useState<ImportedCircuitDocument<SenooMeasuredVerificationReport> | null>(null);
  const [prediction, setPrediction] = useState<ImportedCircuitDocument<SenooCircuitPrediction> | null>(null);
  const [bell, setBell] = useState<ImportedCircuitDocument<SenooBellObservations> | null>(null);
  const [bellSchedule, setBellSchedule] = useState<ImportedCircuitDocument<SenooBellAcquisitionSchedule> | null>(null);
  const [bellPrediction, setBellPrediction] = useState<ImportedCircuitDocument<SenooBellPrediction> | null>(null);
  const [notices, setNotices] = useState<Partial<Record<InputName, CircuitImportNotice>>>({});
  const [attemptIndex, setAttemptIndex] = useState(0);
  const requests = useRef({ batch: 0, rule: 0, verification: 0, prediction: 0, bell: 0, bellSchedule: 0, bellPrediction: 0 });
  const assessed = useMemo(() => batch
    ? assessSenooCircuitReadoutEvidence(batch.record, rule?.record ?? null, verification?.record ?? null)
    : null, [batch, rule, verification]);
  const stats = assessed?.stats;
  const readoutEvidence = assessed?.evidence ?? 'none';
  const predictionReview = useMemo(() => {
    if (!batch || !stats || !prediction) return null;
    try {
      return { comparison: compareSenooCircuitPrediction(prediction.record, batch.record, stats), issue: null };
    } catch (error) {
      return { comparison: null, issue: error instanceof Error ? error.message : '预测与批次条件不匹配。' };
    }
  }, [batch, stats, prediction]);

  async function open<T>(file: File, name: InputName, parse: (text: string) => T, keep: (record: ImportedCircuitDocument<T>) => void) {
    const request = ++requests.current[name];
    setNotices(previous => ({ ...previous, [name]: { status: 'pending' } }));
    try {
      const bytes = await file.arrayBuffer();
      if (request !== requests.current[name]) return;
      const record = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
      if (request !== requests.current[name]) return;
      const sha256 = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : null;
      keep({ filename: file.name, sha256, record });
      setNotices(previous => ({ ...previous, [name]: undefined }));
    } catch (error) {
      if (request === requests.current[name]) setNotices(previous => ({
        ...previous, [name]: { status: 'error', message: error instanceof Error ? error.message : '读取 JSON 失败。' },
      }));
    }
  }

  function exportStatistics() {
    if (!batch || !stats) return;
    const appliedRule = assessed?.appliedRule;
    const recordedVerification = batch.record.sourceKind === 'measured' ? verification : null;
    const comparedPrediction = predictionReview?.comparison ? prediction : null;
    saveJson('senoo-circuit-statistics-v1.json', {
      kind: 'senoo-circuit-statistics', schemaVersion: 1,
      evidence: batch.record.sourceKind === 'measured' ? 'declared-measured-circuit' : 'synthetic-circuit',
      inputs: {
        circuitBatch: { filename: batch.filename, sha256: batch.sha256 },
        frozenReadout: appliedRule ? {
          source: rule ? 'frozen-rule-file' : 'verification-report', filename: rule?.filename ?? null, sha256: rule?.sha256 ?? null,
          schemaVersion: appliedRule.schemaVersion, frozenAtUtc: appliedRule.frozenAtUtc,
          calibrationBatchId: appliedRule.assessment.batchId, calibrationRunId: appliedRule.assessment.runId,
          calibrationSha256: appliedRule.assessment.sha256, candidate: appliedRule.candidate,
        } : null,
        readoutVerification: recordedVerification && {
          filename: recordedVerification.filename, sha256: recordedVerification.sha256, schemaVersion: recordedVerification.record.schemaVersion,
          calibrationRunId: recordedVerification.record.frozen.assessment.runId,
          validationRunId: recordedVerification.record.verification.runId,
          validationSha256: recordedVerification.record.verification.sha256,
          decision: recordedVerification.record.verification.acceptance?.status ?? null,
          scope: senooCircuitReadoutVerificationScope(recordedVerification.record), status: readoutEvidence, issue: assessed?.issue ?? null,
        },
        prediction: comparedPrediction && { filename: comparedPrediction.filename, sha256: comparedPrediction.sha256 },
      },
      batch: batch.record, statistics: stats, prediction: comparedPrediction?.record ?? null,
      comparison: predictionReview?.comparison ?? null,
    });
  }

  const record = batch?.record;
  const attempt = record?.attempts[attemptIndex];
  const attemptStatistics = stats?.attempts[attemptIndex];

  return <section className="scb-panel" aria-label="整机电路独立批次" data-testid="senoo-circuit-batch"
    data-source-kind={record?.sourceKind ?? 'unknown'}>
    <div className="scb-header">
      <h3>整机电路独立批次</h3>
      <span>{record?.sourceKind === 'measured' ? '实测声明 · 待来源核验' : record ? '合成记录' : '待整机记录'}</span>
    </div>
    <p className="smi-note">同一文件记录一个电路版本和一套测量基，保留全部尝试、工序时标和目标位点的原始双帧。</p>
    <div className="md-controls ss-file-actions">
      <button type="button" onClick={() => saveJson('senoo-circuit-batch-template-v1.json', createSenooCircuitBatchTemplate())}>
        <Download size={14} />下载整机批次模板 JSON
      </button>
      <label><Upload size={14} />导入整机批次 JSON
        <input type="file" aria-label="导入整机批次 JSON" accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void open(file, 'batch', parseSenooCircuitBatch, imported => {
            setBatch(imported);
            setAttemptIndex(0);
          });
        }} />
      </label>
      <label><Upload size={14} />导入整机用读出冻结规则 JSON
        <input type="file" aria-label="导入整机用读出冻结规则 JSON" accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void open(file, 'rule', parseSenooFrozenMeasuredReadout, setRule);
        }} />
      </label>
      <label><Upload size={14} />导入整机用读出验证报告 JSON
        <input type="file" aria-label="导入整机用读出验证报告 JSON" accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void open(file, 'verification', parseSenooMeasuredVerificationReport, setVerification);
        }} />
      </label>
      <button type="button" onClick={() => saveJson('senoo-circuit-prediction-template-v1.json', createSenooCircuitPredictionTemplate())}>
        <Download size={14} />下载整机预测模板 JSON
      </button>
      <label><Upload size={14} />导入整机预测 JSON
        <input type="file" aria-label="导入整机预测 JSON" accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void open(file, 'prediction', parseSenooCircuitPrediction, setPrediction);
        }} />
      </label>
    </div>
    {(Object.keys(inputLabels) as (keyof typeof inputLabels)[]).map(name => {
      const notice = notices[name];
      const label = inputLabels[name];
      if (notice?.status === 'pending') return <p className="smi-note" role="status" key={name}>正在校验{label}…</p>;
      if (notice?.status === 'error') return <p className="smi-error" role="alert" key={name}>{label} · {notice.message}</p>;
      return null;
    })}
    {rule && <p className="smi-note">读出冻结规则 <code>{rule.filename}</code> · 标定采集 <code>{rule.record.assessment.runId}</code></p>}
    {verification && <div className="scb-detail" data-testid="senoo-circuit-readout-evidence" data-readout-evidence={readoutEvidence}>
      <p className="smi-note">读出验证报告 <code>{verification.filename}</code> · 留出采集 <code>{verification.record.verification.runId}</code></p>
      <p className="smi-note">{verification.record.verification.acceptance
        ? verificationDecisionLabels[verification.record.verification.acceptance.status] : '仅有描述统计'}
        {' · '}{verification.record.schemaVersion !== 3 ? '旧版重算' : verification.record.verification.crossWorkpoint ? '跨工况' : '同工况'}
        {' · '}{record?.sourceKind === 'synthetic' ? '当前为合成批次' : readoutEvidenceLabels[readoutEvidence]}</p>
      <div className="md-controls">
        <button type="button" onClick={() => {
          ++requests.current.verification;
          setVerification(null);
          setNotices(previous => ({ ...previous, verification: undefined }));
        }}>清除读出验证报告</button>
        {rule && readoutEvidence === 'incompatible' && <button type="button" onClick={() => {
          ++requests.current.rule;
          setRule(null);
          setNotices(previous => ({ ...previous, rule: undefined }));
        }}>清除另行导入的冻结规则</button>}
      </div>
    </div>}
    {prediction && <p className="smi-note">预先记录的整机预测 <code>{prediction.filename}</code></p>}
    {assessed?.issue && <p className="smi-error" role="alert">{assessed.issue}</p>}
    {predictionReview?.issue && <p className="smi-error" role="alert">{predictionReview.issue}</p>}
    {batch && record && stats && <>
      <section className="scb-statistics" aria-label="整机统计" data-testid="senoo-circuit-statistics"
        data-readout-status={stats.readout.status} data-readout-evidence={readoutEvidence}>
        <div className="scb-header">
          <h4>整机统计</h4>
          <span>{readoutLabels[stats.readout.status]}</span>
        </div>
        <dl className="scb-facts">
          <div><dt>批次与采集运行</dt><dd><code>{record.batchId} · {record.acquisitionRunId}</code></dd></div>
          <div><dt>电路与版本</dt><dd><code>{record.circuitId} · {record.circuitVersion}</code></dd></div>
          <div><dt>测量基与位序</dt><dd><code>{record.basis} · {record.siteIds.join('、')}</code></dd></div>
          <div><dt>目标位串</dt><dd><code>{record.targetBitstrings.join('、') || '未指定'}</code></dd></div>
          <div><dt>装置与工况</dt><dd><code>{record.apparatusVersion} · {record.workingPoint}</code></dd></div>
          <div><dt>采集时间</dt><dd><code>{record.acquiredAtUtc}</code></dd></div>
        </dl>
        <dl className="scb-facts scb-counts">
          {(Object.keys(countLabels) as (keyof typeof countLabels)[]).map(key => (
            <div key={key} data-count={key}><dt>{countLabels[key]}</dt><dd>{stats.counts[key] ?? '待判读'}</dd></div>
          ))}
        </dl>
        <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="整机统计指标">
          <table className="smi-table scb-metrics">
            <thead><tr><th scope="col">观测量</th><th scope="col">分子 / 分母</th><th scope="col">结果</th></tr></thead>
            <tbody>{(Object.keys(metricLabels) as (keyof typeof metricLabels)[]).map(key => {
              const metric = stats.metrics[key];
              return <tr key={key} data-metric={key}>
                <th scope="row">{metricLabels[key]}</th>
                <td>{metric ? `${metric.numerator} / ${metric.denominator}` : '—'}</td>
                <td>{metric ? valueRate(metric.value, key === 'parity') : '未估计'}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {stats.bitstrings.length > 0 && <BitstringCounts label="全部有效位串计数" outcomes={stats.bitstrings} />}
        {stats.counts.selectedValidReadout !== stats.counts.validReadout
          && <BitstringCounts label="纳入后的有效位串计数" outcomes={stats.selectedBitstrings} />}
        <p className="smi-note">双暗为读出判决。物理丢失需独立存活对照。目标布居与奇偶相关采用本测量基下纳入分析的有效位串。</p>
      </section>
      {predictionReview?.comparison && <PredictionComparison comparison={predictionReview.comparison} />}
      <details className="scb-detail">
        <summary>查看所选尝试的原始记录</summary>
        <div className="smi-detail-controls">
          <label>整机尝试序号
            <input type="number" aria-label="整机尝试序号" min={1} max={record.attempts.length}
              value={attemptIndex + 1} onChange={event => {
                const next = event.currentTarget.valueAsNumber;
                if (Number.isInteger(next) && next >= 1 && next <= record.attempts.length) setAttemptIndex(next - 1);
              }} />
            <span>/ {record.attempts.length}</span>
          </label>
          <output><code>{attempt?.attemptId}</code></output>
        </div>
        {attempt && attemptStatistics && <AttemptEvidence attempt={attempt} analysis={attemptStatistics} countUnit={record.countUnit} />}
      </details>
      <details className="scb-detail">
        <summary>批次来源与时基</summary>
        <dl className="scb-facts">
          <div><dt>导入文件</dt><dd><code>{batch.filename}</code></dd></div>
          <div><dt>文件 SHA-256</dt><dd><code>{batch.sha256 ?? '未取得'}</code></dd></div>
          <div><dt>采集来源</dt><dd><code>{record.sourceRef}</code></dd></div>
          <div><dt>同位素与光镊波长</dt><dd><code>{record.isotope} · {record.trapWavelengthM} m</code></dd></div>
          <div><dt>时钟与原点</dt><dd><code>{record.clockId} · {record.timeOriginRef}</code></dd></div>
          <div><dt>读出条件</dt><dd><code>{record.protocolVersion} · {record.roiMapVersion} · {record.countUnit}</code></dd></div>
          <div><dt>电路筛选口径</dt><dd><code>{record.circuitSelectionRuleRef}</code></dd></div>
        </dl>
      </details>
      <div className="md-controls">
        <button type="button" onClick={exportStatistics}><Download size={14} />导出整机统计 JSON</button>
      </div>
    </>}
    <SenooBellObservationsPanel imported={bell} rule={rule} verification={verification} notice={notices.bell}
      schedule={bellSchedule} scheduleNotice={notices.bellSchedule}
      prediction={bellPrediction} predictionNotice={notices.bellPrediction}
      onOpenSchedule={file => void open(file, 'bellSchedule', parseSenooBellAcquisitionSchedule, setBellSchedule)}
      onOpenPrediction={file => void open(file, 'bellPrediction', parseSenooBellPrediction, setBellPrediction)}
      onOpen={file => void open(file, 'bell', parseSenooBellObservations, setBell)} saveJson={saveJson} saveText={saveText} />
    <p className="smi-note">正式整机验收需核对装载、输运、门和读出的组件标定，以及独立电路批次与预测的对照。</p>
  </section>;
}
