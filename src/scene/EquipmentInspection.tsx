import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { Aperture, ArrowLeft, Atom, Box, Camera, ChevronRight, Crosshair, ExternalLink, Grid3X3, Layers3, ScanLine, Table2, Waves } from 'lucide-react';
import { equipmentIds, machineEquipment, type EquipmentId } from '../data/machineEquipment';
import { closeEquipment, openEquipment } from './equipmentNavigation';
import './equipment-inspection.css';

const icons = { table: Table2, source: Atom, slm: Grid3X3, aod: Waves, vacuum: Box, array: Crosshair, gate: ScanLine, imaging: Camera };

export function EquipmentDirectory() {
  return <section className="md-panel eq-directory" aria-labelledby="equipment-directory-title">
    <header><Layers3 size={16} /><h2 id="equipment-directory-title">设备拆解</h2></header>
    <div>{equipmentIds.map(id => {
      const Icon = icons[id];
      return <button type="button" data-testid={`equipment-open-${id}`} key={id} onClick={() => openEquipment(id)}>
        <Icon size={16} /><span>{machineEquipment[id].label}</span><ChevronRight size={13} />
      </button>;
    })}</div>
  </section>;
}

interface InspectionProps {
  id: EquipmentId;
  slot: RefObject<HTMLDivElement | null>;
  split: number;
  part: string | null;
  setSplit: (value: number) => void;
  setPart: (value: string | null) => void;
  stage: string;
  attempt: number;
  milliseconds: number;
}

export function EquipmentInspection({ id, slot, split, part, setSplit, setPart, stage, attempt, milliseconds }: InspectionProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const item = machineEquipment[id];
  const Icon = icons[id];
  const selected = item.parts.find(p => p.id === part);
  return <dialog ref={dialog} className="eq-dialog" data-testid="equipment-panel" data-module={id} aria-labelledby="eq-title"
    onCancel={event => { event.preventDefault(); closeEquipment(); }}>
    <header className="eq-dialog-head">
      <button className="eq-return" type="button" onClick={closeEquipment} autoFocus><ArrowLeft size={16} />返回整机</button>
      <select aria-label="切换设备" value={id} onChange={e => openEquipment(e.target.value as EquipmentId)}>
        {equipmentIds.map(key => <option value={key} key={key}>{machineEquipment[key].label}</option>)}
      </select>
    </header>
    <div className="eq-workbench">
      <div className="eq-visual">
        <div className="eq-focus-host" ref={slot} />
        <div className="eq-explosion">
          <div><label htmlFor="eq-split"><Layers3 size={15} />拆解程度</label><output htmlFor="eq-split">{split}%</output></div>
          <div><button type="button" onClick={() => setSplit(0)}>合拢</button>
            <input id="eq-split" type="range" min="0" max="100" step="1" style={{ '--md-fill': `${split}%` } as CSSProperties} value={split} onChange={e => setSplit(Number(e.currentTarget.value))} />
            <button type="button" onClick={() => setSplit(100)}>拆解</button></div>
        </div>
      </div>
      <div className="eq-description">
        <header><Icon size={23} /><h2 id="eq-title">{item.label}</h2></header>
        <p>{item.description}</p>
        <div className="eq-parts" role="group" aria-label="组成部件">{item.parts.map((p, i) => <button
          type="button" key={p.id} data-part={p.id} aria-pressed={part === p.id} onClick={() => setPart(p.id === part ? null : p.id)}>
          <span>{String(i + 1).padStart(2, '0')}</span>{p.label}<ChevronRight size={14} />
        </button>)}</div>
        <p className="eq-part-desc" aria-live="polite">{selected ? selected.description : '点选部件可在模型中定位并查看用途。'}</p>
        <p className="eq-frame"><Aperture size={15} />第 {attempt} 轮 · {stage} · {(milliseconds / 1000).toFixed(2)} s</p>
        <details className="eq-boundary"><summary>结构示意与资料来源</summary><p>{item.boundary}</p>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceLabel}<ExternalLink size={12} /></a>
          <a href={item.evidenceHref}>查看子系统证据<ChevronRight size={13} /></a>
        </details>
      </div>
    </div>
  </dialog>;
}
