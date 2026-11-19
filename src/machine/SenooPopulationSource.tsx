import { ExternalLink, Waves } from 'lucide-react';
import { memo, useId, useState } from 'react';
import { SENOO_POPULATION_SOURCE } from '../data/senooPopulationSource';
import './senoo-readout-source.css';
import './senoo-population-source.css';

const { source, traces } = SENOO_POPULATION_SOURCE;
const colors = { m1: '#81baff', r0: '#f094a6' };
const ticks = [0, 0.25, 0.5, 0.75, 1];
const plot = { width: 660, height: 312, left: 65, right: 624, top: 22, bottom: 246 };
const x = (time: number) => plot.left + time * (plot.right - plot.left);
const y = (population: number) => plot.bottom - population * (plot.bottom - plot.top);
const pointCount = traces[0].points.length;
const errorBars = traces.map(trace => trace.points.map(point => {
  const position = x(point.timeUs);
  const low = y(point.population - point.lowerError);
  const high = y(point.population + point.upperError);
  return `M${position},${low}V${high}M${position - 2},${high}h4M${position - 2},${low}h4`;
}).join(''));

export const SenooPopulationSource = memo(function SenooPopulationSource() {
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const timeUs = traces[0].points[index].timeUs;
  const cursorX = x(timeUs);

  return <section className="md-panel sr-source" aria-labelledby={titleId} data-testid="senoo-population-source">
    <div className="md-panel-header">
      <h2 id={titleId}><Waves size={16} />Senoo 里德堡态布居源表</h2>
      <span className="md-panel-hint">图 2c 右图 · 实验数据</span>
    </div>
    <div className="sr-body">
      <p className="sr-description sp-description">¹⁷¹Yb。{source.conditions}</p>
      <div className="sr-layout">
        <div className="sr-chart">
          <svg viewBox={`0 0 ${plot.width} ${plot.height}`} role="img"
            aria-label="带丢失检测的 m₁ 与 r₀ 布居观测及上下误差" className="sp-plot">
            {ticks.map(value => <g key={value}>
              <line x1={x(value)} x2={x(value)} y1={plot.top} y2={plot.bottom} className="sr-grid" />
              <line x1={plot.left} x2={plot.right} y1={y(value)} y2={y(value)} className="sr-grid" />
              <text x={x(value)} y={plot.bottom + 24} textAnchor="middle" className="sr-tick">{value}</text>
              <text x={plot.left - 12} y={y(value) + 4} textAnchor="end" className="sr-tick">{value}</text>
            </g>)}
            <path d={`M${plot.left},${plot.top}V${plot.bottom}H${plot.right}`} className="sr-axis" />
            <text x={plot.left} y={13} className="sr-axis-label">布居概率</text>
            <text x={(plot.left + plot.right) / 2} y={plot.height - 12} textAnchor="middle" className="sr-axis-label">时间（{source.timeUnit}）</text>
            {traces.map((trace, traceIndex) => <g key={trace.id} fill={colors[trace.id]}>
              <path d={errorBars[traceIndex]} stroke={colors[trace.id]} strokeWidth={0.8} opacity={0.7} pointerEvents="none" />
              {trace.points.map(point => <circle key={point.sourceIndex} cx={x(point.timeUs)} cy={y(point.population)} r={2.9}
                onClick={() => setIndex(point.sourceIndex)} className="sr-point">
                <title>{trace.label} · {point.timeUs} {source.timeUnit} · {point.population}</title>
              </circle>)}
            </g>)}
            <g pointerEvents="none">
              <line x1={cursorX} x2={cursorX} y1={plot.top} y2={plot.bottom} className="sr-crosshair" />
              {traces.map(trace => <circle key={trace.id} cx={cursorX} cy={y(trace.points[index].population)}
                r={6} fill="none" stroke={colors[trace.id]} strokeWidth={1.5} />)}
            </g>
          </svg>
          <div className="sr-legend">
            {traces.map(trace => <span key={trace.id}><i style={{ backgroundColor: colors[trace.id] }} />{trace.label} <small>{trace.points.length} 点</small></span>)}
          </div>
          <p className="sr-scale">{source.errorDefinition}</p>
        </div>
        <div className="sr-detail sp-detail">
          <div className="sr-controls">
            <label>采样点序号
              <input type="number" aria-label="Senoo 布居采样点序号" min={1} max={pointCount} step={1} value={index + 1}
                onChange={event => {
                  const next = event.target.valueAsNumber;
                  if (Number.isInteger(next) && next >= 1 && next <= pointCount) setIndex(next - 1);
                }} />
              <span>/ {pointCount}</span>
            </label>
          </div>
          <div aria-live="polite" data-testid="senoo-population-sample">
            <p>源时间 <code>{timeUs} {source.timeUnit}</code></p>
            {traces.map(trace => {
              const point = trace.points[index];
              return <dl key={trace.id} className="sp-value">
                <div><dt>{trace.label} 布居</dt><dd>{point.population}</dd></div>
                <div><dt>下误差</dt><dd>{point.lowerError}</dd></div>
                <div><dt>上误差</dt><dd>{point.upperError}</dd></div>
                <div><dt>源表</dt><dd className="sr-cell"><code>{trace.sheet}!{point.sourceColumn}2:{point.sourceColumn}5</code></dd></div>
              </dl>;
            })}
          </div>
        </div>
      </div>
      <div className="sr-provenance">
        <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer">Senoo 等 · 图 2c 右图源数据 <ExternalLink size={12} /></a>
        <details>
          <summary>图源与误差定位</summary>
          <p>{source.locator}</p>
          <p className="sr-cell">{source.workbook.file}</p>
          <p className="sr-hash">SHA-256 <code>{source.workbook.sha256}</code></p>
        </details>
      </div>
    </div>
  </section>;
});
