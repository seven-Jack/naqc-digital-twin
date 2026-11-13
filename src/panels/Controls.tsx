import { memo, useEffect, useState } from 'react';
import { Atom, Crosshair, Focus, Orbit, Radio, Settings2, SlidersHorizontal, Target, Waves } from 'lucide-react';
import { atomicData } from '../data/atomicData';
import { bounds, defaults, pulseBoundsUs, type Model, type PhysicsParameterState } from '../physics/model';
import { kHz } from '../physics/units';
import { signed } from '../components/format';
import type { SceneView } from '../scene/InstrumentScene';

export const compensationPreset = { id: 'compensation', view: 'focus', values: { pulseUs: 5 } } as const;

const presets = [
  { id: 'trap', label: 'Optical trapping', icon: Focus, view: 'potential', values: {} },
  { id: 'detuning', label: 'Clock detuning', icon: Waves, view: 'array', values: {} },
  { ...compensationPreset, label: 'Compensation', icon: Target },
  { id: 'rabi', label: 'Rabi oscillation', icon: Orbit, view: 'focus', values: { pulseUs: 20, mode: 'compensated' } },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: typeof Focus; view: SceneView; values: Partial<PhysicsParameterState> }>;
export type Preset = typeof presets[number]['id'];

interface RangeProps {
  label: string;
  name?: string;
  unit: string;
  value: number;
  range: readonly [number, number];
  step: number;
  digits?: number;
  signedValue?: boolean;
  update: (value: number) => void;
  disabled?: boolean;
}
function Range({ label, name = label, unit, value, range: [min, max], step, digits = 2, signedValue, update, disabled }: RangeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const display = signedValue ? signed(value, digits) : value.toFixed(digits);
  useEffect(() => { setError(false); }, [value, min, max]);
  function commit() {
    const numeric = draft.trim() ? Number(draft.trim().replace('−', '-')) : NaN;
    const valid = Number.isFinite(numeric) && numeric >= min && numeric <= max;
    setError(!valid);
    if (valid && value !== numeric) update(numeric);
    setEditing(false);
  }
  const ratio = (value - min) / (max - min) * 100;
  return <div className={`range-field ${disabled ? 'disabled' : ''}`}>
    <div className="range-title">
      <label htmlFor={name}>{label}</label>
      <div className="numeric-value">
        <input aria-label={`${name} value`} inputMode="decimal" type="text" value={editing ? draft : display}
          onFocus={event => { setDraft(value.toFixed(digits)); setEditing(true); event.currentTarget.select(); }}
          onChange={event => setDraft(event.target.value)} onBlur={() => { if (editing) commit(); }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          aria-invalid={error} disabled={disabled} />
        <span>{unit}</span>
      </div>
    </div>
    <input id={name} aria-label={name} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      style={{ '--fill': `${ratio}%` } as React.CSSProperties} onChange={event => update(Number(event.target.value))} />
    {error && <span className="field-error" role="alert">Enter a value from {min} to {max} {unit}.</span>}
  </div>;
}

export const Controls = memo(function Controls({ model, preset, update, selectPreset, showModel }: {
  model: Model; preset?: Preset;
  update: (values: Partial<PhysicsParameterState>) => void;
  selectPreset: (id: Preset, values: PhysicsParameterState, view: SceneView) => void;
  showModel: () => void;
}) {
  const p = model.parameters;
  return <aside className="panel controls" aria-label="Controls">
    <header className="panel-heading"><SlidersHorizontal size={17} /><h2>Controls</h2></header>
    <section className="control-section preset-section">
      <h3>Demo presets</h3>
      <div className="presets">
        {presets.map(({ id, label, icon: Icon, view, values }) => <button key={id} className={preset === id ? 'selected' : ''} aria-pressed={preset === id}
          onClick={() => selectPreset(id, { ...defaults, ...values }, view)}><Icon size={15} />{label}</button>)}
      </div>
    </section>
    <section className="control-section optical">
      <h3><Crosshair size={15} className="teal-text" /> Optical tweezer <small>532 nm</small></h3>
      <Range label="Power" name="Tweezer power" unit="mW" value={p.powerMw} range={bounds.powerMw} step={0.01} update={powerMw => update({ powerMw })} />
      <Range label="Beam waist" unit="µm" value={p.waistUm} range={bounds.waistUm} step={0.01} update={waistUm => update({ waistUm })} />
      <div className="control-detail"><span>Ground-state depth</span><strong>{(-model.groundHz / kHz(1)).toFixed(1)} kHz</strong></div>
      <button className="text-button" onClick={showModel}>R009 polarizability model ↗</button>
    </section>
    <section className="control-section clock">
      <h3><Radio size={15} className="gold-text" /> Clock laser <small>578 nm</small></h3>
      <Range label="Rabi frequency Ω/2π" name="Rabi frequency" unit="kHz" value={p.rabiKhz} range={bounds.rabiKhz} step={1} digits={1}
        update={rabiKhz => update({ rabiKhz, pulseUs: p.pulseUs * p.rabiKhz / rabiKhz })} />
      <div className="control-detail tuning"><label htmlFor="tuning">Laser tuning</label>
        <select id="tuning" value={p.mode} onChange={event => update({ mode: event.target.value as PhysicsParameterState['mode'] })}>
          <option value="free">Free atom</option><option value="manual">Manual offset</option><option value="compensated">Compensated</option>
        </select>
      </div>
      {p.mode === 'manual' ? <Range label="Free-atom detuning" unit="kHz" signedValue value={p.detuningKhz}
        range={bounds.detuningKhz} step={1} digits={1} update={detuningKhz => update({ detuningKhz })} /> :
        <div className="control-detail"><span>Laser offset νL − ν₀</span><strong data-testid="laser-offset">{signed(model.laserOffsetHz / kHz(1))} kHz</strong></div>}
      <button className={'compensation ' + (p.mode === 'compensated' ? 'applied' : '')}
        onClick={() => update({ mode: 'compensated' })}><Target size={15} />{p.mode === 'compensated' ? 'Compensation applied' : 'Apply Compensation'}</button>
      <Range label="Pulse duration" unit="µs" value={p.pulseUs} range={pulseBoundsUs(p.rabiKhz)} step={p.rabiKhz <= 10 ? 0.1 : 0.01}
        update={pulseUs => update({ pulseUs })} />
      <div className="control-detail"><label htmlFor="drive-enabled">Enable square-pulse drive</label>
        <input className="switch" id="drive-enabled" type="checkbox" checked={p.laserEnabled}
          onChange={event => update({ laserEnabled: event.target.checked })} />
      </div>
    </section>
    <section className="control-section atomic">
      <h3><Atom size={15} className="violet-text" /> Atomic state</h3>
      <div className="control-detail"><span>Species</span><strong>¹⁷¹Yb</strong></div>
      <div className="control-detail"><span>Initial → target</span><strong>¹S₀ → ³P₀</strong></div>
      <div className="control-detail"><span>π branch</span><strong>F = ½, m<sub>F</sub> = +½</strong></div>
      <div className="model-note"><Settings2 size={13} /> Scalar trap · closed two-level model</div>
      <span className="sr-only">{atomicData.source}</span>
    </section>
  </aside>;
});
