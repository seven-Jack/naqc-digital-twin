import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Aperture, ArrowDownToLine, ArrowDownUp, ArrowUpRight, Atom, AudioWaveform, BookOpen, Boxes, Camera, ChevronDown, ChevronRight,
  CircleDot, CircuitBoard, Crosshair, Focus, Info, ListOrdered, Move, Pause, Play, RotateCcw,
  ScanLine, SkipForward, Snowflake, Zap, type LucideIcon,
} from 'lucide-react';
import { HardwareEvidence } from './HardwareEvidence';
import { SenooReadoutSource } from './SenooReadoutSource';
import { SenooPopulationSource } from './SenooPopulationSource';
import { munizEvidence as reference } from '../data/hardwareEvidence';
import { MUNIZ_DEMO_PROFILE, type MachineStage } from '../data/machineProfile';
import { Dialog } from '../components/Dialog';
import { importMachineRun } from '../physics/machineRunImport';
import {
  CIRCUITS, createMachineRun, DEFAULT_MACHINE_CONFIG, machineExport, machineFrame,
  type MachineConfig, type MachineFrame, type MachineProtocol, type MachineRun,
} from '../physics/quantumComputer';
import { QuantumComputerScene } from '../scene/QuantumComputerScene';
import './machine-dashboard.css';

const machineTitle = '中性原子量子计算机整机数字孪生';

const stageIcons: Record<string, LucideIcon> = {
  cooling: Snowflake, loading: Focus, rearrangement: Move, preparation: Crosshair, transfer: ArrowDownUp, gates: Zap,
  analysis: ScanLine, return: ArrowDownUp, readout: Camera,
  'occupancy-check': Camera, replenishment: Move, 'occupancy-recheck': Camera,
};

const circuitDetails: Record<MachineConfig['circuit'], { detail: string; target: string; icon: LucideIcon }> = {
  bell: { detail: '双量子比特纠缠', target: '(|00⟩ + |11⟩) / √2', icon: CircuitBoard },
  ghz: { detail: '三量子比特纠缠', target: '(|000⟩ + |111⟩) / √2', icon: Boxes },
  superposition: { detail: '独立的单比特叠加', target: '|+⟩ ⊗ |+⟩', icon: AudioWaveform },
};

const percent = (p: number) => `${(p * 100).toFixed(Number.isInteger(p * 100) ? 0 : 1)}%`;

function rangeFill(value: number, max = 1): CSSProperties {
  return { '--md-fill': percent(value / max) } as CSSProperties;
}

