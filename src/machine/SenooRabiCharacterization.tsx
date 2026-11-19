import { ChartLine, ChevronLeft, ChevronRight, FileSpreadsheet, Waves } from 'lucide-react';
import { SENOO_RABI_CHARACTERIZATION_SOURCE, SENOO_RABI_FIT, SENOO_RABI_POINTS, SENOO_RABI_STATES } from '../data/senooRabiCharacterization';
import { SenooFitPlot, type SenooFitSeries } from './SenooFitPlot';
import './senoo-rabi-characterization.css';

const states = { m1: { label: 'm₁', color: '#84c4fc' }, r0: { label: 'r₀', color: '#ffaea6' } };
const xTicks = [0, 0.25, 0.5, 0.75, 1];
const pointCount = SENOO_RABI_POINTS.length;
const percent = (value: number, digits = 4) => (100 * value).toFixed(digits);
const signed = (value: number) => `${value < 0 ? '−' : '+'}${percent(Math.abs(value))}`;
const populationSeries: readonly SenooFitSeries[] = SENOO_RABI_STATES.map(id => ({
  id, ...states[id],
  points: SENOO_RABI_POINTS.map(point => ({
    index: point.sourceIndex, x: point.timeUs, y: 100 * point[id].population,
    errorY: [100 * point[id].lowerError, 100 * point[id].upperError],
    title: `${states[id].label} · ${point[id].sourceCells} · ${percent(point[id].population)}%`,
  })),
  fit: SENOO_RABI_POINTS.map(point => ({ x: point.timeUs, y: 100 * point[id].prediction })),
}));
const residualSeries: readonly SenooFitSeries[] = SENOO_RABI_STATES.map(id => ({
  id, ...states[id],
  points: SENOO_RABI_POINTS.map(point => ({
    index: point.sourceIndex, x: point.timeUs, y: 100 * point[id].residual,
    title: `${states[id].label} · ${point[id].sourceCells} · ${signed(point[id].residual)} 个百分点`,
  })),
}));

