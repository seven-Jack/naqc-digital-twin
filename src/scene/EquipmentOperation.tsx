import type { CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';
import { GateOperations, type GatePlayback } from '../machine/GateOperations';
import { PlaybackSpeed } from '../components/PlaybackSpeed';
import type { EquipmentId } from '../data/machineEquipment';
import type { MachineStageId } from '../data/machineProfile';
import type { MachineFrame } from '../physics/quantumComputer';
import { illuminatedPart, type MachineSceneFrame } from './machineSceneFrame';
import { ArrayReadout, CameraReadout, TrapHandoff } from './DeviceReadouts';

// The first entry is the suggested clip when the visitor opens a device at an unrelated time.
// The optical table provides a mechanical reference throughout the sequence.
const deviceStages: Record<EquipmentId, readonly MachineStageId[] | 'all'> = {
  table: 'all', source: ['cooling'], vacuum: ['cooling', 'loading', 'transfer', 'gates', 'return'],
  slm: ['loading', 'transfer', 'return'], aod: ['rearrangement', 'replenishment'],
  array: ['loading', 'rearrangement', 'occupancy-check', 'replenishment', 'occupancy-recheck', 'preparation',
    'transfer', 'gates', 'analysis', 'return', 'readout'],
  gate: ['gates', 'preparation', 'analysis', 'readout', 'occupancy-check', 'occupancy-recheck'],
  imaging: ['readout', 'occupancy-check', 'occupancy-recheck'],
};

export interface EquipmentPlayback extends GatePlayback {
  source: '本地导入回放' | '合成演示';
  frameNotice: string | null;
}

function deviceSignal(id: EquipmentId, frame: MachineFrame, scene: MachineSceneFrame): string {
  switch (id) {
    case 'table': return '台面支承各装置，画面显示本轮的整机阶段。';
    case 'source': return scene.elevatorProgress === null ? '原子束进入独立的磁光阱，在 399 nm 和 556 nm 光中冷却。'
      : '532 nm 移动晶格将冷原子送往科学区。亮点示意原子云的位置。';
    case 'vacuum': return scene.raman ? '局域拉曼光经共用投送物镜聚焦至目标比特。'
      : scene.activePath?.id === 'reservoir' ? '固定光镊经共用物镜聚焦到腔内原子平面。'
      : '科学腔经差分抽气管与独立的冷却腔相连。';
    case 'slm': return scene.activePath?.label ?? '等待光阱交接';
    case 'aod': return scene.activeMove ? `搬运原子 ${scene.activeMove.atomId}，目标阱位 ${scene.activeMove.to.id}。`
      : '当前帧没有移动中的原子';
    case 'array': return frame.geometryRecorded ? `当前阵列有 ${frame.atoms.length} 个原子` : '本帧原子坐标缺测';
    case 'gate': {
      const part = illuminatedPart('gate', scene);
      const axis = part === 'probe' ? '沿 −x 入射' : part === 'clock' || part === 'rydberg' ? '沿 +x 入射'
        : scene.raman ? '经共用物镜入射' : '';
      return [scene.activePath?.label ?? '当前无激活光路', axis, ...frame.activeQubits.map(q => `q${q}`)].filter(Boolean).join(' · ');
    }
    case 'imaging':
      if (scene.fluorescence !== null) return `荧光位串 ${scene.fluorescence}`;
      if (scene.occupancyExposure) return '正在采集占位帧';
      if (scene.occupancyPhase === (scene.stage === 'occupancy-check' ? 'initial' : 'recheck')
        && scene.stage !== 'readout') return `占位判读 ${scene.occupancy}`;
      return '等待本阶段观测';
  }
}

export function EquipmentOperation(props: EquipmentPlayback & { id: EquipmentId; scene: MachineSceneFrame; onGateCue: () => void }) {
  const { id, scene, run, frame, source, frameNotice, playing, pause, seek, playRange, speed, setSpeed } = props;
  const stages = run.plan.timeline.stages;
  const ids = deviceStages[id];
  const available = ids === 'all' ? stages : stages.filter(stage => ids.includes(stage.id));
  const current = available.find(stage => stage.id === frame.stage.id);
  const suggested = ids === 'all' ? available[0] : available.find(stage => stage.id === ids[0]);
  const clip = current ?? suggested ?? available[0];
  if (!clip) return null;
  // Stage intervals are half-open. Keep the last whole millisecond inside the selected clip.
  const end = clip.endMs === run.durationMs ? clip.endMs : Math.max(clip.startMs, clip.endMs - 1);
  const cursor = current ? Math.min(frame.elapsedMs, end) : clip.startMs;
  const progress = end > clip.startMs ? (cursor - clip.startMs) / (end - clip.startMs) : 0;
  const showArray = id === 'aod' || id === 'array';
  const showHandoff = (id === 'slm' || id === 'array' || id === 'vacuum') &&
    (scene.activePath?.id === 'to-science' || scene.activePath?.id === 'to-reservoir');
  let signal = '可播放下方片段，查看设备在该阶段的运行。';
  if (current) {
    signal = id !== 'table' && frameNotice ? frameNotice : deviceSignal(id, frame, scene);
  }
  return <section className="eq-operation" aria-label="设备运行回放" data-stage={frame.stage.id}>
    <div className="eq-operation-heading"><h3>运行回放</h3><span>{source} · 第 {frame.attemptIndex + 1} 轮</span></div>
    <div className="eq-frame-detail">
      {showArray && frame.geometryRecorded && <ArrayReadout run={run} scene={scene} />}
      <div><strong>{frame.stage.label}</strong><p>{signal}</p>
        {showArray && scene.activeMove && <p className="eq-itinerary">本轮路径 <b>{scene.activeMove.path.map(site => site.id).join(' → ')}</b></p>}
        {showArray && frame.geometryRecorded && <small className="eq-site-key">方框为寄存器阱位，实点为原子。</small>}
      </div>
      <output aria-label="整机回放时间">{(frame.elapsedMs / 1000).toFixed(2)} s</output>
    </div>
    {showHandoff && <TrapHandoff scienceWeight={scene.scienceWeight} />}
    {id === 'imaging' && current && <CameraReadout run={run} frame={frame} />}
    {id === 'gate' && clip.id === 'gates' && <GateOperations {...props} compact onCue={props.onGateCue} />}
    <div className="eq-clip-controls">
      <label>回放阶段<select value={clip.id} onChange={event => {
        const stage = available.find(item => item.id === event.currentTarget.value);
        if (stage) seek(stage.startMs);
      }}>{available.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
      <button type="button" onClick={() => playing ? pause() : playRange(cursor < end ? cursor : clip.startMs, end)}>
        {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? '暂停片段' : '播放片段'}
      </button>
      <PlaybackSpeed label="片段播放速度" value={speed} onChange={setSpeed} />
      <input type="range" aria-label="设备阶段时间轴" min={clip.startMs} max={end} step="any" value={cursor}
        style={{ '--md-fill': `${progress * 100}%` } as CSSProperties}
        aria-valuetext={`${clip.label}，片段内 ${((cursor - clip.startMs) / 1000).toFixed(2)} 秒`}
        onChange={event => seek(Number(event.currentTarget.value))} />
    </div>
  </section>;
}