function PanelHeader({ icon: Icon, children, aside }: { icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return <div className="md-panel-header">
    <h2><Icon size={16} strokeWidth={1.7} />{children}</h2>
    {aside}
  </div>;
}

function SectionInfo() {
  return <div className="md-model-info">
    <p>演示以 Muniz 等的 ¹⁷¹Yb 基态核自旋装置为流程参考。光路为示意，时间轴使用浏览器播放时间。</p>
    <ul>
      <li>每次尝试独立装载和重排。只有计算位点完全填满，才执行量子线路。三维场景跟踪第 1 次尝试，右侧统计汇总整批尝试。</li>
      <li>Bell 一次补位流程用合成占位观测触发至多一次储备区搬运。观测、判决和跳过操作随播放时间显示，复查填满后继续线路。</li>
      <li>门操作在科学阱中进行。测量 X 基时，在回到储备阱前对每个比特加一个 H，把 X 的本征态转成可用荧光判别的 Z 基布居。H 可用局部拉曼 Xπ/₂ 和虚拟 Z 旋转编译。</li>
      <li>每个已装配寄存器的原子独立发生模拟丢失，由理想末端存活检查标记。完整寄存器按 Born 概率采样，并独立模拟探测位翻转。</li>
      <li>实验通过多幅荧光图像和中间的抽运步骤区分基态、钟态泄漏与丢失。本页近似为理想存活检查和二值判别，暂未建模钟态泄漏、串扰或脉冲动力学。</li>
      <li>Z 基位串用于查看目标态布居；X 基奇偶相关对相干性敏感。乘积态 |++⟩ 也给出理想的 +1，实验保真度还需要针对目标态的更多观测量。</li>
    </ul>
    <div className="source-links">
      <a href={reference.url} target="_blank" rel="noreferrer">Muniz 等 · 基态核自旋量子门 ↗</a>
      <a href="https://doi.org/10.1038/s41567-026-03258-8" target="_blank" rel="noreferrer">Senoo 等 · 纠缠与相干性读出 ↗</a>
    </div>
  </div>;
}

function Sequence({ stages, frame, seek }: { stages: readonly MachineStage[]; frame: MachineFrame; seek: (time: number) => void }) {
  return <section className="md-panel md-sequence">
    <PanelHeader icon={ListOrdered}>实验流程</PanelHeader>
    <ol>
      {stages.map((stage, index) => {
        const Icon = stageIcons[stage.id] ?? CircleDot;
        const current = frame.stageIndex === index;
        const passed = frame.stageIndex > index || frame.complete;
        return <li key={stage.id}>
          <button type="button" className={current ? 'md-current' : ''} aria-current={current ? 'step' : undefined}
            data-stage-status={current && frame.stageSkipped ? 'skipped' : undefined}
            onClick={() => seek(stage.startMs)}>
            <span className="md-step-icon"><Icon size={15} /></span>
            <span className="md-step-text">{stage.label}</span>
            <span className={passed ? 'md-step-passed' : ''}>{current && frame.stageSkipped ? '已跳过' : String(index + 1).padStart(2, '0')}</span>
          </button>
        </li>;
      })}
    </ol>
  </section>;
}

function CircuitDiagram({ run, frame }: { run: MachineRun; frame: MachineFrame }) {
  const xBasis = run.config.basis === 'X';
  return <section className="md-panel md-circuit">
    <PanelHeader icon={CircuitBoard} aside={<code>{circuitDetails[run.circuit.id].target}</code>}>
      量子线路
    </PanelHeader>
    <div className="md-circuit-scroll">
      <div className="md-circuit-grid" role="img"
        aria-label={`量子线路，${run.circuit.qubits} 个量子比特，${run.circuit.gates.map(gate => `${gate.name} ${gate.qubits.map(q => `q${q}`).join(' 和 ')}`).join('，')}，${xBasis ? '各位加 H 后做 Z 基荧光读出，实现 X 基测量' : 'Z 基荧光读出'}`}
        style={{ gridTemplateColumns: `52px repeat(${run.circuit.gates.length + (xBasis ? 2 : 1)}, minmax(31px, 1fr))` }}>
        {Array.from({ length: run.circuit.qubits }, (_, q) => <div className="md-wire-row" key={q}>
          <span className="md-wire-label">q<sub>{q}</sub> <span>|0⟩</span></span>
          {run.circuit.gates.map((gate, index) => {
            const addressed = gate.qubits.includes(q);
            const joined = gate.name === 'CZ' && q >= Math.min(...gate.qubits) && q < Math.max(...gate.qubits);
            return <div className="md-wire" key={index}>
              {joined && <i className="md-cz-link" aria-hidden="true" />}
              {addressed && <span className={`md-gate ${gate.name === 'CZ' ? 'md-cz' : ''} ${frame.gateIndex === index ? 'md-gate-active' : ''}`}>
                {gate.name === 'CZ' ? '●' : 'H'}
              </span>}
            </div>;
          })}
          {xBasis && <div className="md-wire"><span title="X 基变换" className={`md-gate md-basis-gate ${frame.stage.id === 'analysis' && frame.representativeReady ? 'md-gate-active' : ''}`}>H</span></div>}
          <div className="md-wire"><span title="计算基荧光测量" className={`md-gate md-measure ${frame.representativeBitstring ? 'md-gate-active' : ''}`}><ScanLine size={12} /></span></div>
        </div>)}
      </div>
    </div>
  </section>;
}

function RunSettings({ config, protocol, update, setProtocol, imported, sourceControl }: {
  config: MachineConfig;
  protocol: MachineProtocol;
  update: (patch: Partial<MachineConfig>) => void;
  setProtocol: (protocol: MachineProtocol) => void;
  imported: boolean;
  sourceControl: ReactNode;
}) {
  return <section className="md-panel md-settings">
    <PanelHeader icon={CircuitBoard} aside={<span className="md-panel-hint">{imported ? '本地记录' : '仿真输入'}</span>}>运行配置</PanelHeader>
    {sourceControl}
    <fieldset className="md-settings-body" aria-label="运行参数" disabled={imported}>
      <div className="md-field">
        <label htmlFor="machine-protocol">实验协议</label>
        <select id="machine-protocol" value={protocol} onChange={event => setProtocol(event.target.value as MachineProtocol)}>
          <option value="standard">标准流程</option>
          <option value="bell-replenishment">Bell · 一次补位</option>
        </select>
      </div>
      {protocol === 'bell-replenishment' && <p className="md-protocol-note">合成 Bell 案例。初次重排优先填 q0，检查空位后最多补位一次。</p>}
      <div className="md-circuit-options" role="group" aria-label="量子电路">
        {CIRCUITS.map(circuit => {
          const { icon: Icon, detail } = circuitDetails[circuit.id];
          return <button type="button" key={circuit.id} aria-pressed={config.circuit === circuit.id}
            onClick={() => update({ circuit: circuit.id })}>
            <Icon size={17} strokeWidth={1.7} /><span><strong>{circuit.label}</strong><small>{detail}</small></span>
            <ChevronRight className="md-option-chevron" size={14} />
          </button>;
        })}
      </div>
      <div className="md-field">
        <label htmlFor="machine-basis">测量基</label>
        <select id="machine-basis" value={config.basis} onChange={event => update({ basis: event.target.value === 'X' ? 'X' : 'Z' })}>
          <option value="Z">Z · 布居</option>
          <option value="X">X · 相关</option>
        </select>
      </div>
      <div className="md-field">
        <label htmlFor="machine-shot-config">尝试次数</label>
        <select id="machine-shot-config" value={config.shots} onChange={event => update({ shots: Number(event.target.value) })}>
          {[64, 256, 1024, 4096].includes(config.shots) ? null : <option value={config.shots}>{config.shots}</option>}
          {[64, 256, 1024, 4096].map(shots => <option key={shots} value={shots}>{shots}</option>)}
        </select>
      </div>
      <label className="md-range">
        <span>单阱装载概率 <output>{percent(config.loadProbability)}</output></span>
        <input type="range" min="0" max="1" step=".01" value={config.loadProbability}
          style={rangeFill(config.loadProbability)} aria-label="单阱装载概率" onChange={event => update({ loadProbability: Number(event.target.value) })} />
      </label>
      <label className="md-range">
        <span>单比特读出翻转 <output>{percent(config.readoutError)}</output></span>
        <input type="range" min="0" max=".5" step=".005" value={config.readoutError}
          style={rangeFill(config.readoutError, .5)} aria-label="单比特读出翻转" onChange={event => update({ readoutError: Number(event.target.value) })} />
      </label>
      <label className="md-range">
        <span>单原子末端丢失 <output>{percent(config.atomLossProbability)}</output></span>
        <input type="range" min="0" max="1" step=".005" value={config.atomLossProbability}
          style={rangeFill(config.atomLossProbability)} aria-label="单原子丢失概率" onChange={event => update({ atomLossProbability: Number(event.target.value) })} />
      </label>
      <div className="md-field md-seed">
        <span>随机种子 <code>{config.seed}</code></span>
        <button type="button" onClick={() => update({ seed: (config.seed + 1) >>> 0 })}>更换</button>
      </div>
    </fieldset>
  </section>;
}

function OccupancyStatus({ frame }: { frame: MachineFrame }) {
  const occupancy = frame.occupancy;
  if (!occupancy) return null;
  const decision = occupancy.decisions.at(-1);
  const observation = occupancy.observations.at(-1);
  const decisions = {
    replenish: '发现空位，安排一次补位。',
    continue: '计算位点已填满，继续 Bell 电路。',
    skip: '补位后仍有空位，跳过门和读出。',
  };
  const replenishment = {
    pending: '等待补位',
    moving: '正在搬运',
    moved: '补位完成，等待复查',
    'no-source': '储备区没有可用原子',
  };
  let status = decision ? decisions[decision.result] : '等待占位观测。';
  if (occupancy.exposing) status = '正在采集合成占位观测。';
  else if (observation && observation.id !== decision?.observationId) {
    status = `${observation.phase === 'initial' ? '初检' : '复查'}观测已到达，等待判决。`;
  }
  const attemptLabel = `第 ${frame.attemptIndex + 1} 次尝试`;
  return <section className="md-occupancy" aria-label={`${attemptLabel}的占位检查`}
    data-testid="machine-occupancy" data-decision={decision?.result ?? 'pending'}
    data-replenishment={occupancy.replenishment ?? undefined}>
    <div className="md-occupancy-heading"><Camera size={13} /><strong>占位检查</strong><span>{attemptLabel}</span></div>
    <div className="md-occupancy-observations">
      {occupancy.observations.map(observation => <span key={observation.phase}
        data-testid={`machine-occupancy-${observation.phase}`}>
        {observation.phase === 'initial' ? '初检' : '复查'} <code>{observation.sites.filter(site => site.occupied).length} / {observation.sites.length}</code>
      </span>)}
    </div>
    <p>{status}</p>
    {occupancy.replenishment && frame.stage.id === 'replenishment' && <small>{replenishment[occupancy.replenishment]}</small>}
  </section>;
}

function Readout({ run, frame, download, selectAttempt }: {
  run: MachineRun; frame: MachineFrame; download: () => void; selectAttempt: (index: number) => void;
}) {
  const xBasis = run.config.basis === 'X';
  const evenCount = run.outcomes.reduce((total, outcome, index) =>
    outcome.bitstring.replace(/0/g, '').length % 2 === 0 ? total + frame.outcomeCounts[index] : total, 0);
  const xCorrelation = frame.visibleShots ? (2 * evenCount / frame.visibleShots - 1).toFixed(3) : '—';
  return <section className="md-panel md-readout" data-testid="machine-results">
    <PanelHeader icon={AudioWaveform} aside={<button type="button" className="md-icon-button" aria-label="导出运行数据"
      title="导出运行数据" onClick={download} disabled={!frame.complete}><ArrowDownToLine size={15} /></button>}>批次测量 · {run.config.basis} 基</PanelHeader>
    <div className="md-readout-body">
      {run.records.length > 1 && <label className="md-field md-attempt-picker">
        <span>回放尝试编号</span>
        <input type="number" min={1} max={run.records.length} step={1} value={frame.attemptIndex + 1}
          onChange={event => {
            const number = event.currentTarget.valueAsNumber;
            if (Number.isInteger(number) && number >= 1 && number <= run.records.length) selectAttempt(number - 1);
          }} />
      </label>}
      <dl className="md-shot-tally">
        <div><dt>已处理尝试</dt><dd data-testid="machine-attempts" data-count={frame.visibleAttempts}>{frame.visibleAttempts} / {run.config.shots}</dd></div>
        <div><dt>有效位串</dt><dd data-testid="machine-shots" data-completed-shots={frame.visibleShots}>{frame.visibleShots}</dd></div>
        <div><dt>{run.plan.protocol === 'bell-replenishment' ? '装配未完成' : '重排未填满'}</dt><dd data-testid="machine-rejected" data-count={frame.visibleRejectedShots}>{frame.visibleRejectedShots}</dd></div>
        <div><dt>有原子丢失</dt><dd data-testid="machine-lost" data-count={frame.visibleLostShots}>{frame.visibleLostShots}</dd></div>
      </dl>
      {frame.complete && !frame.visibleShots && <p className="md-shot-note">该批次没有有效位串。</p>}
      <div className="md-readout-meta"><span>有效位串的频率</span><span className="md-ideal-key"><i />理想概率</span></div>
      <div className="md-histogram" aria-label={`${run.config.basis} 基测量直方图`}>
        {run.outcomes.map((outcome, index) => {
          const count = frame.outcomeCounts[index];
          const frequency = frame.visibleShots ? count / frame.visibleShots : 0;
          return <div className="md-bin" key={outcome.bitstring}>
            <code>{outcome.bitstring}</code>
            <div className="md-bin-track" aria-label={`${outcome.bitstring} 计数 ${count}，理想概率 ${percent(outcome.idealProbability)}`}>
              <div style={{ width: percent(frequency) }} />
              {outcome.idealProbability > 0 && <i style={{ left: percent(outcome.idealProbability) }} />}
            </div>
            <span>{frame.visibleShots ? percent(frequency) : '—'}</span>
          </div>;
        })}
      </div>
      {xBasis && <div className="md-last-shot"><span>X 奇偶相关 <small>0 ↔ +，1 ↔ −</small></span><code>{xCorrelation}</code></div>}
      <div className="md-last-shot"><span>最近有效位串</span><code>{frame.latestBitstring ?? '—'}</code></div>
    </div>
  </section>;
}

export function MachineDashboard() {
  const [config, setConfig] = useState(DEFAULT_MACHINE_CONFIG);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [infoOpen, setInfoOpen] = useState(false);
  const [demoProtocol, setProtocol] = useState<MachineProtocol>('standard');
  const [imported, setImported] = useState<{ name: string; run: MachineRun } | null>(null);
  const [importError, setImportError] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState(0);
  const readId = useRef(0);
  const run = useMemo(() => imported?.run ?? createMachineRun(config, MUNIZ_DEMO_PROFILE, demoProtocol), [config, demoProtocol, imported]);
  const frame = useMemo(() => machineFrame(run, elapsed, selectedAttempt), [run, elapsed, selectedAttempt]);
  const { profile } = run;
  const { rows, columns } = profile.array;
  const { protocol, timeline: { stages } } = run.plan;
  const attemptNumber = frame.attemptIndex + 1;

  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      setElapsed(time => Math.min(run.durationMs, time + delta * speed));
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, run.durationMs, speed]);

  useEffect(() => {
    if (frame.complete) setPlaying(false);
  }, [frame.complete]);

  const seek = (time: number) => {
    setPlaying(false);
    setElapsed(time);
  };
  const update = (patch: Partial<MachineConfig>) => {
    seek(0);
    setSelectedAttempt(0);
    if (patch.circuit && patch.circuit !== 'bell') setProtocol('standard');
    setConfig(old => ({ ...old, ...patch }));
  };
  const changeProtocol = (next: MachineProtocol) => {
    seek(0);
    setSelectedAttempt(0);
    setProtocol(next);
    if (next === 'bell-replenishment') setConfig(old => ({ ...old, circuit: 'bell' }));
  };
  const play = () => {
    if (frame.complete) setElapsed(0);
    setPlaying(!playing);
  };
  const loadRecord = async (file: File) => {
    const id = ++readId.current;
    setImportError('');
    try {
      const content = await file.text();
      if (id !== readId.current) return;
      const run = importMachineRun(content);
      setImported({ name: file.name, run });
      setSelectedAttempt(0);
      seek(0);
    } catch (error) {
      if (id !== readId.current) return;
      setImportError(error instanceof Error ? error.message : '读取运行记录失败。');
    }
  };
  const returnToSimulation = () => {
    readId.current++;
    setImported(null);
    setImportError('');
    setSelectedAttempt(0);
    seek(0);
  };
  const selectAttempt = (index: number) => {
    setPlaying(false);
    setSelectedAttempt(index);
  };

  const download = () => {
    const file = machineExport(run);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `neutral-atom-${run.circuit.id}-${run.config.seed}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const status = frame.complete ? '已完成' : playing ? '运行中' : frame.elapsedMs > 0 ? '已暂停' : '待运行';
  const stageNumber = String(frame.stageIndex + 1).padStart(2, '0');
  const loadingComplete = frame.stage.id !== 'cooling' && frame.stage.id !== 'loading';
  const visibleLoaded = protocol === 'bell-replenishment' ? frame.atoms.length : loadingComplete ? run.loadedCount : frame.atoms.length;
  const visibleQubits = loadingComplete ? frame.atoms.filter(atom => atom.qubit !== undefined).length : 0;

  let stageDescription: string = frame.stage.description;
  if (frame.stage.id === 'analysis') {
    stageDescription = run.config.basis === 'X' ? '对各比特施加 H，将 X 基测量转换为 Z 基荧光测量。' : '选择 Z 基，保持量子态并直接进入荧光读出。';
  }
  if (protocol === 'standard' && loadingComplete && frame.stage.id !== 'rearrangement' && !frame.representativeReady) {
    stageDescription = '第 1 次尝试重排后仍有空位，跳过该次的制备、门和读出。';
  }
  if (frame.stageSkipped) {
    const skipDescriptions = {
      filled: '初检已填满寄存器，跳过补位和复查。',
      'no-source': '储备区没有可用原子，本次补位未执行。',
      vacant: '复查仍有空位，该次跳过制备、门和读出。',
      'atom-lost': '末端检测到原子丢失，该次跳过位串读出。',
    };
    stageDescription = frame.stageSkipReason ? skipDescriptions[frame.stageSkipReason] : '该次跳过当前操作。';
  }
  if (frame.representativeLostQubits.length) {
    stageDescription = `第 ${attemptNumber} 次尝试检测到 ${frame.representativeLostQubits.map(q => `q${q}`).join('、')} 丢失，本次无有效位串。`;
  }
  if (!frame.geometryRecorded) stageDescription = '该轮记录缺少此阶段的原子坐标或重排路径。';

  const openEvidence = () => {
    const heading = document.getElementById('hardware-evidence-heading');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  };

  return <div className="md-app" data-machine-profile={profile.id} data-machine-protocol={protocol}>
    <header className="md-topbar">
      <div className="md-topbar-inner">
        <a className="md-brand" href="#machine"><span><Atom size={23} strokeWidth={1.5} /></span><div>NAQC 数字孪生<small>NEUTRAL ATOM SYSTEM</small></div></a>
        <nav aria-label="演示导航">
          <a className="md-nav-active" href="#machine" aria-current="page"><Boxes size={15} />整机演示</a>
          <a href="#senoo"><Crosshair size={15} />Senoo 装置</a>
          <a href="#clock"><AudioWaveform size={15} />钟跃迁子系统<ArrowUpRight size={12} /></a>
        </nav>
        <button type="button" className="md-info-button" onClick={() => setInfoOpen(true)}><Info size={15} /> 模型说明</button>
      </div>
    </header>
    <main className="md-main">
      <div className="md-intro">
        <div>
          <p className="md-intro-kicker"><i /> ¹⁷¹Yb <span>/</span> <strong>{profile.label}</strong></p>
          <h1>{machineTitle}</h1>
          <p className="md-intro-subtitle" lang="en">Neutral-Atom Quantum Computer Digital Twin</p>
          <p className="md-intro-description">用基态核自旋编码，演示从光镊装载到量子门与荧光读出的完整流程。</p>
        </div>
        <div className="md-intro-actions">
          <button type="button" className="md-evidence-link" onClick={openEvidence}><BookOpen size={14} />真机实验依据</button>
          <div className={`md-run-status ${playing ? 'md-running' : ''}`}><i />{status}</div>
        </div>
      </div>
      <div className="md-layout">
        <aside className="md-workflow-column">
          <Sequence stages={stages} frame={frame} seek={seek} />
          <section className="md-panel md-telemetry">
            <PanelHeader icon={Aperture} aside={<span className="md-panel-hint">第 {attemptNumber} 次尝试</span>}>阵列状态</PanelHeader>
            <dl>
              <div><dt>光镊位点</dt><dd>{columns} × {rows}</dd></div>
              <div><dt>{protocol === 'bell-replenishment' ? '当前原子' : '已装载原子'}</dt><dd data-testid="machine-loaded-count">{frame.geometryRecorded ? visibleLoaded : '缺测'}<small> / {run.sites.length}</small></dd></div>
              <div><dt>计算寄存器</dt><dd>{frame.geometryRecorded ? visibleQubits : '缺测'}<small> / {run.circuit.qubits}</small></dd></div>
              {protocol === 'standard' && <div><dt title="独立装载、无搬运损失时，装载原子数达到寄存器大小的概率">模型重排成功率</dt><dd>{percent(run.expectedAssemblyProbability)}</dd></div>}
            </dl>
          </section>
        </aside>
        <div className="md-visual-column">
          <section className="md-panel md-scene-panel">
            <PanelHeader icon={Atom} aside={<span className="md-stage-indicator" data-testid="machine-stage" data-stage-id={frame.stage.id}>
              <i />{stageNumber} · {frame.stage.label}
            </span>}>整机光路</PanelHeader>
            <div className="md-scene-body">
              <QuantumComputerScene profile={profile} frame={frame} />
            </div>
            <div className="md-playback">
              <OccupancyStatus frame={frame} />
              <div className="md-playback-note">
                <p>{stageDescription}</p>
                {frame.parallelTrapHandoff && <p className="md-panel-hint">483 nm 与 460 nm 光路并行</p>}
                {frame.representativeBitstring && <code>第 {attemptNumber} 次位串 {frame.representativeBitstring}</code>}
              </div>
              <div className="md-timeline">
                <input type="range" aria-label="演示时间轴" min={0} max={run.durationMs} step="any" value={frame.elapsedMs} style={rangeFill(frame.elapsedMs, run.durationMs)}
                  onChange={event => seek(Number(event.target.value))} />
                <code>{(frame.elapsedMs / 1000).toFixed(1)} / {(run.durationMs / 1000).toFixed(1)} s</code>
              </div>
              <div className="md-controls">
                <button type="button" className="md-play-button" onClick={play}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  {playing ? '暂停' : frame.complete ? '重新演示' : frame.elapsedMs ? '继续演示' : '启动演示'}</button>
                <button type="button" onClick={() => seek(frame.stageEndMs)} disabled={frame.complete}><SkipForward size={15} />下一阶段</button>
                <button type="button" onClick={() => seek(0)}><RotateCcw size={15} />重置</button>
                <label className="md-speed"><span className="sr-only">播放速度</span>
                  <select aria-label="播放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
                    {[0.5, 1, 2].map(value => <option key={value} value={value}>{value}×</option>)}
                  </select><ChevronDown size={12} />
                </label>
              </div>
            </div>
          </section>
          <CircuitDiagram run={run} frame={frame} />
        </div>
        <aside className="md-run-column">
          <RunSettings config={run.config} protocol={protocol} update={update} setProtocol={changeProtocol} imported={imported !== null}
            sourceControl={<><div className="md-run-source">
              <label>导入运行 JSON<input type="file" accept=".json,application/json" onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void loadRecord(file);
              }} /></label>
              {imported && <div><p data-testid="machine-record-source">本地回放 · {imported.name}</p>
                <button type="button" onClick={returnToSimulation}>返回仿真</button></div>}
              {importError && <p role="alert">{importError}</p>}
            </div>
              {run.atomicReference && <details className="md-run-source md-atomic-reference">
                <summary>578 nm 原子参考</summary>
                <p>¹⁷¹Yb ¹S₀ → ³P₀ · F = 1/2 → 1/2</p>
                <p><code>{run.atomicReference.frequencyDecimalHz} Hz</code></p>
                <p>超精细重心频率。装置驱动频率和 Rabi 频率待测。</p>
                <a href={run.atomicReference.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</a>
              </details>}
            </>} />
          <Readout run={run} frame={frame} download={download} selectAttempt={selectAttempt} />
        </aside>
      </div>
      <SenooReadoutSource />
      <SenooPopulationSource />
      <HardwareEvidence />
      <footer className="md-footer"><span>{machineTitle}</span><button type="button" onClick={() => setInfoOpen(true)}>仿真模型与参考文献 <ArrowUpRight size={13} /></button></footer>
    </main>
    {infoOpen && <Dialog title="整机仿真模型" onClose={() => setInfoOpen(false)}><SectionInfo /></Dialog>}
  </div>;
}
