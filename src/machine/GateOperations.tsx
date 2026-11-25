import { useState } from 'react';
import { ExternalLink, Pause, Play, Zap } from 'lucide-react';
import { PlaybackSpeed } from '../components/PlaybackSpeed';
import { machineFrame, type MachineFrame, type MachineGate, type MachineRun } from '../physics/quantumComputer';
import { openEquipment } from '../scene/equipmentNavigation';
import { gateClip, gatePulses, pulseAt, pulseDetails, type GatePulse } from '../scene/gateSequence';
import './gate-operations.css';

const gatePaper = 'https://harvest.aps.org/v2/journals/articles/10.1103/PRXQuantum.6.020334/fulltext';

export interface GatePlayback {
  run: MachineRun;
  frame: MachineFrame;
  playing: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  seek: (time: number) => void;
  playRange: (start: number, end: number) => void;
  pause: () => void;
}

function GateLevels({ gate, pulse }: { gate: MachineGate['name']; pulse: GatePulse | null }) {
  const cz = gate === 'CZ';
  const clock = pulse === 'clock-shelve' || pulse === 'clock-return';
  const returning = pulse === 'clock-return';
  return <figure className="gate-levels">
    <figcaption><b>¹⁷¹Yb 能级</b><span>间距示意</span></figcaption>
    <svg viewBox="0 0 340 169" role="img"
      aria-label={`${gate} 门能级示意，${pulse ? pulseDetails[pulse].label + '，' + pulseDetails[pulse].transition : '计划耦合通道'}`}>
      <g className="gate-level-lines">
        <path d="M20 133h72 M153 133h65" />
        <text x="20" y="154">|0⟩ · ¹S₀</text><text x="228" y="138">|1⟩ · ¹S₀</text>
        {cz && <><path d="M153 77h65 M153 18h65" />
          <text x="228" y="82">|c⟩ · ³P₀</text><text x="228" y="23">|r⟩ · 65 ³S₁</text></>}
      </g>
      {cz ? <>
        <g className="gate-coupling" data-tone="gold" data-lit={clock || undefined}>
          <text x="139" y="110" textAnchor="end">{pulseDetails['clock-shelve'].light}</text>
          <path d="M185 82v46" />
          <path d={returning ? 'M181 123l4 5 4-5' : 'M181 87l4-5 4 5'} />
        </g>
        <g className="gate-coupling" data-tone="violet" data-lit={pulse === 'rydberg' || undefined}>
          <text x="139" y="52" textAnchor="end">{pulseDetails.rydberg.light}</text>
          <path d="M185 23v49 M181 28l4-5 4 5 M181 67l4 5 4-5" />
        </g>
      </> : <g>
        <g className="gate-level-lines">
          <path d="M78 30h93" /><text x="182" y="35">³P₁ · F = ½</text>
          <path strokeDasharray="3 4" d="M78 67h93" /><text x="182" y="71">虚能级</text>
          <text className="gate-detuning" x="182" y="54">红失谐 5 GHz</text>
        </g>
        <g className="gate-coupling" data-tone="rose" data-lit={pulse === 'raman' || undefined}>
          <path d="M58 128L108 73 M101 74l7-1-1 7 M140 73l45 55 M178 126l7 2-1-7" />
          <text x="121" y="113" textAnchor="middle">Raman</text>
        </g>
      </g>}
    </svg>
  </figure>;
}

const czBranches = {
  '00': { shelved: '|00⟩', uv: '|00⟩ 保持在基态', output: '|00⟩' },
  '01': { shelved: '|0c⟩', uv: '|0c⟩ ↔ |0r⟩', output: '|01⟩' },
  '10': { shelved: '|c0⟩', uv: '|c0⟩ ↔ |r0⟩', output: '|10⟩' },
  '11': { shelved: '|cc⟩', uv: '|cc⟩ ↔ (|cr⟩ + |rc⟩)/√2', output: '−|11⟩' },
} as const;

function BasisBranch({ pulse }: { pulse: GatePulse | null }) {
  const [bits, setBits] = useState<keyof typeof czBranches>('11');
  const branch = czBranches[bits];
  let caption = '理想 CZ 输出', mapping = `|${bits}⟩ → ${branch.output}`;
  if (pulse === 'clock-shelve') {
    caption = '首个钟脉冲';
    mapping = `|${bits}⟩ → ${branch.shelved}`;
  } else if (pulse === 'rydberg') {
    caption = '紫外耦合';
    mapping = branch.uv;
  } else if (pulse === 'clock-return') {
    caption = '返回并补偿单比特相位后';
    mapping = branch.output;
  }
  return <div className="gate-branch">
    <label>理想输入分量<select value={bits} onChange={event => setBits(event.currentTarget.value as keyof typeof czBranches)}>
      {Object.keys(czBranches).sort().map(input => <option key={input} value={input}>|{input}⟩</option>)}
    </select></label>
    <output aria-label="选定分量的理想演化"><small>{caption}</small><b>{mapping}</b></output>
  </div>;
}

