import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Atom, Download, Expand, FlaskConical, Info, Minimize2, RotateCcw } from 'lucide-react';
import { atomicData, assumptions } from './data/atomicData';
import { calculateModel, defaults, exportSnapshot, MODEL_VERSION, normalizeParameters, type PhysicsParameterState } from './physics/model';
import { kHz, us } from './physics/units';
import { compensationPreset, Controls, type Preset } from './panels/Controls';
import { Readouts } from './panels/Readouts';
import { Calibration } from './panels/Calibration';
import { ExperimentGuide } from './panels/ExperimentGuide';
import { MotionSection } from './panels/MotionalAnalysis';
import { Comparison, Timeline } from './panels/Timeline';
import { Analysis } from './plots/Analysis';
import { SceneViewport } from './scene/SceneViewport';
import { BlochSphere } from './scene/BlochSphere';
import type { SceneOptions, SceneView } from './scene/InstrumentScene';
import { signed } from './components/format';
import { Dialog } from './components/Dialog';
import { usePlayback } from './state/usePlayback';

const initialScene: SceneOptions = { view: 'array', potential: 'both', quality: 'Medium', tweezers: true, clock: true, glow: true };

export function App() {
  const [startInCompensation] = useState(() => new URLSearchParams(window.location.search).get('demo') === compensationPreset.id);
  const [parameters, setParameters] = useState(startInCompensation ? { ...defaults, ...compensationPreset.values } : defaults);
  const [preset, setPreset] = useState<Preset>(startInCompensation ? compensationPreset.id : 'detuning');
  const [sceneOptions, setSceneOptions] = useState(startInCompensation ? { ...initialScene, view: compensationPreset.view } : initialScene);
  const [showcase, setShowcase] = useState(false);
  const [dialog, setDialog] = useState<'model' | 'bloch'>();
  const model = useMemo(() => calculateModel(parameters), [parameters]);
  const playback = usePlayback(model.pulseSeconds);
  const { reset, time, running } = playback;
  const state = model.drive.at(time);
  const active = parameters.laserEnabled && time < model.pulseSeconds && (running || time > 0);
  const showModel = useCallback(() => setDialog('model'), []);
  const showBloch = useCallback(() => setDialog('bloch'), []);
  const closeDialog = useCallback(() => setDialog(undefined), []);

  const update = useCallback((patch: Partial<PhysicsParameterState>) => {
    reset();
    setParameters(old => normalizeParameters({ ...old, ...patch }));
  }, [reset]);
  const selectSite = useCallback((site: number) => setParameters(old => old.site === site ? old : { ...old, site }), []);
  const updateScene = useCallback((patch: Partial<SceneOptions>) => setSceneOptions(old => ({ ...old, ...patch })), []);
  const selectPreset = useCallback((id: Preset, values: PhysicsParameterState, view: SceneView) => {
    setPreset(id);
    reset();
    setParameters(values);
    updateScene({ view, potential: 'both' });
  }, [reset, updateScene]);
  const resetAll = useCallback(() => {
    selectPreset('detuning', defaults, 'array');
    playback.setSpeed(1);
    setSceneOptions(initialScene);
  }, [selectPreset, playback.setSpeed]);

  const setShowcaseMode = async (mode: boolean) => {
    setShowcase(mode);
    if (mode) {
      window.scrollTo(0, 0);
      try { await document.documentElement.requestFullscreen?.(); } catch { /* Viewport layout also works without browser fullscreen. */ }
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  };
  useEffect(() => {
    const exit = () => { if (!document.fullscreenElement) setShowcase(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement && !document.querySelector('dialog[open]')) setShowcase(false);
    };
    document.addEventListener('fullscreenchange', exit);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', exit);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function download() {
    const blob = new Blob([JSON.stringify(exportSnapshot(model, time), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `yb171-clock-${model.site.id}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Expensive path generation runs at background priority during rapid slider updates.
  // The analysis uses one complete snapshot, including cursor and population.
  const liveAnalysis = useMemo(() => ({ model, time, excitation: state.excited }), [model, time, state.excited]);
  const deferred = useDeferredValue(liveAnalysis);
  const analysis = deferred.model === model ? liveAnalysis : deferred;
  return <div className={`app ${showcase ? 'showcase' : ''}`}>
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><Atom size={24} strokeWidth={1.6} /></div>
        <div><div className="brand-title">¹⁷¹Yb <span>钟跃迁数字孪生</span></div><div className="brand-subtitle">光镊俘获与钟跃迁</div></div>
      </div>
      <div className="top-actions">
        <div className="mode-switch" role="group" aria-label="显示模式">
          <button aria-pressed={!showcase} className={!showcase ? 'selected' : ''} onClick={() => void setShowcaseMode(false)}><FlaskConical size={14} /> 研究</button>
          <button aria-pressed={showcase} className={showcase ? 'selected' : ''} onClick={() => void setShowcaseMode(!showcase)}>
            {showcase ? <Minimize2 size={14} /> : <Expand size={14} />} 展示</button>
        </div>
        <span className="nav-rule" />
        <button className="nav-button" onClick={resetAll} aria-label="重置参数"><RotateCcw size={15} /><span>重置</span></button>
        <button className="nav-button" onClick={showModel} aria-label="模型说明"><Info size={15} /><span>模型说明</span></button>
        <button className="export-button" aria-label="导出数据" onClick={download}><Download size={15} /><span>导出</span></button>
      </div>
    </header>
    <main>
      <div className="intro">
        <div>
          <h1>钟跃迁模拟器</h1>
          <p>调节光镊，观察 <strong>¹⁷¹Yb</strong> 的钟跃迁如何失谐，再用频率补偿恢复共振。</p>
        </div>
        <div className="intro-tags">
          <span className="wavelength"><i className="dot teal" /> 532 nm 光镊</span>
          <span className="wavelength"><i className="dot gold" /> 578 nm 钟激光</span>
          <button className="evidence" onClick={showModel}><i className="dot gold" /> 条件理论</button>
        </div>
      </div>
      <div className="workspace">
        <Controls model={model} preset={preset} update={update} selectPreset={selectPreset} showModel={showModel} />
        <div className="instrument">
          {!showcase && <ExperimentGuide model={model}
            onCompensate={() => update({ mode: model.parameters.mode === 'compensated' ? 'free' : 'compensated' })} />}
          <section className="panel scene-panel">
            <SceneViewport model={model} options={sceneOptions} onOptions={updateScene} onSelect={selectSite} population={state.excited}
              active={active} onBloch={showBloch} />
            {showcase && <div className="showcase-metrics">
              <span>斯塔克光移 Δν <strong>{signed(model.starkHz / kHz(1))} kHz</strong></span>
              <span>δ / 2π <strong>{signed(model.detuningHz / kHz(1))} kHz</strong></span>
              <span>Ω / 2π <strong>{(model.activeRabiHz / kHz(1)).toFixed(1)} kHz</strong></span>
              <span>π 脉冲 <strong>{(model.piSeconds / us(1)).toFixed(2)} µs</strong></span>
            </div>}
            <Timeline model={model} playback={playback} excitation={state.excited} onBloch={showBloch} />
          </section>
          <Comparison model={model} />
        </div>
        <Readouts model={model} openInfo={showModel} />
      </div>
      {!showcase && <Analysis {...analysis} seek={playback.seek} />}
      <section className="research-section" id="research-models" aria-labelledby="research-title" hidden={showcase}>
        <div className="section-heading"><h2 id="research-title">运动模型与实验校准</h2></div>
        <MotionSection model={analysis.model} />
        <Calibration model={analysis.model} />
      </section>
      <footer><span>¹⁷¹Yb 钟跃迁数字孪生 · v{MODEL_VERSION}</span><button className="text-button" onClick={showModel}>数据来源与模型假设 ↗</button></footer>
    </main>
    {dialog === 'model' && <Dialog title="模型说明" onClose={closeDialog}>
      <div className="model-body">
        <div className="model-badges"><span className="evidence"><i className="dot gold" /> 条件理论</span><span className="evidence analytic">解析解已验证</span></div>
        <p>{atomicData.source}。{atomicData.uncertainty}。下列实验文献提供物理背景。</p>
        <ul>{assumptions.map(item => <li key={item}>{item}</li>)}</ul>
        <p>角频率用 rad/s，频率用 Hz。自由原子参考频率 ν₀ 为 {atomicData.clockFrequencyCipmText} Hz（CIPM 2025）。计算使用激光相对频偏，以保留数值精度。</p>
        <p>高斯光束的束腰 w₀ 是焦点处光强降至峰值 1/e² 的半径。傍轴光束包络显示 w(z)，原子颜色表示理想布居。1× 播放时，整个脉冲在屏幕上用 4.8 s 播完。</p>
        <div className="source-links">
          <a href={atomicData.calculationUrl} target="_blank" rel="noreferrer">Calculation #23 · R009 ↗</a>
          <a href={atomicData.sourceUrl} target="_blank" rel="noreferrer">Höhn 等 · 极化率 ↗</a>
          <a href="https://doi.org/10.1103/PhysRevX.13.041035" target="_blank" rel="noreferrer">Lis 等 · 532 nm 光移 ↗</a>
          <a href="https://doi.org/10.1103/PhysRevX.13.041034" target="_blank" rel="noreferrer">Norcia 等 · 魔术波长俘获 ↗</a>
          <a href="https://doi.org/10.1103/PRXQuantum.6.020334" target="_blank" rel="noreferrer">Muniz 等 · 钟跃迁控制 ↗</a>
        </div>
      </div>
    </Dialog>}
    {dialog === 'bloch' && <Dialog title="布洛赫球" onClose={closeDialog}>
      <BlochSphere model={model} vector={state.bloch} />
      <div className="bloch-notes"><span><i className="dot cyan" /> 状态矢量</span><span><i className="dot gold" /> 驱动轴</span>
        <output>{(time / us(1)).toFixed(2)} µs</output></div>
      <input aria-label="布洛赫球脉冲时间" className="bloch-timeline" type="range" min={0} max={model.pulseSeconds} step="any"
        value={time} onChange={event => playback.seek(Number(event.target.value))} />
    </Dialog>}
  </div>;
}
