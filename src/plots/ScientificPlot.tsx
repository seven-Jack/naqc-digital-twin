import { memo, useId, useState } from 'react';
import type { Point, Series } from './curves';

interface Marker { x: number; color: string; label?: string }
interface Dot extends Marker { y: number }
interface Props {
  label: string;
  xLabel: string;
  yLabel: string;
  xRange: [number, number];
  yRange: [number, number];
  series: Series[];
  markers?: Marker[];
  dots?: Dot[];
  cursor?: number;
  onSeek?: (value: number) => void;
}
const width = 600;
const height = 205;
const left = 63;
const right = 578;
const top = 23;
const bottom = 158;
const coordinates = (points: Point[], x: (v: number) => number, y: (v: number) => number) =>
  points.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a).toFixed(2)},${y(b).toFixed(2)}`).join(' ');

function ticks([min, max]: [number, number], target: number) {
  const approximate = (max - min) / target;
  const power = 10 ** Math.floor(Math.log10(approximate));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(value => value >= approximate) ?? approximate;
  const list: number[] = [];
  for (let value = Math.ceil(min / step - 1e-10) * step; value <= max + 1e-10; value += step) list.push(value);
  return list;
}
const fmt = (n: number) => Number(n.toFixed(3)).toString().replace('-', '−');

const Traces = memo(function Traces({ series, xRange, yRange, id }: Pick<Props, 'series' | 'xRange' | 'yRange'> & { id: string }) {
  const x = (value: number) => left + (value - xRange[0]) / (xRange[1] - xRange[0]) * (right - left);
  const y = (value: number) => bottom - (value - yRange[0]) / (yRange[1] - yRange[0]) * (bottom - top);
  return <g clipPath={`url(#${id}-clip)`}>{series.map(line => {
    const path = coordinates(line.points, x, y);
    const lastX = x(line.points.at(-1)![0]);
    const firstX = x(line.points[0][0]);
    const baseline = y(Math.max(yRange[0], Math.min(0, yRange[1])));
    return <g key={line.id}>
      {line.fill && <path d={`${path} L${lastX},${baseline} L${firstX},${baseline} Z`} fill={`url(#${id}-${line.id})`} />}
      <path data-series={line.id} d={path} fill="none" stroke={line.color} strokeWidth={line.dashed ? 1.35 : 2}
        strokeDasharray={line.dashed ? '5 5' : undefined} vectorEffect="non-scaling-stroke" />
    </g>;
  })}</g>;
});

export const ScientificPlot = memo(function ScientificPlot({ label, xLabel, yLabel, xRange, yRange, series, markers = [], dots = [], cursor, onSeek }: Props) {
  const id = useId();
  const [probe, setProbe] = useState<number>();
  const x = (value: number) => left + (value - xRange[0]) / (xRange[1] - xRange[0]) * (right - left);
  const y = (value: number) => bottom - (value - yRange[0]) / (yRange[1] - yRange[0]) * (bottom - top);
  function xAt(event: React.PointerEvent<SVGSVGElement>) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(event.currentTarget.getScreenCTM()?.inverse());
    const ratio = (point.x - left) / (right - left);
    return ratio >= 0 && ratio <= 1 && point.y >= top && point.y <= bottom ? xRange[0] + ratio * (xRange[1] - xRange[0]) : undefined;
  }
  return <div className="plot-figure">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={onSeek ? 'plot-seek' : ''}
      onPointerMove={event => setProbe(xAt(event))} onPointerLeave={() => setProbe(undefined)}
      onPointerDown={event => { const value = xAt(event); if (value !== undefined) onSeek?.(value); }}>
      <defs>
        <clipPath id={`${id}-clip`}><rect x={left} y={top - 2} width={right - left} height={bottom - top + 4} /></clipPath>
        {series.filter(line => line.fill).map(line => <linearGradient id={`${id}-${line.id}`} key={line.id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={line.color} stopOpacity={0.21} /><stop offset="100%" stopColor={line.color} stopOpacity={0.035} />
        </linearGradient>)}
      </defs>
      {ticks(xRange, 5).map(value => <g key={value}>
        <line x1={x(value)} x2={x(value)} y1={top} y2={bottom} className="plot-grid" />
        <text x={x(value)} y={bottom + 18} textAnchor="middle" className="plot-tick">{fmt(value)}</text>
      </g>)}
      {ticks(yRange, 4).map(value => <g key={value}>
        <line x1={left} x2={right} y1={y(value)} y2={y(value)} className="plot-grid" />
        <text x={left - 8} y={y(value) + 4} textAnchor="end" className="plot-tick">{fmt(value)}</text>
      </g>)}
      <path d={`M${left},${top} V${bottom} H${right}`} className="plot-axis" />
      <text x={(left + right) / 2} y={height - 9} textAnchor="middle" className="plot-label">{xLabel}</text>
      <text x={left} y={14} className="plot-label">{yLabel}</text>
      <Traces series={series} xRange={xRange} yRange={yRange} id={id} />
      {markers.map((marker, index) => <g key={index}>
        <line x1={x(marker.x)} x2={x(marker.x)} y1={top} y2={bottom} stroke={marker.color} opacity={0.6} strokeDasharray="3 4" />
        {marker.label && <text x={x(marker.x) + 5} y={top + 12} fill={marker.color} className="plot-tick">{marker.label}</text>}
      </g>)}
      {cursor !== undefined && <line data-testid="rabi-time-cursor" data-time-us={cursor} x1={x(cursor)} x2={x(cursor)} y1={top} y2={bottom} stroke="#e5f6ff" opacity={0.65} />}
      {dots.map((dot, index) => <circle key={index} cx={x(dot.x)} cy={y(dot.y)} r="4" fill={dot.color} stroke="#0c1421" strokeWidth="1.5" />)}
      {probe !== undefined && probe >= xRange[0] && probe <= xRange[1] && <g pointerEvents="none">
        <line x1={x(probe)} x2={x(probe)} y1={top} y2={bottom} stroke="#c6e3ed" opacity={0.5} strokeDasharray="2 3" />
        <rect x={Math.min(right - 58, x(probe) + 4)} y={top + 2} width="58" height="18" rx="4" fill="#172738" />
        <text x={Math.min(right - 54, x(probe) + 9)} y={top + 15} fill="#dbeef9" className="plot-tick">{fmt(probe)}</text>
      </g>}
    </svg>
    <div className="plot-legend">{series.map(line => <span key={line.id}><i className={line.dashed ? 'dashed' : ''} style={{ color: line.color }} />{line.label}</span>)}</div>
  </div>;
});
