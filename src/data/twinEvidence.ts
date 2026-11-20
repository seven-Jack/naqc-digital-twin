import { MUNIZ_DEMO_PROFILE } from './machineProfile';
import type { EquipmentId } from './machineEquipment';
import { munizEvidence } from './hardwareEvidence';
import { SENOO_APPARATUS_PROFILE } from './senooApparatus';
import { SENOO_READOUT_SOURCE } from './senooReadoutSource';
import { atomicData } from './atomicData';
import calWorkbook from '../../references/templates/Senoo_双曝光逐轮实测模板_CAL.xlsx?url';
import valWorkbook from '../../references/templates/Senoo_双曝光逐轮实测模板_VAL.xlsx?url';
import bellSchedule from '../../references/templates/Senoo_Bell_独立实测交错排程.csv?url';
import czSchedule from '../../references/templates/Senoo_CZ_独立门响应先导排程.csv?url';
import grbSchedule from '../../references/templates/Senoo_CZ_gRB_丢失先导排程.csv?url';

export const evidenceKinds = {
  demo: '演示配置', literature: '文献复现', synthetic: '合成验收', comparison: '跨装置对照',
} as const;
export type EvidenceKind = keyof typeof evidenceKinds;
export type EvidenceFilter = 'all' | EvidenceKind;
export type SubsystemId = 'array' | 'transport' | 'control' | 'readout' | 'bell';

export interface EvidenceLink {
  label: string;
  href: string;
  filename?: string;
}

interface EvidenceRecord {
  kind: EvidenceKind;
  title: string;
  detail: string;
  links?: EvidenceLink[];
}

interface Subsystem {
  id: SubsystemId;
  equipment: readonly EquipmentId[];
  name: string;
  components: string;
  operation: string;
  records: EvidenceRecord[];
  pending: { title: string; detail: string; links?: EvidenceLink[] }[];
}

const profile = MUNIZ_DEMO_PROFILE;
const apparatus = SENOO_APPARATUS_PROFILE;
const groups = SENOO_READOUT_SOURCE.groups;
const spinPairCount = groups.reduce((total, group) => total + group.points.length, 0);
const paper = (label: string) => ({ label, href: apparatus.publication.url });

