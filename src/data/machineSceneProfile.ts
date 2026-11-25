import { norciaTransport } from './hardwareEvidence';

export const MUNIZ_DEMO_WAVELENGTHS_NM = {
  reservoir: 483,
  science: 460,
  transport: 483,
  clock: 578,
  rydberg: 301.9,
  probe: 556,
} as const;

export type ScenePoint = readonly [x: number, y: number, z: number];

interface OpticalPath {
  points: readonly ScenePoint[];
  color: string;
  width?: number;
}

interface SidePath {
  /** Output collimator and turning mirrors, ordered from source to interaction row. */
  approach: readonly ScenePoint[];
  rowEntranceX: number;
  rowExitX: number;
  color: string;
  width: number;
}

const highlights = {
  cooling: { color: 'cooling', label: '磁光阱冷却' },
  elevator: { color: 'tweezer', label: '532 nm 晶格输运 · 示意' },
  reservoir: { color: 'tweezer', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.reservoir} nm 储备光镊` },
  transport: { color: 'transport', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.transport} nm AOD 搬运` },
  preparation: { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm 光抽运` },
  'occupancy-check': { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm 合成占位曝光` },
  'occupancy-recheck': { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm 合成补位复查` },
  'to-science': { color: 'science', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.reservoir} → ${MUNIZ_DEMO_WAVELENGTHS_NM.science} nm 光镊交接` },
  raman: { color: 'raman', label: '局域 Raman 旋转' },
  'clock-shelve': { color: 'clock', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.clock} nm · 转入钟态` },
  rydberg: { color: 'gate', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.rydberg} nm · Rydberg 条件相位` },
  'clock-return': { color: 'clock', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.clock} nm · 返回基态` },
  'raman-analysis': { color: 'raman', label: '局域 Raman 分析旋转' },
  'to-reservoir': { color: 'tweezer', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.science} → ${MUNIZ_DEMO_WAVELENGTHS_NM.reservoir} nm 光镊交接` },
  readout: { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm σ− 探测` },
};

export type MachineOpticalHighlight = keyof typeof highlights;

/** The sample-to-sample transport has a metric scale. Housings and replay sites are illustrative. */
export interface MachineSceneProfile {
  arrayPitch: number;
  arrayY: number;
  motY: number;
  labels: readonly { id: string; text: string; color: string; position: ScenePoint; offset: readonly [number, number] }[];
  delivery: ScenePoint;
  collection: ScenePoint;
  paths: {
    reservoir: OpticalPath;
    science: OpticalPath;
    transport: OpticalPath;
    objective: OpticalPath;
    raman: OpticalPath;
    cooling: readonly OpticalPath[];
    clock: SidePath;
    rydberg: SidePath;
    probe: SidePath;
  };
  highlights: Record<MachineOpticalHighlight, { color: string; label: string }>;
}

export function interactionPath(path: SidePath, arrayY: number, rowOffset: number): OpticalPath {
  return { ...path, points: [...path.approach, [path.rowEntranceX, arrayY - rowOffset, 0], [path.rowExitX, arrayY - rowOffset, 0]] };
}

export const sceneUnitsPerMetre = 10;
const arrayY = 2.35;
const motY = arrayY - norciaTransport.separationM * sceneUnitsPerMetre;
const merge: ScenePoint = [-4.25, 0.02, 1.33];
const delivery: ScenePoint = [0, arrayY, -0.83];
const collection: ScenePoint = [0, arrayY, 0.83];

export const MUNIZ_DEMO_SCENE: MachineSceneProfile = {
  arrayPitch: 0.145,
  arrayY, motY,
  labels: [
    { id: 'source', text: '原子源', color: 'vacuum', position: [-2.95, motY, 0], offset: [-16, 35] },
    { id: 'table', text: '光学平台', color: 'vacuum', position: [-5.7, -1.60, 3.78], offset: [2, -8] },
    { id: 'array', text: '原子阵列', color: 'science', position: [0, arrayY, 0], offset: [47, 23] },
    { id: 'slm', text: 'SLM 固定光镊', color: 'tweezer', position: [-7.27, 0.28, 1.64], offset: [-12, -17] },
    { id: 'aod', text: 'AOD 搬运光镊', color: 'transport', position: [-7.48, 0.12, -1.30], offset: [-28, -24] },
    { id: 'vacuum', text: '真空腔', color: 'vacuum', position: [-1.15, arrayY + 0.45, 0.3], offset: [-30, -24] },
    { id: 'imaging', text: '荧光收集物镜', color: 'imaging', position: [0.35, arrayY, 2.55], offset: [-82, -12] },
    { id: 'gate', text: '门与探测激光', color: 'gate', position: [6.50, arrayY, 1.82], offset: [0, -24] },
  ],
  delivery, collection,
  paths: {
    reservoir: { points: [[-5.95, 0.02, 1.07], merge], color: '#60debe' },
    science: { points: [[-5.95, 0.02, 1.59], merge], color: '#78a8ff' },
    transport: { points: [[-6.02, 0.02, -1.17], [-4.25, 0.02, -1.17], merge], color: '#62d9f5' },
    raman: { points: [[-4.25, 0.02, 2.26], merge], color: '#f18de1', width: 0.075 },
    objective: { points: [merge, [-3.65, 0.02, 1.33], [-3.65, 0.02, -2.85], [-3.65, arrayY, -2.85], [0, arrayY, -2.85], delivery], color: '#60debe', width: 0.11 },
    cooling: [
      { points: [[-1.55, motY, -1.3], [0, motY, 0], [1.55, motY, 1.3]], color: '#7dc7ec', width: 0.14 },
      { points: [[1.55, motY, -1.3], [0, motY, 0], [-1.55, motY, 1.3]], color: '#7dc7ec', width: 0.14 },
    ],
    // Fig. 1a: clock and UV point toward +x; readout points toward −x.
    clock: { approach: [[5.38, arrayY + 0.82, 2.55], [-2.55, arrayY + 0.82, 2.55]], rowEntranceX: -2.55, rowExitX: 1.93, color: '#f3c16d', width: 0.10 },
    rydberg: { approach: [[5.38, arrayY + 0.82, 3.28], [-2.55, arrayY + 0.82, 3.28]], rowEntranceX: -2.55, rowExitX: 1.93, color: '#b694ff', width: 0.12 },
    probe: { approach: [[5.38, arrayY, 1.82], [3.72, arrayY, 1.82]], rowEntranceX: 3.72, rowExitX: -1.93, color: '#94e3a7', width: 0.12 },
  },
  highlights,
};
