import {
  ArrowUpRight, Atom, BarChart3, Camera, Crosshair, Download, Focus, ListOrdered, Move, Pause, Play,
  RotateCcw, ScanLine, SkipForward, Snowflake, Upload, Waves, Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SENOO_APPARATUS_PROFILE, SENOO_REPLAY_LENGTH, SENOO_REPLAY_STAGES } from '../data/senooApparatus';
import { SENOO_CZ_BELL_SOURCE } from '../data/senooCzBellSource';
import { SENOO_CZ_CHARACTERIZATION_SOURCE } from '../data/senooCzCharacterization';
import { SENOO_PAIR_SOURCE } from '../data/senooPairCharacterization';
import { SENOO_PXP_SOURCE } from '../data/senooPxpSource';
import { SENOO_READOUT_SOURCE, type SenooReadoutGroup } from '../data/senooReadoutSource';
import { SENOO_RABI_CHARACTERIZATION_SOURCE } from '../data/senooRabiCharacterization';
import {
  createSenooCzBellReplayRecord, createSenooCzBellSelection, importSenooCzBellReplayRecord, type SenooCzBellReplaySelection,
} from '../physics/senooCzBellReplay';
import {
  createSenooPxpReplayRecord, createSenooPxpSelection, importSenooPxpReplayRecord, type SenooPxpReplaySelection,
} from '../physics/senooPxpReplay';
import {
  createSenooReplayRecord, importSenooReplayRecord, SENOO_REPLAY_RULE, senooReplayFrame, senooReplaySample,
} from '../physics/senooReplay';
import { SenooOpticalScene } from '../scene/SenooOpticalScene';
import { usePlayback } from '../state/usePlayback';
import { useHashFragment } from '../state/useHashFragment';
import { SenooBellReplay } from './SenooBellReplay';
import { SenooCzCharacterization, type SenooCzSelectedDepth } from './SenooCzCharacterization';
import { SenooCzWaveformInput } from './SenooCzWaveformInput';
import { SenooMeasurementImport } from './SenooMeasurementImport';
import { SenooPairCharacterization } from './SenooPairCharacterization';
import { SenooRabiCharacterization } from './SenooRabiCharacterization';
import { SenooTransportReplayPanel } from './SenooTransportReplay';
import './machine-dashboard.css';
import './senoo-apparatus.css';

const { groups, source } = SENOO_READOUT_SOURCE;
const stages = SENOO_REPLAY_STAGES;
const stageIcons = [Snowflake, Focus, Move, Crosshair, Zap, Camera, Waves, Zap, Camera, ScanLine];
const stateLabels = {
  unknown: '位点占据缺测', empty: '无原子对照', removed: '名义状态 · 成像后移除',
  m0: '名义状态 · m₀', m1: '名义状态 · m₁', g0: '名义状态 · g₀',
};
const verdictLabels = { m0: 'm₀', m1: 'm₁', 'no-atom': '无原子', ambiguous: '歧义' };
const replayModes = {
  readout: {
    label: '图 2b 双曝光读出', title: 'Senoo 双曝光读出',
    description: '沿论文工序查看亚稳态核自旋读出，逐帧核对图 2b 的实际计数。',
    citation: '刊版图 2a–b', url: source.url, icon: Camera,
  },
  pxp: {
    label: '图 2f 阻塞 Bell 映射', title: 'Senoo 阻塞 Bell 映射',
    description: '沿图 2f 的实验步骤检查双原子映射、布居和奇偶振荡。',
    citation: '刊版图 2f', url: SENOO_PXP_SOURCE.url, icon: Atom,
  },
  cz: {
    label: '图 1c→1d CZ 对照', title: 'Senoo CZ Bell 映射',
    description: '沿图 1c→1d 查看 CZ 制备的 Bell 态，并比较两种制备路线的映射观测。',
    citation: '刊版图 1b–d', url: SENOO_CZ_BELL_SOURCE.url, icon: Zap,
  },
  characterization: {
    label: '图 3b–d CZ 表征', title: 'Senoo CZ 门表征',
    description: '按 CZ 门深度核对随机基准成功率、每门保真度与丢失。',
    citation: '刊版图 3b–d', url: SENOO_CZ_CHARACTERIZATION_SOURCE.url, icon: BarChart3,
  },
  rabi: {
    label: '图 2c 单原子 Rabi', title: 'Senoo 单原子 Rabi',
    description: '核对 302 nm 驱动的两态条件布居和共振模型残差。',
    citation: '刊版图 2c 右图', url: SENOO_RABI_CHARACTERIZATION_SOURCE.url, icon: Waves,
  },
  pair: {
    label: '扩展图 4f、5f 双原子', title: 'Senoo 双原子能移与阻塞',
    description: '按原子间距、磁场方向和驱动时窗核对公开能移与单激发布居。',
    citation: '刊版扩展数据图 4f、5f', url: SENOO_PAIR_SOURCE.url, icon: Atom,
  },
} as const;
type ReplayMode = keyof typeof replayModes;

