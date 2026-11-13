import { Atom, Pause, Play, RotateCcw } from 'lucide-react';
import { usePlayback } from '../state/usePlayback';
import type { Model } from '../physics/model';
import { us } from '../physics/units';

const pct = (value: number) => (100 * value).toFixed(1) + '%';

export function Timeline({ model, playback, excitation, onBloch }: {
  model: Model; playback: ReturnType<typeof usePlayback>; excitation: number; onBloch: () => void;
}) {
  const { time, running, reset, seek, speed, setSpeed, toggle } = playback;
  const { pulseSeconds, parameters } = model;
  return <div className="timeline">
    <div className="timeline-heading">
      <div className="timeline-actions">
        <button className="play-button" onClick={toggle}>
          {running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
          {running ? '暂停' : time > 0 && time < pulseSeconds ? '继续' : '开始脉冲'}
        </button>
        <button className="icon-button reset-pulse" aria-label="重置脉冲" title="重置脉冲" onClick={reset}><RotateCcw size={15} /></button>
      </div>
      <div className="timeline-clock"><output data-testid="playback-time" data-seconds={time}>{(time / us(1)).toFixed(2)}</output><span> / {parameters.pulseUs.toFixed(2)} µs</span></div>
      <div className="timeline-utilities">
        <select aria-label="播放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          {[0.25, 0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
        <button className="icon-button" title="布洛赫球" aria-label="布洛赫球" onClick={onBloch}><Atom size={17} /></button>
      </div>
    </div>
    <input type="range" className="time-slider" aria-label="脉冲时间" min={0} max={pulseSeconds} step="any" value={time}
      style={{ '--fill': `${100 * time / pulseSeconds}%` } as React.CSSProperties}
      onChange={event => seek(Number(event.target.value))} />
    <div className="population-row">
      <div><i className="dot cyan" /> 基态 P<sub>g</sub> <output data-testid="ground-population">{pct(1 - excitation)}</output></div>
      <div className="population-track" aria-hidden="true" style={{ '--excited': `${100 * excitation}%` } as React.CSSProperties} />
      <div><i className="dot violet" /> 激发态 P<sub>e</sub> <output data-testid="excited-population">{pct(excitation)}</output></div>
    </div>
  </div>;
}

export function Comparison({ model }: { model: Model }) {
  const { freeDrive, compensatedDrive, pulseSeconds, piSeconds } = model;
  const probeTime = Math.min(piSeconds, pulseSeconds);
  return <section className="panel comparison" aria-label="频率补偿对比">
    <div className="comparison-heading"><h3>所选位点的补偿对比</h3><span>{(probeTime / us(1)).toFixed(2)} µs 时的理想 Pₑ</span></div>
    <div className="comparison-grid">
      <div><span><i className="dot gold" /> 自由原子共振</span><strong>{pct(freeDrive.population(probeTime))}</strong></div>
      <div><span><i className="dot teal" /> 补偿后共振</span><strong>{pct(compensatedDrive.population(probeTime))}</strong></div>
    </div>
  </section>;
}
