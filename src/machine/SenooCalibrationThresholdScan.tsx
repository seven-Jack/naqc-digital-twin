import { useState, type FormEvent } from 'react';
import {
  scanSenooMeasuredCalibration,
  type SenooMeasuredCalibrationScan,
  type SenooMeasuredCandidate,
  type SenooMeasuredWorkbook,
} from '../physics/senooMeasuredReadout';
import type { SenooReadoutScanOptions } from '../physics/senooReadoutThresholdScan';
import { groupLabels } from './senooMeasurementLabels';
import './senoo-calibration-threshold-scan.css';

const rangeFields = [
  ['firstMin', '第一帧阈值下界'],
  ['firstMax', '第一帧阈值上界'],
  ['secondMin', '第二帧阈值下界'],
  ['secondMax', '第二帧阈值上界'],
] as const;
const groups = ['m1', 'm0', 'empty_control'] as const;
const comparisonLabels = { ge: '≥', gt: '>' };
type ScanDraft = Record<typeof rangeFields[number][0], string> & { rankBy: SenooReadoutScanOptions['rankBy'] | '' };
const emptyDraft: ScanDraft = { firstMin: '', firstMax: '', secondMin: '', secondMax: '', rankBy: '' };

interface Props {
  workbook: SenooMeasuredWorkbook | null;
  calibrationId: string | null;
  enabled: boolean;
  locked?: boolean;
  firstComparison: SenooMeasuredCandidate['firstComparison'];
  secondComparison: SenooMeasuredCandidate['secondComparison'];
  onChoose: (candidate: SenooMeasuredCandidate) => void;
}

type ScanRun = {
  workbook: SenooMeasuredWorkbook;
  calibrationId: string;
  draft: ScanDraft;
  firstComparison: Props['firstComparison'];
  secondComparison: Props['secondComparison'];
} & ({ report: SenooMeasuredCalibrationScan } | { error: string });

const percent = (value: number) => `${(100 * value).toFixed(2)}%`;

function formatInterval(bin: SenooMeasuredCalibrationScan['firstAxis'][number]) {
  return `${bin.lowerInclusive ? '[' : '('}${bin.lower}, ${bin.upper}${bin.upperInclusive ? ']' : ')'}`;
}