export function SenooRabiCharacterization({ index, onSelect }: { index: number; onSelect: (index: number) => void }) {
  const point = SENOO_RABI_POINTS[index];
  const { parameters, contrast, piTimeUs, firstMaximumUs, summaries } = SENOO_RABI_FIT;
  const { conditions, errorDefinition, selectionLabel, workbook, derivedTable, locator } = SENOO_RABI_CHARACTERIZATION_SOURCE;
  const plotProps = { xTicks, xDomain: [0, 1] as const, xLabel: '驱动时间 (µs)', selectedIndex: index, selectedX: point.timeUs, onSelect };

  return <div className="rbc-page" data-testid="senoo-rabi-characterization" data-index={index} data-time-us={point.timeUs}>
    <section className="md-panel rbc-toolbar" aria-label="图 2c 时点选择">
      <div className="rbc-selection">
        <label htmlFor="senoo-rabi-sample">时点</label>
        <div className="md-controls">
          <button type="button" aria-label="上一时点" onClick={() => onSelect(index - 1)} disabled={index === 0}><ChevronLeft size={14} /></button>
          <input id="senoo-rabi-sample" type="number" aria-label="图 2c 时点序号" min={1} max={pointCount} step={1} value={index + 1}
            onChange={event => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isInteger(next) && next >= 1 && next <= pointCount) onSelect(next - 1);
            }} />
          <span>/ {pointCount}</span>
          <button type="button" aria-label="下一时点" onClick={() => onSelect(index + 1)}
            disabled={index === pointCount - 1}><ChevronRight size={14} /></button>
        </div>
        <output title={String(point.timeUs)}>{point.timeUs.toFixed(6)} µs</output>
      </div>
      <span className="rbc-evidence">文献复现 <span>· {selectionLabel}</span></span>
    </section>
    <div className="rbc-columns">
      <div className="rbc-stack">
        <section className="md-panel" aria-label="图 2c 两态布居">
          <div className="md-panel-header"><h2><Waves size={16} />图 2c · 两态条件布居</h2><small>80 个共同时间点</small></div>
          <SenooFitPlot {...plotProps} testId="senoo-rabi-population-plot" markerTestId="senoo-rabi-population-point"
            yLabel="布居 (%)" yTicks={[0, 25, 50, 75, 100]} yDomain={[0, 100]} series={populationSeries} />
        </section>
        <section className="md-panel" aria-label="图 2c 逐点拟合残差">
          <div className="md-panel-header"><h2><ChartLine size={16} />逐点残差</h2><small>模型 − 观测</small></div>
          <SenooFitPlot {...plotProps} testId="senoo-rabi-residual-plot" markerTestId="senoo-rabi-residual-point"
            yLabel="残差 (百分点)" yTicks={[-6, -3, 0, 3, 6]} yDomain={[-6, 6]} series={residualSeries} compact />
        </section>
      </div>
      <div className="rbc-stack">
        <section className="md-panel" aria-label="选中时点的布居与残差">
          <div className="md-panel-header"><h2><FileSpreadsheet size={16} />源点核对</h2><small>时点 {index + 1} / {pointCount}</small></div>
          <div className="rbc-detail-grid">
            {SENOO_RABI_STATES.map(state => {
              const row = point[state];
              const [sheet, cells] = row.sourceCells.split('!');
              return <div className="rbc-detail" key={state} data-testid="senoo-rabi-state-detail" data-state={state}
                data-index={index} data-observed={row.population} data-error-lower={row.lowerError} data-error-upper={row.upperError}
                data-fitted={row.prediction} data-residual={row.residual}>
                <h3 style={{ color: states[state].color }}>{states[state].label}
                  <span data-within={row.withinErrorBar}>{row.withinErrorBar ? '误差条内' : '超出误差条'}</span>
                </h3>
                <dl>
                  <div><dt>条件布居</dt><dd>{percent(row.population)}%</dd></div>
                  <div><dt>模型预测</dt><dd>{percent(row.prediction)}%</dd></div>
                  <div><dt>下误差</dt><dd>−{percent(row.lowerError)}</dd></div>
                  <div><dt>上误差</dt><dd>+{percent(row.upperError)}</dd></div>
                  <div><dt>残差</dt><dd>{signed(row.residual)}</dd></div>
                  <div><dt>残差／平均误差</dt><dd>{row.residualInMeanErrorUnits.toFixed(4)}</dd></div>
                </dl>
                <code className="rbc-cell">{sheet}!<wbr />{cells}</code>
              </div>;
            })}
          </div>
          <p className="rbc-note">上下误差与残差以百分点计。源时点的有效分母及丢失率未公开。</p>
        </section>
        <section className="md-panel" aria-label="图 2c 拟合参数">
          <div className="md-panel-header"><h2><ChartLine size={16} />共振两能级拟合</h2><small>r₀ 拟合，核对两态</small></div>
          <dl className="rbc-metrics">
            <div><dt>有效振荡频率</dt><dd>{(parameters.frequencyHz / 1e6).toFixed(5)} MHz</dd></div>
            <div><dt>有效相位</dt><dd>{parameters.phaseRad.toFixed(5)} rad</dd></div>
            <div><dt>r₀ 下限／上限</dt><dd>{parameters.minimumR0.toFixed(6)} / {parameters.maximumR0.toFixed(6)}</dd></div>
            <div><dt>有效对比度</dt><dd>{percent(contrast)}%</dd></div>
            <div><dt>共振模型 π 时间</dt><dd>{piTimeUs.toFixed(5)} µs</dd></div>
            <div><dt>第一个峰位</dt><dd>{firstMaximumUs.toFixed(5)} µs</dd></div>
          </dl>
          <table className="rbc-table">
            <thead><tr><th scope="col">态</th><th scope="col">RMSE（百分点）</th><th scope="col">误差条内</th><th scope="col">归一化残差 RMS</th></tr></thead>
            <tbody>{SENOO_RABI_STATES.map(state => <tr key={state}>
              <th scope="row">{states[state].label}</th><td>{percent(summaries[state].rmse)}</td>
              <td>{summaries[state].insideErrorBars}/{pointCount}</td><td>{summaries[state].rmsInMeanErrorUnits.toFixed(4)}</td>
            </tr>)}</tbody>
          </table>
          <p className="rbc-note">r₀ 上限达到约束边界，参数给出点估计。拟合权重为两侧误差均值的平方倒数。</p>
        </section>
      </div>
    </div>
    <section className="md-panel" aria-label="图 2c 来源与适用条件">
      <div className="md-panel-header"><h2><FileSpreadsheet size={16} />来源与适用条件</h2></div>
      <div className="rbc-provenance">
        <p>¹⁷¹Yb，{conditions} 适用时间 0.01–1.00 µs。</p>
        <p>{errorDefinition}</p>
        <p><span>实际门波形待测</span>。<span>正式读出标定待同装置实测和独立验证批次</span>。</p>
        <details>
          <summary>图源与校验值</summary>
          <p>{locator}</p>
          <p><code>{workbook.file}</code> · SHA-256 <code>{workbook.sha256}</code></p>
          <p><code>{derivedTable.file}</code> · SHA-256 <code>{derivedTable.sha256}</code></p>
        </details>
      </div>
    </section>
  </div>;
}
