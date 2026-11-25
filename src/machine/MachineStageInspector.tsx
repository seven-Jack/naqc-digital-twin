import { openEquipment } from '../scene/equipmentNavigation';
import type { EquipmentId } from '../data/machineEquipment';
import { Activity } from 'lucide-react';
import type { MachineStageId } from '../data/machineProfile';
import type { MachineFrame, MachineRun } from '../physics/quantumComputer';
import { projectMachineScene } from '../scene/machineSceneFrame';
import './machine-stage-inspector.css';

const stageEquipment = {
  cooling: ['磁光阱', 'source'],
  loading: ['储备光镊阵列', 'slm'],
  rearrangement: ['AOD 搬运光镊', 'aod'],
  'occupancy-check': ['占位成像相机', 'imaging'],
  replenishment: ['AOD 补位光镊', 'aod'],
  'occupancy-recheck': ['占位复查相机', 'imaging'],
  preparation: ['光抽运与制备光路', 'gate'],
  transfer: ['储备阱与计算阱', 'array'],
  gates: ['量子门光路', 'gate'],
  analysis: ['测量基旋转光路', 'gate'],
  return: ['计算阱与储备阱', 'slm'],
  readout: ['荧光收集物镜与相机', 'imaging'],
} as const satisfies Record<MachineStageId, readonly [string, EquipmentId]>;

const eventNames = { operation: '设备操作', observe: '相机曝光', decide: '占位判决' } as const;

export function MachineStageInspector({ run, frame, synthetic }: { run: MachineRun; frame: MachineFrame; synthetic: boolean }) {
  const [equipment, moduleId] = stageEquipment[frame.stage.id];
  const scene = projectMachineScene(frame, run.profile, synthetic);
  const record = run.records[frame.attemptIndex];
  const events = record?.events.filter(event => event.stageId === frame.stage.id && event.startMs <= frame.elapsedMs
    && (event.reason !== 'atom-lost' || frame.stageSkipped));
  const observation = frame.occupancy?.observations.at(-1);
  let camera = '本轮尚无观测';
  if (frame.stageSkipped && frame.stage.id === 'readout') camera = '本轮读出已跳过';
  else if (scene.occupancyExposure) camera = '正在采集占位帧';
  else if (scene.fluorescence !== null) camera = `荧光位串 ${scene.fluorescence}`;
  else if (observation) camera = `${observation.phase === 'initial' ? '初检' : '复查'}占位 ${scene.occupancy}`;

  return <section className="md-panel machine-inspector" aria-label="当前阶段设备">
    <header>
      <div><Activity size={16} aria-hidden="true" /><h2>{equipment}</h2></div>
      <div className="eq-stage-links"><button type="button" onClick={() => openEquipment(moduleId)}>拆解本阶段设备</button><a href="#hardware-evidence-heading">查看实验依据</a></div>
    </header>
    <dl>
      <div><dt>当前光路</dt><dd data-testid="inspector-optics">{scene.activePath?.label ?? (frame.stageSkipped ? '已跳过' : '无激活光路')}</dd></div>
      <div><dt>寻址比特</dt><dd>{frame.activeQubits.length ? frame.activeQubits.map(q => `q${q}`).join('、') : '—'}</dd></div>
      <div><dt>相机观测</dt><dd data-testid="inspector-observation">{camera}</dd></div>
    </dl>
    {record && <details>
      <summary>第 {frame.attemptIndex + 1} 轮 · 本阶段事件记录</summary>
      {events?.length ? <ul>{events.map(event => {
        const ended = frame.elapsedMs >= event.endMs;
        const status = event.status === 'skipped' ? '已跳过' : ended ? '已结束' : '进行中';
        return <li key={event.id}>
          <span>{eventNames[event.kind]} · {status}</span>
          <code>{event.id}</code>
          <span>开始 {event.startMs} ms{ended && ` · 结束 ${event.endMs} ms`}</span>
          {!!event.schedule?.resourceIds.length && <span>资源 <code>{event.schedule.resourceIds.join('、')}</code></span>}
        </li>;
      })}</ul> : <p>当前时刻尚无可显示的事件。</p>}
      <p>时间来自合成运行记录的演示时钟。</p>
    </details>}
  </section>;
}
