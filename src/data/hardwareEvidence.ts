export const munizEvidence = {
  author: 'Muniz 等 · 2025',
  platform: 'Atom Computing · ¹⁷¹Yb 基态核自旋',
  url: 'https://doi.org/10.1103/PRXQuantum.6.020334',
  sources: '图 1、图 3–4、附录 A、D',
  encoding: '¹S₀，|0⟩ 对应 mF = −½，|1⟩ 对应 mF = +½',
  reservoirNm: 483,
  scienceNm: 460,
  shelvingNm: 578,
  rydbergNm: 301.9,
  imagingNm: 556,
  transferMs: 2,
  imageMs: 5,
  trapSites: 84,
  trapRows: 12,
  trapColumns: 7,
  gatePitchUm: 3,
  interactionRowGapUm: 6,
  objectiveNA: 0.65,
  fieldOfViewMm: 0.5,
  apparatusUrl: 'https://arxiv.org/html/2411.11708#A1',
} as const;

export const interactionSiteXUm = Array.from({ length: munizEvidence.trapColumns },
  (_, column) => (column - (munizEvidence.trapColumns - 1) / 2) * munizEvidence.gatePitchUm);

// Predecessor ¹⁷¹Yb apparatus cited in Muniz Appendix A. Distance between the
// trapped atom samples, not a mechanical flange-to-flange specification.
export const norciaTransport = {
  separationM: 0.300,
  wavelengthNm: 532,
  sourceUrl: 'https://doi.org/10.1103/PhysRevX.13.041034',
  figureUrl: 'https://arxiv.org/pdf/2401.16177#page=2',
} as const;

export const hardwareComparisons = [
  {
    author: 'Jenkins 等 · 2022',
    platform: 'JILA · ¹⁷¹Yb 基态核自旋',
    topic: '单轮增强装载',
    data: '10 × 10 阵列 · 92.73(8)% 平均单位点占据',
    detail: '532 nm 光镊中使用 35 ms 增强装载脉冲。相同方法用于单阱时测得 96.0(1.4)%。指标按位点计。',
    sources: '第 II–III 节、图 2',
    url: 'https://doi.org/10.1103/PhysRevX.12.021027',
  },
  {
    author: 'Norcia 等 · 2024',
    platform: 'Atom Computing · ¹⁷¹Yb 腔增强光晶格',
    topic: '多轮装载与占位成像',
    data: '1,225 个目标阱位 · 重排后典型填充 99%',
    detail: '在腔增强光晶格中进行 7 ms 占位成像，单次成像存活率为 99.8(1)%。填充率来自多轮装载及重排。',
    sources: '图 2–3',
    url: 'https://doi.org/10.1103/PRXQuantum.5.030316',
  },
  {
    author: 'Reichardt 等 · 2025',
    platform: 'Atom Computing / Microsoft · ¹⁷¹Yb',
    topic: '物理比特与逻辑编码',
    data: '256 个物理比特 · 24 个逻辑比特纠缠',
    detail: '使用 [[4,2,2]] 码，以 48 个原子实现该纠缠实验。丢失位置可用于解码，逻辑比特数取决于编码和任务。',
    sources: '摘要、逻辑纠缠实验',
    url: 'https://arxiv.org/abs/2411.11822',
  },
  {
    author: 'Senoo 等 · 2026',
    platform: 'JILA · ¹⁷¹Yb 亚稳态核自旋',
    topic: '目标布居与相干性',
    data: '20 原子 GHZ · 目标布居 78(3)% · 保真度 51(4)%',
    detail: '由里德堡流形的交替序态制备并映射到 ³P₀，数据使用丢失检测。保真度还用到目标两位串间的相干性。',
    sources: '图 4c、源数据',
    url: 'https://www.nature.com/articles/s41567-026-03258-8',
  },
  {
    author: 'Li 等 · 2026',
    platform: 'Princeton · ¹⁷¹Yb 亚稳态核自旋',
    topic: '相干存储期间补充原子',
    data: '最高 500 次提取/s · 30 次阵列初始化/s',
    detail: '第二个速率是随机占据的新阵列准备频率，包含单原子制备、无损成像和初始化。该协议用亚稳态保护已有量子信息。',
    sources: 'Science 摘要',
    url: 'https://doi.org/10.1126/science.adz9952',
  },
  {
    author: 'Bluvstein 等 · 2025 在线发表',
    platform: 'Harvard / MIT / QuEra · ⁸⁷Rb 超精细钟态',
    topic: '分区架构与可判别丢失的读出',
    data: '最多 448 个原子 · 0.46(4)% 读出翻转 · 0.24(2)% 丢失',
    detail: '用自旋到位置转换分别识别两种自旋态与原子丢失，结合 AOD 搬运和分区控制。',
    sources: '图 1b、Methods',
    url: 'https://doi.org/10.1038/s41586-025-09848-5',
  },
] as const;
