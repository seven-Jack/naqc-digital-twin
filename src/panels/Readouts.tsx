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
  return <svg className="energy-diagram" viewBox="0 0 250 145" role="img" aria-label="钟态能级、激光调谐与差分斯塔克光移。图中压缩了自由原子的能级间隔。">
    <text x="48" y="13" textAnchor="middle" className="diagram-label">自由原子</text>
    <text x="173" y="13" textAnchor="middle" className="diagram-label">光镊焦点</text>
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
      <div className="readout-label">差分斯塔克光移 <ArrowUpRight size={14} /></div>
      <strong data-testid="stark-shift" data-hz={model.starkHz}>{signed(model.starkHz / kHz(1))} <small>kHz</small></strong>
      <span>光镊焦点处的钟跃迁蓝移</span>
    </div>
    <section className="readout-block">
      <h3><Layers2 size={14} /> 能级</h3>
      <EnergyDiagram model={model} />
      <div className="diagram-note">图中压缩了自由原子的能级间隔</div>
      <div className="data-row"><span><i className="dot cyan" /> U<sub>g</sub>/h</span><strong>{frequency(model.groundHz)}</strong></div>
      <div className="data-row"><span><i className="dot violet" /> U<sub>e</sub>/h</span><strong>{frequency(model.excitedHz)}</strong></div>
      <div className="data-row"><span>Δν / D<sub>g</sub></span><strong>+{model.normalizedShift.toFixed(5)}</strong></div>
      <div className="data-row"><span>α<sub>e</sub> / α<sub>g</sub></span><strong>{model.alphaRatio.toFixed(5)}</strong></div>
    </section>
    <section className="readout-block">
      <h3><Activity size={14} /> 钟跃迁驱动</h3>
      <div className="data-row"><span>有效失谐 δ / 2π</span><strong data-testid="effective-detuning" data-hz={model.detuningHz}
        className={model.detuningHz === 0 ? 'teal-text' : 'gold-text'}>{frequency(model.detuningHz)}</strong></div>
      <div className="data-row"><span>Ω / 2π</span><strong>{(model.activeRabiHz / kHz(1)).toFixed(1)} kHz</strong></div>
      <div className="data-row"><span>共振 π 脉冲时长</span><strong data-testid="pi-time" data-us={model.piSeconds / us(1)}>{(model.piSeconds / us(1)).toFixed(2)} µs</strong></div>
      <div className="data-row"><span>理想最大 P<sub>e</sub></span><strong data-testid="max-population">{percent(model.drive.maxExcited)}</strong></div>
    </section>
    <section className="readout-block motional">
      <h3><Atom size={14} /> 谐振近似</h3>
      <table><thead><tr><th>阱频</th><th className="cyan-text">¹S₀</th><th className="violet-text">³P₀</th></tr></thead>
        <tbody>
          <tr><th scope="row">径向 (kHz)</th><td>{(model.harmonicGround.radialHz / kHz(1)).toFixed(1)}</td><td>{(model.harmonicExcited.radialHz / kHz(1)).toFixed(1)}</td></tr>
          <tr><th scope="row">轴向 (kHz)</th><td>{(model.harmonicGround.axialHz / kHz(1)).toFixed(1)}</td><td>{(model.harmonicExcited.axialHz / kHz(1)).toFixed(1)}</td></tr>
        </tbody>
      </table>
      <details>
        <summary>径向振动能级</summary>
        <div className="diagram-note">焦点附近的谐振估计 · U/h 单位为 kHz</div>
        <div className="harmonic-levels">
          {[
            { state: '¹S₀', color: 'cyan-text', values: levels(model.groundHz, model.harmonicGround.radialHz) },
            { state: '³P₀', color: 'violet-text', values: levels(model.excitedHz, model.harmonicExcited.radialHz) },
          ].map(({ state, color, values }) => <div key={state} className={color}>
            <strong>{state}</strong>{values.map((value, n) => <div key={n}>n={n} · {signed(value / kHz(1))}</div>)}
            {!values.length && <div>没有低于逃逸阈值的能级</div>}
          </div>)}
        </div>
      </details>
    </section>
    <section className="readout-block source-readout">
      <h3><CircleDot size={14} /> 极化率 <button className="text-button" onClick={openInfo}>来源 ↗</button></h3>
      <div className="data-row"><span>α<sub>g</sub> / α<sub>e</sub></span><strong>{atomicData.alphaGroundAu.toFixed(2)} / {atomicData.alphaExcitedAu.toFixed(2)} a.u.</strong></div>
      <div className="data-row"><span>Δα</span><strong>{signed(atomicData.alphaExcitedAu - atomicData.alphaGroundAu, 2)} a.u.</strong></div>
    </section>
  </>;
});

export function Readouts({ model, openInfo }: { model: Model; openInfo: () => void }) {
  return <aside className="panel readouts" aria-label="实时读数">
    <header className="panel-heading"><Gauge size={17} /><h2>实时读数</h2><span className="live-label"><i className="status-dot" /> 实时</span></header>
    <StaticReadouts model={model} openInfo={openInfo} />
  </aside>;
}
