import { memo, useMemo, useState } from 'react';
import { Activity, ChartNoAxesCombined, Radio, Waves } from 'lucide-react';
import type { Model } from '../physics/model';
import { kHz, us } from '../physics/units';
import { signed } from '../components/format';
import { colors, potentialCurves, rabiCurves, spectrumCurves, starkCurve } from './curves';
import { ScientificPlot } from './ScientificPlot';

const probability: [number, number] = [0, 1];

export const Analysis = memo(function Analysis({ model, time, seek, excitation }: {
  model: Model; time: number; seek: (time: number) => void; excitation: number;
}) {
  const [axial, setAxial] = useState(false);
  const rabi = useMemo(() => rabiCurves(model), [model]);
  const spectrum = useMemo(() => spectrumCurves(model), [model]);
  const potential = useMemo(() => potentialCurves(model, axial), [model, axial]);
  const stark = useMemo(() => starkCurve(model), [model]);
  const rabiRange = useMemo<[number, number]>(() => [0, model.parameters.pulseUs], [model.parameters.pulseUs]);
  const potentialYRange = useMemo<[number, number]>(() => [model.groundHz / kHz(1) * 1.08, model.starkHz / kHz(1) * 1.13], [model.groundHz, model.starkHz]);
  const starkYRange = useMemo<[number, number]>(() => [0, stark[0].points.at(-1)![1] * 1.07], [stark]);
  const cursor = time / us(1);
  return <section className="analysis" aria-label="科学分析">
    <div className="section-heading"><h2>科学分析</h2><span><i className="status-dot" /> 随当前参数更新</span></div>
    <div className="analysis-grid">
      <article className="panel plot-card">
        <header><div><Activity size={17} /><h3>拉比动力学</h3></div><span>解析解已验证</span></header>
        <ScientificPlot label="拉比动力学" xLabel="脉冲时间 (µs)" yLabel="布居概率" xRange={rabiRange}
          yRange={probability} series={rabi} cursor={cursor} onSeek={value => seek(us(value))}
          dots={[{ x: cursor, y: excitation, color: colors.cyan }]} />
      </article>
      <article className="panel plot-card">
        <header><div><Radio size={17} /><h3>钟跃迁激发谱</h3></div><span>{signed(model.starkHz / kHz(1))} kHz 光移</span></header>
        <ScientificPlot label="钟跃迁激发谱" xLabel="激光频偏 νL − ν₀ (kHz)" yLabel="脉冲结束时的 Pₑ"
          xRange={spectrum.range} yRange={probability} series={spectrum.series} markers={spectrum.markers} dots={spectrum.dots} />
      </article>
      <article className="panel plot-card">
        <header><div><Waves size={17} /><h3>态依赖势阱</h3></div>
          <select aria-label="势阱剖面方向" value={axial ? 'axial' : 'radial'} onChange={event => setAxial(event.target.value === 'axial')}>
            <option value="radial">径向</option><option value="axial">轴向</option>
          </select>
        </header>
        <ScientificPlot label="态依赖势阱" xLabel={axial ? '轴向 z (µm)' : '径向 x (µm)'} yLabel="能量 / h (kHz)"
          xRange={potential.range} yRange={potentialYRange} series={potential.series} />
      </article>
      <article className="panel plot-card">
        <header><div><ChartNoAxesCombined size={17} /><h3>钟跃迁斯塔克光移</h3></div><span>条件理论</span></header>
        <ScientificPlot label="钟跃迁斯塔克光移随光镊功率变化" xLabel="光镊功率 (mW)" yLabel="光移 Δν (kHz)"
          xRange={[0, 5]} yRange={starkYRange} series={stark}
          markers={[{ x: model.parameters.powerMw, color: colors.teal }]}
          dots={[{ x: model.parameters.powerMw, y: model.starkHz / kHz(1), color: colors.teal }]} />
      </article>
    </div>
  </section>;
});
