import { ChartLine, FileSpreadsheet } from 'lucide-react';
import { SENOO_PAIR_SHIFTS, type SenooPairDirection } from '../data/senooPairCharacterization';
import { senooPairShiftHz } from '../physics/senooPair';
import { um } from '../physics/units';
import { SenooFitPlot, type SenooFitSeries } from './SenooFitPlot';

const directions: Record<SenooPairDirection, { label: string; color: string }> = {
  perpendicular: { label: '垂直', color: '#84c4fc' },
  parallel: { label: '平行', color: '#ffaea6' },
};
const directionIds = ['perpendicular', 'parallel'] as const;
const series: readonly SenooFitSeries[] = directionIds.map(id => {
  const points = SENOO_PAIR_SHIFTS.filter(point => point.direction === id);
  const low = Math.min(...points.map(point => point.distanceUm - point.distanceErrorUm));
  const high = Math.max(...points.map(point => point.distanceUm + point.distanceErrorUm));
  const coefficientHzM6 = points[0].coefficientGHzUm6 * 1e-27;
  return {
    id,
    ...directions[id],
    points: points.map(point => ({
      index: point.index,
      x: point.distanceUm,
      y: point.observedMHz,
      errorX: [point.distanceErrorUm, point.distanceErrorUm],
      errorY: [point.shiftErrorMHz, point.shiftErrorMHz],
      title: `${directions[id].label} · ${point.sourceCells} · ${point.observedMHz} MHz`,
    })),
    fit: Array.from({ length: 41 }, (_, index) => {
      const x = low + (high - low) * index / 40;
      return { x, y: senooPairShiftHz(um(x), coefficientHzM6) / 1e6 };
    }),
  };
});
const overlapCount = SENOO_PAIR_SHIFTS.filter(point => point.overlapsErrorBox).length;
const signedMHz = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(5)} MHz`;

export function SenooPairShiftPanel({ index, onSelect }: { index: number; onSelect: (index: number) => void }) {
  const selected = SENOO_PAIR_SHIFTS[index];
  return <section className="rbc-stack" aria-label="扩展数据图 5f 双原子能移" data-testid="senoo-pair-shift-panel">
    <div className="rbc-two-column">
      <section className="md-panel" aria-label="双原子能移随距离变化">
        <div className="md-panel-header">
          <h2><ChartLine size={16} />扩展数据图 5f · 双原子能移</h2>
          <small>文献复现 · {overlapCount}/{SENOO_PAIR_SHIFTS.length} 相交</small>
        </div>
        <SenooFitPlot testId="senoo-pair-shift-plot" markerTestId="senoo-pair-shift-point"
          xLabel="原子间距 (µm)" yLabel="V/(2π) (MHz)"
          xDomain={[3.52, 3.92]} yDomain={[6.4, 12.3]} xTicks={[3.55, 3.65, 3.75, 3.85]} yTicks={[7, 8, 9, 10, 11, 12]}
          selectedIndex={index} selectedX={selected.distanceUm} onSelect={onSelect} series={series} fitLegend="刊版系数曲线" />
        <p className="rbc-note">以刊版固定系数 C₆/(2π) = 24（垂直）和 21（平行）GHz·µm⁶ 绘制 R⁻⁶ 曲线。
          曲线绘制在各方向源点的横向误差所及的距离范围内。平行方向仅有 3.68 µm 一个源点。</p>
      </section>
      <section className="md-panel" aria-label="选中源点的能移核对" data-testid="senoo-pair-shift-detail"
        data-index={index} data-direction={selected.direction} data-residual={selected.residualMHz}
        data-inside-y={selected.insideYError} data-overlaps-xy={selected.overlapsErrorBox}>
        <div className="md-panel-header">
          <h2><FileSpreadsheet size={16} />源点核对</h2>
          <small>{directions[selected.direction].label}于磁场 · {selected.distanceUm} µm</small>
        </div>
        <dl className="rbc-metrics">
          <div><dt>中心距离的模型值</dt><dd>{selected.modelMHz.toFixed(5)} MHz</dd></div>
          <div><dt>中心残差 · 模型 − 观测</dt><dd>{signedMHz(selected.residualMHz)}</dd></div>
          <div><dt>中心预测与纵向误差</dt><dd>{selected.insideYError ? '误差条内' : '超出纵向误差条'}</dd></div>
          <div><dt>曲线与横纵误差矩形</dt><dd>{selected.overlapsErrorBox ? '相交' : '未相交'}</dd></div>
          <div><dt>计入距离误差的模型范围</dt><dd>{selected.modelLowMHz.toFixed(5)}–{selected.modelHighMHz.toFixed(5)} MHz</dd></div>
          <div><dt>源单元格</dt><dd><code className="rbc-cell">{selected.sourceCells}</code></dd></div>
        </dl>
      </section>
    </div>
    <section className="md-panel" aria-label="图 5f 五个源点">
      <div className="md-panel-header"><h2>图 5f · 横纵误差与源单元格</h2><small>方向为原子连线相对磁场</small></div>
      <table className="rbc-table rbc-shift-table">
        <thead><tr><th scope="col">方向</th><th scope="col">间距 ± 误差 (µm)</th>
          <th scope="col">能移 ± 误差 (MHz)</th><th scope="col">源单元格</th></tr></thead>
        <tbody>{SENOO_PAIR_SHIFTS.map(point => <tr key={point.sourceCells} data-testid="senoo-pair-shift-row"
          data-index={point.index} data-x={point.distanceUm} data-error-x={point.distanceErrorUm}
          data-y={point.observedMHz} data-error-y={point.shiftErrorMHz} data-selected={point.index === index}>
          <th scope="row"><button type="button" className="rbc-row-button" aria-pressed={point.index === index}
            aria-label={`${directions[point.direction].label} · ${point.distanceUm} µm`}
            onClick={() => onSelect(point.index)}>{directions[point.direction].label}</button></th>
          <td>{point.distanceUm} ± {point.distanceErrorUm}</td><td>{point.observedMHz} ± {point.shiftErrorMHz}</td>
          <td><code className="rbc-cell">{point.sourceCells}</code></td>
        </tr>)}</tbody>
      </table>
      <p className="rbc-note">各点保留原表两轴误差。相交检查比较距离误差范围内的模型预测与频移误差区间。
        2.4 µm 的绝对相互作用能移仍待同装置谱线数据。</p>
    </section>
  </section>;
}
