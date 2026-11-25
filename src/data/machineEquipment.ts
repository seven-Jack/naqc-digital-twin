import { munizEvidence, norciaTransport } from './hardwareEvidence';
import { MUNIZ_DEMO_WAVELENGTHS_NM as wavelength } from './machineSceneProfile';

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
  sourceLabel: string;
  sourceUrl: string;
}

export const machineEquipment = {
  table: {
    id: 'table', label: '光学平台',
    description: '承载真空腔、光镊和成像组件。台面提供比较各光路相对位置的共同基准。',
    parts: [
      { id: 'surface', label: '安装面', description: '孔阵列给出镜架与底座的安装位置。' },
      { id: 'frame', label: '台体边框', description: '台面下方的框架支承安装面。' },
      { id: 'feet', label: '支脚', description: '四角的支脚承托台体。' },
    ],
    boundary: '台面、支脚和安装间距采用示意几何，实际尺寸与隔振性能待测。',
    sourceLabel: '装置背景 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  source: {
    id: 'source', label: '原子源',
    description: '预冷的 ¹⁷¹Yb 原子束先进入磁光阱（MOT）。冷却完成后，两束相向传播的 532 nm 光形成移动晶格，沿差分抽气管将原子云送至科学区。',
    parts: [
      { id: 'body', label: '原子束与冷却腔', description: '在同团队前序装置中，399 nm 光先俘获原子，556 nm 窄线冷却进一步降低温度。窗口围绕冷原子样品。' },
      { id: 'nozzle', label: '差分输运管', description: '独立的冷却腔与科学腔通过差分抽气管连通。300 mm 对应两个原子样品位置的垂直距离，管长与内径待核。' },
      { id: 'mount', label: '支架', description: '立柱与底座支承源体和输送管。' },
    ],
    boundary: '垂直间距采用 Muniz 附录 A 所引 Norcia 前序平台的 300 mm。画面取向上为输运方向，源体、法兰与支架采用示意外形。',
    sourceLabel: '双真空区与移动晶格 · Norcia 等附录 A', sourceUrl: norciaTransport.sourceUrl,
  },
  slm: {
    id: 'slm', label: 'SLM 固定光镊',
    description: '两路空间光调制器（SLM）光场生成位置重合的储备阱和科学阱。交接时，一路功率渐降，另一路渐升，原子留在同一位置。',
    parts: [
      { id: 'modulator', label: '调制器机体', description: '两路调制头分别形成储备阱与科学阱光场，输出经中继镜汇入共用物镜。' },
      { id: 'ports', label: '双波长光口', description: `标出 ${wavelength.reservoir} nm 储备阱和 ${wavelength.science} nm 科学阱两路演示光束。` },
      { id: 'relay', label: '中继镜架', description: 'Muniz 装置用一组二向色镜合并固定光镊、搬运光镊和局域拉曼光，再送入同一物镜。' },
    ],
    boundary: '波长取自演示所参考的装置。调制器外形、实际相位图及成像倍率待装置资料确认。',
    sourceLabel: '双波长光镊 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  aod: {
    id: 'aod', label: 'AOD 搬运光镊',
    description: '一对正交声光偏转器（AOD）分别控制光束在两个方向的偏转。一束 483 nm 移动光镊依次把原子送入目标阱位。',
    parts: [
      { id: 'deflector', label: '偏转器机体', description: '串接的两只偏转器分别控制一个方向。改变射频驱动，就能移动聚焦后的光斑。' },
      { id: 'port', label: '出光口', description: `连接通向阵列的 ${wavelength.transport} nm 搬运光路。` },
      { id: 'mount', label: '支承底座', description: '底座和短立柱将偏转器置于演示光轴高度。' },
    ],
    boundary: '搬运动画依据合成轮次。实际射频驱动、位移标度及逐轮存活需同装置日志核对。',
    sourceLabel: '光镊重排 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  vacuum: {
    id: 'vacuum', label: '真空腔',
    description: '科学腔经差分管接收冷原子。两侧相向的物镜共用焦平面，一只投送光镊和局域 Raman 光，另一只收集 556 nm 荧光。泵路单独连接腔体。',
    parts: [
      { id: 'chamber', label: '腔体与法兰', description: '玻璃窗为相向的物镜和交互行方向的门光提供通光口。两侧铜色线圈的轴线平行于交互行。' },
      { id: 'pump', label: '抽气接口', description: '科学腔后方的腔颈连接真空歧管。旁支法兰连接抽气端，给物镜留出空间。' },
      { id: 'objective', label: '光镊物镜', description: '固定光镊、移动光镊和局域拉曼光共用这只物镜。Muniz 装置的投送物镜数值孔径为 0.65，视场为 0.5 mm。' },
    ],
    boundary: '相对光轴依据 Muniz 图 1a 和附录 A。物镜相对重力的安装角、科学腔尺寸、线圈与泵路外形采用示意布置。',
    sourceLabel: '光镊装置背景 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  array: {
    id: 'array', label: '光镊阵列',
    description: '在同一平面查看位点和当前轮的原子占位。拆开图层可分别观察阱位与原子。',
    parts: [
      { id: 'plane', label: '阵列参考平面', description: '放大视图的网格用于辨认行列。整机视图中，原子悬在两只物镜之间的光镊焦平面。' },
      { id: 'sites', label: '阱位', description: '小圆环显示可俘获原子的位点，包括空位。' },
      { id: 'atoms', label: '当前帧原子', description: '当前帧已有的原子随这一层显示。回放尚未装载时，此层为空。' },
    ],
    boundary: 'Muniz 文献阵列为 12 行 × 7 列。交互行内中心距为 3 μm，与相邻行相隔 6 μm。运行回放使用独立的 6 行 × 8 列演示阵列。',
    sourceLabel: '实验阵列 · Muniz 等图 1', sourceUrl: munizEvidence.url,
  },
  gate: {
    id: 'gate', label: '门与探测激光',
    description: '沿阵列交互行，578 nm 态转移光与 301.9 nm 里德堡光同向入射，556 nm 探测光从对面入射。折转镜把三路光引到对应的入射端。',
    parts: [
      { id: 'clock', label: '钟态转移通道', description: `${wavelength.clock} nm 钟光连接 ¹S₀ 与 ³P₀，用于门序列中的态转移。` },
      { id: 'rydberg', label: '里德堡通道', description: `${wavelength.rydberg} nm 光从亚稳态驱动里德堡激发，用于两原子条件相位操作。` },
      { id: 'probe', label: '探测通道', description: `${wavelength.probe} nm 探测光照亮原子，散射荧光由独立的收集物镜接收。` },
      { id: 'mount', label: '共用支架', description: '底板与支承件示意三路激光相对于交互行的方向。' },
    ],
    boundary: '交互行处的相对传播方向与波长依据 Muniz 图 1a。外围折转次数、准直器与镜架位置为展示布置。',
    sourceLabel: '钟态转移与门操作 · Muniz 等', sourceUrl: munizEvidence.url,
  },
  imaging: {
    id: 'imaging', label: '荧光收集物镜',
    description: '556 nm 探测光从侧面照亮原子。对侧物镜收集散射荧光并送入相机。在回放中逐位点查看占位或量子态读出。',
    parts: [
      { id: 'objective', label: '收集物镜', description: '朝向原子平面的镜筒和通光孔接收荧光。' },
      { id: 'camera', label: '相机头', description: '镜筒后方的机体表示形成观测帧的探测端。' },
      { id: 'mount', label: '成像支架', description: '支架沿收集光轴托住物镜和相机，中央通光孔朝向科学腔。' },
    ],
    boundary: 'Muniz 等附录 A 中，探测光沿 518 G 磁场方向入射，σ− 光选择 |0⟩ 亮态。相机视图显示合成记录的判读，原始像素、光子计数和阈值需同装置数据。',
    sourceLabel: '态选择荧光成像 · Muniz 等', sourceUrl: munizEvidence.url,
  },
} as const satisfies Record<EquipmentId, Equipment>;
