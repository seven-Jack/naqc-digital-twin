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
  return <section className="analysis" aria-label="Scientific analysis">
    <div className="section-heading"><h2>Scientific analysis</h2><span><i className="status-dot" /> Linked to current parameters</span></div>
    <div className="analysis-grid">
      <article className="panel plot-card">
        <header><div><Activity size={17} /><h3>Rabi dynamics</h3></div><span>VERIFIED ANALYTIC</span></header>
        <ScientificPlot label="Rabi dynamics" xLabel="Pulse time (µs)" yLabel="Population" xRange={rabiRange}
          yRange={probability} series={rabi} cursor={cursor} onSeek={value => seek(us(value))}
          dots={[{ x: cursor, y: excitation, color: colors.cyan }]} />
      </article>
      <article className="panel plot-card">
        <header><div><Radio size={17} /><h3>Clock excitation spectrum</h3></div><span>{signed(model.starkHz / kHz(1))} kHz SHIFT</span></header>
        <ScientificPlot label="Clock excitation spectrum" xLabel="Laser offset νL − ν₀ (kHz)" yLabel="End-of-pulse Pₑ"
          xRange={spectrum.range} yRange={probability} series={spectrum.series} markers={spectrum.markers} dots={spectrum.dots} />
      </article>
      <article className="panel plot-card">
        <header><div><Waves size={17} /><h3>State-dependent potentials</h3></div>
          <select aria-label="Potential plot axis" value={axial ? 'axial' : 'radial'} onChange={event => setAxial(event.target.value === 'axial')}>
            <option value="radial">Radial</option><option value="axial">Axial</option>
          </select>
        </header>
        <ScientificPlot label="State-dependent potentials" xLabel={axial ? 'Axial z (µm)' : 'Radial slice x (µm)'} yLabel="Energy / h (kHz)"
          xRange={potential.range} yRange={potentialYRange} series={potential.series} />
      </article>
      <article className="panel plot-card">
        <header><div><ChartNoAxesCombined size={17} /><h3>Clock Stark shift</h3></div><span>CONDITIONAL THEORY</span></header>
        <ScientificPlot label="Clock Stark shift by tweezer power" xLabel="Tweezer power (mW)" yLabel="Δν Stark (kHz)"
          xRange={[0, 5]} yRange={starkYRange} series={stark}
          markers={[{ x: model.parameters.powerMw, color: colors.teal }]}
          dots={[{ x: model.parameters.powerMw, y: model.starkHz / kHz(1), color: colors.teal }]} />
      </article>
    </div>
  </section>;
});
