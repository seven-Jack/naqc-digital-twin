import { memo } from 'react';
import { Activity, ArrowUpRight, Atom, CircleDot, Gauge, Layers2 } from 'lucide-react';
import { atomicData } from '../data/atomicData';
import type { Model } from '../physics/model';
import { harmonicLevelHz } from '../physics/trapPotential';
import { kHz, us } from '../physics/units';
import { signed } from '../components/format';

const frequency = (hz: number) => signed(hz / kHz(1)) + ' kHz';
const percent = (value: number) => (100 * value).toFixed(1) + '%';

function EnergyDiagram({ model }: { model: Model }) {
  const height = 38;
  const offsetScale = Math.max(-model.groundHz, Math.abs(model.laserOffsetHz), Math.abs(model.excitedHz), model.starkHz);
  const g = 88 - model.groundHz / offsetScale * height;
  const e = 26 - model.excitedHz / offsetScale * height;
  const laser = g - 62 - model.laserOffsetHz / offsetScale * height;
  return <svg className="energy-diagram" viewBox="0 0 250 145" role="img" aria-label="Clock energy levels with laser tuning and differential Stark shift. Free atom energy gap compressed.">
    <text x="48" y="13" textAnchor="middle" className="diagram-label">FREE ATOM</text>
    <text x="173" y="13" textAnchor="middle" className="diagram-label">TRAP FOCUS</text>
    <path d={`M18 26 H79 L139 ${e} H207 M18 88 H79 L139 ${g} H207`} fill="none" stroke="#375163" strokeDasharray="3 4" />
    <path d={`M18 26 H79 M139 ${e} H207`} fill="none" stroke="#af96ff" strokeWidth="1.8" />
    <path d={`M18 88 H79 M139 ${g} H207`} fill="none" stroke="#62e0f6" strokeWidth="1.8" />
    <text x="213" y={e + 4} fill="#af96ff" className="diagram-state">³P₀</text>
    <text x="213" y={g + 4} fill="#62e0f6" className="diagram-state">¹S₀</text>
    <path d={`M173 ${g - 4} V${laser + 4} M169 ${laser + 8} L173 ${laser + 4} L177 ${laser + 8}`} fill="none"
      stroke="#f4c56a" strokeWidth="1.4" opacity={model.parameters.laserEnabled ? 1 : 0.25} />
    <text x="181" y={(g + laser) / 2 + 5} fill="#f4c56a" className="diagram-state">νL</text>
    <path d="M49 33 V82" stroke="#7790a3" strokeWidth="1" />
    <text x="56" y="61" fill="#8da5b9" className="diagram-state">ν₀</text>
  </svg>;
}

const StaticReadouts = memo(function StaticReadouts({ model, openInfo }: { model: Model; openInfo: () => void }) {
  const levels = (bottomHz: number, radialHz: number) => [0, 1, 2].map(n => harmonicLevelHz(bottomHz, radialHz, n)).filter(value => value < 0);
  return <>
    <div className="readout-block stark-block">
      <div className="readout-label">Differential Stark shift <ArrowUpRight size={14} /></div>
      <strong data-testid="stark-shift" data-hz={model.starkHz}>{signed(model.starkHz / kHz(1))} <small>kHz</small></strong>
      <span>Clock blue shift at trap focus</span>
    </div>
    <section className="readout-block">
      <h3><Layers2 size={14} /> Energy levels</h3>
      <EnergyDiagram model={model} />
      <div className="diagram-note">Free-atom gap compressed for display</div>
      <div className="data-row"><span><i className="dot cyan" /> U<sub>g</sub>/h</span><strong>{frequency(model.groundHz)}</strong></div>
      <div className="data-row"><span><i className="dot violet" /> U<sub>e</sub>/h</span><strong>{frequency(model.excitedHz)}</strong></div>
      <div className="data-row"><span>Δν / D<sub>g</sub></span><strong>+{model.normalizedShift.toFixed(5)}</strong></div>
      <div className="data-row"><span>α<sub>e</sub> / α<sub>g</sub></span><strong>{model.alphaRatio.toFixed(5)}</strong></div>
    </section>
    <section className="readout-block">
      <h3><Activity size={14} /> Clock drive</h3>
      <div className="data-row"><span>Effective δ / 2π</span><strong data-testid="effective-detuning" data-hz={model.detuningHz}
        className={model.detuningHz === 0 ? 'teal-text' : 'gold-text'}>{frequency(model.detuningHz)}</strong></div>
      <div className="data-row"><span>Ω / 2π</span><strong>{(model.activeRabiHz / kHz(1)).toFixed(1)} kHz</strong></div>
      <div className="data-row"><span>Resonant π pulse</span><strong data-testid="pi-time" data-us={model.piSeconds / us(1)}>{(model.piSeconds / us(1)).toFixed(2)} µs</strong></div>
      <div className="data-row"><span>Max ideal P<sub>e</sub></span><strong data-testid="max-population">{percent(model.drive.maxExcited)}</strong></div>
    </section>
    <section className="readout-block motional">
      <h3><Atom size={14} /> Harmonic limit</h3>
      <table><thead><tr><th>Trap frequency</th><th className="cyan-text">¹S₀</th><th className="violet-text">³P₀</th></tr></thead>
        <tbody>
          <tr><th scope="row">Radial (kHz)</th><td>{(model.harmonicGround.radialHz / kHz(1)).toFixed(1)}</td><td>{(model.harmonicExcited.radialHz / kHz(1)).toFixed(1)}</td></tr>
          <tr><th scope="row">Axial (kHz)</th><td>{(model.harmonicGround.axialHz / kHz(1)).toFixed(1)}</td><td>{(model.harmonicExcited.axialHz / kHz(1)).toFixed(1)}</td></tr>
        </tbody>
      </table>
      <details>
        <summary>Radial vibrational levels</summary>
        <div className="diagram-note">Local harmonic estimates · U/h in kHz</div>
        <div className="harmonic-levels">
          {[
            { state: '¹S₀', color: 'cyan-text', values: levels(model.groundHz, model.harmonicGround.radialHz) },
            { state: '³P₀', color: 'violet-text', values: levels(model.excitedHz, model.harmonicExcited.radialHz) },
          ].map(({ state, color, values }) => <div key={state} className={color}>
            <strong>{state}</strong>{values.map((value, n) => <div key={n}>n={n} · {signed(value / kHz(1))}</div>)}
            {!values.length && <div>No levels below escape</div>}
          </div>)}
        </div>
      </details>
    </section>
    <section className="readout-block source-readout">
      <h3><CircleDot size={14} /> Polarizability <button className="text-button" onClick={openInfo}>Source ↗</button></h3>
      <div className="data-row"><span>α<sub>g</sub> / α<sub>e</sub></span><strong>{atomicData.alphaGroundAu.toFixed(2)} / {atomicData.alphaExcitedAu.toFixed(2)} a.u.</strong></div>
      <div className="data-row"><span>Δα</span><strong>{signed(atomicData.alphaExcitedAu - atomicData.alphaGroundAu, 2)} a.u.</strong></div>
    </section>
  </>;
});

export function Readouts({ model, openInfo }: { model: Model; openInfo: () => void }) {
  return <aside className="panel readouts" aria-label="Live readouts">
    <header className="panel-heading"><Gauge size={17} /><h2>Live readouts</h2><span className="live-label"><i className="status-dot" /> LIVE</span></header>
    <StaticReadouts model={model} openInfo={openInfo} />
  </aside>;
}
