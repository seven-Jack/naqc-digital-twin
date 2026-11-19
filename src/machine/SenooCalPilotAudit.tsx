import { Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { readSenooCalPilotScheduleWorkbook } from '../data/senooMeasurementWorkbook';
import { auditSenooCalPilot, parseSenooCalPilotMapping, parseSenooCalPilotSchedule } from '../physics/senooCalPilotAudit';
import type { SenooMeasurementReport } from '../physics/senooMeasurements';
import { groupLabels, sourceLabels } from './senooMeasurementLabels';

type Audit = ReturnType<typeof auditSenooCalPilot>;
type Plan = {
  schedule: ReturnType<typeof parseSenooCalPilotSchedule>;
  filename: string;
  sha256: string | null;
};

const findings = {
  missing: '工作簿未见对应轮次',
  unmapped: '未对应先导排程',
  'group-mismatch': '制备组与排程不同',
  'mixed-group': '同轮登记了多个制备组',
} as const;

function message(error: unknown) {
  return error instanceof Error ? error.message : '无法读取所选文件。';
}

export function SenooCalPilotAudit({ workbook }: {
  workbook: { filename: string; report: SenooMeasurementReport; sha256: string | null } | null;
}) {
  const planRequest = useRef(0);
  const mappingRequest = useRef(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planStatus, setPlanStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [mapping, setMapping] = useState<{
    filename: string;
    ids: ReturnType<typeof parseSenooCalPilotMapping>;
    workbook: NonNullable<typeof workbook>;
    batchId: string;
  } | null>(null);
  const [mappingStatus, setMappingStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [batchId, setBatchId] = useState('');
  const calibrationBatches = workbook?.report.batches.filter(batch => batch.role === 'calibration') ?? [];
  const batch = calibrationBatches.find(item => item.id === batchId) ?? calibrationBatches[0];
  const mappingMismatch = Boolean(mapping && batch && (mapping.workbook !== workbook || mapping.batchId !== batch.id));
  const result = useMemo((): { audit: Audit } | { error: string } | null => {
    if (!plan || !workbook || !batch || mappingStatus || mappingMismatch) return null;
    try {
      return { audit: auditSenooCalPilot(plan.schedule, workbook.report, batch.id, mapping?.ids) };
    } catch (error) {
      return { error: message(error) };
    }
  }, [plan, workbook, batch, mapping, mappingStatus, mappingMismatch]);

  async function loadPlan(file: File) {
    const request = ++planRequest.current;
    setPlan(null);
    setPlanStatus({ text: '正在读取先导排程…', error: false });
    try {
      const { rows, sha256 } = await readSenooCalPilotScheduleWorkbook(file);
      const schedule = parseSenooCalPilotSchedule(rows);
      if (request !== planRequest.current) return;
      setPlan({ schedule, filename: file.name, sha256 });
      setPlanStatus(null);
    } catch (error) {
      if (request === planRequest.current) setPlanStatus({ text: message(error), error: true });
    }
  }

  async function loadMapping(file: File) {
    if (!workbook || !batch) return;
    const request = ++mappingRequest.current;
    setMapping(null);
    setMappingStatus({ text: '正在读取轮号对应表…', error: false });
    try {
      const ids = parseSenooCalPilotMapping(await file.text());
      if (request !== mappingRequest.current) return;
      setMapping({ filename: file.name, ids, workbook, batchId: batch.id });
      setMappingStatus(null);
    } catch (error) {
      if (request === mappingRequest.current) setMappingStatus({ text: message(error), error: true });
    }
  }

  return <details className="smi-original" data-testid="senoo-cal-pilot-audit">
    <summary>CAL 先导排程核对</summary>
    <div className="smi-detail smi-pilot">
      <div className="ss-file-actions">
        <label><Upload size={14} />导入已发排程 XLSX
          <input type="file" aria-label="导入已发排程 XLSX" accept=".xlsx" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void loadPlan(file);
          }} />
        </label>
        <label><Upload size={14} />导入轮号对应 JSON
          <input type="file" aria-label="导入轮号对应 JSON" accept=".json,application/json" disabled={!batch} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void loadMapping(file);
          }} />
        </label>
        {(mapping || mappingStatus) && <button type="button" className="smi-more" onClick={() => {
          ++mappingRequest.current;
          setMapping(null);
          setMappingStatus(null);
        }}>清除轮号对应</button>}
      </div>
      {!plan && !planStatus && <p className="smi-note">选择已发出的 CAL 排程模板，并在上方导入填好的工作簿。设备另编轮号时，按采集日志导入对应表。</p>}
      {planStatus && <p className={planStatus.error ? 'smi-error' : 'smi-note'} role={planStatus.error ? 'alert' : 'status'}>{planStatus.text}</p>}
      {mappingStatus && <p className={mappingStatus.error ? 'smi-error' : 'smi-note'} role={mappingStatus.error ? 'alert' : 'status'}>{mappingStatus.text}</p>}
      {mappingMismatch && <p className="smi-error" role="alert">已选工作簿或批次发生变化，请载入当前批次的轮号对应表或清除旧表。</p>}
      {plan && <p className="smi-note">排程 <code>{plan.filename}</code> · {plan.schedule.length} 轮</p>}
      {mapping && <p className="smi-note">轮号对应 <code>{mapping.filename}</code> · {mapping.ids.size} 项</p>}
      {plan && !batch && <p className="smi-note" role="status">等待含标定批次的实测工作簿。</p>}
      {batch && <div className="smi-detail-controls">
        <label>先导核对批次 <select aria-label="先导核对批次" value={batch.id} onChange={event => setBatchId(event.target.value)}>
          {calibrationBatches.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
        </select></label><span className={`smi-source-${batch.sourceKind}`}>{sourceLabels[batch.sourceKind]}</span>
      </div>}
      {result && 'error' in result && <p className="smi-error" role="alert">{result.error}</p>}
      {plan && workbook && result && 'audit' in result && <>
        <PilotAuditResult audit={result.audit} />
        <details className="smi-event-detail">
          <summary>核对文件来源</summary>
          <p>排程 <code>{plan.filename}</code> · SHA-256 <code>{plan.sha256 ?? '未记录'}</code></p>
          <p>工作簿 <code>{workbook.filename}</code> · SHA-256 <code>{workbook.sha256 ?? '未记录'}</code></p>
        </details>
      </>}
    </div>
  </details>;
}

