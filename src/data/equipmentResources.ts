import { norciaTransport } from './hardwareEvidence';
import type { EquipmentId } from './machineEquipment';

interface EquipmentResource {
  title: string;
  publisher: string;
  kind: '公众号文章' | '中文讲座' | '报告导读' | '视频讲座' | '视频访谈' | '实验室图像与视频' | '三维装配图' | '实验光路图';
  url: string;
  devices: readonly EquipmentId[];
  guide: string;
}

export const equipmentResources: readonly EquipmentResource[] = [
  {
    title: '两腔输运与阵列装载 · 图 1', publisher: 'Norcia 等 · Atom Computing', kind: '实验光路图',
    url: norciaTransport.figureUrl, devices: ['source', 'vacuum', 'array'],
    guide: '对照图 1a 的 MOT 区和科学区。正文与附录 A 给出两束 532 nm 光形成的输运晶格，以及两个样品位置之间的 30 cm 垂直距离。',
  },
  {
    title: '从冷却腔到计算阵列 · 第 10 页', publisher: 'Atom Computing · 官方白皮书', kind: '实验光路图',
    url: 'https://atom-computing.com/wp-content/uploads/2025/01/Atom-Computing-Whitepaper-2025.pdf#page=10',
    devices: ['source', 'vacuum', 'table'], guide: '阅读团队对 optical elevator 的说明，沿冷却腔、光晶格输运和储备阵列追踪原子。',
  },
  {
    title: '¹⁷¹Yb 门光与读出光的入射方向 · 图 1a', publisher: 'Muniz 等 · Atom Computing', kind: '实验光路图',
    url: 'https://arxiv.org/pdf/2411.11708#page=2', devices: ['slm', 'gate', 'imaging', 'vacuum', 'array'],
    guide: '沿交互行对照黄色、紫色与绿色箭头。附录 A 说明两路固定阱、搬运光与局域 Raman 光共用 NA 0.65 投送物镜，对侧物镜专收 556 nm 荧光。',
  },
  {
    title: '镱双腔装置的 CAD 与水平截面 · 图 1b', publisher: 'Wang 等 · 波恩大学', kind: '三维装配图',
    url: 'https://arxiv.org/pdf/2408.03310#page=2', devices: ['source', 'vacuum', 'table'],
    guide: '对照上图的源区、差分抽气段和科学腔，再看下图原子束进入冷却区的位置。该装置使用 ¹⁷⁴Yb，仅作真空结构参考。',
  },
  {
    title: 'CavYt 镱平台的真空装配', publisher: '因斯布鲁克大学 · Nägerl 实验组', kind: '三维装配图',
    url: 'https://quantummatter.at/cavyt/', devices: ['source', 'vacuum'],
    guide: '查看 Vacuum setup design，沿着原子源定位差分管、真空歧管、泵和科学腔。此装置另有光学腔，此处只参考真空机械连接。',
  },
  {
    title: 'Quantum Science with Tweezer Arrays', publisher: 'Manuel Endres · Caltech', kind: '视频讲座',
    url: 'https://www.youtube.com/watch?v=7o6bbNdKRt0', devices: ['aod', 'array', 'imaging'],
    guide: '对照讲座中的逐原子组装和成像，观察随机装载后如何识别空位并安排搬运。',
  },
  {
    title: '中性原子阵列量子计算机前沿进展介绍', publisher: '墨子沙龙 · 尹璋琦，风云之声授权转载', kind: '公众号文章',
    url: 'https://xueqiu.com/4826147079/304072236', devices: ['aod', 'array', 'gate'],
    guide: '看图一的装载区与相互作用区，再对照本机的流程，区分移动原子、在固定位置换阱以及对邻近原子施加门操作。',
  },
  {
    title: '都2022了，你还不知道中性原子量子计算机吗？', publisher: '光子盒 · 武汉量子技术研究院转载', kind: '公众号文章',
    url: 'https://www.whiqt.org.cn/index.php?a=index&aid=559&c=View&m=home', devices: ['source', 'slm', 'gate'],
    guide: '从激光冷却、光镊到里德堡相互作用，沿文中的示意图对照这三套设备各做什么。',
  },
  {
    title: 'AI助力2024个原子60毫秒精准重排', publisher: '量子位 · 时令', kind: '公众号文章',
    url: 'https://www.qbitai.com/2025/08/321955.html', devices: ['aod', 'slm'],
    guide: '看重排前后的空位。中国科大铷阵列使用动态 SLM 并行搬运，本机演示的镱方案使用一束移动光镊。',
  },
  {
    title: '《自然》一周论文导读 · 6100 个原子的光镊阵列', publisher: '科学网微信公众号 · 冯维维', kind: '公众号文章',
    url: 'https://news.sciencenet.cn/htmlnews/2025/11/554859.shtm', devices: ['array', 'imaging'],
    guide: '读首篇物理学导读。铯实验约有 12000 个阱位，其中俘获超过 6100 个原子。对照图中的空阱和已占位点。',
  },
  {
    title: '量子计算机“补货”：原子装载如何提速近100倍', publisher: '科学网 · iCANX 李一一报告', kind: '报告导读',
    url: 'https://news.sciencenet.cn/htmlnews/2026/10/573037.shtm', devices: ['source', 'aod', 'array'],
    guide: '查看普林斯顿 ¹⁷¹Yb 实验如何从储备区提取新原子，同时保护已有比特。演示中的“一次补位”从本轮已装载的原子中调一枚填空。',
  },
  {
    title: '原子量子计算物理与技术', publisher: '詹明生 · 中国电子学会 CEIC 2024', kind: '中文讲座',
    url: 'https://www.bilibili.com/video/BV1ANs5ePEBa/', devices: ['source', 'table', 'gate'],
    guide: '从原子量子比特的制备和操控理解整机分工，再对照首页的供给、操控与成像路径。',
  },
  {
    title: 'Exploring Many-Body Problems With Arrays of Individual Atoms', publisher: 'Antoine Browaeys · Simons Foundation', kind: '视频讲座',
    url: 'https://www.simonsfoundation.org/events/exploring-many-body-problems-with-arrays-of-individual-atoms/', devices: ['array', 'gate'],
    guide: '从单原子光镊阵列看里德堡激发如何开启相互作用，可与演示里选定的相邻原子对照。',
  },
  {
    title: 'Cold Atoms · Mikhail Lukin', publisher: '632nm · 第 7 期', kind: '视频访谈',
    url: 'https://632nm.com/episodes/cold-atoms-mikhail-lukin-on-quantum-optics-and-neutral-atom-computing', devices: ['gate', 'table'],
    guide: '从 28:39 的里德堡原子章节或 29:46 的整机建造章节开始。',
  },
  {
    title: 'Caltech Team Sets Record With 6,100-Qubit Array', publisher: 'Caltech · Endres 实验组报道', kind: '实验室图像与视频',
    url: 'https://www.caltech.edu/about/news/caltech-team-sets-record-with-6100-qubit-array', devices: ['table', 'vacuum', 'imaging'],
    guide: '用实验室和超高真空腔的实物照片辨认光学平台、腔体及外围光学件。照片来自铯装置。',
  },
];
