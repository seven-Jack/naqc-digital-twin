import { Camera, Download, ExternalLink } from 'lucide-react';
import { memo, useId, useMemo, useState } from 'react';
import { DEFAULT_EXPLORATORY_THRESHOLDS, evaluateSenooReadout } from '../data/senooReadoutEvaluation';
import { SENOO_READOUT_SOURCE } from '../data/senooReadoutSource';
import { READOUT_OUTCOMES, type DualExposureRule } from '../physics/dualExposureReadout';
import './senoo-readout-source.css';

const { source, groups } = SENOO_READOUT_SOURCE;
const samples = groups.flatMap(group => group.points.map(point => ({ group, point })));
const colors: Record<string, string> = { loss: '#a8b8ca', spin0: '#83eac3', spin1: '#c6adff' };
const ticks = [10, 20, 50, 100, 200];
const minThreshold = ticks[0];
const maxThreshold = ticks.at(-1)!;
const minimumExponent = Math.log10(minThreshold);
const maximumExponent = Math.log10(maxThreshold);
const plot = { width: 660, height: 406, left: 75, right: 630, top: 22, bottom: 343 };
const fraction = (value: number) => (Math.log10(value) - minimumExponent) / (maximumExponent - minimumExponent);
const x = (value: number) => plot.left + fraction(value) * (plot.right - plot.left);
const y = (value: number) => plot.bottom - fraction(value) * (plot.bottom - plot.top);

const decisionLabels = { m0: 'm₀', m1: 'm₁', 'no-atom': '无原子', ambiguous: '歧义' } as const;
const initialThresholds = {
  drafts: {
    first: String(DEFAULT_EXPLORATORY_THRESHOLDS.first),
    second: String(DEFAULT_EXPLORATORY_THRESHOLDS.second),
  },
  applied: DEFAULT_EXPLORATORY_THRESHOLDS,
};

function parseThreshold(text: string) {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) && value >= minThreshold && value <= maxThreshold ? value : null;
}

function ThresholdRegions({ thresholds: { first, second }, outcomes }: DualExposureRule) {
  const splitX = x(first);
  const splitY = y(second);
  const regions = [
    { outcome: outcomes.lowHigh, left: plot.left, right: splitX, top: plot.top, bottom: splitY },
    { outcome: outcomes.highHigh, left: splitX, right: plot.right, top: plot.top, bottom: splitY },
    { outcome: outcomes.lowLow, left: plot.left, right: splitX, top: splitY, bottom: plot.bottom },
    { outcome: outcomes.highLow, left: splitX, right: plot.right, top: splitY, bottom: plot.bottom },
  ];
  return <g pointerEvents="none">
    {regions.map(({ outcome, left, right, top, bottom }) => <g key={outcome}>
      <rect data-decision-region={outcome} className="sr-decision-region" x={left} y={top} width={right - left} height={bottom - top} />
      {right - left >= 76 && bottom - top >= 38 &&
        <text className="sr-region-label" x={right - 12} y={top + 22} textAnchor="end">{decisionLabels[outcome]}</text>}
    </g>)}
    <line data-testid="senoo-threshold-first" className="sr-threshold-line" x1={splitX} x2={splitX} y1={plot.top} y2={plot.bottom} />
    <line data-testid="senoo-threshold-second" className="sr-threshold-line" x1={plot.left} x2={plot.right} y1={splitY} y2={splitY} />
  </g>;
}

