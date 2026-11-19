import { BarChart3, ChartLine, FileSpreadsheet } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  SENOO_CZ_CHARACTERIZATION_SOURCE, SENOO_CZ_DEPTHS, SENOO_CZ_GRB_SERIES, SENOO_CZ_INDEPENDENT_LOSS, SENOO_CZ_LOSS_SERIES,
} from '../data/senooCzCharacterization';
import './senoo-cz-characterization.css';

export type SenooCzSelectedDepth = typeof SENOO_CZ_DEPTHS[number];
type GrbSeries = typeof SENOO_CZ_GRB_SERIES[number];
type LossSeries = typeof SENOO_CZ_LOSS_SERIES[number];
type Series = GrbSeries | LossSeries;

interface DepthSelection {
  depth: SenooCzSelectedDepth;
  onDepthChange: (depth: SenooCzSelectedDepth) => void;
}

const seriesColors: Record<Series['id'], string> = {
  prep: '#72dccc',
  decay: '#c6afff',
  loss: '#f6ca88',
  prep_site_loss: '#84c4fc',
  prep_correlated_pair_loss: '#ffafa0',
};
const chart = { width: 480, height: 210, left: 54, right: 459, top: 15, bottom: 169 };
const grbTicks = [0.7, 0.8, 0.9, 1];
const lossTicks = [0, 0.03, 0.06, 0.09, 0.12];
const percent = (value: number, digits = 5) => (value * 100).toFixed(digits);
const seriesStyle = (id: Series['id']) => ({ '--czc-series': seriesColors[id] }) as CSSProperties;

