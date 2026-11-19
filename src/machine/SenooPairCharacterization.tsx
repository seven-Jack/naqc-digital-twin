import { ChartLine, FileSpreadsheet, Waves } from 'lucide-react';
import {
  SENOO_BLOCKADE_SUMMARY, SENOO_BLOCKADE_WINDOWS, SENOO_PAIR_SOURCE,
} from '../data/senooPairCharacterization';
import { SenooFitPlot, type SenooFitSeries } from './SenooFitPlot';
import { SenooPairShiftPanel } from './SenooPairShiftPanel';
import './senoo-rabi-characterization.css';

const branchIds = ['free', 'published'] as const;
const branchStyles = {
  free: { color: '#83c8ff', label: '源表自由频率' },
  published: { color: '#f6c281', label: '固定刊版频率' },
};
const blockadePoints = SENOO_BLOCKADE_WINDOWS.flatMap(window => window.points);
const percent = (value: number, digits = 4) => (100 * value).toFixed(digits);
const signed = (value: number, digits = 4) => `${value < 0 ? '−' : '+'}${percent(Math.abs(value), digits)}`;
const frequency = (hz: number, id: typeof branchIds[number]) => `${(hz / 1e6).toFixed(id === 'free' ? 5 : 2)} MHz`;

function BlockadeSection({ index, onSelect }: { index: number; onSelect: (index: number) => void }) {
  const point = blockadePoints[index];
  const window = SENOO_BLOCKADE_WINDOWS[point.window - 1];
  const labels = {
    free: frequency(window.free.frequencyHz, 'free'),
    published: frequency(window.published.frequencyHz, 'published'),
  };
  const [sheet, cells] = point.sourceCells.split('!');
  const windowWidth = window.endUs - window.startUs;
  const xTicks = Array.from({ length: 4 }, (_, tick) => Number((window.startUs + windowWidth * tick / 3).toFixed(2)));
  const plotProps = {
    xTicks, xDomain: [window.startUs - 0.025, window.endUs + 0.025] as const, xLabel: '驱动时间 (µs)',
    selectedIndex: index, selectedX: point.timeUs, onSelect,
  };
  const populationSeries: readonly SenooFitSeries[] = [
    ...branchIds.map(id => ({
      id, color: branchStyles[id].color, label: labels[id], points: [],
      fit: window.points.map(sample => ({ x: sample.timeUs, y: 100 * sample[id].fitted })),
    })),
    {
      id: 'observed', color: '#b6e4d1', label: '源表布居',
      points: window.points.map(sample => ({
        index: sample.index, x: sample.timeUs, y: 100 * sample.observed,
        errorY: [100 * sample.lowerError, 100 * sample.upperError],
        title: `${sample.sourceCells} · ${percent(sample.observed)}%`,
      })),
    },
  ];
  const residualSeries: readonly SenooFitSeries[] = branchIds.map(id => ({
    id, color: branchStyles[id].color, label: labels[id],
    points: window.points.map(sample => ({
      index: sample.index, x: sample.timeUs, y: 100 * sample[id].residual,
      title: `${sample.sourceCells} · ${signed(sample[id].residual)} 个百分点`,
    })),
  }));
  return <section className="rbc-stack" aria-label="扩展数据图 4f 阻塞 Rabi" data-testid="senoo-blockade-section"
    data-window={window.id} data-index={index}>
    <div className="md-panel">
      <div className="md-panel-header"><h2><Waves size={16} />扩展数据图 4f · 阻塞 Rabi</h2>
        <small>2.4 µm · 丢失检测后</small></div>
      <div className="rbc-toolbar">
        <div className="rbc-selection">
          <div className="md-controls rbc-option-buttons" role="group" aria-label="图 4f 采样时窗">
            {SENOO_BLOCKADE_WINDOWS.map(item => <button type="button" aria-pressed={item.id === window.id}
              key={item.id} onClick={() => onSelect(item.points[0].index)}>时窗 {item.id}</button>)}
          </div>
          <label htmlFor="senoo-blockade-sample">源点</label>
          <input id="senoo-blockade-sample" type="number" aria-label="图 4f 源点序号"
            min={1} max={blockadePoints.length} step={1} value={index + 1}
            onChange={event => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isInteger(next) && next >= 1 && next <= blockadePoints.length) onSelect(next - 1);
            }} />
          <span>/ {blockadePoints.length}</span>
          <output title={String(point.timeUs)}>{point.timeUs.toFixed(6)} µs</output>
        </div>
        <span className="rbc-evidence">文献复现</span>
      </div>
    </div>
    <div className="rbc-columns">
      <div className="rbc-stack">
        <section className="md-panel" aria-label="图 4f 单激发布居">
          <div className="md-panel-header"><h2><Waves size={16} />原子对单激发布居</h2><small>同窗 15 点</small></div>
          <SenooFitPlot {...plotProps} testId="senoo-blockade-population-plot" markerTestId="senoo-blockade-population-point"
            yLabel="单激发布居 (%)" yTicks={[0, 25, 50, 75, 100]} yDomain={[0, 100]} series={populationSeries} />
        </section>
        <section className="md-panel" aria-label="图 4f 逐点残差">
          <div className="md-panel-header"><h2><ChartLine size={16} />逐点残差</h2><small>共享相位模型 − 观测</small></div>
          <SenooFitPlot {...plotProps} testId="senoo-blockade-residual-plot" markerTestId="senoo-blockade-residual-point"
            yLabel="残差 (百分点)" yTicks={[-30, -15, 0, 15, 30]} yDomain={[-30, 30]} series={residualSeries} compact />
        </section>
      </div>
      <div className="rbc-stack">
        <div className="md-panel" data-testid="senoo-blockade-point-detail" data-time-us={point.timeUs}
          data-observed={point.observed} data-error-lower={point.lowerError} data-error-upper={point.upperError}
          data-fit-free={point.free.fitted} data-fit-published={point.published.fitted}
          data-residual-free={point.free.residual} data-residual-published={point.published.residual}>
          <div className="md-panel-header"><h2><FileSpreadsheet size={16} />源点核对</h2><small>时窗 {window.id}</small></div>
          <div className="rbc-blockade-source">
            <div><span>观测</span> <strong>{percent(point.observed)}%</strong></div>
            <div>误差（百分点） <code>−{percent(point.lowerError)} / +{percent(point.upperError)}</code></div>
            <code className="rbc-cell">{sheet}!<wbr />{cells}</code>
          </div>
          <table className="rbc-table">
            <thead><tr><th scope="col">频率</th><th scope="col">预测</th><th scope="col">残差（百分点）</th><th scope="col">误差条</th></tr></thead>
            <tbody>{branchIds.map(id => <tr key={id}>
              <th scope="row" style={{ color: branchStyles[id].color }}>{labels[id]}</th><td>{percent(point[id].fitted)}%</td>
              <td>{signed(point[id].residual)}</td><td>{point[id].insideErrorBar ? '内' : '外'}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <section className="md-panel" aria-label="图 4f 逐窗残差与相位">
          <div className="md-panel-header"><h2><ChartLine size={16} />逐窗残差与相位</h2><small>共享 → 逐窗独立相位</small></div>
          <p className="rbc-note">时窗 {window.id} · 中点 {window.centerUs.toFixed(4)} µs · <code>{window.sourceRange}</code></p>
          <div className="rbc-detail-grid rbc-diagnostics">
            {branchIds.map(id => {
              const branch = window[id];
              return <article key={id} className="rbc-detail" data-testid="senoo-blockade-diagnostic" data-branch={id}
                data-window={window.id} data-shared-rmse={branch.sharedRmse} data-local-rmse={branch.localRmse}>
                <h3 style={{ color: branchStyles[id].color }}>{labels[id]}</h3>
                <span className="rbc-diagnostic-label">{branchStyles[id].label}</span>
                <dl>
                  <div><dt>RMSE（百分点）</dt><dd>{percent(branch.sharedRmse, 3)} → {percent(branch.localRmse, 3)}</dd></div>
                  <div><dt>平均残差（百分点）</dt><dd>{signed(branch.sharedMeanResidual, 3)} → {signed(branch.localMeanResidual, 3)}</dd></div>
                  <div><dt>中心相位（rad）</dt><dd>{branch.sharedPhaseRad.toFixed(3)} → {branch.localPhaseRad.toFixed(3)}</dd></div>
                  <div><dt>加权残差平方和</dt><dd>{branch.sharedWeightedSse.toFixed(2)} → {branch.localWeightedSse.toFixed(2)}</dd></div>
                  <div><dt>误差条内</dt><dd>{branch.sharedInsideErrorBar}/15 → {branch.localInsideErrorBar}/15</dd></div>
                </dl>
              </article>;
            })}
          </div>
          <p className="rbc-note">逐点图使用共享相位的归档拟合。逐窗独立相位保存汇总诊断。</p>
        </section>
      </div>
    </div>
    <section className="md-panel" aria-label="图 4f 两组频率的全图结果">
      <div className="md-panel-header"><h2><ChartLine size={16} />全图 60 点比较</h2><small>频率选解待核</small></div>
      <table className="rbc-table">
        <thead><tr><th scope="col">频率</th><th scope="col">共享相位 RMSE（百分点）</th>
          <th scope="col">逐窗相位 RMSE（百分点）</th><th scope="col">共享相位归一化 RMS</th></tr></thead>
        <tbody>{branchIds.map(id => <tr key={id}><th scope="row">{labels[id]}</th>
          <td>{percent(SENOO_BLOCKADE_SUMMARY[id].sharedRmse, 4)}</td>
          <td>{percent(SENOO_BLOCKADE_SUMMARY[id].localRmse, 4)}</td>
          <td>{SENOO_BLOCKADE_SUMMARY[id].rmsInMeanErrorUnits.toFixed(4)}</td>
        </tr>)}</tbody>
      </table>
      <p className="rbc-note">放开逐窗相位使固定刊版频率的额外加权残差减少 {percent(SENOO_BLOCKADE_SUMMARY.extraWeightedSseReduction, 2)}%。
        固定刊版频率的共享相位拟合超出归一化 RMS ≤ 2 的复现门槛。
        频率选解仍需核对原始时标、窗间扫描或作者拟合文件。</p>
    </section>
  </section>;
}

export function SenooPairCharacterization({ shiftIndex, onShiftSelect, blockadeIndex, onBlockadeSelect }: {
  shiftIndex: number;
  onShiftSelect: (index: number) => void;
  blockadeIndex: number;
  onBlockadeSelect: (index: number) => void;
}) {
  const { workbooks, derivedTables } = SENOO_PAIR_SOURCE;
  return <div className="rbc-page" data-testid="senoo-pair-characterization">
    <SenooPairShiftPanel index={shiftIndex} onSelect={onShiftSelect} />
    <BlockadeSection index={blockadeIndex} onSelect={onBlockadeSelect} />
    <section className="md-panel" aria-label="双原子来源与适用条件">
      <div className="md-panel-header"><h2><FileSpreadsheet size={16} />来源与适用条件</h2><small>文献复现</small></div>
      <div className="rbc-provenance">
        <p>¹⁷¹Yb，767 nm 光镊，302 nm 驱动 m₁↔r₀。图 5f 为 r₀r₀ 双原子能移。图 4f 为 2.4 µm 原子对的单激发条件布居。</p>
        <p>图 4f 按丢失检测筛选，每点约 130 次有效测量，九对原子汇总。逐点精确分母和丢失率未公开。</p>
        <p><span>实际门波形待测</span>。<span>正式读出标定待同装置实测和独立验证批次</span>。</p>
        <details>
          <summary>工作簿与复算源表校验值</summary>
          {[...Object.values(workbooks), ...Object.values(derivedTables)].map(file => <p key={file.file}>
            <code>{file.file}</code> · SHA-256 <code>{file.sha256}</code>
          </p>)}
        </details>
      </div>
    </section>
  </div>;
}