export function SenooCalibrationThresholdScan({
  workbook, calibrationId, enabled, locked = false, firstComparison, secondComparison, onChoose,
}: Props) {
  const [draft, setDraft] = useState(emptyDraft);
  const [run, setRun] = useState<ScanRun | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  const mayEdit = enabled && !locked;
  const needsInputs = !draft.rankBy || rangeFields.some(([key]) =>
    draft[key].trim() === '' || !Number.isFinite(Number(draft[key])));
  const currentRun = (enabled || locked) && run?.workbook === workbook && run.calibrationId === calibrationId && run.draft === draft
    && run.firstComparison === firstComparison && run.secondComparison === secondComparison ? run : null;
  const current = currentRun && 'report' in currentRun ? currentRun.report : null;
  const error = currentRun && 'error' in currentRun ? currentRun.error : null;
  const point = current?.rows[activeIndex];
  const firstInterval = point && current?.firstAxis.find(bin => bin.threshold === point.candidate.first);
  const secondInterval = point && current?.secondAxis.find(bin => bin.threshold === point.candidate.second);

  function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mayEdit || !workbook || !calibrationId || needsInputs || !draft.rankBy) return;
    const context = { workbook, calibrationId, draft, firstComparison, secondComparison };
    try {
      const report = scanSenooMeasuredCalibration(workbook, calibrationId, {
        firstRange: { min: Number(draft.firstMin), max: Number(draft.firstMax) },
        secondRange: { min: Number(draft.secondMin), max: Number(draft.secondMax) },
        firstComparison, secondComparison, rankBy: draft.rankBy,
      });
      setRun({ ...context, report });
      setActiveIndex(0);
      setChosenIndex(null);
    } catch (problem) {
      setRun({ ...context, error: problem instanceof Error ? problem.message : '标定候选扫描失败。' });
    }
  }

  function choose() {
    if (!mayEdit || !point) return;
    onChoose(point.candidate);
    setChosenIndex(activeIndex);
  }

  function exportScan() {
    if (!current || !point) return;
    const archive = {
      kind: 'senoo-calibration-threshold-scan',
      schemaVersion: 1,
      scan: current,
      selectedCandidate: point.candidate,
      chosenCandidate: chosenIndex === null ? null : current.rows[chosenIndex].candidate,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'senoo-calibration-threshold-scan-v1.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="smf-fields sct-scan" aria-label="标定批次阈值扫描" data-testid="senoo-calibration-threshold-scan">
    <h4>标定批次阈值扫描</h4>
    <p className="smi-note">{locked ? '冻结期间可查看和导出本批次扫描。'
      : '填写两帧范围和排序指标。所选候选可填入上方表单，再单独评估和冻结。'}</p>
    <form className="smf-fields" onSubmit={scan}>
      <div className="smf-field">
        {rangeFields.map(([key, label]) => <label key={key}>{label}
          <input type="number" step="any" disabled={!mayEdit} value={draft[key]}
            onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
        </label>)}
      </div>
      <p className="smi-note">Image 1 判亮 {comparisonLabels[firstComparison]} 阈值 · Image 2 判亮 {comparisonLabels[secondComparison]} 阈值</p>
      <label>候选排序
        <select value={draft.rankBy} disabled={!mayEdit} onChange={event => {
          const value = event.target.value;
          setDraft({ ...draft, rankBy: value === 'total-errors' || value === 'worst-group-error' ? value : '' });
        }}>
          <option value="">请选择排序指标</option>
          <option value="total-errors">错误总数最少</option>
          <option value="worst-group-error">最差制备组错误率最低</option>
        </select>
      </label>
      <div className="ssw-actions"><button type="submit" disabled={!mayEdit || needsInputs}>扫描标定候选</button></div>
    </form>
    {error && <p className="smi-error" role="alert">{error}</p>}
    {current && point && <div className="smf-fields sct-result" data-testid="senoo-calibration-scan-result" data-tested-pairs={current.testedPairs}>
      <p role="status">已比较 {current.testedPairs} 个判决区间组合，显示 {current.rows.length} 个候选。</p>
      <label>扫描候选
        <select value={activeIndex} onChange={event => setActiveIndex(Number(event.target.value))}>
          {current.rows.map(({ candidate, totalErrors, worstGroupError }, index) => <option
            key={`${candidate.first}/${candidate.second}`} value={index}>
            {candidate.first} / {candidate.second} · 错误 {totalErrors} · 最差组 {percent(worstGroupError)}
          </option>)}
        </select>
      </label>
      <p className="smi-note" data-testid="senoo-calibration-scan-point">候选 <code>{point.candidate.first} / {point.candidate.second}</code> {current.countUnit}
        {firstInterval && secondInterval && <> · 区间 <code>{formatInterval(firstInterval)} × {formatInterval(secondInterval)}</code></>}
      </p>
      <div className="sct-groups">
        {groups.map(group => {
          const counts = point.groups[group];
          return <section className="sct-group" data-group={group} key={group} aria-label={groupLabels[group]}>
            <h5>{groupLabels[group]}</h5>
            <dl>
              <div><dt>分母</dt><dd>{counts.denominator}</dd></div>
              <div><dt>{group === 'empty_control' ? '误报' : '错标'}</dt><dd>{counts.wrong}</dd></div>
              {group !== 'empty_control' && <div><dt>判丢失</dt><dd>{counts.loss}</dd></div>}
              <div><dt>歧义</dt><dd>{counts.ambiguous}</dd></div>
            </dl>
          </section>;
        })}
      </div>
      <div className="ssw-actions">
        <button type="button" disabled={!mayEdit} onClick={choose}>填入候选阈值</button>
        <button type="button" onClick={exportScan}>导出标定扫描 JSON</button>
      </div>
      {chosenIndex !== null && <p className="smi-note" role="status">
        已填入 <code>{current.rows[chosenIndex].candidate.first} / {current.rows[chosenIndex].candidate.second}</code> {current.countUnit}。
      </p>}
      <details className="smf-identity">
        <summary>标定扫描来源</summary>
        <p>批次 <code>{current.batchId}</code> · 采集 <code>{current.runId}</code> · 工况 <code>{current.workingPoint}</code></p>
        <p>{current.filename} · SHA-256 <code>{current.sha256}</code></p>
      </details>
    </div>}
  </section>;
}
