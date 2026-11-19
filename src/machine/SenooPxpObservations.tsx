import { Activity } from 'lucide-react';
import { useId, type CSSProperties } from 'react';
import type { SenooPxpObservationGroup, SenooPxpPoint } from '../data/senooPxpSource';
import './senoo-pxp-observations.css';

export interface SenooBellComparisonRow {
  readonly label: string;
  readonly targetPopulation: number;
  readonly parityAmplitude: number;
}

interface Props {
  readonly frame: {
    readonly stage: { readonly id: string };
    readonly observations: SenooPxpObservationGroup | null;
    readonly point: SenooPxpPoint | null;
  };
  readonly onSelectPoint: (pointId: string) => void;
  readonly figure?: string;
  readonly emptyMessage?: string;
  readonly fidelityCondition?: string;
  readonly comparison?: readonly [SenooBellComparisonRow, SenooBellComparisonRow];
}

interface PlotProps {
  readonly points: readonly SenooPxpPoint[];
  readonly selectedId: string | null;
  readonly onSelectPoint: Props['onSelectPoint'];
}

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const plot = { width: 360, height: 184, left: 35, right: 343, top: 9, bottom: 151 };
const phaseTicks = [0, 0.5, 1, 1.5, 2];
const parityTicks = [-1, -0.5, 0, 0.5, 1];
const x = (phase: number) => plot.left + phase / 2.04 * (plot.right - plot.left);
const y = (parity: number) => plot.bottom - (parity + 1.12) / 2.24 * (plot.bottom - plot.top);

function PopulationPlot({ points, selectedId, onSelectPoint }: PlotProps) {
  return <section className="sx-population" aria-label="四态布居" data-testid="senoo-pxp-population-chart">
    <h3>四态布居</h3>
    {points.map(point => {
      const lower = point.observed - point.lowerError;
      const upper = point.observed + point.upperError;
      const style = {
        '--sx-value': `${point.observed * 100}%`,
        '--sx-error-left': `${lower * 100}%`,
        '--sx-error-width': `${(upper - lower) * 100}%`,
      } as CSSProperties;
      return <button type="button" key={point.id} className="sx-population-row" style={style}
        aria-pressed={point.id === selectedId} onClick={() => onSelectPoint(point.id)}
        aria-label={`${point.state} 布居 ${percent(point.observed)}`}>
        <code>{point.state}</code>
        <span className="sx-population-track" aria-hidden="true"><i /><b /></span>
        <span>{percent(point.observed)}</span>
      </button>;
    })}
  </section>;
}

