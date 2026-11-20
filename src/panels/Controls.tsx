import { memo, useEffect, useState } from 'react';
import { Atom, Crosshair, Focus, Orbit, Radio, Settings2, SlidersHorizontal, Target, Waves } from 'lucide-react';
import { atomicData } from '../data/atomicData';
import { bounds, defaults, pulseBoundsUs, type Model, type PhysicsParameterState } from '../physics/model';
import { kHz } from '../physics/units';
import { signed } from '../components/format';
import type { SceneView } from '../scene/InstrumentScene';

export const compensationPreset = { id: 'compensation', view: 'focus', values: { pulseUs: 5 } } as const;

const presets = [
  { id: 'trap', label: '光镊俘获', icon: Focus, view: 'potential', values: {} },
  { id: 'detuning', label: '钟跃迁失谐', icon: Waves, view: 'array', values: {} },
  { ...compensationPreset, label: '频率补偿', icon: Target },
  { id: 'rabi', label: '拉比振荡', icon: Orbit, view: 'focus', values: { pulseUs: 20, mode: 'compensated' } },
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
        <input aria-label={`${name}数值`} inputMode="decimal" type="text" value={editing ? draft : display}
          onFocus={event => { setDraft(value.toFixed(digits)); setEditing(true); event.currentTarget.select(); }}
          onChange={event => setDraft(event.target.value)} onBlur={() => { if (editing) commit(); }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          aria-invalid={error} disabled={disabled} />
        <span>{unit}</span>
      </div>
    </div>
    <input id={name} aria-label={name} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      style={{ '--fill': `${ratio}%` } as React.CSSProperties} onChange={event => update(Number(event.target.value))} />
    {error && <span className="field-error" role="alert">请输入 {min} 至 {max} {unit} 范围内的数值。</span>}
  </div>;
}

export const Controls = memo(function Controls({ model, preset, update, selectPreset, showModel }: {
  model: Model; preset?: Preset;
  update: (values: Partial<PhysicsParameterState>) => void;
  selectPreset: (id: Preset, values: PhysicsParameterState, view: SceneView) => void;
  showModel: () => void;
}) {
  const p = model.parameters;
  return <aside className="panel controls" aria-label="参数控制">
    <header className="panel-heading"><SlidersHorizontal size={17} /><h2>参数控制</h2></header>
    <section className="control-section preset-section">
      <h3>演示预设</h3>
      <div className="presets">
        {presets.map(({ id, label, icon: Icon, view, values }) => <button key={id} className={preset === id ? 'selected' : ''} aria-pressed={preset === id}
          onClick={() => selectPreset(id, { ...defaults, ...values }, view)}><Icon size={15} />{label}</button>)}
      </div>
    </section>
    <section className="control-section optical" id="optical-controls" tabIndex={-1}>
      <h3><Crosshair size={15} className="teal-text" /> 光镊 <small>532 nm</small></h3>
      <Range label="功率" name="光镊功率" unit="mW" value={p.powerMw} range={bounds.powerMw} step={0.01} update={powerMw => update({ powerMw })} />
      <Range label="束腰" unit="µm" value={p.waistUm} range={bounds.waistUm} step={0.01} update={waistUm => update({ waistUm })} />
      <div className="control-detail"><span>基态阱深</span><strong>{(-model.groundHz / kHz(1)).toFixed(1)} kHz</strong></div>
      <button className="text-button" onClick={showModel}>R009 极化率模型 ↗</button>
    </section>
    <section className="control-section clock">
      <h3><Radio size={15} className="gold-text" /> 钟激光 <small>578 nm</small></h3>
      <Range label="拉比频率 Ω/2π" name="拉比频率" unit="kHz" value={p.rabiKhz} range={bounds.rabiKhz} step={1} digits={1}
        update={rabiKhz => update({ rabiKhz, pulseUs: p.pulseUs * p.rabiKhz / rabiKhz })} />
      <div className="control-detail tuning"><label htmlFor="tuning">激光调谐</label>
        <select id="tuning" value={p.mode} onChange={event => update({ mode: event.target.value as PhysicsParameterState['mode'] })}>
          <option value="free">自由原子共振</option><option value="manual">手动频偏</option><option value="compensated">已补偿</option>
        </select>
      </div>
      {p.mode === 'manual' ? <Range label="相对自由原子频偏" unit="kHz" signedValue value={p.detuningKhz}
        range={bounds.detuningKhz} step={1} digits={1} update={detuningKhz => update({ detuningKhz })} /> :
        <div className="control-detail"><span>激光频偏 νL − ν₀</span><strong data-testid="laser-offset">{signed(model.laserOffsetHz / kHz(1))} kHz</strong></div>}
      <button className={'compensation ' + (p.mode === 'compensated' ? 'applied' : '')}
        onClick={() => update({ mode: 'compensated' })}><Target size={15} />{p.mode === 'compensated' ? '已施加频率补偿' : '施加频率补偿'}</button>
      <Range label="脉冲时长" unit="µs" value={p.pulseUs} range={pulseBoundsUs(p.rabiKhz)} step={p.rabiKhz <= 10 ? 0.1 : 0.01}
        update={pulseUs => update({ pulseUs })} />
      <div className="control-detail"><label htmlFor="drive-enabled">启用方波脉冲驱动</label>
        <input className="switch" id="drive-enabled" type="checkbox" checked={p.laserEnabled}
          onChange={event => update({ laserEnabled: event.target.checked })} />
      </div>
    </section>
    <section className="control-section atomic">
      <h3><Atom size={15} className="violet-text" /> 原子态</h3>
      <div className="control-detail"><span>原子种类</span><strong>¹⁷¹Yb</strong></div>
      <div className="control-detail"><span>初态 → 目标态</span><strong>¹S₀ → ³P₀</strong></div>
      <div className="control-detail"><span>π 跃迁分支</span><strong>F = ½, m<sub>F</sub> = +½</strong></div>
      <div className="model-note"><Settings2 size={13} /> 标量光镊 · 封闭两能级模型</div>
      <span className="sr-only">{atomicData.source}</span>
    </section>
  </aside>;
});
