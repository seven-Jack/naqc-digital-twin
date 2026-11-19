import { Download, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  auditSenooBellAcquisition, createSenooBellAcquisitionSchedule, SENOO_BELL_ACQUISITION_FILENAME,
  type SenooBellAcquisitionSchedule,
} from '../physics/senooBellAcquisition';
import {
  createSenooBellObservationTemplate, summarizeSenooBellObservations,
  type SenooBellObservations,
} from '../physics/senooBellObservations';
import { compareSenooBellPrediction, type SenooBellPrediction } from '../physics/senooBellPrediction';
import type { SenooMeasuredVerificationReport, SenooFrozenMeasuredReadout } from '../physics/senooMeasuredReadout';
import { SenooBellPredictionResult, SenooBellPredictionSetup, type FrozenBellPrediction } from './SenooBellPrediction';

export type ImportedCircuitDocument<T> = { filename: string; sha256: string | null; record: T };
export type CircuitImportNotice = { status: 'pending' } | { status: 'error'; message: string };

const settingLabels = { population: 'ZZ 布居', plus: '全局 +π/4', minus: '全局 −π/4' } as const;
const readoutLabels = {
  none: '待组件验证证据',
  'replayed-insufficient': '组件验证证据不足',
  'criteria-met': '组件验证符合其预设判据',
  incompatible: '组件证据不匹配',
} as const;

const percent = (value: number) => `${(100 * value).toFixed(2)}%`;

function identity(input: ImportedCircuitDocument<unknown> | null) {
  return input ? { filename: input.filename, sha256: input.sha256 } : null;
}

