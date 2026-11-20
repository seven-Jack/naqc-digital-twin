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
  entranceZ: number;
  color: string;
  width: number;
}

const highlights = {
  cooling: { color: 'cooling', label: '磁光阱冷却' },
  reservoir: { color: 'tweezer', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.reservoir} nm 储备光镊` },
  transport: { color: 'transport', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.transport} nm AOD 搬运` },
  preparation: { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm 光抽运` },
  'occupancy-check': { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm 合成占位曝光` },
  'occupancy-recheck': { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm 合成补位复查` },
  'to-science': { color: 'science', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.reservoir} → ${MUNIZ_DEMO_WAVELENGTHS_NM.science} nm 光镊交接` },
  raman: { color: 'raman', label: '局域 Raman 旋转' },
  'clock-shelve': { color: 'clock', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.clock} nm · 转入钟态` },
  rydberg: { color: 'gate', label: `${Math.round(MUNIZ_DEMO_WAVELENGTHS_NM.rydberg)} nm · Rydberg 条件相位` },
  'clock-return': { color: 'clock', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.clock} nm · 返回基态` },
  'raman-analysis': { color: 'raman', label: '局域 Raman 分析旋转' },
  'to-reservoir': { color: 'tweezer', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.science} → ${MUNIZ_DEMO_WAVELENGTHS_NM.reservoir} nm 光镊交接` },
  readout: { color: 'imaging', label: `${MUNIZ_DEMO_WAVELENGTHS_NM.probe} nm σ− 探测` },
};

export type MachineOpticalHighlight = keyof typeof highlights;

/** Display geometry and visual labels for the schematic. Scene coordinates have no physical units. */
export interface MachineSceneProfile {
  arrayPitch: number;
  arrayY: number;
  labels: readonly { id: string; text: string; color: string; position: ScenePoint }[];
  delivery: ScenePoint;
  collection: ScenePoint;
  sidePathX: readonly [entrance: number, fold: number, exit: number];
  paths: {
    reservoir: OpticalPath;
    science: OpticalPath;
    transport: OpticalPath;
    objective: OpticalPath;
    cooling: readonly OpticalPath[];
    clock: SidePath;
    rydberg: SidePath;
    probe: SidePath;
  };
  ramanColor: string;
  highlights: Record<MachineOpticalHighlight, { color: string; label: string }>;
}

const arrayY = 0.36;
const merge: ScenePoint = [-4.25, 0.02, 1.33];
const delivery: ScenePoint = [0, -0.55, 0];

export const MUNIZ_DEMO_SCENE: MachineSceneProfile = {
  arrayPitch: 0.5,
  arrayY,
  labels: [
    { id: 'source', text: '原子源', color: 'vacuum', position: [-4.38, 0.84, -2.40] },
    { id: 'table', text: '光学平台', color: 'vacuum', position: [-5.8, -1.60, 3.20] },
    { id: 'array', text: '原子阵列', color: 'science', position: [0.72, 0.56, 1.54] },
    { id: 'slm', text: 'SLM 固定光镊', color: 'tweezer', position: [-7.4, 1.65, 1.35] },
    { id: 'aod', text: 'AOD 搬运光镊', color: 'transport', position: [-7.05, 2.45, -1.25] },
    { id: 'vacuum', text: '真空腔', color: 'vacuum', position: [-2.35, 2.03, 0.75] },
    { id: 'imaging', text: '荧光收集物镜', color: 'imaging', position: [0.20, 4.42, 0] },
    { id: 'gate', text: '门与探测激光', color: 'gate', position: [7.13, 1.76, 0.1] },
  ],
  delivery,
  collection: [0, 2.49, 0],
  sidePathX: [5.18, 3.85, -2.15],
  paths: {
    reservoir: { points: [[-5.95, 0.02, 1.07], merge], color: '#4feab7' },
    science: { points: [[-5.95, 0.02, 1.59], merge], color: '#74adfc' },
    transport: { points: [[-6.02, 0.02, -1.17], [-5.1, 0.02, -1.17], merge], color: '#5beafb' },
    objective: { points: [merge, [-3.16, -0.74, 0], [0, -0.74, 0], delivery], color: '#4feab7', width: 0.18 },
    cooling: [
      { points: [[-2.28, 0.55, -1.44], [0, arrayY, 0], [1.94, 0.21, 1.68]], color: '#4fb7fe', width: 0.37 },
      { points: [[-1.96, 0.31, 1.48], [0, arrayY, 0], [1.96, 0.47, -1.48]], color: '#4fb7fe', width: 0.33 },
    ],
    clock: { entranceZ: -0.57, color: '#ffcc7e', width: 0.18 },
    rydberg: { entranceZ: 0.24, color: '#b089fc', width: 0.22 },
    probe: { entranceZ: 1.05, color: '#ffad69', width: 0.30 },
  },
  ramanColor: '#f18de1',
  highlights,
};
