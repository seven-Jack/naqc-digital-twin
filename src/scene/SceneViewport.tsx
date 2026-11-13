import { memo, useEffect, useRef, useState } from 'react';
import { Box, Crosshair, Focus, Grid2X2, Layers3, MoveUpRight, RotateCcw, ScanLine } from 'lucide-react';
import { ARRAY_SIDE, SITE_COUNT, siteLocation, type Model } from '../physics/model';
import { InstrumentScene, type SceneOptions } from './InstrumentScene';
import type { PotentialView } from './potentialSurface';

interface Props {
  model: Model;
  options: SceneOptions;
  onOptions: (options: Partial<SceneOptions>) => void;
  onSelect: (site: number) => void;
  population: number;
  active: boolean;
  onBloch: () => void;
}

const views = [
  { id: 'array', label: 'Array', icon: Grid2X2 },
  { id: 'focus', label: 'Single atom', icon: Crosshair },
  { id: 'potential', label: 'Potentials', icon: Layers3 },
] as const;
const potentialViews: [PotentialView, string][] = [
  ['both', 'Both clock states'], ['ground', 'Ground state'], ['excited', 'Excited state'],
  ['difference', 'Difference ΔU'], ['radial', 'Radial cut'], ['axial', 'Axial cut'],
];

export const SceneViewport = memo(function SceneViewport({ model, options, onOptions, onSelect, population, active, onBloch }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<InstrumentScene>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [hover, setHover] = useState<number>();
  const [failed, setFailed] = useState(false);
  const [layers, setLayers] = useState(false);

  useEffect(() => {
    try {
      scene.current = new InstrumentScene(host.current!, site => selectRef.current(site), setHover);
    } catch {
      setFailed(true);
    }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => scene.current?.update(model, options), [model, options]);
  useEffect(() => scene.current?.setEvolution(population, active), [population, active]);

  const site = hover === undefined ? model.site : siteLocation(hover);
  return <>
    <div className="viewport-toolbar">
      <div className="viewport-title"><Box size={17} /><h2>Quantum scene</h2></div>
      <div className="view-tabs" role="group" aria-label="Scene view">
        {views.map(({ id, label, icon: Icon }) => <button key={id} className={options.view === id ? 'selected' : ''}
          onClick={() => onOptions({ view: id })} aria-pressed={options.view === id}><Icon size={14} />{label}</button>)}
      </div>
    </div>
    <div className="viewport" aria-label="Quantum scene">
      <div ref={host} className="three-host" data-testid="three-host" />
      <div className="scene-caption">
        <span className="scene-kicker"><span className="status-dot" />{options.view === 'potential' ? 'GAUSSIAN POTENTIAL' : 'OPTICAL TWEEZER ARRAY'}</span>
        {options.view === 'potential' ? <select aria-label="Potential display" value={options.potential}
          onChange={event => onOptions({ potential: event.target.value as PotentialView })}>
          {potentialViews.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select> : <strong>{ARRAY_SIDE} × {ARRAY_SIDE} <span>·</span> ¹⁷¹Yb</strong>}
      </div>
      <div className="scene-tools">
        <button className="icon-button" aria-label="Reset camera" title="Reset camera" onClick={() => scene.current?.resetCamera()}><RotateCcw size={16} /></button>
        <button className="icon-button" aria-label="Toggle site focus" title="Toggle site focus" onClick={() => onOptions({ view: options.view === 'focus' ? 'array' : 'focus' })}><Focus size={17} /></button>
        <button className={'icon-button ' + (layers ? 'selected' : '')} aria-label="Scene layers" title="Scene layers" aria-expanded={layers} onClick={() => setLayers(value => !value)}><Layers3 size={16} /></button>
      </div>
      {layers && <div className="layer-menu">
        <label>Quality <select value={options.quality} onChange={event => onOptions({ quality: event.target.value as SceneOptions['quality'] })}>
          <option>Low</option><option>Medium</option><option>High</option>
        </select></label>
        <label><input type="checkbox" checked={options.tweezers} onChange={event => onOptions({ tweezers: event.target.checked })} />532 nm envelope</label>
        <label><input type="checkbox" checked={options.clock} onChange={event => onOptions({ clock: event.target.checked })} />578 nm beam</label>
        <label><input type="checkbox" checked={options.glow} onChange={event => onOptions({ glow: event.target.checked })} />Glow effects</label>
        <button onClick={onBloch}><ScanLine size={14} /> Bloch sphere <MoveUpRight size={12} /></button>
      </div>}
      {failed && <p className="scene-error" role="status">WebGL 2 is unavailable. The site selector and scientific plots remain available.</p>}
      <div className="scene-legend">
        {options.view === 'potential' ? <>
          {options.potential === 'difference' ? <span><i className="dot gold" /> ΔU/h</span> : <>
            {options.potential !== 'excited' && <span><i className="dot cyan" /> ¹S₀</span>}
            {options.potential !== 'ground' && <span><i className="dot violet" /> ³P₀</span>}
          </>}
        </> : <>
          {options.tweezers && <span><i className="dot teal" /> 532 nm tweezer</span>}
          {options.clock && model.parameters.laserEnabled && <span><i className="dot gold" /> 578 nm drive</span>}
        </>}
      </div>
      <div className="site-badge">
        <Crosshair size={15} />
        <select aria-label="Selected site" value={model.parameters.site} onChange={event => onSelect(Number(event.target.value))}>
          {Array.from({ length: SITE_COUNT }, (_, index) => <option key={index} value={index}>{siteLocation(index).id}</option>)}
        </select>
        <span data-testid="site-position">{site.id} · ({site.xUm}, {site.yUm}, 0) µm</span>
      </div>
    </div>
  </>;
});
