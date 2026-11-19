import type { CSSProperties } from 'react';

interface Coordinates {
  readonly x: number;
  readonly y: number;
}

interface FitPoint extends Coordinates {
  readonly index: number;
  readonly title: string;
  readonly errorX?: readonly [number, number];
  readonly errorY?: readonly [number, number];
}

export interface SenooFitSeries {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly FitPoint[];
  readonly fit?: readonly Coordinates[];
}

interface PlotProps {
  readonly testId: string;
  readonly markerTestId: string;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly xTicks: readonly number[];
  readonly yTicks: readonly number[];
  readonly xDomain: readonly [number, number];
  readonly yDomain: readonly [number, number];
  readonly selectedIndex: number;
  readonly selectedX: number;
  readonly onSelect: (index: number) => void;
  readonly series: readonly SenooFitSeries[];
  readonly compact?: boolean;
  readonly fitLegend?: string;
}

export function SenooFitPlot({
  testId, markerTestId, xLabel, yLabel, xTicks, yTicks, xDomain, yDomain, selectedIndex, selectedX, onSelect, series,
  compact = false, fitLegend = '复算拟合',
}: PlotProps) {
  const chart = { width: 536, height: compact ? 168 : 258, left: 57, right: 520, top: 14, bottom: compact ? 130 : 220 };
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const x = (value: number) => chart.left + (value - xMin) / (xMax - xMin) * (chart.right - chart.left);
  const y = (value: number) => chart.bottom - (value - yMin) / (yMax - yMin) * (chart.bottom - chart.top);
  const style = (color: string) => ({ '--rbc-series': color }) as CSSProperties;
  return <figure className="rbc-plot">
    <svg role="img" aria-label={`${yLabel}随${xLabel}变化`} viewBox={`0 0 ${chart.width} ${chart.height}`}
      data-testid={testId} data-index={selectedIndex}>
      {xTicks.map(value => <g key={value}>
        <line x1={x(value)} x2={x(value)} y1={chart.top} y2={chart.bottom} className="rbc-grid" />
        <text x={x(value)} y={chart.bottom + 16} textAnchor="middle">{value}</text>
      </g>)}
      {yTicks.map(value => <g key={value}>
        <line x1={chart.left} x2={chart.right} y1={y(value)} y2={y(value)}
          className={value === 0 && yMin < 0 ? 'rbc-zero' : 'rbc-grid'} />
        <text x={chart.left - 8} y={y(value) + 4} textAnchor="end">{value}</text>
      </g>)}
      <text className="rbc-axis-label" x={15} y={(chart.top + chart.bottom) / 2} textAnchor="middle"
        transform={`rotate(-90 15 ${(chart.top + chart.bottom) / 2})`}>{yLabel}</text>
      <text className="rbc-axis-label" x={(chart.left + chart.right) / 2} y={chart.height - 4} textAnchor="middle">{xLabel}</text>
      <line x1={x(selectedX)} x2={x(selectedX)} y1={chart.top} y2={chart.bottom} className="rbc-crosshair" />
      {series.map(trace => <g key={trace.id} style={style(trace.color)}>
        {trace.fit && <path className="rbc-fit" d={trace.fit.map((point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(point.x)},${y(point.y)}`).join(' ')} />}
        {trace.points.map(point => {
          const cx = x(point.x);
          const cy = y(point.y);
          const selected = point.index === selectedIndex;
          const left = point.errorX && x(point.x - point.errorX[0]);
          const right = point.errorX && x(point.x + point.errorX[1]);
          const bottom = point.errorY && y(point.y - point.errorY[0]);
          const top = point.errorY && y(point.y + point.errorY[1]);
          return <g key={point.index} data-testid={markerTestId} data-index={point.index}
            data-state={trace.id} data-selected={selected} onClick={() => onSelect(point.index)}>
            <title>{point.title}</title>
            {top !== undefined && bottom !== undefined && <path className="rbc-error" data-error="y"
              d={`M${cx},${top}V${bottom}M${cx - 3},${top}h6M${cx - 3},${bottom}h6`} />}
            {left !== undefined && right !== undefined && <path className="rbc-error" data-error="x"
              d={`M${left},${cy}H${right}M${left},${cy - 3}v6M${right},${cy - 3}v6`} />}
            <circle className="rbc-point" cx={cx} cy={cy} r={selected ? 3.4 : 2.15} />
            <circle className="rbc-hit" cx={cx} cy={cy} r={5} />
          </g>;
        })}
      </g>)}
    </svg>
    <ul className="rbc-legend" aria-label={`${yLabel}图例`}>
      {series.map(trace => <li key={trace.id} style={style(trace.color)}>
        <i className={trace.points.length ? 'rbc-legend-dot' : 'rbc-legend-line'} aria-hidden="true" />{trace.label}
      </li>)}
      {series.some(trace => trace.fit && trace.points.length) && <li><i className="rbc-legend-line" aria-hidden="true" />{fitLegend}</li>}
    </ul>
  </figure>;
}