function ParityPlot({ points, selectedId, onSelectPoint }: PlotProps) {
  const fitPath = (key: 'fixedFit' | 'freeFit') => points
    .filter(point => point[key] !== null && point.phaseOverPi !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.phaseOverPi!)},${y(point[key]!)}`).join(' ');
  const fixedPath = fitPath('fixedFit');
  const freePath = fitPath('freeFit');

  return <section className="sx-parity" aria-label="奇偶振荡" data-testid="senoo-pxp-parity-chart">
    <h3>奇偶振荡</h3>
    <svg viewBox={`0 0 ${plot.width} ${plot.height}`} role="img" aria-label="奇偶值、上下误差和拟合随分析相位变化">
      {parityTicks.map(tick => <g key={tick}>
        <line className="sx-grid" x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} />
        <text x={plot.left - 7} y={y(tick) + 4} textAnchor="end">{tick}</text>
      </g>)}
      {phaseTicks.map(tick => <g key={tick}>
        <line className="sx-grid" x1={x(tick)} x2={x(tick)} y1={plot.top} y2={plot.bottom} />
        <text x={x(tick)} y={plot.bottom + 14} textAnchor="middle">{tick}</text>
      </g>)}
      <text x={(plot.left + plot.right) / 2} y={plot.height - 3} textAnchor="middle">分析相位 φ/π</text>
      {fixedPath && <path className="sx-fit sx-fixed" d={fixedPath} />}
      {freePath && <path className="sx-fit sx-free" d={freePath} />}
      {points.map(point => {
        const cx = x(point.phaseOverPi!);
        const cy = y(point.observed);
        const low = y(point.observed - point.lowerError);
        const high = y(point.observed + point.upperError);
        return <g key={point.id} className="sx-observed" data-selected={point.id === selectedId}
          onClick={() => onSelectPoint(point.id)}>
          <title>{point.sourceCells} · {point.observed}</title>
          <path d={`M${cx},${high}V${low}M${cx - 2.5},${high}h5M${cx - 2.5},${low}h5`} />
          <circle cx={cx} cy={cy} r={2.15} />
          <circle className="sx-hit-area" cx={cx} cy={cy} r={7.5} />
        </g>;
      })}
    </svg>
    <ul className="sx-legend" aria-label="奇偶曲线图例">
      <li><i className="sx-symbol-observed" />观测</li>
      {fixedPath && <li><i className="sx-symbol-fixed" />固定二倍谐波</li>}
      {freePath && <li><i className="sx-symbol-free" />自由谐波拟合</li>}
    </ul>
  </section>;
}

export function SenooPxpObservations({
  frame, onSelectPoint, figure = '图 2f', emptyMessage = '图 2f 的公开布居从 r→m 映射后开始。',
  fidelityCondition, comparison,
}: Props) {
  const titleId = useId();
  const { observations, point, stage } = frame;
  const points = observations?.points ?? [];
  const populations = points.filter(entry => entry.kind === 'population');
  const parity = points.filter(entry => entry.kind === 'parity');
  const fits = observations ? [
    { label: '固定二倍谐波', value: observations.fixedFidelity, error: observations.fixedFidelityError },
    { label: '自由谐波拟合', value: observations.freeFidelity, error: observations.freeFidelityError },
  ] : [];

  return <section className="md-panel sx-observations" aria-labelledby={titleId}
    data-testid="senoo-pxp-observations" data-stage={stage.id} data-point-id={point?.id ?? ''}
    data-figure={figure} data-basis={populations.some(entry => entry.state === 'gg') ? 'clock' : undefined}>
    <div className="md-panel-header">
      <h2 id={titleId}><Activity size={16} />{figure} 观测</h2>
      {observations && <span className="sx-filter" data-testid="senoo-pxp-selection">丢失检测后</span>}
    </div>
    {!observations ? <p className="sx-empty">{emptyMessage}</p> : <div className="sx-body">
      <dl className="sx-summary">
        <div><dt>{stage.id === 'r-to-m' ? '奇子空间布居' : '目标偶布居'}</dt><dd>{percent(observations.targetPopulation)}</dd></div>
        {fits.map(({ label, value, error }) => value !== null && <div key={label}>
          <dt>Bell 保真度 · {label}</dt>
          <dd>{percent(value)}{error !== null && <small>±{(100 * error).toFixed(2)} 个百分点</small>}</dd>
        </div>)}
      </dl>
      {fidelityCondition && <p className="sx-fit-condition">{fidelityCondition}</p>}
      <div className="sx-plots" data-has-parity={parity.length > 0}>
        <PopulationPlot points={populations} selectedId={point?.id ?? null} onSelectPoint={onSelectPoint} />
        {parity.length > 0 && <ParityPlot points={parity} selectedId={point?.id ?? null} onSelectPoint={onSelectPoint} />}
      </div>

      {comparison && <table className="sx-comparison" data-testid="senoo-bell-comparison">
        <caption>路线对照 · 固定二倍谐波</caption>
        <thead><tr><th scope="col">制备路线</th><th scope="col">目标布居</th><th scope="col">奇偶振幅</th></tr></thead>
        <tbody>{comparison.map(row => <tr key={row.label}>
          <th scope="row">{row.label}</th><td>{percent(row.targetPopulation)}</td><td>{percent(row.parityAmplitude)}</td>
        </tr>)}</tbody>
      </table>}

      {point && <div className="sx-detail">
        <label>{figure} 数据点
          <select value={point.id} onChange={event => onSelectPoint(event.currentTarget.value)}>
            <optgroup label="四态布居">{populations.map(entry => <option key={entry.id} value={entry.id}>{entry.state} 布居</option>)}</optgroup>
            {parity.length > 0 && <optgroup label="奇偶振荡">{parity.map(entry =>
              <option key={entry.id} value={entry.id}>φ/π = {entry.phaseOverPi?.toFixed(5)}</option>)}</optgroup>}
          </select>
        </label>
        <dl aria-live="polite">
          <div><dt>{point.kind === 'parity' ? '奇偶值' : '布居概率'}</dt><dd><code>{point.observed}</code></dd></div>
          {point.phaseOverPi !== null && <div><dt>分析相位 φ/π</dt><dd><code>{point.phaseOverPi}</code></dd></div>}
          <div><dt>下误差</dt><dd><code data-testid="senoo-pxp-error-lower">{point.lowerError}</code></dd></div>
          <div><dt>上误差</dt><dd><code data-testid="senoo-pxp-error-upper">{point.upperError}</code></dd></div>
          <div><dt>{point.kind === 'parity' ? '偶数计数' : '状态计数'}／有效对（反推）</dt>
            <dd><code data-testid="senoo-pxp-inferred-count">{point.numerator} / {point.denominator}</code></dd></div>
          <div className="sx-source-cell"><dt>源单元格</dt><dd><code data-testid="senoo-pxp-source-cell">{point.sourceCells}</code></dd></div>
        </dl>
        <p>有效计数按 68% Clopper–Pearson 区间反推。</p>
      </div>}
    </div>}
  </section>;
}