function PilotAuditResult({ audit }: { audit: Audit }) {
  return <>
    <p className="smi-note" data-testid="senoo-cal-pilot-summary">批次记录 {audit.actualRounds} 轮 · 组别匹配 {audit.matchedRounds} 轮 · 核查项 {audit.findings.length} 条。实际执行顺序、仪器阈值和筛选依据以原始日志核对。</p>
    <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="先导分组分母">
      <table className="smi-table smi-pilot-counts">
        <thead><tr><th scope="col">制备组</th><th scope="col">计划轮</th><th scope="col">批次实际轮</th><th scope="col">组别匹配轮</th>
          <th scope="col">对应位点</th><th scope="col">制备通过</th><th scope="col">双帧有效</th><th scope="col">原记录纳入</th><th scope="col">可判读</th>
          <th scope="col">缺帧</th><th scope="col">跳过帧</th><th scope="col">无效帧</th><th scope="col">未知帧</th></tr></thead>
        <tbody>{audit.groups.map(group => <tr key={group.preparedGroup} data-testid="senoo-cal-pilot-group">
          <th scope="row">{groupLabels[group.preparedGroup]}</th><td>{group.plannedRounds}</td><td>{group.actualRounds}</td><td>{group.matchedRounds}</td>
          <td>{group.attemptedSites}</td><td>{group.prepPassed}</td><td>{group.validPairs}</td><td>{group.included}</td><td>{group.evaluated}</td>
          <td>{group.missingFrames}</td><td>{group.skippedFrames}</td><td>{group.invalidFrames}</td><td>{group.unknownFrames}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="smi-note">位点和帧按已对应到计划且组别唯一的实际轮统计。批次实际轮包含未对应排程的同组轮次。</p>
    {audit.findings.length > 0 && <details className="smi-event-detail">
      <summary>查看轮号核查项（{audit.findings.length}）</summary>
      <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="先导轮号核查项">
        <table className="smi-table smi-pilot-findings">
          <thead><tr><th scope="col">核查项</th><th scope="col">计划轮号</th><th scope="col">对应轮号</th><th scope="col">计划组</th><th scope="col">登记组</th></tr></thead>
          <tbody>{audit.findings.map(finding => <tr key={finding.plannedAttemptId ?? `actual:${finding.attemptId}`}>
            <th scope="row">{findings[finding.kind]}</th><td>{finding.plannedAttemptId ?? '—'}</td><td>{finding.attemptId}</td>
            <td>{finding.expectedGroup ? groupLabels[finding.expectedGroup] : '—'}</td><td>{finding.actualGroups.map(group => groupLabels[group]).join('、') || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </>;
}