function DepthPlot({ depth, onDepthChange, series, ticks, label, testId }: DepthSelection & {
  series: readonly Series[];
  ticks: readonly number[];
  label: string;
  testId: string;
}) {
  const min = ticks[0];
  const max = ticks[ticks.length - 1];
  const x = (value: number) => chart.left + value / SENOO_CZ_DEPTHS[SENOO_CZ_DEPTHS.length - 1] * (chart.right - chart.left);
  const y = (value: number) => chart.bottom - (value - min) / (max - min) * (chart.bottom - chart.top);
  return <figure className="czc-plot">
    <svg role="img" aria-label={`${label}随 CZ 门深度的源点、误差条及拟合`}
      viewBox={`0 0 ${chart.width} ${chart.height}`} data-testid={testId}>
      <rect className="czc-depth-band" x={x(depth) - 11} y={chart.top} width={22} height={chart.bottom - chart.top} />
      {ticks.map(tick => <g key={tick}>
        <line className="czc-grid" x1={chart.left} x2={chart.right} y1={y(tick)} y2={y(tick)} />
        <text x={chart.left - 8} y={y(tick) + 4} textAnchor="end">{Math.round(100 * tick)}</text>
      </g>)}
      {SENOO_CZ_DEPTHS.map(tick => <g key={tick} className={tick === depth ? 'czc-selected-tick' : undefined}>
        <line className="czc-grid" x1={x(tick)} x2={x(tick)} y1={chart.top} y2={chart.bottom} />
        <text x={x(tick)} y={chart.bottom + 16} textAnchor="middle">{tick}</text>
      </g>)}
      <text className="czc-axis-label" x={13} y={92} textAnchor="middle" transform="rotate(-90 13 92)">{label} (%)</text>
      <text className="czc-axis-label" x={(chart.left + chart.right) / 2} y={chart.height - 4} textAnchor="middle">CZ 门数</text>
      {series.map(curve => <g key={curve.id} style={seriesStyle(curve.id)}>
        <path className="czc-fit" d={curve.points.map((point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(point.depth)},${y(point.fittedProbability)}`).join(' ')} />
        {curve.points.map(point => {
          const center = x(point.depth);
          const low = y(point.probability - point.lowerError);
          const high = y(point.probability + point.upperError);
          return <g key={point.sourceCells} data-testid="senoo-cz-observed-point" data-series={curve.id}
            data-depth={point.depth} data-selected={point.depth === depth} onClick={() => onDepthChange(point.depth)}>
            <title>{curve.label} · 深度 {point.depth} · {percent(point.probability)}% · {point.sourceCells}</title>
            <path className="czc-error-bar" d={`M${center},${high}V${low}M${center - 5},${high}h10M${center - 5},${low}h10`} />
            <circle className="czc-point" cx={center} cy={y(point.probability)} r={point.depth === depth ? 3.6 : 2.8} />
            <circle className="czc-hit" cx={center} cy={y(point.probability)} r={9} />
          </g>;
        })}
      </g>)}
    </svg>
    <ul className="czc-legend" aria-label={`${label}图例`}>
      {series.map(curve => <li key={curve.id} style={seriesStyle(curve.id)}>
        <i className="czc-legend-dot" aria-hidden="true" />{curve.label}
      </li>)}
      <li><i className="czc-legend-fit" aria-hidden="true" />复算拟合</li>
    </ul>
  </figure>;
}

function DepthObservations({ depth, series }: { depth: SenooCzSelectedDepth; series: readonly Series[] }) {
  return <table className="czc-table czc-point-table">
    <caption>深度 <code>{depth}</code> 的源点</caption>
    <thead><tr><th scope="col">观测口径</th><th scope="col">比例与误差</th>
      <th scope="col">反推计数</th><th scope="col">源单元格</th></tr></thead>
    <tbody>{series.map(curve => {
      const point = curve.points.find(row => row.depth === depth)!;
      const [sheet, cells] = point.sourceCells.split('!');
      return <tr key={curve.id} data-testid="senoo-cz-point-detail" data-series={curve.id}
        data-depth={point.depth} data-observed={point.probability}
        data-error-lower={point.lowerError} data-error-upper={point.upperError}>
        <th scope="row" style={seriesStyle(curve.id)}>{curve.label}</th>
        <td><code>{percent(point.probability)}%</code>
          <small title="下误差／上误差（百分点）">−{percent(point.lowerError)} / +{percent(point.upperError)}</small>
        </td>
        <td><code>{point.numerator} / {point.denominator}</code>
          <small>{'fidelity' in curve.summary ? '成功／原子对'
            : point.denominatorUnit === 'atom_site' ? '丢失／站点' : '双丢失／原子对'}</small>
        </td>
        <td><code>{sheet}!<wbr />{cells}</code></td>
      </tr>;
    })}</tbody>
  </table>;
}

function FitSummary({ series }: { series: readonly Series[] }) {
  return <table className="czc-table czc-fit-table">
    <thead><tr><th scope="col">口径</th><th scope="col">复算值 ± 标准误差<small>误差单位为百分点</small></th>
      <th scope="col">刊版参照</th></tr></thead>
    <tbody>{series.map(curve => {
      const summary = curve.summary;
      const grb = 'fidelity' in summary;
      const value = grb ? summary.fidelity : summary.rate;
      const digits = grb ? 5 : 8;
      return <tr key={curve.id} data-testid="senoo-cz-fit-summary" data-series={curve.id}>
        <th scope="row" style={seriesStyle(curve.id)}>{curve.label}
          {grb && <small>渐近值 <var>b</var> = {summary.asymptote === 0 ? '0' : '1/4'}</small>}
        </th>
        <td><code>{percent(value, digits)}% ± {percent(summary.standardError, digits)}</code></td>
        <td>{grb ? <code>{summary.publishedLabel}</code>
          : <><code>{percent(summary.publishedRate, digits)}% ± {percent(summary.publishedStandardError, digits)}</code>
            <small><code>{summary.publishedCells}</code></small></>}</td>
      </tr>;
    })}</tbody>
  </table>;
}

export function SenooCzCharacterization({ depth, onDepthChange }: DepthSelection) {
  const { workbook, derivedTable, countProvenanceLabel } = SENOO_CZ_CHARACTERIZATION_SOURCE;
  return <div className="czc-page" data-testid="senoo-cz-characterization" data-depth={depth}>
    <section className="md-panel czc-toolbar" aria-label="源点选择">
      <div className="czc-depth-controls">
        <span>CZ 门深度</span>
        <div className="md-controls czc-depth-buttons" role="group" aria-label="CZ 门深度">
          {SENOO_CZ_DEPTHS.map(value => <button type="button" key={value} aria-pressed={value === depth}
            onClick={() => onDepthChange(value)}>{value}</button>)}
        </div>
      </div>
      <span className="czc-evidence">文献复现 <span>· 30 个源点</span></span>
    </section>

    <div className="czc-columns">
      <section className="md-panel czc-chart-panel" aria-label="图 3b gRB 成功率">
        <div className="md-panel-header"><h2><ChartLine size={16} />图 3b · gRB 成功率</h2><small>返回目标态</small></div>
        <DepthPlot depth={depth} onDepthChange={onDepthChange} series={SENOO_CZ_GRB_SERIES} ticks={grbTicks}
          label="序列成功率" testId="senoo-cz-grb-plot" />
        <DepthObservations depth={depth} series={SENOO_CZ_GRB_SERIES} />
      </section>
      <section className="md-panel czc-chart-panel" aria-label="图 3c 单站点和相关丢失">
        <div className="md-panel-header"><h2><ChartLine size={16} />图 3c · 丢失率</h2><small>制备擦除后</small></div>
        <DepthPlot depth={depth} onDepthChange={onDepthChange} series={SENOO_CZ_LOSS_SERIES} ticks={lossTicks}
          label="序列末端丢失率" testId="senoo-cz-loss-plot" />
        <DepthObservations depth={depth} series={SENOO_CZ_LOSS_SERIES} />
      </section>
    </div>

    <div className="czc-columns">
      <section className="md-panel" aria-label="图 3b 每门 CZ 保真度">
        <div className="md-panel-header"><h2><BarChart3 size={16} />图 3b · 每门 CZ 保真度</h2><small>六个深度联合拟合</small></div>
        <FitSummary series={SENOO_CZ_GRB_SERIES} />
        <p className="czc-note">以 <var>S</var>(ℓ) = <var>ap</var><sup>ℓ</sup> + <var>b</var> 拟合成功率，经 1 − (1 − <var>b</var>)(1 − <var>p</var>) 得到每门保真度。</p>
      </section>
      <section className="md-panel" aria-label="图 3d 每门丢失">
        <div className="md-panel-header"><h2><BarChart3 size={16} />图 3d · 每门丢失</h2><small>图 3c 拟合斜率</small></div>
        <FitSummary series={SENOO_CZ_LOSS_SERIES} />
        <p className="czc-note">独立丢失比较值 <var>p</var><sub>single</sub><sup>2</sup> 为{' '}
          <code>{percent(SENOO_CZ_INDEPENDENT_LOSS.rate, 10)}% ± {percent(SENOO_CZ_INDEPENDENT_LOSS.standardError, 10)}</code>{' '}
          个百分点（误差），源表 <code>{SENOO_CZ_INDEPENDENT_LOSS.sourceCells}</code>。</p>
      </section>
    </div>

    <section className="md-panel" aria-label="表征来源与适用条件">
      <div className="md-panel-header"><h2><FileSpreadsheet size={16} />来源与适用条件</h2></div>
      <div className="czc-provenance">
        <p>¹⁷¹Yb，767 nm 光镊，m₀／m₁ 编码，302 nm 驱动 m₁↔r₀。图 3b 为 non-echo gRB，图 3c 丢失包含 CZ 后电离的残余里德堡布居。</p>
        <p>比例的上下误差与反推计数采用公开图源。{countProvenanceLabel}。两侧误差按百分点分别显示。</p>
        <ul className="czc-conditions">
          {SENOO_CZ_GRB_SERIES.map(curve => <li key={curve.id}>{curve.label} · {curve.selectionLabel} <code>{curve.sourceRange}</code></li>)}
        </ul>
        <p><span>实际门波形待测</span>。<span>正式读出标定待同装置实测和独立验证批次</span>。</p>
        <details>
          <summary>工作簿与复算源表校验值</summary>
          <dl>
            <div><dt><code>{workbook.file}</code></dt><dd>SHA-256 <code>{workbook.sha256}</code></dd></div>
            <div><dt><code>{derivedTable.file}</code></dt><dd>SHA-256 <code>{derivedTable.sha256}</code></dd></div>
          </dl>
        </details>
      </div>
    </section>
  </div>;
}
