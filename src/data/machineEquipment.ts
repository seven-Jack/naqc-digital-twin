import { munizEvidence } from './hardwareEvidence';
import { MUNIZ_DEMO_WAVELENGTHS_NM as wavelength } from './machineSceneProfile';
import type { SubsystemId } from './twinEvidence';

export const equipmentIds = ['table', 'source', 'slm', 'aod', 'vacuum', 'array', 'gate', 'imaging'] as const;
export type EquipmentId = typeof equipmentIds[number];

export interface EquipmentPart {
  id: string;
  label: string;
  description: string;
}

interface Equipment {
  id: EquipmentId;
  label: string;
  description: string;
  parts: readonly EquipmentPart[];
  boundary: string;
  evidenceHref: `#evidence/${SubsystemId}`;
  sourceLabel: string;
  sourceUrl: string;
}

export const machineEquipment = {
  table: {
    id: 'table', label: '光学平台',
    description: '承载真空腔、光镊和成像组件。台面提供比较各光路相对位置的共同基准。',
    parts: [
      { id: 'surface', label: '安装面', description: '网格标出承载器件的台面和安装方向。' },
      { id: 'frame', label: '台体边框', description: '台面下方的框架支承安装面。' },
      { id: 'feet', label: '支脚', description: '四角的支脚承托台体。' },
    ],
    boundary: '台面、支脚和安装间距采用示意几何，实际尺寸与隔振性能待测。',
    evidenceHref: '#evidence/array', sourceLabel: '装置背景 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  source: {
    id: 'source', label: '原子源',
    description: '位于真空腔上游，在流程中为冷却与俘获提供 ¹⁷¹Yb 原子。',
    parts: [
      { id: 'body', label: '源体', description: '原子供给端位于输送管的上游。' },
      { id: 'nozzle', label: '输送管与出口', description: '从源体延伸至腔口，标出原子进入俘获区域的方向。' },
      { id: 'mount', label: '支架', description: '立柱与底座支承源体和输送管。' },
    ],
    boundary: '源体与管路仅示意供给路径。源温、束流和真空接口尺寸待补。',
    evidenceHref: '#evidence/transport', sourceLabel: '装载流程 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  slm: {
    id: 'slm', label: 'SLM 固定光镊',
    description: '空间光调制器生成固定光镊阵列。演示配置用两套光路在储备阱与科学阱间交接原子。',
    parts: [
      { id: 'modulator', label: '调制器机体', description: '以机体和像素图案示意空间光场的调制。' },
      { id: 'ports', label: '双波长光口', description: `标出 ${wavelength.reservoir} nm 储备阱和 ${wavelength.science} nm 科学阱两路演示光束。` },
      { id: 'relay', label: '中继镜架', description: '位于光口与共用物镜之间，示意光路汇合与转向。' },
    ],
    boundary: '波长取自演示所参考的装置。调制器外形、实际相位图及成像倍率待装置资料确认。',
    evidenceHref: '#evidence/array', sourceLabel: '双波长光镊 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  aod: {
    id: 'aod', label: 'AOD 搬运光镊',
    description: '声光偏转器移动光镊，将已装载的原子送到目标位点。',
    parts: [
      { id: 'deflector', label: '偏转器机体', description: '代表调节光束偏转方向的声光器件。' },
      { id: 'port', label: '出光口', description: `连接通向阵列的 ${wavelength.transport} nm 搬运光路。` },
      { id: 'mount', label: '支承底座', description: '底座和短立柱将偏转器置于演示光轴高度。' },
    ],
    boundary: '搬运动画依据合成轮次。实际射频驱动、位移标度及逐轮存活需同装置日志核对。',
    evidenceHref: '#evidence/transport', sourceLabel: '光镊重排 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  vacuum: {
    id: 'vacuum', label: '真空腔',
    description: '包围冷却、俘获与门操作区域。光镊经下方物镜聚焦到原子平面。',
    parts: [
      { id: 'chamber', label: '腔体与法兰', description: '透明腔壁、上下法兰和连接件围出原子所在空间。' },
      { id: 'pump', label: '抽气接口', description: '腔体侧面的短管标出泵路连接位置。' },
      { id: 'objective', label: '光镊物镜', description: '下方物镜将固定和移动光镊引向原子阵列。' },
    ],
    boundary: '腔壁和法兰为结构示意。腔压、窗口方向和俘获物镜参数待补。',
    evidenceHref: '#evidence/array', sourceLabel: '光镊装置背景 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  array: {
    id: 'array', label: '光镊阵列',
    description: '在同一平面查看位点和当前轮的原子占位。拆开图层可分别观察阱位与原子。',
    parts: [
      { id: 'plane', label: '阵列参考平面', description: '网格和边界给出阵列的行列方向。' },
      { id: 'sites', label: '阱位', description: '小圆环显示可俘获原子的位点，包括空位。' },
      { id: 'atoms', label: '当前帧原子', description: '当前帧已有的原子随这一层显示。回放尚未装载时，此层为空。' },
    ],
    boundary: '轮号、占位和计数随运行记录确定。图层分离距离仅用于观察。',
    evidenceHref: '#evidence/array', sourceLabel: '实验阵列 · Muniz 等图 1', sourceUrl: munizEvidence.url,
  },
  gate: {
    id: 'gate', label: '门与探测激光',
    description: '从阵列侧面送入钟态转移、里德堡激发及荧光探测所用的光。',
    parts: [
      { id: 'clock', label: '钟态转移通道', description: `${wavelength.clock} nm 钟光连接 ¹S₀ 与 ³P₀，用于门序列中的态转移。` },
      { id: 'rydberg', label: '里德堡通道', description: `${wavelength.rydberg} nm 光从亚稳态驱动里德堡激发，用于两原子条件相位操作。` },
      { id: 'probe', label: '探测通道', description: `${wavelength.probe} nm 探测光照亮原子，散射荧光由独立的收集物镜接收。` },
      { id: 'mount', label: '共用支架', description: '底板与支承件示意三路激光相对于交互行的方向。' },
    ],
    boundary: '光路功能和波长参考 Muniz 装置，机箱排列为示意。同门版本的驱动、失谐和相位波形待测。',
    evidenceHref: '#evidence/control', sourceLabel: '钟态转移与门操作 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  imaging: {
    id: 'imaging', label: '荧光收集物镜',
    description: '从原子收集散射光并引向相机，在成像阶段产生可判读的观测。',
    parts: [
      { id: 'objective', label: '收集物镜', description: '朝向原子平面的镜筒和通光孔接收荧光。' },
      { id: 'camera', label: '相机头', description: '镜筒后方的机体表示形成观测帧的探测端。' },
      { id: 'mount', label: '成像支架', description: '横梁和立柱将物镜与相机头置于阵列上方。' },
    ],
    boundary: '收集方向和相机外形为演示布局。探测效率、实际帧时标和判决阈值需用对应装置标定。',
    evidenceHref: '#evidence/readout', sourceLabel: '态选择荧光成像 · Muniz 等', sourceUrl: munizEvidence.url,
  },
} as const satisfies Record<EquipmentId, Equipment>;
