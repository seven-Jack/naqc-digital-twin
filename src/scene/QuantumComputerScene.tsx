import { Box, Crosshair, RotateCcw, Ruler, Workflow } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { munizEvidence } from '../data/hardwareEvidence';
import { machineEquipment, type EquipmentId } from '../data/machineEquipment';
import { useHashFragment } from '../state/useHashFragment';
import { ApparatusDimensions } from './ApparatusDimensions';
import { EquipmentDiagram } from './EquipmentDiagram';
import { MachineArchitectureDiagram } from './MachineArchitectureDiagram';
import { EquipmentInspection } from './EquipmentInspection';
import { EquipmentOperation, type EquipmentPlayback } from './EquipmentOperation';
import { ArrayReadout } from './DeviceReadouts';
import { equipmentAt, openEquipment } from './equipmentNavigation';
import { illuminatedPart, projectMachineScene } from './machineSceneFrame';
import { QuantumMachineRenderer, type MachineView } from './QuantumMachineRenderer';
import './quantum-scene.css';

export function QuantumComputerScene(playback: EquipmentPlayback) {
  const { run: { profile }, frame, pause } = playback;
  const equipment = equipmentAt(useHashFragment());
  const home = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const [surface] = useState(() => {
    const element = document.createElement('div');
    element.className = 'eq-scene-surface';
    return element;
  });
  const [inspection, setInspection] = useState<{ key: EquipmentId | null; split: number; part: string | null }>({ key: null, split: 50, part: null });
  const split = inspection.key === equipment ? inspection.split : 50;
  const part = inspection.key === equipment ? inspection.part : null;
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<QuantumMachineRenderer | null>(null);
  const [view, setView] = useState<MachineView>('machine');
  const [overlay, setOverlay] = useState<'connections' | 'dimensions' | null>(null);
  const [failed, setFailed] = useState(false);
  const functionalView = overlay === 'connections' || (failed && overlay !== 'dimensions');
  const labelsRef = useRef<Record<string, HTMLElement | null>>({});
  const synthetic = playback.source === '合成演示';
  const projection = useMemo(() => projectMachineScene(frame, profile, synthetic), [frame, profile, synthetic]);
  const { stage, atoms, activePath } = projection;
  const { rows, columns } = profile.array;
  const litPart = illuminatedPart(equipment, projection);
  const focusedPart = part ?? litPart;
  const partLabel = equipment && machineEquipment[equipment].parts.find(item => item.id === focusedPart)?.label;
  const arrayNote = equipment === 'array' && part === 'atoms'
    ? (frame.geometryRecorded ? ` · ${atoms.length} 个` : ' · 本帧坐标缺测') : '';

  // Move the existing viewport between its two hosts so orbit, selection and the WebGL context survive inspection.
  useLayoutEffect(() => {
    const target = equipment ? detail.current : home.current;
    target?.appendChild(surface);
    pause();
    if (!equipment) setInspection(previous => previous.key === null ? previous : { key: null, split: 50, part: null });
  }, [equipment, pause, surface]);

  useEffect(() => {
    setFailed(false);
    try {
      renderer.current = new QuantumMachineRenderer(host.current!, profile, labelsRef.current, (id, pickedPart) => {
        if (pickedPart) {
          setInspection(previous => ({ key: id, split: previous.key === id ? previous.split : 50, part: pickedPart }));
        } else openEquipment(id);
      });
    } catch {
      setFailed(true);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [profile]);

  useEffect(() => renderer.current?.setView(view), [view, profile]);
  useEffect(() => renderer.current?.update(projection), [projection, overlay]);

  useEffect(() => { renderer.current?.setInspection(equipment, split / 100, focusedPart); }, [equipment, split, focusedPart, profile]);

  const scene = <div className="qc-scene" data-inspecting={equipment ?? undefined} data-testid="quantum-scene" data-view={view} data-stage={stage}
    data-active-path={activePath?.id} data-occupancy={projection.occupancy ?? undefined}
    data-occupancy-phase={projection.occupancyPhase ?? undefined}
    data-moving-atom={projection.movingAtom ?? undefined} data-stage-skipped={projection.skipped || undefined}
    aria-label="整机三维光路演示">
    <div className="qc-scene-canvas" ref={host} hidden={failed} />
    {functionalView && <div className="qc-map-layer" hidden={!!equipment} data-testid={failed ? 'quantum-scene-fallback' : undefined}>
      <MachineArchitectureDiagram scene={projection} array={frame.geometryRecorded
        ? <ArrayReadout run={playback.run} scene={projection} /> : <small>坐标缺测</small>} />
    </div>}
    {overlay === 'dimensions' && !equipment && <div className="qc-metric-layer"><ApparatusDimensions /></div>}
    {failed && equipment ? <div className="eq-fallback" data-testid="equipment-fallback">
      <EquipmentDiagram id={equipment} selected={part} illuminated={litPart} split={split} atoms={atoms} rows={rows} columns={columns}
        supplyProgress={projection.illustratedSupply ? projection.elevatorProgress ?? 0 : undefined}
        slmPowers={stage === 'cooling' ? undefined : projection.strengths}
        geometryRecorded={frame.geometryRecorded} onSelect={value => setInspection({ key: equipment, split, part: value })} />
    </div> : !failed &&
      <div className="qc-scene-labels" hidden={!!equipment || !!overlay} aria-label="场景设备">
        {profile.scene.labels.map(({ id, text, color }) => <button type="button" className="qc-scene-label" key={id} data-color={color}
          title={`放大并拆解${text}`} aria-label={`放大${text}`} data-testid={`equipment-label-${id}`} onClick={() => openEquipment(id as EquipmentId)}
          ref={element => { labelsRef.current[id] = element; }}><i />{text}</button>)}
      </div>}
    <div className="qc-scene-tools" hidden={!!equipment} role="group" aria-label="三维视图">
      {!failed && <button type="button" title="整机视图" aria-label="整机视图" aria-pressed={!overlay && view === 'machine'} onClick={() => { setOverlay(null); setView('machine'); }}><Box size={15} /><span>整机</span></button>}
      <button type="button" aria-pressed={functionalView} onClick={() => setOverlay('connections')}><Workflow size={15} />功能图</button>
      <button type="button" aria-pressed={overlay === 'dimensions'} onClick={() => setOverlay('dimensions')}><Ruler size={15} />尺寸图</button>
      {!failed && <button type="button" title="阵列视图" aria-label="阵列视图" aria-pressed={!overlay && view !== 'machine'} onClick={() => { setOverlay(null); setView('published'); }}><Crosshair size={15} /><span>阵列</span></button>}
      {!failed && !overlay && <button type="button" title="重置视角" aria-label="重置视角" onClick={() => renderer.current?.setView(view)}><RotateCcw size={15} /></button>}
    </div>
    {!failed && !equipment && !overlay && view !== 'machine' && <div className="qc-array-switch metric-switch" role="group" aria-label="阵列内容">
      <button type="button" aria-pressed={view === 'published'} onClick={() => setView('published')}>论文交互行</button>
      <button type="button" aria-pressed={view === 'array'} onClick={() => setView('array')}>本轮占位</button>
    </div>}
    {!failed && !equipment && !overlay && view === 'published' && <div className="qc-array-topology">
      <svg viewBox="0 0 36 60" aria-label="12 行 7 列阱位索引，首行为交互行" role="img">
        {Array.from({ length: munizEvidence.trapSites }, (_, i) => <circle key={i}
          cx={3 + 5 * (i % munizEvidence.trapColumns)} cy={3 + 5 * Math.floor(i / munizEvidence.trapColumns)} r="1.18"
          fill={i < munizEvidence.trapColumns ? '#98e3c7' : '#86928d'} />)}
      </svg>
      <div><strong>{munizEvidence.trapRows} 行 × {munizEvidence.trapColumns} 列</strong><span>顶行为交互行</span></div>
    </div>}
    {partLabel && <span className="eq-located-part">{!part && '当前光路 · '}{partLabel}{arrayNote}</span>}
    <div className="qc-scene-footer">
      {!equipment && overlay !== 'dimensions' && (view !== 'published' || functionalView) && activePath && <span className="qc-scene-active" data-color={activePath.color}><i />{activePath.label}</span>}
      {!failed && (equipment || !overlay) && <span className="qc-scene-scale">
        {equipment ? '结构示意 · 非等比例' : view === 'published' ? '阱心按 μm 定位 · 下方横线为相邻储备行' : view === 'array' ? `焦平面放大 · ${rows} × ${columns} 演示阵列` : '两区垂直间距 300 mm · 外形示意'}
      </span>}
    </div>
  </div>;

  return <>
    <div className="eq-scene-home" ref={home} />
    {createPortal(scene, surface)}
    {equipment && <EquipmentInspection id={equipment} slot={detail} split={split} part={part}
      setSplit={value => setInspection({ key: equipment, part, split: value })}
      setPart={value => setInspection({ key: equipment, part: value, split })}
      operation={<EquipmentOperation {...playback} id={equipment} scene={projection}
        onGateCue={() => setInspection({ key: equipment, split, part: null })} />} />}
  </>;
}

export default QuantumComputerScene;
