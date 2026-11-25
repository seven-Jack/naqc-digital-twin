import { useState } from 'react';
import { interactionSiteXUm, munizEvidence, norciaTransport } from '../data/hardwareEvidence';

// Dimension lines share the coordinates of the samples or trap centres they measure.
function Gauge({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const tick = x1 === x2 ? 5 : 0;
  const rise = y1 === y2 ? 5 : 0;
  return <path className="metric-gauge" d={`M${x1} ${y1}L${x2} ${y2} M${x1 - tick} ${y1 - rise}l${2 * tick} ${2 * rise} M${x2 - tick} ${y2 - rise}l${2 * tick} ${2 * rise}`} />;
}

function TransportGeometry() {
  const mm = norciaTransport.separationM * 1000;
  const x = 157, science = 57, mot = science + mm * 0.51;
  return <svg viewBox="0 0 380 262" role="img" aria-label={`MOT 与科学区的原子位置，垂直间距 ${mm} 毫米`}>
    <g className="metric-shell">
      <rect x={x - 31} y={science - 21} width="62" height="42" rx="3" />
      <rect x={x - 7} y={science + 21} width="14" height={mot - science - 42} />
      {[science + 25, mot - 25].map(y => <rect key={y} x={x - 12} y={y - 2} width="24" height="4" />)}
      <path d={`M${x-25} ${mot-20} h50 l9 10 v20 l-9 10 h-50 l-9 -10 v-20 Z`} />
      {[-1, 1].map(sign => <path key={sign} d={`M${x + sign*35} ${science-9} h${sign*12} v-4 h${sign*18} v26 h${sign*-18} v-4 h${sign*-12} Z`} />)}
    </g>
    <path className="metric-guide" d={`M56 ${science} H${x} M56 ${mot} H${x}`} />
    <Gauge x1={63} y1={science} x2={63} y2={mot} />
    <text className="metric-value" x="55" y={(science + mot) / 2} textAnchor="middle" transform={`rotate(-90 55 ${(science+mot)/2})`}>{mm} mm</text>
    <path className="metric-transfer" d={`M${x} ${mot} V${science} m-4 12 4 -7 4 7`} />
    <circle className="metric-site" cx={x} cy={science} r="4" /><circle className="metric-site" cx={x} cy={mot} r="5" />
    <text x="237" y={science + 3}>科学区</text><text className="metric-sub" x="237" y={science+23}>储备光镊焦点</text>
    <text x="200" y={(science+mot)/2}>532 nm 移动晶格</text>
    <text x="216" y={mot+2}>冷却区</text><text className="metric-sub" x="216" y={mot+22}>磁光阱中心</text>
  </svg>;
}

function InteractionGeometry() {
  const { trapColumns, gatePitchUm: pitch, interactionRowGapUm: gap } = munizEvidence;
  const scale = 13, startX = 56, row = 113;
  const span = (trapColumns - 1) * pitch;
  const endX = startX + scale * span, nextRow = row + scale * gap;
  return <svg viewBox="0 0 380 262" role="img" aria-label={`交互行 ${trapColumns} 个阱位，中心距 ${pitch} 微米，首末跨距 ${span} 微米，与储备区间隔 ${gap} 微米`}>
    <path className="metric-guide" d={`M${startX} 51 V${row} M${endX} 51 V${row} M${startX} ${nextRow} H335 M${startX} ${row} H335`} />
    <Gauge x1={startX} y1={55} x2={endX} y2={55} />
    <text className="metric-value" x={(startX+endX)/2} y="42" textAnchor="middle">{span} μm</text>
    {interactionSiteXUm.map(x => <g key={x} transform={`translate(${startX+(x-interactionSiteXUm[0])*scale} ${row})`}>
      <circle className="metric-site-outline" r="8" /><circle className="metric-site" r="3.5" />
    </g>)}
    <text x={startX} y={row-19}>交互行</text>
    <Gauge x1={startX} y1={row+21} x2={startX+scale*pitch} y2={row+21}/>
    <text className="metric-value" x={startX+scale*pitch/2} y={row+43} textAnchor="middle">{pitch} μm</text>
    <Gauge x1={322} y1={row} x2={322} y2={nextRow}/>
    <text className="metric-value" x="330" y={(row+nextRow)/2+4}>{gap} μm</text>
    <text x={startX} y={nextRow+22}>相邻储备行</text>
  </svg>;
}

export function ApparatusDimensions({ initial = 'transport', fixed = false }: {
  initial?: 'transport' | 'array'; fixed?: boolean;
}) {
  const [section, setSection] = useState(initial);
  const transport = section === 'transport';
  return <section className="apparatus-dimensions" aria-label="装置公开尺寸">
    {!fixed && <div className="metric-switch" role="group" aria-label="尺寸局部">
      <button type="button" aria-pressed={transport} onClick={() => setSection('transport')}>两腔输运</button>
      <button type="button" aria-pressed={!transport} onClick={() => setSection('array')}>交互行</button>
    </div>}
    {transport ? <TransportGeometry /> : <InteractionGeometry />}
    <p>{transport ? '两处原子的位置取自同团队前序装置。腔体轮廓与安装朝向为示意。'
      : `实验阵列共 ${munizEvidence.trapRows} 行 × ${munizEvidence.trapColumns} 列。图中仅标出有公开间距的阱位，圆点表示阱心。`}</p>
    <a href={transport ? norciaTransport.figureUrl : munizEvidence.apparatusUrl} target="_blank" rel="noreferrer">
      {transport ? 'Norcia 等 · 图 1 与正文 ↗' : 'Muniz 附录 A · 阵列参数 ↗'}
    </a>
  </section>;
}
