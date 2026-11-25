import type { ReactNode } from 'react';
import { equipmentIds, machineEquipment, type EquipmentId } from '../data/machineEquipment';
import { openEquipment } from './equipmentNavigation';
import { illuminatedPart, type MachineSceneFrame } from './machineSceneFrame';

const positions: Record<EquipmentId, readonly [number, number]> = {
  source: [17, 23], vacuum: [50, 23], gate: [83, 23],
  slm: [17, 49], aod: [17, 71], array: [50, 55], imaging: [83, 63], table: [50, 86],
};

export function MachineArchitectureDiagram({ scene, array }: { scene: MachineSceneFrame; array: ReactNode }) {
  const fixed = illuminatedPart('slm', scene) !== null;
  const delivery = illuminatedPart('vacuum', scene) === 'objective';
  const side = illuminatedPart('gate', scene) !== null;
  const fromLeft = side && (scene.activePath?.id === 'clock-shelve' || scene.activePath?.id === 'clock-return' || scene.blockade);
  const cooling = scene.activePath?.id === 'cooling';
  let route = '实线为传递路径，虚线为结构关系。';
  if (cooling) route = '预冷原子束 → 独立冷却腔内的磁光阱';
  if (scene.elevatorProgress !== null) route = '冷却区 → 532 nm 移动晶格 → 科学区 · 垂直间距 300 mm';
  if (fixed) route = '固定光镊 → 共用物镜 → 阵列阱位';
  if (scene.transport) route = '搬运光镊 → 共用物镜 → 移动中的原子';
  if (scene.raman) route = '局域拉曼光 → 共用物镜 → 选定比特';
  if (side) route = fromLeft ? '门光沿 +x 进入交互行' : '探测通道沿 −x 进入交互行';
  if (scene.collecting) route = scene.emittingAtoms.size
    ? '侧向探测光 → 原子 → 对侧收集物镜 → 相机' : '侧向探测光照亮交互行 · 本帧无亮位点';
  return <div className="qc-architecture-map" role="group" aria-label="整机功能连接图">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M17 23H50" data-lit={cooling || scene.elevatorProgress !== null || undefined} />
      <path d="M17 49H32V34H44L50 23" data-lit={fixed || undefined} />
      <path d="M17 71H37V38L50 23" data-lit={scene.transport || undefined} />
      {scene.raman && <path d="M50 9V23" data-lit="true" />}
      <path d="M50 23V55" data-lit={delivery || undefined} />
      <path d="M83 23V40H67V55H50" data-lit={side && !fromLeft || undefined} />
      {fromLeft && <path d="M83 23V12H29V55H50" data-lit />}
      {side && <path className="qc-route-tip" d={fromLeft ? 'M42 53L43.5 55L42 57' : 'M59 53L57.5 55L59 57'} data-lit />}

      <path d="M50 55H70V63H83" data-lit={scene.emittingAtoms.size > 0 || undefined} />
      <path className="qc-structural" d="M50 55V86" />
    </svg>
    {scene.raman && <small className="qc-map-raman">局域拉曼光</small>}
    {equipmentIds.map(id => {
      const [left, top] = positions[id];
      const active = Boolean(illuminatedPart(id, scene)) || (id === 'array' && scene.atoms.length > 0);
      return <button type="button" key={id} onClick={() => openEquipment(id)}
        aria-label={`放大${machineEquipment[id].label}`} data-active={active || undefined}
        style={{ left: `${left}%`, top: `${top}%` }}>
        {machineEquipment[id].label}{id === 'array' && array}
      </button>;
    })}
    <p>{route}</p>
  </div>;
}