export const twinSubsystems: readonly Subsystem[] = [
  {
    id: 'array', name: '俘获与阵列', components: '光镊阵列 · 真空腔 · 钟激光',
    equipment: ['array', 'slm', 'vacuum', 'table'],
    operation: '将原子装入储备阱，在计算前完成阱间交接。可在钟跃迁模型中改变光镊功率、束腰与频率补偿，观察失谐和布居。',
    records: [
      { kind: 'demo', title: profile.label,
        detail: `整机演示使用 ${profile.array.rows} × ${profile.array.columns} 个示意位点和理想电路。储备阱与科学阱的波长取自 Muniz 等的 ¹⁷¹Yb 基态核自旋装置，几何和播放时长由演示配置给定。`,
        links: [{ label: '查看整机阵列', href: '#machine' }, { label: 'Muniz 等 · 图 1 与附录 A', href: munizEvidence.url }] },
      { kind: 'demo', title: '532 nm 光镊中的钟跃迁模型',
        detail: '对 ¹⁷¹Yb 的 ¹S₀ ↔ ³P₀ 跃迁计算单个位点的差分光移及理想双能级演化。532 nm 极化率使用 ¹⁷⁴Yb 经验模型的近似输入。',
        links: [{ label: '打开钟跃迁子系统', href: '#clock' }, { label: '极化率模型来源', href: atomicData.sourceUrl }] },
    ],
    pending: [{ title: '正式整机装置配置', detail: '需用目标装置的阱位几何、光束参数、时序与版本替换演示配置。483/460 nm 保留作演示。' }],
  },
  {
    id: 'transport', name: '装载与搬运', components: 'AOD 搬运光镊 · SLM 目标阵列 · 占位相机',
    equipment: ['source', 'aod'],
    operation: '比较搬运前后占位帧与目标位，沿原轮号追踪补位、原子存活和被排除的尝试。',
    records: [
      { kind: 'literature', title: 'Senoo 光镊重排流程',
        detail: `装置使用 ${apparatus.channels.loading.wavelengthNm} nm 装载光镊和 ${apparatus.channels.tweezer.wavelengthNm} nm 科学阱。公开资料给出装载、转阱、预成像和逐行压缩的顺序。`,
        links: [{ label: '查看论文工序', href: '#senoo/readout' }, paper('Senoo 等 · 扩展数据图 1')] },
      { kind: 'synthetic', title: '占位检查与一次补位',
        detail: '整机中的合成 Bell 协议先检查首帧占位，有空位时补一次。补位失败的尝试跳过门和读出，保留尝试与有效读出各自的分母。',
        links: [{ label: '选择一次补位协议', href: '#machine/config' }] },
      { kind: 'comparison', title: 'Knottnerus ⁸⁸Sr · S23/P19',
        detail: '固定 P1 的 3×3 窗口，从两个曝光帧的原像素复算，并以原轮号逐位对照 Pic1／Pic2 日志。此处展示同序列留出结果。' },
    ],
    pending: [{ title: '同装置装载率、搬运存活与满阵列率', detail: '需同装置搬运前后占位帧索引、位点几何、控制器时标、逐轮存活结局及独立批次。',
      links: [{ label: '打开输运日志导入', href: '#senoo/readout?panel=transport' }] }],
  },
  {
    id: 'control', name: '单原子与两原子门', components: '里德堡驱动 · 失谐与相位控制 · 两原子阻塞',
    equipment: ['gate'],
    operation: '从单原子布居响应检查驱动，再按原子间距和磁场方向核对两原子能移，并按门深度查看 CZ 门表征。',
    records: [
      { kind: 'literature', title: '单原子 Rabi 与双原子阻塞',
        detail: `在 Senoo 的 ¹⁷¹Yb 亚稳态比特中，${apparatus.channels.rydberg.wavelengthNm} nm 驱动耦合到里德堡态。图 2c 的两态布居保留不对称误差条。扩展图 5f 按距离、磁场方向比较能移，扩展图 4f 保留两组频率的逐窗残差。`,
        links: [{ label: '核对单原子 Rabi', href: '#senoo/rabi' }, { label: '核对双原子阻塞', href: '#senoo/pair' }] },
      { kind: 'literature', title: '图 3b–d 的 CZ 门表征',
        detail: '按门深度比较三种筛选下的 gRB 成功率、每门保真度、单站点与相关丢失。复现保留误差条、源单元格和反推分母。',
        links: [{ label: '打开 CZ 表征', href: '#senoo/characterization' }, paper('Senoo 等 · 图 2、图 3 与扩展数据')] },
    ],
    pending: [
      { title: '同版本 CZ 波形及独立响应', detail: '需同门版本的驱动幅度、失谐、相位、相互作用标定、门响应及 gRB 记录。',
        links: [{ label: '独立响应排程 CSV', href: czSchedule, filename: 'Senoo_CZ_独立门响应先导排程.csv' },
          { label: 'gRB 与丢失排程 CSV', href: grbSchedule, filename: 'Senoo_CZ_gRB_丢失先导排程.csv' }] },
      { title: '扩展图 4f 的频率选解', detail: '保留源表自由拟合和刊版固定频率两组结果。复核刊版选解需要原拟合时标、权重、相位约束及绘图设置。' },
    ],
  },
  {
    id: 'readout', name: '双曝光读出', components: '态映射激光 · 荧光收集 · 相机',
    equipment: ['imaging'],
    operation: '依次映射 m₁ 和 m₀，比较同一位点的两帧荧光计数，追踪丢失、歧义和有效判决分母。',
    records: [
      { kind: 'literature', title: '图 2b 配对计数',
        detail: `Senoo 的 ${SENOO_READOUT_SOURCE.source.tweezerWavelengthNm} nm 光镊中，${groups.length} 个制备组共 ${spinPairCount} 对公开计数。图源表按列配对，保留 m₁、m₀ 和空位各组。站内阈值用于探索判决。`,
        links: [{ label: '回放双曝光计数', href: '#senoo/readout' }, paper('Senoo 等 · 图 2a–b')] },
      { kind: 'synthetic', title: 'SYN-CAL 与 SYN-VAL',
        detail: '合成验收覆盖逐轮配对、缺帧、曝光时序、筛选及独立验证。只在 SYN-CAL 选阈值，按冻结规则对 SYN-VAL 统计错标、丢失和歧义。',
        links: [{ label: '打开逐轮工作簿导入', href: '#senoo/readout?panel=workbook' }] },
    ],
    pending: [
      { title: 'CAL 标定批次', detail: '先导排程含 m₁、m₀、空位三组，各 100 轮。需已填工作簿和相机、控制器原始日志，核对实际阈值与筛选分母后完成 CAL。',
        links: [{ label: '下载 CAL 先导工作簿', href: calWorkbook, filename: 'Senoo_双曝光逐轮实测模板_CAL.xlsx' }] },
      { title: 'VAL 独立验证批次', detail: 'CAL 读出规则冻结后再开 VAL。保留独立运行身份、相同工况、逐帧时标与各组分母。',
        links: [{ label: '下载 VAL 工作簿', href: valWorkbook, filename: 'Senoo_双曝光逐轮实测模板_VAL.xlsx' }] },
    ],
  },
  {
    id: 'bell', name: 'Bell 态与整机验证', components: '双比特门 · 基旋转 · 联合读出',
    equipment: ['array', 'gate'],
    operation: '在两种制备路径下查看布居和奇偶振荡，比较亚稳态与钟比特映射后的目标态重叠。',
    records: [
      { kind: 'literature', title: 'CZ 与阻塞两条 Bell 制备路径',
        detail: 'Senoo 图 1c→1d 回放 CZ 制备与钟态映射。图 2f 回放阻塞制备，再从里德堡态映射到亚稳态与钟态。观测保留丢失筛选，分母从公开误差条反推。',
        links: [{ label: '回放 CZ Bell', href: '#senoo/cz' }, { label: '回放阻塞 Bell', href: '#senoo/pxp' }, paper('Senoo 等 · 图 1c–d、2f')] },
      { kind: 'synthetic', title: '三个测量设置的联合预测',
        detail: '合成记录核对 ZZ、+π/4、−π/4 三组的布居、相干与目标态重叠，并分别保留有效轮次。' },
    ],
    pending: [{ title: '独立 Bell 批次', detail: '观测前冻结预测、容差与最低有效轮次。需实际相位标定、原始双帧、筛选和经独立验证的读出规则版本。',
      links: [{ label: '下载三组交错排程 CSV', href: bellSchedule, filename: 'Senoo_Bell_独立实测交错排程.csv' }] }],
  },
];

export function evidenceRoute(id: SubsystemId, filter: EvidenceFilter = 'all') {
  return `#evidence/${id}${filter === 'all' ? '' : `?kind=${filter}`}`;
}

export function resolveEvidenceRoute(hash: string) {
  const [path, query] = hash.split('?');
  const kind = new URLSearchParams(query).get('kind') ?? '';
  const filter: EvidenceFilter = Object.hasOwn(evidenceKinds, kind) ? kind as EvidenceKind : 'all';
  const visible = twinSubsystems.filter(entry => filter === 'all' || entry.records.some(record => record.kind === filter));
  const selected = visible.find(entry => path === `#evidence/${entry.id}`) ?? visible[0];
  return { filter, visible, selected };
}