export const SenooReadoutSource = memo(function SenooReadoutSource() {
  const titleId = useId();
  const descriptionId = useId();
  const thresholdStatusId = useId();
  const [displayGroup, setDisplayGroup] = useState('all');
  const [selectedId, setSelectedId] = useState(samples[0].point.id);
  const [thresholds, setThresholds] = useState(initialThresholds);
  const { first, second } = thresholds.applied;
  const evaluation = useMemo(() => evaluateSenooReadout(thresholds.applied), [thresholds.applied]);
  const invalidFirst = parseThreshold(thresholds.drafts.first) === null;
  const invalidSecond = parseThreshold(thresholds.drafts.second) === null;
  const visible = samples.filter(sample => displayGroup === 'all' || sample.group.id === displayGroup);
  const selectedIndex = Math.max(0, visible.findIndex(sample => sample.point.id === selectedId));
  const selected = visible[selectedIndex];
  const { point, group } = selected;
  const { decision } = evaluation.samples.find(sample => sample.observation.id === point.id)!;
  const sampleTotal = evaluation.samples.length;

  function selectGroup(id: string) {
    setDisplayGroup(id);
    const next = samples.find(sample => id === 'all' || sample.group.id === id)!;
    setSelectedId(next.point.id);
  }

  function selectSample(value: number) {
    const index = Math.max(0, Math.min(visible.length - 1, Math.round(value) - 1));
    setSelectedId(visible[index].point.id);
  }

  function changeThreshold(exposure: 'first' | 'second', text: string) {
    setThresholds(current => {
      const drafts = { ...current.drafts, [exposure]: text };
      const first = parseThreshold(drafts.first);
      const second = parseThreshold(drafts.second);
      return { drafts, applied: first === null || second === null ? current.applied : { first, second } };
    });
  }

  function exportEvaluation() {
    const blob = new Blob([JSON.stringify(evaluation, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'senoo-fig2b-readout-decisions.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="md-panel sr-source" aria-labelledby={titleId} data-testid="senoo-readout-source">
    <div className="md-panel-header">
      <h2 id={titleId}><Camera size={16} />Senoo 双曝光读出源表</h2>
      <span className="md-panel-hint">Fig. {source.figure} · 出版方图源</span>
    </div>
    <div className="sr-body">
      <p className="sr-description" id={descriptionId}>¹⁷¹Yb · {source.state} · {source.tweezerWavelengthNm} nm 光镊。每个点关联同一源索引的两次成像计数，颜色表示制备组别。</p>
      <div className="sr-controls">
        <label>显示制备组
          <select aria-label="显示制备组" value={displayGroup} onChange={event => selectGroup(event.target.value)}>
            <option value="all">全部组别</option>
            {groups.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>源表样本序号
          <input type="number" aria-label="源表样本序号" min={1} max={visible.length} step={1}
            value={selectedIndex + 1} onChange={event => selectSample(Number(event.target.value))} />
          <span>/ {visible.length}</span>
        </label>
      </div>
      <fieldset className="sr-thresholds">
        <legend>探索性双阈值判决 v{evaluation.rule.version}</legend>
        <div className="sr-controls sr-threshold-controls">
          <label>Image 1 阈值
            <input type="number" min={minThreshold} max={maxThreshold} step="any"
              aria-label="Image 1 阈值" aria-invalid={invalidFirst} aria-describedby={thresholdStatusId}
              value={thresholds.drafts.first} onChange={event => changeThreshold('first', event.target.value)} />
          </label>
          <label>Image 2 阈值
            <input type="number" min={minThreshold} max={maxThreshold} step="any"
              aria-label="Image 2 阈值" aria-invalid={invalidSecond} aria-describedby={thresholdStatusId}
              value={thresholds.drafts.second} onChange={event => changeThreshold('second', event.target.value)} />
          </label>
          <button type="button" onClick={() => setThresholds(initialThresholds)}>恢复初始阈值</button>
        </div>
        <p className="sr-rule">每幅计数达到阈值即为亮。仅第一幅亮判为 m₁，仅第二幅亮判为 m₀，双暗判为无原子，双亮归为歧义。</p>
        <p className="sr-rule" id={thresholdStatusId} role="status" data-testid="senoo-threshold-status" data-first={first} data-second={second}>
          {(invalidFirst || invalidSecond) && <span className="sr-threshold-error">请输入 10–200 counts 范围内的阈值。 </span>}
          当前应用 {first} / {second} counts
        </p>
      </fieldset>
      <div className="sr-layout">
        <div className="sr-chart">
          <svg viewBox={`0 0 ${plot.width} ${plot.height}`} role="img" aria-label="两次成像计数的双对数散点图"
            aria-describedby={descriptionId} data-testid="senoo-readout-plot">
            {ticks.map(value => <g key={value}>
              <line x1={x(value)} x2={x(value)} y1={plot.top} y2={plot.bottom} className="sr-grid" />
              <line x1={plot.left} x2={plot.right} y1={y(value)} y2={y(value)} className="sr-grid" />
              <text x={x(value)} y={plot.bottom + 24} textAnchor="middle" className="sr-tick">{value}</text>
              <text x={plot.left - 13} y={y(value) + 4} textAnchor="end" className="sr-tick">{value}</text>
            </g>)}
            <path d={`M${plot.left},${plot.top} V${plot.bottom} H${plot.right}`} className="sr-axis" />
            <text x={(plot.left + plot.right) / 2} y={plot.height - 10} textAnchor="middle" className="sr-axis-label">{source.axes.x.label} ({source.axes.x.unit})</text>
            <text x="18" y={(plot.top + plot.bottom) / 2} textAnchor="middle" className="sr-axis-label"
              transform={`rotate(-90,18,${(plot.top + plot.bottom) / 2})`}>{source.axes.y.label} ({source.axes.y.unit})</text>
            <ThresholdRegions {...evaluation.rule} />
            {visible.map(sample => <circle key={sample.point.id} data-source-point={sample.point.id}
              cx={x(sample.point.first)} cy={y(sample.point.second)} r="3.3" fill={colors[sample.group.id]} opacity="0.65"
              className="sr-point" onClick={() => setSelectedId(sample.point.id)}>
              <title>{sample.group.label}，源索引 {sample.point.sourceIndex}，{sample.point.first} / {sample.point.second} counts</title>
            </circle>)}
            <g pointerEvents="none">
              <line x1={x(point.first)} x2={x(point.first)} y1={plot.top} y2={plot.bottom} className="sr-crosshair" />
              <line x1={plot.left} x2={plot.right} y1={y(point.second)} y2={y(point.second)} className="sr-crosshair" />
              <circle cx={x(point.first)} cy={y(point.second)} r="6" fill="none" stroke="#f7d493" strokeWidth="2"
                data-testid="senoo-selected-point" data-selected-source-point={point.id} />
            </g>
          </svg>
          <div className="sr-legend" aria-label="制备组别与源表点数">
            {groups.map(item => <span key={item.id} style={{ opacity: displayGroup === 'all' || displayGroup === item.id ? 1 : 0.45 }}>
              <i style={{ backgroundColor: colors[item.id] }} />{item.label} <small>{item.points.length} 对</small>
            </span>)}
          </div>
          <p className="sr-scale">横纵轴均为对数坐标，范围固定为 10–200 counts。</p>
        </div>
        <div className="sr-detail" aria-live="polite" data-testid="senoo-selected-sample">
          <h3>{group.label}</h3>
          <p>{group.preparation}</p>
          <dl>
            <div><dt>{source.axes.x.label}</dt><dd data-testid="senoo-first-count">{point.first} <small>{source.axes.x.unit}</small></dd></div>
            <div><dt>{source.axes.y.label}</dt><dd data-testid="senoo-second-count">{point.second} <small>{source.axes.y.unit}</small></dd></div>
          </dl>
          <div className="sr-decision" data-testid="senoo-decision" data-outcome={decision.outcome}>
            <p>当前判决 <strong>{decisionLabels[decision.outcome]}</strong></p>
            <p>Image 1 {decision.firstHigh ? '亮' : '暗'} · Image 2 {decision.secondHigh ? '亮' : '暗'}</p>
          </div>
          <p className="sr-cell">源索引 <code>{point.sourceIndex}</code></p>
          <p className="sr-cell"><code>{group.sheet}!{point.sourceColumn}2/{point.sourceColumn}3</code></p>
          <p className="sr-conditions">{source.conditions}</p>
        </div>
      </div>
      <section className="sr-tally">
        <div className="sr-tally-header">
          <div>
            <h3>制备组与判决交叉计数</h3>
            <p>统计图 2b 的全部 {sampleTotal} 对样本，每组行合计为该组样本数。</p>
          </div>
          <button type="button" onClick={exportEvaluation}><Download size={14} />导出判决 JSON</button>
        </div>
        <table data-testid="senoo-readout-crosstab" aria-label="制备组与判决交叉计数">
          <thead>
            <tr><th scope="col">制备组</th>
              {READOUT_OUTCOMES.map(outcome => <th key={outcome} scope="col" data-outcome={outcome}>{decisionLabels[outcome]}</th>)}
              <th scope="col">合计</th>
            </tr>
          </thead>
          <tbody>
            {evaluation.rows.map(row => <tr key={row.groupId} data-preparation={row.groupId}>
              <th scope="row">{row.label}</th>
              {READOUT_OUTCOMES.map(outcome => <td key={outcome} data-outcome={outcome}>{row.counts[outcome]}</td>)}
              <td>{row.total}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr><th scope="row">合计</th>
              {READOUT_OUTCOMES.map(outcome => <td key={outcome} data-outcome={outcome}>
                {evaluation.rows.reduce((sum, row) => sum + row.counts[outcome], 0)}
              </td>)}
              <td>{sampleTotal}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <div className="sr-provenance">
        <a href={source.url} target="_blank" rel="noreferrer">Senoo 等 · Fig. {source.figure} 源数据 <ExternalLink size={12} /></a>
        <details>
          <summary>工作簿与来源定位</summary>
          <p>{source.title}</p>
          <p>{source.locator}</p>
          <p className="sr-cell">{source.workbook.file}</p>
          <p className="sr-hash">SHA-256 <code>{source.workbook.sha256}</code></p>
          <p className="sr-cell">DOI <code>{source.doi}</code></p>
        </details>
      </div>
    </div>
  </section>;
});