function navigateToMode(mode: ReplayMode) {
  window.location.hash = mode === 'readout' ? '#senoo' : `#senoo/${mode}`;
}

export function SenooApparatus() {
  const fragment = useHashFragment();
  const [path, query] = fragment.split('?');
  const modeName = path.slice('#senoo/'.length);
  const mode: ReplayMode = Object.hasOwn(replayModes, modeName) ? modeName as ReplayMode : 'readout';
  const panel = new URLSearchParams(query).get('panel');
  const [pxpSelection, setPxpSelection] = useState(createSenooPxpSelection);
  const [czSelection, setCzSelection] = useState(createSenooCzBellSelection);
  const [czDepth, setCzDepth] = useState<SenooCzSelectedDepth>(0);
  const [rabiIndex, setRabiIndex] = useState(0);
  const [shiftIndex, setShiftIndex] = useState(0);
  const [blockadeIndex, setBlockadeIndex] = useState(0);
  const [groupId, setGroupId] = useState<SenooReadoutGroup['id']>('spin1');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [fileStatus, setFileStatus] = useState<{ kind: 'error' | 'loaded'; text: string } | null>(null);
  const importId = useRef(0);
  const playback = usePlayback(SENOO_REPLAY_LENGTH);
  const group = groups.find(item => item.id === groupId)!;
  const sample = senooReplaySample(groupId, sourceIndex);
  const frame = senooReplayFrame(sample, playback.time);
  const progress = (frame.position / SENOO_REPLAY_LENGTH) * 100;
  const complete = frame.position === SENOO_REPLAY_LENGTH;
  const activeMode = replayModes[mode];

  useEffect(() => {
    if (mode !== 'readout' && playback.running) playback.seek(playback.time);
  }, [mode, playback.running, playback.seek, playback.time]);

  useEffect(() => {
    if (mode !== 'readout' || (panel !== 'transport' && panel !== 'workbook')) return;
    const id = requestAnimationFrame(() => {
      const element = document.getElementById(`senoo-intake-${panel}`);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [mode, panel]);

  function selectMode(nextMode: ReplayMode) {
    if (nextMode === mode) return;
    importId.current++;
    setFileStatus(null);
    playback.seek(frame.position);
    navigateToMode(nextMode);
  }

  function updatePxpSelection(selection: SenooPxpReplaySelection) {
    importId.current++;
    setFileStatus(null);
    setPxpSelection(selection);
  }

  function updateCzSelection(selection: SenooCzBellReplaySelection) {
    importId.current++;
    setFileStatus(null);
    setCzSelection(selection);
  }

  function selectSample(nextGroup: SenooReadoutGroup['id'], nextIndex: number) {
    importId.current++;
    setFileStatus(null);
    setGroupId(nextGroup);
    setSourceIndex(nextIndex);
    playback.reset();
  }

  async function openReplay(file: File) {
    const request = ++importId.current;
    const originalRoute = window.location.hash;
    setFileStatus(null);
    try {
      const text = await file.text();
      if (request !== importId.current || window.location.hash !== originalRoute) return;
      let header: unknown;
      try {
        header = JSON.parse(text);
      } catch {
        throw new Error('文件中的 JSON 无效。');
      }
      const schema = header !== null && typeof header === 'object' && 'schema' in header ? header.schema : undefined;
      if (schema === 'senoo-fig2f-replay') {
        const saved = importSenooPxpReplayRecord(text);
        playback.seek(frame.position);
        setPxpSelection(saved.selection);
        navigateToMode('pxp');
      } else if (schema === 'senoo-cz-bell-replay') {
        const saved = importSenooCzBellReplayRecord(text);
        playback.seek(frame.position);
        setCzSelection(saved.selection);
        navigateToMode('cz');
      } else {
        const saved = importSenooReplayRecord(text);
        setGroupId(saved.sample.groupId);
        setSourceIndex(saved.sample.sourceIndex);
        playback.seek(saved.position);
        navigateToMode('readout');
      }
      setFileStatus({ kind: 'loaded', text: file.name });
    } catch (error) {
      if (request !== importId.current || window.location.hash !== originalRoute) return;
      setFileStatus({ kind: 'error', text: error instanceof Error ? error.message : '读取回放文件失败。' });
    }
  }

  function downloadReplay() {
    const record = mode === 'pxp' ? createSenooPxpReplayRecord(pxpSelection) : mode === 'cz'
      ? createSenooCzBellReplayRecord(czSelection) : createSenooReplayRecord(sample, frame.position);
    const json = JSON.stringify(record, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = mode === 'pxp' ? 'senoo-fig2f-replay.json' : mode === 'cz' ? 'senoo-fig1cd-replay.json'
      : `senoo-fig2b-${sample.groupId}-${sourceIndex + 1}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const fileActions = <>
    <div className="md-controls ss-file-actions">
      <button type="button" onClick={downloadReplay}><Download size={14} />导出回放 JSON</button>
      <label><Upload size={14} />导入回放 JSON
        <input type="file" aria-label="导入回放 JSON" accept=".json,application/json" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void openReplay(file);
        }} />
      </label>
    </div>
    {fileStatus && <p className="ss-file-status" role={fileStatus.kind === 'error' ? 'alert' : 'status'}>{fileStatus.text}</p>}
  </>;

  return <div className="md-app ss-app" data-replay-mode={mode}
    data-apparatus-profile={mode === 'readout' ? SENOO_APPARATUS_PROFILE.id : undefined}>
    <main className="md-main ss-main">
      <div className="md-intro ss-intro">
        <div>
          <p className="md-intro-kicker"><i /> ¹⁷¹Yb <span>/</span> 767 nm 光镊</p>
          <h1>{activeMode.title}</h1>
          <p className="md-intro-description">{activeMode.description}</p>
        </div>
        <a className="ss-source-link" href={activeMode.url}
          target="_blank" rel="noreferrer">{activeMode.citation} <ArrowUpRight size={14} /></a>
      </div>
      <div className="md-controls ss-replay-switch" role="group" aria-label="Senoo 文献回放与表征">
        {(Object.keys(replayModes) as ReplayMode[]).map(key => {
          const { icon: Icon, label } = replayModes[key];
          return <button key={key} type="button" aria-pressed={mode === key} onClick={() => selectMode(key)}>
            <Icon size={15} />{label}
          </button>;
        })}
      </div>
      {mode === 'pxp' && <SenooBellReplay mode="pxp" selection={pxpSelection} onSelection={updatePxpSelection} fileActions={fileActions} />}
      {mode === 'cz' && <SenooBellReplay mode="cz" selection={czSelection} onSelection={updateCzSelection} fileActions={fileActions} />}
      {mode === 'characterization' && <SenooCzCharacterization depth={czDepth} onDepthChange={setCzDepth} />}
      <div hidden={mode !== 'characterization'}><SenooCzWaveformInput /></div>
      {mode === 'rabi' && <SenooRabiCharacterization index={rabiIndex} onSelect={setRabiIndex} />}
      {mode === 'pair' && <SenooPairCharacterization shiftIndex={shiftIndex} onShiftSelect={setShiftIndex}
        blockadeIndex={blockadeIndex} onBlockadeSelect={setBlockadeIndex} />}
      {mode === 'readout' && <div className="ss-layout">
        <section className="md-panel md-sequence ss-sequence" aria-label="文献工序">
          <div className="md-panel-header"><h2><ListOrdered size={16} />文献工序</h2></div>
          <ol>
            {stages.map((stage, index) => {
              const Icon = stageIcons[index];
              const current = frame.index === index;
              return <li key={stage.id}>
                <button type="button" aria-current={current ? 'step' : undefined} className={current ? 'md-current' : ''}
                  onClick={() => playback.seek(index)}>
                  <span className="md-step-icon"><Icon size={15} /></span>
                  <span className="md-step-text">{stage.label}</span>
                </button>
              </li>;
            })}
          </ol>
        </section>

        <section className="md-panel ss-optics" aria-label="装置与光路">
          <div className="md-panel-header">
            <h2><Atom size={16} />装置与光路</h2>
            <span className="md-stage-indicator" data-testid="senoo-apparatus-stage" data-stage={frame.stage.id}>
              <i />{frame.stage.label}
            </span>
          </div>
          <SenooOpticalScene activeChannels={frame.stage.channels} state={frame.state} stateLabel={stateLabels[frame.state]} />
          <div className="md-playback">
            <p className="md-playback-note">{frame.stage.description}</p>
            <div className="md-timeline ss-timeline">
              <input type="range" aria-label="Senoo 示意时间轴" aria-valuetext={frame.stage.label} min={0}
                max={SENOO_REPLAY_LENGTH} step="any" value={frame.position} style={{ '--md-fill': `${progress}%` } as CSSProperties}
                onChange={event => playback.seek(event.target.valueAsNumber)} />
              <code>示意进度 {Math.round(progress)}%</code>
            </div>
            <div className="md-controls">
              <button type="button" className="md-play-button" onClick={playback.toggle}>
                {playback.running ? <Pause size={15} /> : <Play size={15} />}
                {playback.running ? '暂停' : complete ? '重新播放' : '播放'}
              </button>
              <button type="button" disabled={frame.index === SENOO_REPLAY_LENGTH - 1}
                onClick={() => playback.seek(frame.index + 1)}><SkipForward size={15} />下一步</button>
              <button type="button" onClick={playback.reset}><RotateCcw size={15} />重置</button>
            </div>
          </div>
        </section>

        <section className="md-panel ss-receipt" aria-label="图 2b 样本与判决">
          <div className="md-panel-header"><h2><Camera size={16} />图 2b 样本</h2><span className="md-panel-hint">出版方源表</span></div>
          <div className="ss-receipt-body">
            <label className="md-field">
              <span>文献制备组</span>
              <select aria-label="文献制备组" value={groupId} onChange={event => selectSample(event.target.value as SenooReadoutGroup['id'], 0)}>
                {groups.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="md-field ss-sample">
              <span>图 2b 样本序号</span>
              <input type="number" aria-label="图 2b 样本序号" min={1} max={group.points.length} step={1} value={sourceIndex + 1}
                onChange={event => {
                  const next = event.target.valueAsNumber;
                  if (Number.isInteger(next) && next >= 1 && next <= group.points.length) selectSample(groupId, next - 1);
                }} />
              <small>/ {group.points.length}</small>
            </label>
            <dl className="ss-counts">
              <div><dt>Image 1 <span>m₁ 通道</span></dt><dd data-testid="senoo-replay-first-count">{frame.firstCount === null ? '—' : `${frame.firstCount} counts`}</dd></div>
              <div><dt>Image 2 <span>m₀ 通道</span></dt><dd data-testid="senoo-replay-second-count">{frame.secondCount === null ? '—' : `${frame.secondCount} counts`}</dd></div>
            </dl>
            <div className="ss-verdict" data-testid="senoo-replay-outcome" data-outcome={frame.decision?.outcome ?? 'pending'}>
              <div><span>探索判决</span><strong>{frame.decision ? verdictLabels[frame.decision.outcome] : '等待两帧'}</strong></div>
              <p>阈值 {SENOO_REPLAY_RULE.thresholds.first} / {SENOO_REPLAY_RULE.thresholds.second} counts</p>
            </div>
            <p className="ss-cells"><code>{sample.sheet}!{sample.cells.first} / {sample.cells.second}</code></p>
            <p className="ss-note">样本的实验时标、位点、原图和实际阈值缺测。三维显示协议的名义状态。</p>
            {fileActions}
          </div>
        </section>
      </div>}
      <div id="senoo-intake-transport" tabIndex={-1}><SenooTransportReplayPanel /></div>
      <div id="senoo-intake-workbook" tabIndex={-1} hidden={mode !== 'readout'}><SenooMeasurementImport /></div>
    </main>
  </div>;
}