export function GateOperations({ run, frame, playing, speed, setSpeed, seek, playRange, pause, compact = false, onCue }:
  GatePlayback & { compact?: boolean; onCue?: () => void }) {
  const stage = run.plan.timeline.stages.find(item => item.id === 'gates');
  if (!stage) return null;
  const gates = run.circuit.gates;
  const inStage = frame.stage.id === 'gates';
  const skipped = inStage && (frame.stageSkipped || frame.gateIndex === null);
  const preferred = Math.max(0, gates.findIndex(gate => gate.name === 'CZ'));
  const index = inStage ? frame.gateIndex ?? Math.min(gates.length - 1, Math.floor(frame.stageProgress * gates.length)) : preferred;
  const gate = gates[index];
  const steps = gatePulses(gate.name);
  const clip = gateClip(stage, gates.length, index);
  const progress = frame.gateProgress ?? 0;
  const active = inStage && !skipped ? pulseAt(gate.name, progress) : null;
  const isPlaying = playing && inStage;
  const status = skipped ? '本轮已跳过' : active ? (isPlaying ? '播放中' : '已定位') : '序列预览';
  const details = active ? pulseDetails[active].description : gate.name === 'CZ'
    ? '一对比特在 460 nm 科学阱中依次接受三个脉冲。钟光转移 |1⟩ 分量，紫外光产生条件相位，末次钟光将钟态分量送回计算基。'
    : '这一步对选中的核自旋施加 Hadamard 门。局域拉曼光通过共用物镜投送到目标阱位。';

  function goTo(time: number) {
    onCue?.();
    seek(time);
  }
  function playGate() {
    if (isPlaying) { pause(); return; }
    onCue?.();
    const start = inStage && frame.elapsedMs < clip.endMs ? frame.elapsedMs : clip.startMs;
    if (!inStage) {
      const first = machineFrame(run, start, frame.attemptIndex);
      if (first.gateIndex === null || first.stageSkipped) { seek(start); return; }
    }
    playRange(start, clip.endMs);
  }

  return <section className={compact ? 'gate-workspace gate-compact' : 'gate-workspace md-panel'} id={compact ? undefined : 'machine/gates'}
    tabIndex={compact ? undefined : -1} aria-label={compact ? '设备门操作' : '门操作演示'} data-gate={gate.name}
    data-phase={active ?? undefined} data-skipped={skipped || undefined}>
    <header className="gate-heading">
      <h2><Zap size={17} aria-hidden="true" />门操作</h2><span>{run.circuit.label} · 第 {frame.attemptIndex + 1} 轮 · {status}</span>
    </header>
    <div className="gate-body">
      {!compact && <GateLevels gate={gate.name} pulse={active} />}
      <div className="gate-sequence">
        <div className="gate-toolbar">
          <label>电路中的门<select value={index} onChange={e => goTo(gateClip(stage, gates.length, Number(e.currentTarget.value)).startMs)}>
            {gates.map((item, i) => <option key={i} value={i}>{i + 1} · {item.name}（{item.qubits.map(q => 'q' + q).join('、')}）</option>)}
          </select></label>
          <div className="gate-play">
            <button type="button" disabled={skipped && !isPlaying} onClick={playGate}>
              {isPlaying ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{isPlaying ? '暂停此门' : '播放此门'}
            </button>
            {!compact && <PlaybackSpeed value={speed} onChange={setSpeed} label="门操作播放速度" />}
          </div>
        </div>
        <div className="gate-steps" role="group" aria-label="门脉冲步骤">{steps.map((step, part) => {
          const detail = pulseDetails[step];
          const selected = active === step;
          const phaseBounds = gateClip(stage, gates.length, index, part, steps.length);
          const fill = active ? Math.max(0, Math.min(1, progress * steps.length - part)) : 0;
          return <button type="button" key={step} data-pulse={step} aria-pressed={selected} disabled={skipped}
            onClick={() => goTo(phaseBounds.startMs)}>
            <span className="gate-step-light"><small>{detail.light}</small>
              {gate.name === 'CZ' && <svg viewBox="0 0 50 14" aria-hidden="true">
                <path d={step === 'rydberg' ? 'M1 12h10V2h28v10h10'
                  : 'M1 12h3c3 0 3-9 6-9s3 9 6 9c4 0 5-10 9-10s5 10 9 10c3 0 3-9 6-9s3 9 6 9h3'} />
              </svg>}
            </span><b>{detail.label}</b><span>{detail.transition}</span>
            <i aria-hidden="true" style={{ transform: `scaleX(${fill})` }} />
          </button>;
        })}</div>
        {!compact && !skipped && gate.name === 'CZ' && <BasisBranch pulse={active} />}
        {!compact && !skipped && gate.name === 'H' && <div className="gate-branch">
          <span>理想 H 输出</span><b>|0⟩ → (|0⟩ + |1⟩)/√2</b><b>|1⟩ → (|0⟩ − |1⟩)/√2</b>
        </div>}
        <p className="gate-explanation">{skipped ? '本轮未满足执行条件，门脉冲已跳过。' : details}</p>
      </div>
    </div>
    <footer><span>点选步骤可暂停定位 · 波形与段长为示意</span>
      <div className="gate-links">
        {!compact && <button type="button" onClick={() => {
          if (!inStage) goTo(clip.startMs);
          openEquipment(gate.name === 'CZ' ? 'gate' : 'vacuum');
        }}>{gate.name === 'CZ' ? '查看门光设备' : '查看拉曼投送物镜'}</button>}
        <a href={gatePaper + (gate.name === 'CZ' ? '#page=5' : '#page=3')} target="_blank" rel="noreferrer">
        {gate.name === 'CZ' ? '实验图 3a' : '单比特寻址'}<ExternalLink size={12} aria-hidden="true" /></a>
      </div>
    </footer>
  </section>;
}
