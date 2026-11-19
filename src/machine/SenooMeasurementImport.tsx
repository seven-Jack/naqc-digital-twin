import { FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { readSenooMeasurementWorkbook } from '../data/senooMeasurementWorkbook';
import { validateSenooMeasurements, type SenooMeasurementReport } from '../physics/senooMeasurements';
import { SenooCalPilotAudit } from './SenooCalPilotAudit';
import { SenooCircuitBatchPanel } from './SenooCircuitBatchPanel';
import { SenooMeasurementReplay } from './SenooMeasurementReplay';
import { SenooMeasuredReadout } from './SenooMeasuredReadout';
import { SenooSyntheticWorkflow } from './SenooSyntheticWorkflow';
import { decisionLabels, eventLabels, groupLabels, preparationLabels, selectionLabels, sourceLabels } from './senooMeasurementLabels';
import './senoo-measurement-import.css';

type Report = SenooMeasurementReport;
type Issue = Report['issues'][number];
type Pair = Report['records'][number];
type Batch = Report['batches'][number];
type TimingEvent = Report['events'][number];
type Workbook = { filename: string; report: Report; sha256: string | null };
type PendingImport = { filename: string; state: 'loading' } | {
  filename: string; state: 'rejected'; text: string; issues: readonly Issue[]; workbook?: Workbook;
};

const roles = { calibration: '标定批次', validation: '独立验证批次' };
const frameLabels: Record<string, string> = {
  valid: '有效', missing: '缺帧', skipped: '跳过', invalid: '无效', unknown: '未知',
};
const comparisonLabels: Record<string, string> = { ge: '≥', gt: '>', other: '其他比较规则' };

function valueText(value: string | number | null | undefined, unit = '') {
  return value === null || value === undefined || value === '' ? '未记录' : `${value}${unit ? ` ${unit}` : ''}`;
}

function MeasurementIssues({ issues }: { issues: readonly Issue[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!issues.length) return null;
  const firstPageSize = 30;
  const displayed = showAll ? issues : issues.slice(0, firstPageSize);
  return <section className="smi-issues" aria-label="工作簿校验问题" data-testid="senoo-measurement-issues">
    <h3>校验问题 <span>{issues.length}</span></h3>
    <ul>
      {displayed.map((issue, index) => <li key={index} data-severity={issue.severity}>
        <strong>{issue.severity === 'error' ? '错误' : '提示'}</strong>
        <div>
          <code>{issue.sheet}{issue.row ? ` · 第 ${issue.row} 行` : ''}{issue.field ? ` · ${issue.field}` : ''}</code>
          <p>{issue.message}</p>
        </div>
      </li>)}
    </ul>
    {issues.length > firstPageSize && <button type="button" className="smi-more" onClick={() => setShowAll(!showAll)}>
      {showAll ? '收起其余问题' : `显示其余 ${issues.length - firstPageSize} 项`}
    </button>}
  </section>;
}

function MeasurementPair({ pair, countUnit, events }: { pair: Pair; countUnit: string; events: readonly TimingEvent[] }) {
  return <section className="smi-pair" aria-label="选中位点的双曝光" data-testid="senoo-measurement-pair"
    data-batch-id={pair.batchId} data-attempt-id={pair.attemptId} data-site-id={pair.siteId}>
    <h3><code>{pair.batchId}</code><span>尝试 <code>{pair.attemptId}</code></span><span>位点 <code>{pair.siteId}</code></span></h3>
    <dl className="smi-pair-meta">
      <div><dt>制备条件</dt><dd>{groupLabels[pair.preparedGroup] ?? valueText(pair.preparedGroup)}</dd></div>
      <div><dt>制备擦除</dt><dd>{preparationLabels[pair.prepErasureStatus] ?? valueText(pair.prepErasureStatus)}</dd></div>
      <div><dt>统计筛选</dt><dd>{selectionLabels[pair.analysisStatus] ?? valueText(pair.analysisStatus)}</dd></div>
      <div><dt>原仪器判决</dt><dd>{pair.instrumentDecision ? decisionLabels[pair.instrumentDecision] ?? pair.instrumentDecision : '未记录'}</dd></div>
      <div><dt>判决可用时标</dt><dd>{valueText(pair.decisionReadyUs, 'µs')}</dd></div>
      {pair.exclusionReason && <div className="smi-pair-reason"><dt>筛选原因</dt><dd>{pair.exclusionReason}</dd></div>}
    </dl>
    <div className="smi-frames">
      {[...pair.frames].sort((left, right) => left.imageNo - right.imageNo).map(frame => (
        <section key={frame.imageNo} className="smi-frame" data-status={frame.status}
          data-testid={`senoo-measurement-frame-${frame.imageNo}`}>
          <h4>Image {frame.imageNo}<span>{frameLabels[frame.status] ?? frame.status}</span></h4>
          <dl>
            <div><dt>曝光 ID</dt><dd>{valueText(frame.exposureId)}</dd></div>
            <div><dt>判决计数</dt><dd data-testid="senoo-measurement-count">
              {frame.decisionCount === null && frame.status === 'missing' ? '缺测' : valueText(frame.decisionCount, countUnit)}
            </dd></div>
            <div><dt>实际阈值</dt><dd>{valueText(frame.actualThreshold, countUnit)}
              {frame.thresholdOp && ` · ${comparisonLabels[frame.thresholdOp] ?? frame.thresholdOp}`}
            </dd></div>
            <div><dt>触发时标</dt><dd>{valueText(frame.triggerUs, 'µs')}</dd></div>
            <div><dt>曝光起点</dt><dd>{valueText(frame.startUs, 'µs')}</dd></div>
            <div><dt>曝光终点</dt><dd>{valueText(frame.endUs, 'µs')}</dd></div>
            <div><dt>计数可用时标</dt><dd>{valueText(frame.countReadyUs, 'µs')}</dd></div>
            <div><dt>记录来源</dt><dd>{valueText(frame.sourceRef)}</dd></div>
            {frame.issue && <div><dt>帧状态备注</dt><dd>{frame.issue}</dd></div>}
          </dl>
        </section>
      ))}
    </div>
    {!!events.length && <details className="smi-event-detail">
      <summary>关联事件时标（{events.length}）</summary>
      <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="关联事件时标表">
        <table className="smi-table">
          <thead><tr><th scope="col">事件</th><th scope="col">关联曝光</th><th scope="col">起点</th>
            <th scope="col">终点</th><th scope="col">日志来源</th></tr></thead>
          <tbody>{events.map(event => <tr key={event.eventId}>
            <th scope="row">{eventLabels[event.eventType] ?? event.eventType} <code>{event.eventId}</code></th>
            <td>{event.imageNo === null ? '—' : `Image ${event.imageNo}`}</td>
            <td>{valueText(event.startUs, 'µs')}</td><td>{valueText(event.endUs, 'µs')}</td><td>{valueText(event.sourceRef)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </section>;
}

function BatchTotals({ batches }: { batches: readonly Batch[] }) {
  return <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="批次统计表">
    <table className="smi-table smi-batches">
      <thead><tr>
        <th scope="col">批次</th><th scope="col">用途</th><th scope="col">来源</th>
        <th scope="col">尝试轮次</th><th scope="col">尝试位点</th><th scope="col">制备通过</th>
        <th scope="col">有效配对</th><th scope="col">统计纳入</th>
        <th scope="col">缺帧</th><th scope="col">跳过帧</th><th scope="col">无效帧</th><th scope="col">未知帧</th>
      </tr></thead>
      <tbody>{batches.map(batch => <tr key={batch.id} data-testid="senoo-measurement-batch" data-batch-id={batch.id}
        data-source-kind={batch.sourceKind} data-role={batch.role}>
        <th scope="row"><code>{batch.id}</code></th><td>{roles[batch.role]}</td>
        <td className={`smi-source-${batch.sourceKind}`}>{sourceLabels[batch.sourceKind]}</td>
        <td>{batch.uniqueAttempts}</td><td>{batch.attemptedSites}</td><td>{batch.prepPassed}</td>
        <td>{batch.validPairs}</td><td>{batch.included}</td>
        <td>{batch.missingFrames}</td><td>{batch.skippedFrames}</td><td>{batch.invalidFrames}</td><td>{batch.unknownFrames}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function SenooMeasurementImport() {
  const importId = useRef(0);
  const [loaded, setLoaded] = useState<Workbook | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [batchId, setBatchId] = useState('');
  const [recordIndex, setRecordIndex] = useState(0);
  const [positionUs, setPositionUs] = useState<number | null>();
  const batch = loaded?.report.batches.find(item => item.id === batchId) ?? loaded?.report.batches[0];
  const records = useMemo(() => loaded?.report.records.filter(record => record.batchId === batch?.id) ?? [], [loaded, batch]);
  const pair = records[recordIndex];
  const events = useMemo(() => loaded?.report.events.filter(event =>
    event.batchId === pair?.batchId && event.attemptId === pair.attemptId && (event.siteId === null || event.siteId === pair.siteId))
    ?? [], [loaded, pair]);
  const issues = pending?.state === 'rejected' ? pending.issues : loaded?.report.issues ?? [];
  const auditWorkbook = pending ? (pending.state === 'rejected' ? pending.workbook ?? null : null) : loaded;

  async function openWorkbook(file: File) {
    const request = ++importId.current;
    setPending({ filename: file.name, state: 'loading' });
    try {
      const { sheets, sha256 } = await readSenooMeasurementWorkbook(file);
      if (request !== importId.current) return;
      const report = validateSenooMeasurements(sheets);
      const workbook = { filename: file.name, report, sha256 };
      if (report.issues.some(issue => issue.severity === 'error')) {
        setPending({ filename: file.name, state: 'rejected', text: '工作簿校验未通过。', issues: report.issues, workbook });
        return;
      }
      setLoaded(workbook);
      if (!loaded || sha256 === null || loaded.sha256 !== sha256) {
        setBatchId(report.batches[0]?.id ?? '');
        setRecordIndex(0);
        setPositionUs(undefined);
      }
      setPending(null);
    } catch (error) {
      if (request !== importId.current) return;
      setPending({ filename: file.name, state: 'rejected',
        text: error instanceof Error ? error.message : '读取工作簿失败。', issues: [] });
    }
  }

  return <section className="md-panel smi-panel" aria-labelledby="senoo-measurement-title" data-testid="senoo-measurement-import">
    <div className="md-panel-header">
      <h2 id="senoo-measurement-title"><FileSpreadsheet size={16} />Senoo 实测工作簿</h2>
      <div className="ss-file-actions">
        <label><Upload size={14} />导入实测 XLSX
          <input type="file" aria-label="导入实测 XLSX" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void openWorkbook(file);
            }} />
        </label>
      </div>
    </div>
    <div className="smi-content">
      {!loaded && !pending && <p className="smi-note">选择按 Senoo 逐轮实测模板填写的工作簿，核对双帧配对、时标和统计分母。</p>}
      {pending?.state === 'loading' && <p className="smi-note" role="status" data-testid="senoo-measurement-status">正在校验 {pending.filename}</p>}
      {pending?.state === 'rejected' && <p className="smi-error" role="alert" data-testid="senoo-measurement-status">
        <strong>{pending.filename}</strong> {pending.text}
      </p>}
      <MeasurementIssues issues={issues} key={pending?.filename ?? loaded?.filename ?? ''} />
      <SenooCalPilotAudit workbook={auditWorkbook} />
      {loaded && <>
        <p className="smi-note" aria-live="polite" data-testid="senoo-measurement-filename">已校验的工作簿 <code>{loaded.filename}</code></p>
        <BatchTotals batches={loaded.report.batches} />
        {batch && <section className="smi-detail" aria-label="逐轮核对">
          <div className="smi-detail-controls">
            <label>实测批次
              <select aria-label="实测批次" value={batch.id} onChange={event => {
                setBatchId(event.target.value);
                setRecordIndex(0);
                setPositionUs(undefined);
              }}>
                {loaded.report.batches.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
              </select>
            </label>
            {!!records.length && <label>实测记录序号
              <input type="number" aria-label="实测记录序号" min={1} max={records.length} step={1}
                value={recordIndex + 1} onChange={event => {
                  const next = event.target.valueAsNumber;
                  if (Number.isInteger(next) && next >= 1 && next <= records.length) {
                    setRecordIndex(next - 1);
                    setPositionUs(undefined);
                  }
                }} />
              <span>/ {records.length}</span>
            </label>}
          </div>
          <dl className="smi-pair-meta" aria-label="批次来源与时标">
            <div><dt>采集运行 ID</dt><dd><code>{valueText(batch.acquisitionRunId)}</code></dd></div>
            <div><dt>共同时间轴</dt><dd><code>{valueText(batch.clockId)}</code></dd></div>
            <div><dt>时间原点 t₀</dt><dd><code>{valueText(batch.timeOrigin)}</code></dd></div>
          </dl>
          {pair && <SenooMeasurementReplay pair={pair} batch={batch} records={records} events={events}
            positionUs={positionUs} onSeek={setPositionUs} />}
          {!!batch.groups.length && <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="按制备组统计位点">
            <table className="smi-table smi-groups">
              <thead><tr><th scope="col">制备组</th><th scope="col">尝试位点</th><th scope="col">制备通过</th>
                <th scope="col">有效配对</th><th scope="col">统计纳入</th></tr></thead>
              <tbody>{batch.groups.map(group => <tr key={group.preparedGroup}>
                <th scope="row">{groupLabels[group.preparedGroup] ?? group.preparedGroup}</th><td>{group.attemptedSites}</td>
                <td>{group.prepPassed}</td><td>{group.validPairs}</td><td>{group.included}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {pair && <details className="smi-original">
            <summary>查看所选位点的原始记录</summary>
            <MeasurementPair pair={pair} countUnit={batch.countUnit ?? ''} events={events} />
          </details>}
        </section>}
        <SenooSyntheticWorkflow report={loaded.report} filename={loaded.filename} />
      </>}
      <SenooMeasuredReadout workbook={loaded} />
      <SenooCircuitBatchPanel />
    </div>
  </section>;
}
