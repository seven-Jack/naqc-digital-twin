import { SENOO_READOUT_SOURCE } from './senooReadoutSource';

const { doi, url } = SENOO_READOUT_SOURCE.source;

function channel(label: string, wavelengthNm: number | null, source: string) {
  return { label, wavelengthNm, wavelengthM: wavelengthNm === null ? null : wavelengthNm * 1e-9, source };
}

export const SENOO_APPARATUS_PROFILE = {
  id: 'senoo-767nm-fig2b',
  version: 1,
  isotope: 171,
  evidence: 'published-procedure',
  publication: { doi, url, figures: 'Fig. 1a, Fig. 2a–b, Extended Data Figs. 1–2' },
  array: {
    topology: 'reconfigurable-2d',
    loadingOptic: 'crossed AOD',
    scienceOptic: 'liquid-crystal SLM',
    representedSites: 1,
    sampleSiteId: null,
    sampleCoordinatesM: null,
    sampleTrajectory: null,
    source: 'Methods, Resource-efficient atom preparation; Extended Data Fig. 1a',
  },
  levels: {
    m0: { term: '³P₀', F: 0.5, mF: -0.5 },
    m1: { term: '³P₀', F: 0.5, mF: 0.5 },
    g0: { term: '¹S₀', F: 0.5, mF: -0.5 },
    r0: { term: '³S₁ 系支态', F: 0.5, mF: -0.5, nApprox: 58, source: 'Fig. 1a; Multilevel qubit mapping and loss detection' },
  },
  channels: {
    cooling: channel('556 nm 冷却／预成像', 556, 'Methods, Resource-efficient atom preparation; Extended Data Fig. 1b'),
    loading: channel('532 nm 装载／搬运', 532, 'Methods, Resource-efficient atom preparation'),
    tweezer: channel('767 nm 俘获', 767, 'Methods, Resource-efficient atom preparation; Extended Data Figs. 1–2'),
    clock: channel('578 nm 钟态映射', 578, 'Fig. 2a; Extended Data Figs. 1b and 2f'),
    raman: channel('1389 nm 亚稳态翻转', 1389, 'Extended Data Figs. 1b and 2f'),
    rydberg: channel('302 nm 里德堡驱动', 302, 'Figs. 1a and 2c,f; Extended Data Fig. 4'),
    fluorescence: channel('399 nm 破坏性成像', 399, 'Methods, Fast destructive imaging and three outcome measurements; Extended Data Fig. 2a'),
    camera: channel('荧光收集与相机', null, 'Fig. 2a–b; Extended Data Fig. 2f'),
  },
  typicalSpinImaging: {
    deepTrapDepthOverHHz: 9.6e6,
    opposingBeamAlternationHz: 3e6,
    illuminationDurationS: [15e-6, 17e-6],
    trapRampUpDurationS: 0.5e-3,
    source: 'Methods, Fast destructive imaging and three outcome measurements; Extended Data Fig. 2',
  },
  sampleExposureTimesS: null,
  sampleCameraFrames: null,
  publishedThresholdsCounts: null,
} as const;

type Channel = keyof typeof SENOO_APPARATUS_PROFILE.channels;
type Stage = { id: string; label: string; channels: readonly Channel[]; description: string };

export const SENOO_REPLAY_STAGES = [
  { id: 'loading', label: '冷却与装载', channels: ['cooling', 'loading'],
    description: '从 556 nm 窄线 MOT 装入 532 nm AOD 光镊。' },
  { id: 'preimage', label: '转阱与预成像', channels: ['tweezer', 'cooling', 'camera'],
    description: '转入 767 nm SLM 光镊，进行无破坏预成像。' },
  { id: 'rearrange', label: '光镊重排', channels: ['tweezer', 'loading'],
    description: '使用可移动的 532 nm 光镊逐行压缩。图 2b 样本的位点与路径缺测。' },
  { id: 'prepare', label: '亚稳态制备', channels: ['tweezer'],
    description: '按所选制备组显示 m₁、m₀ 的目标态或无原子对照。图中只显示工序主要步骤。' },
  { id: 'clock-1', label: '第一次钟态映射', channels: ['tweezer', 'clock'],
    description: 'σ⁺ 钟 π 脉冲选择性地把 m₁ 映射到 g₀，m₀ 保留在亚稳态。' },
  { id: 'image-1', label: '第一次曝光', channels: ['tweezer', 'fluorescence', 'camera'],
    description: '在深阱中用 399 nm 光照明。两束反向光交替照射，第一次成像读取已映射的 m₁。' },
  { id: 'rotate', label: '亚稳态翻转', channels: ['tweezer', 'raman'],
    description: '第一次曝光结束。亚稳态 Raman π 脉冲把受保护的 m₀ 翻转到 m₁。' },
  { id: 'clock-2', label: '第二次钟态映射', channels: ['tweezer', 'clock'],
    description: '第二次钟 π 脉冲将翻转后的 m₁ 映射到 g₀。' },
  { id: 'image-2', label: '第二次曝光', channels: ['tweezer', 'fluorescence', 'camera'],
    description: '用相同的 399 nm 破坏性成像读出最初制备的 m₀。' },
  { id: 'decision', label: '双帧判决', channels: [],
    description: '取源表同一列的配对计数，应用探索阈值并显示判决。' },
] as const satisfies readonly Stage[];

export const SENOO_REPLAY_LENGTH = SENOO_REPLAY_STAGES.length;