export function SenooBellObservationsPanel({
  imported, rule, verification, notice, schedule, scheduleNotice, prediction, predictionNotice,
  onOpen, onOpenSchedule, onOpenPrediction, saveJson, saveText,
}: {
  imported: ImportedCircuitDocument<SenooBellObservations> | null;
  rule: ImportedCircuitDocument<SenooFrozenMeasuredReadout> | null;
  verification: ImportedCircuitDocument<SenooMeasuredVerificationReport> | null;
  notice?: CircuitImportNotice;
  schedule: ImportedCircuitDocument<SenooBellAcquisitionSchedule> | null;
  scheduleNotice?: CircuitImportNotice;
  prediction: ImportedCircuitDocument<SenooBellPrediction> | null;
  predictionNotice?: CircuitImportNotice;
  onOpen: (file: File) => void;
  onOpenSchedule: (file: File) => void;
  onOpenPrediction: (file: File) => void;
  saveJson: (filename: string, value: unknown) => void;
  saveText: (filename: string, text: string, type: string) => void;
}) {
  const [frozen, setFrozen] = useState<FrozenBellPrediction | null>(null);
  const statistics = useMemo(() => imported
    ? summarizeSenooBellObservations(imported.record, rule?.record ?? null, verification?.record ?? null)
    : null, [imported, rule, verification]);
  const scheduleAudit = useMemo(() => schedule && imported && statistics
    ? auditSenooBellAcquisition(schedule.record, imported.record, statistics)
    : null, [schedule, imported, statistics]);
  const predictionReview = useMemo(() => {
    if (!frozen || !imported || !statistics) return null;
    try {
      return { comparison: compareSenooBellPrediction(frozen.input.record, imported.record, statistics), issue: null };
    } catch (error) {
      return { comparison: null, issue: error instanceof Error ? error.message : 'Bell 预测与观测不相容。' };
    }
  }, [frozen, imported, statistics]);
  const estimate = statistics?.estimate;
  const population = statistics?.settings[0].metric?.value ?? null;
  const synthetic = statistics?.sourceKind === 'synthetic';

  function exportObservations() {
    if (!imported || !statistics) return;
    saveJson('senoo-bell-observation-comparison-v1.json', {
      kind: 'senoo-bell-observation-comparison', schemaVersion: 1,
      inputs: {
        bellObservations: identity(imported),
        frozenReadout: synthetic ? null : identity(rule),
        readoutVerification: synthetic ? null : identity(verification),
        ...(schedule && { bellSchedule: identity(schedule) }),
        ...(frozen && { bellPrediction: identity(frozen.input) }),
      },
      observations: imported.record, statistics,
      ...(schedule && { schedule: schedule.record, scheduleAudit }),
      ...(frozen && {
        frozenPrediction: { prediction: frozen.input.record, frozenInSessionAtUtc: frozen.frozenInSessionAtUtc },
        predictionComparison: predictionReview?.comparison ?? null,
        predictionIssue: predictionReview?.issue ?? null,
      }),
    });
  }

  return <details className="scb-detail scb-bell" data-testid="senoo-bell-observations">
    <summary>Bell 布居与相干核对</summary>
    <p className="smi-note">目标态 (|00⟩−i|11⟩)/√2。联合导入 ZZ 和全局 ±π/4 的三组观测，使用同一分析相位参考。</p>
    <SenooBellPredictionSetup candidate={prediction} frozen={frozen} notice={predictionNotice}
      observationOpened={!!imported || notice?.status === 'pending'}
      onOpen={onOpenPrediction} onFreeze={value => setFrozen(previous => previous ?? value)} saveJson={saveJson} />
    <div className="md-controls ss-file-actions">
      <button type="button" onClick={() => saveJson('senoo-bell-observations-template-v1.json', createSenooBellObservationTemplate())}>
        <Download size={14} />下载 Bell 观测模板 JSON
      </button>
      <label><Upload size={14} />导入 Bell 观测 JSON
        <input type="file" aria-label="导入 Bell 观测 JSON" accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onOpen(file);
        }} />
      </label>
      <button type="button" onClick={() => saveText(
        SENOO_BELL_ACQUISITION_FILENAME, createSenooBellAcquisitionSchedule(), 'text/csv;charset=utf-8',
      )}><Download size={14} />下载 Bell 交错排程 CSV</button>
      <label><Upload size={14} />导入 Bell 排程 CSV
        <input type="file" aria-label="导入 Bell 排程 CSV" accept=".csv,text/csv" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onOpenSchedule(file);
        }} />
      </label>
    </div>
    {notice?.status === 'pending' && <p className="smi-note" role="status">正在校验 Bell 观测…</p>}
    {notice?.status === 'error' && <p className="smi-error" role="alert">{notice.message}</p>}
    {scheduleNotice?.status === 'pending' && <p className="smi-note" role="status">正在校验 Bell 排程…</p>}
    {scheduleNotice?.status === 'error' && <p className="smi-error" role="alert">{scheduleNotice.message}</p>}
    {schedule && <section className="smi-detail scb-bell-schedule" data-testid="senoo-bell-schedule-audit">
      <p className="smi-note"><code>{schedule.filename}</code> · {schedule.record.rows.length} 个计划轮次
        {!scheduleAudit && ' · 待导入观测核对'}</p>
      {scheduleAudit && <>
        <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="Bell 排程覆盖与分母">
          <table className="smi-table scb-bell-table">
            <thead><tr><th scope="col">测量设置</th><th scope="col">计划／匹配</th>
              <th scope="col">执行／纳入</th><th scope="col">双帧／有效</th></tr></thead>
            <tbody>{scheduleAudit.settings.map(row => <tr key={row.setting} data-schedule-setting={row.setting}>
              <th scope="row">{settingLabels[row.setting]}</th><td>{row.planned} / {row.matched}</td>
              <td>{row.executed} / {row.included}</td><td>{row.complete} / {row.effective ?? '待判读'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="smi-note">执行、纳入和双帧分母取自观测记录。有效轮需纳入且两位点均可判为二进制结果。</p>
        {scheduleAudit.issues.length > 0 && <details className="scb-detail" open>
          <summary>{scheduleAudit.issues.length} 项排程差异</summary>
          <ul>{scheduleAudit.issues.slice(0, 20).map(({ plannedId, attemptId, reason }, index) =>
            <li key={index}>{plannedId ?? '未关联计划'} · {attemptId} · {reason}</li>)}</ul>
          {scheduleAudit.issues.length > 20 && <p className="smi-note">其余差异见导出的核对 JSON。</p>}
        </details>}
      </>}
    </section>}
    {imported && statistics && <section className="smi-detail" data-testid="senoo-bell-observation-result">
      <p className="smi-note">{synthetic ? '合成观测' : '实测声明 · 待基旋转与筛选核验'} · <code>{imported.filename}</code></p>
      <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="Bell 测量设置及分母">
        <table className="smi-table scb-bell-table">
          <thead><tr><th scope="col">测量设置</th><th scope="col" title="全部尝试／执行且纳入">尝试／纳入</th>
            <th scope="col" title="分子／有效分母">分子／分母</th><th scope="col">观测及区间</th></tr></thead>
          <tbody>{statistics.settings.map(row => <tr key={row.setting} data-setting={row.setting}>
            <th scope="row">{settingLabels[row.setting]}</th><td>{row.counts.attempted} / {row.counts.analysisIncluded}</td>
            <td>{row.metric ? `${row.metric.numerator} / ${row.metric.denominator}` : '待判读'}</td>
            <td>{row.metric?.value === null || !row.metric ? '待有效分母' : <>
              {row.metric.value.toFixed(4)} <small>{row.metric.lower?.toFixed(4)} 至 {row.metric.upper?.toFixed(4)}</small>
            </>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {statistics.settings.map(row => row.issue && <p className="smi-error" role="alert" key={row.setting}>{settingLabels[row.setting]} · {row.issue}</p>)}
      <dl className="scb-facts" data-testid="senoo-bell-overlap">
        <div><dt>目标布居</dt><dd>{population === null ? '待 ZZ 有效观测' : percent(population)}</dd></div>
        <div><dt>相干项 Im ρ₀₀,₁₁</dt><dd>{estimate ? estimate.coherenceImag.toFixed(4) : '待相位观测'}</dd></div>
        <div><dt>条件态原始重叠</dt><dd>{estimate ? percent(estimate.overlap) : '待联合核对'}</dd></div>
        {estimate && <div><dt>{percent(statistics.confidenceLevel)} 联合区间</dt><dd>{percent(estimate.lower)} 至 {percent(estimate.upper)}</dd></div>}
      </dl>
      <details className="scb-detail">
        <summary>采集运行与来源</summary>
        <dl className="scb-facts">
          <div><dt>观测文件 SHA-256</dt><dd><code>{imported.sha256 ?? '未取得'}</code></dd></div>
          <div><dt>共同制备与筛选</dt><dd><code>{imported.record.ensembleRef}</code></dd></div>
          <div><dt>基旋转与位值</dt><dd><code>{imported.record.phaseReferenceRef}</code></dd></div>
          <div><dt>独立性依据</dt><dd><code>{imported.record.independenceRef}</code></dd></div>
          {statistics.settings.map(row => <div key={row.setting}>
            <dt>{settingLabels[row.setting]}</dt><dd><code>{row.batchId} · {row.acquisitionRunId}</code>
              {!synthetic && ` · ${readoutLabels[row.readoutEvidence]}`}</dd>
          </div>)}
        </dl>
      </details>
      <p className="smi-note">估计量使用各设置纳入且有效的位串。物理解释需回查跨设置制备和筛选、分析相位以及实际读出标定。</p>
      {predictionReview?.issue && <p className="smi-error" role="alert">{predictionReview.issue}</p>}
      {predictionReview?.comparison && <SenooBellPredictionResult comparison={predictionReview.comparison} />}
      <div className="md-controls">
        <button type="button" onClick={exportObservations}><Download size={14} />导出 Bell 观测核对 JSON</button>
      </div>
    </section>}
  </details>;
}
