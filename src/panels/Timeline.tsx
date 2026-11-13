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
          {running ? 'Pause' : time > 0 && time < pulseSeconds ? 'Resume' : 'Start pulse'}
        </button>
        <button className="icon-button reset-pulse" aria-label="Reset pulse" title="Reset pulse" onClick={reset}><RotateCcw size={15} /></button>
      </div>
      <div className="timeline-clock"><output data-testid="playback-time" data-seconds={time}>{(time / us(1)).toFixed(2)}</output><span> / {parameters.pulseUs.toFixed(2)} µs</span></div>
      <div className="timeline-utilities">
        <select aria-label="Animation speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          {[0.25, 0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
        <button className="icon-button" title="Bloch sphere" aria-label="Bloch sphere" onClick={onBloch}><Atom size={17} /></button>
      </div>
    </div>
    <input type="range" className="time-slider" aria-label="Pulse time" min={0} max={pulseSeconds} step="any" value={time}
      style={{ '--fill': `${100 * time / pulseSeconds}%` } as React.CSSProperties}
      onChange={event => seek(Number(event.target.value))} />
    <div className="population-row">
      <div><i className="dot cyan" /> Ground P<sub>g</sub> <output data-testid="ground-population">{pct(1 - excitation)}</output></div>
      <div className="population-track" aria-hidden="true" style={{ '--excited': `${100 * excitation}%` } as React.CSSProperties} />
      <div><i className="dot violet" /> Excited P<sub>e</sub> <output data-testid="excited-population">{pct(excitation)}</output></div>
    </div>
  </div>;
}

export function Comparison({ model }: { model: Model }) {
  const { freeDrive, compensatedDrive, pulseSeconds, piSeconds } = model;
  const probeTime = Math.min(piSeconds, pulseSeconds);
  return <section className="panel comparison" aria-label="Compensation comparison">
    <div className="comparison-heading"><h3>Compensation at the selected site</h3><span>Ideal Pₑ at {(probeTime / us(1)).toFixed(2)} µs</span></div>
    <div className="comparison-grid">
      <div><span><i className="dot gold" /> Free-atom tune</span><strong>{pct(freeDrive.population(probeTime))}</strong></div>
      <div><span><i className="dot teal" /> Local resonance</span><strong>{pct(compensatedDrive.population(probeTime))}</strong></div>
    </div>
  </section>;
}
