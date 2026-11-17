import { Box, Crosshair, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { czOpticalPhase, QuantumMachineRenderer, type MachineView, type SceneFrame } from './QuantumMachineRenderer';
import './quantum-scene.css';

interface Props extends SceneFrame {
  rows: number;
  columns: number;
}

const labels = [
  { type: 'slm', text: 'SLM 固定光镊', color: 'tweezer' },
  { type: 'aod', text: 'AOD 搬运光镊', color: 'transport' },
  { type: 'vacuum', text: '真空腔', color: 'vacuum' },
  { type: 'imaging', text: '荧光收集物镜', color: 'imaging' },
  { type: 'gate', text: '门与探测激光', color: 'gate' },
] as const;

function activePath({ stage, atoms, activeQubits = [], gateProgress, representativeReady = true }: SceneFrame) {
  switch (stage) {
    case 'cooling': return { color: 'cooling', label: '磁光阱冷却' };
    case 'loading': return { color: 'tweezer', label: '483 nm 储备光镊' };
    case 'rearrangement': return atoms.some(atom => atom.moving) ? { color: 'transport', label: '483 nm AOD 搬运' } : null;
    case 'preparation': return activeQubits.length ? { color: 'imaging', label: '556 nm 光抽运' } : null;
    case 'transfer': return representativeReady ? { color: 'science', label: '483 → 460 nm 光镊交接' } : null;
    case 'gates': {
      if (activeQubits.length === 1) return { color: 'raman', label: '局域 Raman 旋转' };
      if (activeQubits.length !== 2) return null;
      const phase = czOpticalPhase(gateProgress);
      if (phase === 'blockade') return { color: 'gate', label: '302 nm · Rydberg 条件相位' };
      return { color: 'clock', label: phase === 'shelve' ? '578 nm · 转入钟态' : '578 nm · 返回基态' };
    }
    case 'analysis': return activeQubits.length ? { color: 'raman', label: '局域 Raman 分析旋转' } : null;
    case 'return': return representativeReady ? { color: 'tweezer', label: '460 → 483 nm 光镊交接' } : null;
    case 'readout': return atoms.some(atom => atom.bright !== undefined)
      ? { color: 'imaging', label: '556 nm σ− 探测 · |0⟩ 亮、|1⟩ 暗' } : null;
    default: return null;
  }
}

export function QuantumComputerScene({ rows, columns, stage, atoms, progress, completed, activeQubits,
  gateProgress, representativeReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<QuantumMachineRenderer | null>(null);
  const [view, setView] = useState<MachineView>('machine');
  const [failed, setFailed] = useState(false);
  const labelsRef = useRef<Record<string, HTMLSpanElement | null>>({});

  useEffect(() => {
    setFailed(false);
    try {
      renderer.current = new QuantumMachineRenderer(host.current!, rows, columns, labelsRef.current);
    } catch {
      setFailed(true);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [rows, columns]);

  useEffect(() => renderer.current?.setView(view), [view, rows, columns]);
  useEffect(() => renderer.current?.update({ stage, atoms, progress, completed, activeQubits, gateProgress, representativeReady }),
    [stage, atoms, progress, completed, activeQubits, gateProgress, representativeReady, rows, columns]);

  const path = activePath({ stage, atoms, activeQubits, gateProgress, representativeReady });

  return <div className="qc-scene" data-testid="quantum-scene" data-view={view} aria-label="整机三维光路演示">
    <div className="qc-scene-canvas" ref={host} />
    {failed ? <div className="qc-scene-fallback" data-testid="quantum-scene-fallback">
      <p>WebGL 不可用，显示二维阵列</p>
      <div className="qc-scene-fallback-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        role="img" aria-label={`${rows} 行 ${columns} 列，${atoms.length} 个原子`}>
        {Array.from({ length: rows * columns }, (_, index) => {
          const atom = atoms.find(atom => Math.round(atom.row) === Math.floor(index / columns) && Math.round(atom.column) === index % columns);
          const state = atom ? atom.moving ? 'moving' : atom.bright === false ? 'dark' : atom.bright ? 'bright'
            : atom.qubit === undefined ? 'atom' : 'qubit' : 'empty';
          return <span key={index} data-state={state} />;
        })}
      </div>
    </div> : <>
      <div className="qc-scene-labels" aria-hidden="true">
        {labels.map(({ type, text, color }) => <span className="qc-scene-label" key={type} data-color={color}
          ref={element => { labelsRef.current[type] = element; }}><i />{text}</span>)}
      </div>
      <div className="qc-scene-tools" role="group" aria-label="三维视图">
        <button type="button" title="整机视图" aria-label="整机视图" aria-pressed={view === 'machine'} onClick={() => setView('machine')}><Box size={15} /><span>整机</span></button>
        <button type="button" title="阵列视图" aria-label="阵列视图" aria-pressed={view === 'array'} onClick={() => setView('array')}><Crosshair size={15} /><span>阵列</span></button>
        <button type="button" title="重置视角" aria-label="重置视角" onClick={() => renderer.current?.setView(view)}><RotateCcw size={15} /></button>
      </div>
    </>}
    <div className="qc-scene-footer">
      {path && <span className="qc-scene-active" data-color={path.color}><i />{path.label}</span>}
      {!failed && <span className="qc-scene-scale">光路示意 · 非等比例</span>}
    </div>
  </div>;
}

export default QuantumComputerScene;
