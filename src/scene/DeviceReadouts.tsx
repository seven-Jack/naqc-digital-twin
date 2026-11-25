import { munizEvidence } from '../data/hardwareEvidence';
import type { MachineFrame, MachineRun, MachineSite } from '../physics/quantumComputer';
import type { MachineSceneFrame } from './machineSceneFrame';

export function ArrayReadout({ run, scene }: { run: MachineRun; scene: MachineSceneFrame }) {
  const { rows, columns, registerRow } = run.profile.array;
  return <svg className="eq-array-readout" viewBox={[-.5, -.5, columns, rows].join(' ')} role="img"
    aria-label={`阵列俯视图，${rows} 行 ${columns} 列，${scene.atoms.length} 个原子`}>
    {run.sites.map(site => site.qubit === undefined
      ? <circle key={site.id} cx={site.column} cy={site.row} r=".31" className="eq-trap" />
      : <rect key={site.id} x={site.column - .39} y={site.row - .39} width=".78" height=".78" rx=".12" className="eq-target-site" />)}
    {scene.activeMove && <polyline className="eq-move-route"
      points={scene.activeMove.path.map(site => site.column + ',' + site.row).join(' ')} />}
    {scene.atoms.map(atom => {
      const bright = atom.bright === true || (scene.occupancyExposure && Math.abs(atom.row - registerRow) < .001);
      const color = atom.moving ? 'eq-moving' : bright ? 'eq-bright' : atom.bright === false ? 'eq-dark'
        : atom.qubit !== undefined ? 'eq-qubit' : 'eq-present';
      return <circle key={atom.id} cx={atom.column} cy={atom.row} r={atom.moving ? '.31' : '.22'} className={color} />;
    })}
  </svg>;
}

export function TrapHandoff({ scienceWeight }: Pick<MachineSceneFrame, 'scienceWeight'>) {
  const science = Math.round(100 * scienceWeight);
  const channels = [
    { name: '储备阱', nm: munizEvidence.reservoirNm, value: 100 - science },
    { name: '科学阱', nm: munizEvidence.scienceNm, value: science },
  ];
  return <figure className="eq-instrument eq-handoff" aria-label="同址换阱">
    <figcaption>同址换阱 <small>各光路相对功率设定</small></figcaption>
    {channels.map(({ name, nm, value }) => <div className="eq-power-row" key={nm}>
      <span>{nm} nm <b>{name}</b></span><meter aria-label={name} min="0" max="100" value={value} /><output>{value}%</output>
    </div>)}
    <p>原子保持在原阱位。文献交接用时 {munizEvidence.transferMs} ms，此处放慢回放。</p>
  </figure>;
}

function cameraSite(site: MachineSite, frame: MachineFrame, brightBit: string) {
  if (frame.stageSkipped || frame.representativeLostQubits.length || (frame.stage.id === 'readout' && !frame.representativeReady)) {
    return { label: '无有效观测', state: 'unavailable' };
  }
  if (frame.stage.id === 'readout') {
    const bit = frame.representativeBitstring?.[site.qubit!];
    if (bit === undefined) return { label: '待判读', state: 'pending' };
    return bit === brightBit ? { label: '亮 · ' + bit, state: 'bright' } : { label: '暗 · ' + bit, state: 'dark' };
  }
  const phase = frame.stage.id === 'occupancy-check' ? 'initial' : 'recheck';
  const observed = frame.occupancy?.observations.find(item => item.phase === phase)?.sites.find(item => item.id === site.id);
  if (observed) return observed.occupied ? { label: '有原子', state: 'occupied' } : { label: '空位', state: 'vacant' };
  return { label: frame.occupancy?.exposing ? '曝光中' : '待观测', state: 'pending' };
}

export function CameraReadout({ run, frame }: { run: MachineRun; frame: MachineFrame }) {
  const stateReadout = frame.stage.id === 'readout';
  return <figure className="eq-instrument eq-camera" aria-label="相机位点判读">
    <figcaption>{stateReadout ? '态选择荧光' : '寄存器占位'} <small>模拟位点判读</small></figcaption>
    <div className="eq-camera-sites">{run.sites.filter(site => site.qubit !== undefined).map(site => {
      const { label, state } = cameraSite(site, frame, run.profile.readoutBrightBit);
      return <div key={site.id} data-signal={state}><span>q{site.qubit} · {site.id}</span><strong><i aria-hidden="true" />{label}</strong></div>;
    })}</div>
    <p>{stateReadout ? `文献单次探测 ${munizEvidence.imageMs} ms。本轮通过存活检查后，才用亮暗判读量子态。` : '曝光结束后逐位点记录占位，供本轮补位判决使用。'}</p>
  </figure>;
}
