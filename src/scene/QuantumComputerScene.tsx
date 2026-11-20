import { Box, Crosshair, RotateCcw } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { machineEquipment, type EquipmentId } from '../data/machineEquipment';
import { useHashFragment } from '../state/useHashFragment';
import { EquipmentDiagram } from './EquipmentDiagram';
import { EquipmentInspection } from './EquipmentInspection';
import { equipmentAt, openEquipment } from './equipmentNavigation';
import type { MachineProfile } from '../data/machineProfile';
import type { MachineFrame } from '../physics/quantumComputer';
import { projectMachineScene } from './machineSceneFrame';
import { QuantumMachineRenderer, type MachineView } from './QuantumMachineRenderer';
import './quantum-scene.css';

interface Props {
  profile: MachineProfile;
  frame: MachineFrame;
  pause: () => void;
}

export function QuantumComputerScene({ profile, frame, pause }: Props) {
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
  const [failed, setFailed] = useState(false);
  const labelsRef = useRef<Record<string, HTMLElement | null>>({});
  const projection = useMemo(() => projectMachineScene(frame, profile), [frame, profile]);
  const { stage, atoms, activePath } = projection;
  const { rows, columns } = profile.array;
  const partLabel = equipment && machineEquipment[equipment].parts.find(item => item.id === part)?.label;
  const arrayNote = equipment === 'array' && part === 'atoms'
    ? (frame.geometryRecorded ? ` · ${atoms.length} 个` : ' · 本帧坐标缺测') : '';

  // Move the existing viewport between its two hosts so orbit, selection and the WebGL context survive inspection.
  useLayoutEffect(() => {
    const target = equipment ? detail.current : home.current;
    target?.appendChild(surface);
    if (equipment) pause();
    else setInspection(previous => previous.key === null ? previous : { key: null, split: 50, part: null });
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
  useEffect(() => renderer.current?.update(projection), [projection]);

  useEffect(() => { renderer.current?.setInspection(equipment, split / 100, part); }, [equipment, split, part, profile]);

  const scene = <div className="qc-scene" data-inspecting={equipment ?? undefined} data-testid="quantum-scene" data-view={view} data-stage={stage}
    data-active-path={activePath?.id} data-occupancy={projection.occupancy ?? undefined}
    data-occupancy-phase={projection.occupancyPhase ?? undefined}
    data-moving-atom={projection.movingAtom ?? undefined} data-stage-skipped={projection.skipped || undefined}
    aria-label="整机三维光路演示">
    <div className="qc-scene-canvas" ref={host} hidden={failed} />
    {failed && equipment ? <div className="eq-fallback" data-testid="equipment-fallback">
      <EquipmentDiagram id={equipment} selected={part} split={split} atoms={atoms} rows={rows} columns={columns}
        geometryRecorded={frame.geometryRecorded} onSelect={value => setInspection({ key: equipment, split, part: value })} />
    </div> : failed ? <div className="qc-scene-fallback" data-testid="quantum-scene-fallback">
      <p>WebGL 不可用，显示二维阵列</p>
      <div className="qc-scene-fallback-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        role="img" aria-label={`${rows} 行 ${columns} 列，${atoms.length} 个原子`}>
        {Array.from({ length: rows * columns }, (_, index) => {
          const atom = atoms.find(atom => Math.round(atom.row) === Math.floor(index / columns) && Math.round(atom.column) === index % columns);
          const occupancyLit = projection.occupancyExposure && atom && Math.abs(atom.row - profile.array.registerRow) < 0.001;
          const state = atom ? atom.moving ? 'moving' : occupancyLit ? 'bright' : atom.bright === false ? 'dark' : atom.bright ? 'bright'
            : atom.qubit === undefined ? 'atom' : 'qubit' : 'empty';
          return <span key={index} data-state={state} />;
        })}
      </div>
    </div> : <>
      <div className="qc-scene-labels" hidden={!!equipment} aria-label="场景设备">
        {profile.scene.labels.map(({ id, text, color }) => <button type="button" className="qc-scene-label" key={id} data-color={color}
          title={`放大并拆解${text}`} aria-label={`放大${text}`} data-testid={`equipment-label-${id}`} onClick={() => openEquipment(id as EquipmentId)}
          ref={element => { labelsRef.current[id] = element; }}><i />{text}</button>)}
      </div>
      <div className="qc-scene-tools" hidden={!!equipment} role="group" aria-label="三维视图">
        <button type="button" title="整机视图" aria-label="整机视图" aria-pressed={view === 'machine'} onClick={() => setView('machine')}><Box size={15} /><span>整机</span></button>
        <button type="button" title="阵列视图" aria-label="阵列视图" aria-pressed={view === 'array'} onClick={() => setView('array')}><Crosshair size={15} /><span>阵列</span></button>
        <button type="button" title="重置视角" aria-label="重置视角" onClick={() => renderer.current?.setView(view)}><RotateCcw size={15} /></button>
      </div>
    </>}
    {partLabel && <span className="eq-located-part">{partLabel}{arrayNote}</span>}
    <div className="qc-scene-footer">
      {!equipment && activePath && <span className="qc-scene-active" data-color={activePath.color}><i />{activePath.label}</span>}
      {!failed && <span className="qc-scene-scale">{equipment ? '结构示意 · 非等比例' : '点选设备可拆解 · 光路非等比例'}</span>}
    </div>
  </div>;

  return <>
    <div className="eq-scene-home" ref={home} />
    {createPortal(scene, surface)}
    {equipment && <EquipmentInspection id={equipment} slot={detail} split={split} part={part}
      setSplit={value => setInspection({ key: equipment, part, split: value })}
      setPart={value => setInspection({ key: equipment, part: value, split })}
      stage={frame.stage.label} attempt={frame.attemptIndex + 1} milliseconds={frame.elapsedMs} />}
  </>;
}

export default QuantumComputerScene;
