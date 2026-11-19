import { Box, Crosshair, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MachineProfile } from '../data/machineProfile';
import type { MachineFrame } from '../physics/quantumComputer';
import { projectMachineScene } from './machineSceneFrame';
import { QuantumMachineRenderer, type MachineView } from './QuantumMachineRenderer';
import './quantum-scene.css';

interface Props {
  profile: MachineProfile;
  frame: MachineFrame;
}

export function QuantumComputerScene({ profile, frame }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<QuantumMachineRenderer | null>(null);
  const [view, setView] = useState<MachineView>('machine');
  const [failed, setFailed] = useState(false);
  const labelsRef = useRef<Record<string, HTMLSpanElement | null>>({});
  const projection = useMemo(() => projectMachineScene(frame, profile), [frame, profile]);
  const { stage, atoms, activePath } = projection;
  const { rows, columns } = profile.array;

  useEffect(() => {
    setFailed(false);
    try {
      renderer.current = new QuantumMachineRenderer(host.current!, profile, labelsRef.current);
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

  return <div className="qc-scene" data-testid="quantum-scene" data-view={view} data-stage={stage}
    data-active-path={activePath?.id} data-occupancy={projection.occupancy ?? undefined}
    data-occupancy-phase={projection.occupancyPhase ?? undefined}
    data-moving-atom={projection.movingAtom ?? undefined} data-stage-skipped={projection.skipped || undefined}
    aria-label="整机三维光路演示">
    <div className="qc-scene-canvas" ref={host} />
    {failed ? <div className="qc-scene-fallback" data-testid="quantum-scene-fallback">
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
      <div className="qc-scene-labels" aria-hidden="true">
        {profile.scene.labels.map(({ id, text, color }) => <span className="qc-scene-label" key={id} data-color={color}
          ref={element => { labelsRef.current[id] = element; }}><i />{text}</span>)}
      </div>
      <div className="qc-scene-tools" role="group" aria-label="三维视图">
        <button type="button" title="整机视图" aria-label="整机视图" aria-pressed={view === 'machine'} onClick={() => setView('machine')}><Box size={15} /><span>整机</span></button>
        <button type="button" title="阵列视图" aria-label="阵列视图" aria-pressed={view === 'array'} onClick={() => setView('array')}><Crosshair size={15} /><span>阵列</span></button>
        <button type="button" title="重置视角" aria-label="重置视角" onClick={() => renderer.current?.setView(view)}><RotateCcw size={15} /></button>
      </div>
    </>}
    <div className="qc-scene-footer">
      {activePath && <span className="qc-scene-active" data-color={activePath.color}><i />{activePath.label}</span>}
      {!failed && <span className="qc-scene-scale">光路示意 · 非等比例</span>}
    </div>
  </div>;
}

export default QuantumComputerScene;
