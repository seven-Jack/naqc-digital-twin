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
  { id: 'array', label: '阵列', icon: Grid2X2 },
  { id: 'focus', label: '单原子', icon: Crosshair },
  { id: 'potential', label: '势阱', icon: Layers3 },
] as const;
const potentialViews: [PotentialView, string][] = [
  ['both', '两钟态叠加'], ['ground', '基态'], ['excited', '激发态'],
  ['difference', '差分势 ΔU'], ['radial', '径向剖面'], ['axial', '轴向剖面'],
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
      <div className="viewport-title"><Box size={17} /><h2>三维场景</h2></div>
      <div className="view-tabs" role="group" aria-label="场景视图">
        {views.map(({ id, label, icon: Icon }) => <button key={id} className={options.view === id ? 'selected' : ''}
          onClick={() => onOptions({ view: id })} aria-pressed={options.view === id}><Icon size={14} />{label}</button>)}
      </div>
    </div>
    <div className="viewport" aria-label="三维场景">
      <div ref={host} className="three-host" data-testid="three-host" />
      <div className="scene-caption">
        <span className="scene-kicker"><span className="status-dot" />{options.view === 'potential' ? '高斯势阱' : '光镊阵列'}</span>
        {options.view === 'potential' ? <select aria-label="势阱显示" value={options.potential}
          onChange={event => onOptions({ potential: event.target.value as PotentialView })}>
          {potentialViews.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select> : <strong>{ARRAY_SIDE} × {ARRAY_SIDE} <span>·</span> ¹⁷¹Yb</strong>}
      </div>
      <div className="scene-tools">
        <button className="icon-button" aria-label="重置视角" title="重置视角" onClick={() => scene.current?.resetCamera()}><RotateCcw size={16} /></button>
        <button className="icon-button" aria-label="切换位点聚焦" title="切换位点聚焦" onClick={() => onOptions({ view: options.view === 'focus' ? 'array' : 'focus' })}><Focus size={17} /></button>
        <button className={'icon-button ' + (layers ? 'selected' : '')} aria-label="场景图层" title="场景图层" aria-expanded={layers} onClick={() => setLayers(value => !value)}><Layers3 size={16} /></button>
      </div>
      {layers && <div className="layer-menu">
        <label>画质 <select value={options.quality} onChange={event => onOptions({ quality: event.target.value as SceneOptions['quality'] })}>
          <option value="Low">低</option><option value="Medium">中</option><option value="High">高</option>
        </select></label>
        <label><input type="checkbox" checked={options.tweezers} onChange={event => onOptions({ tweezers: event.target.checked })} />532 nm 光束包络</label>
        <label><input type="checkbox" checked={options.clock} onChange={event => onOptions({ clock: event.target.checked })} />578 nm 光束</label>
        <label><input type="checkbox" checked={options.glow} onChange={event => onOptions({ glow: event.target.checked })} />辉光效果</label>
        <button onClick={onBloch}><ScanLine size={14} /> 布洛赫球 <MoveUpRight size={12} /></button>
      </div>}
      {failed && <p className="scene-error" role="status">当前浏览器无法使用 WebGL 2，仍可选择位点并查看图表。</p>}
      <div className="scene-legend">
        {options.view === 'potential' ? <>
          {options.potential === 'difference' ? <span><i className="dot gold" /> ΔU/h</span> : <>
            {options.potential !== 'excited' && <span><i className="dot cyan" /> ¹S₀</span>}
            {options.potential !== 'ground' && <span><i className="dot violet" /> ³P₀</span>}
          </>}
        </> : <>
          {options.tweezers && <span><i className="dot teal" /> 532 nm 光镊</span>}
          {options.clock && model.parameters.laserEnabled && <span><i className="dot gold" /> 578 nm 驱动</span>}
        </>}
      </div>
      <div className="site-badge">
        <Crosshair size={15} />
        <select aria-label="所选位点" value={model.parameters.site} onChange={event => onSelect(Number(event.target.value))}>
          {Array.from({ length: SITE_COUNT }, (_, index) => <option key={index} value={index}>{siteLocation(index).id}</option>)}
        </select>
        <span data-testid="site-position">{site.id} · ({site.xUm}, {site.yUm}, 0) µm</span>
      </div>
    </div>
  </>;
});
