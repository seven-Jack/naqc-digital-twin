import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Atom, Download, Expand, FlaskConical, Info, Minimize2, RotateCcw } from 'lucide-react';
import { atomicData, assumptions } from './data/atomicData';
import { calculateModel, defaults, exportSnapshot, MODEL_VERSION, normalizeParameters, type PhysicsParameterState } from './physics/model';
import { kHz, us } from './physics/units';
import { compensationPreset, Controls, type Preset } from './panels/Controls';
import { Readouts } from './panels/Readouts';
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
        <div><div className="brand-title">Yb-171 <span>CLOCK DIGITAL TWIN</span></div><div className="brand-subtitle">Optical Tweezer × Atomic Clock Transition</div></div>
      </div>
      <div className="top-actions">
        <div className="mode-switch" role="group" aria-label="Display mode">
          <button aria-pressed={!showcase} className={!showcase ? 'selected' : ''} onClick={() => void setShowcaseMode(false)}><FlaskConical size={14} /> Research</button>
          <button aria-pressed={showcase} className={showcase ? 'selected' : ''} onClick={() => void setShowcaseMode(!showcase)}>
            {showcase ? <Minimize2 size={14} /> : <Expand size={14} />} Showcase</button>
        </div>
        <span className="nav-rule" />
        <button className="nav-button" onClick={resetAll} aria-label="Reset parameters"><RotateCcw size={15} /><span>Reset</span></button>
        <button className="nav-button" onClick={showModel} aria-label="Model info"><Info size={15} /><span>Model info</span></button>
        <button className="export-button" aria-label="Export" onClick={download}><Download size={15} /><span>Export</span></button>
      </div>
    </header>
    <main>
      <div className="intro">
        <div>
          <h1>Clock transition simulator</h1>
          <p>State-dependent trapping and coherent control of <strong>¹⁷¹Yb</strong></p>
        </div>
        <div className="intro-tags">
          <span className="wavelength"><i className="dot teal" /> 532 nm trap</span>
          <span className="wavelength"><i className="dot gold" /> 578 nm clock</span>
          <button className="evidence" onClick={showModel}><i className="dot gold" /> Conditional theory</button>
        </div>
      </div>
      <div className="workspace">
        <Controls model={model} preset={preset} update={update} selectPreset={selectPreset} showModel={showModel} />
        <div className="instrument">
          <section className="panel scene-panel">
            <SceneViewport model={model} options={sceneOptions} onOptions={updateScene} onSelect={selectSite} population={state.excited}
              active={active} onBloch={showBloch} />
            {showcase && <div className="showcase-metrics">
              <span>Δν Stark <strong>{signed(model.starkHz / kHz(1))} kHz</strong></span>
              <span>δ / 2π <strong>{signed(model.detuningHz / kHz(1))} kHz</strong></span>
              <span>Ω / 2π <strong>{(model.activeRabiHz / kHz(1)).toFixed(1)} kHz</strong></span>
              <span>π pulse <strong>{(model.piSeconds / us(1)).toFixed(2)} µs</strong></span>
            </div>}
            <Timeline model={model} playback={playback} excitation={state.excited} onBloch={showBloch} />
          </section>
          <Comparison model={model} />
        </div>
        <Readouts model={model} openInfo={showModel} />
      </div>
      {!showcase && <Analysis {...analysis} seek={playback.seek} />}
      <footer><span>¹⁷¹Yb Clock Digital Twin · v{MODEL_VERSION}</span><button className="text-button" onClick={showModel}>Sources & model assumptions ↗</button></footer>
    </main>
    {dialog === 'model' && <Dialog title="Model information" onClose={closeDialog}>
      <div className="model-body">
        <div className="model-badges"><span className="evidence"><i className="dot gold" /> Conditional theory</span><span className="evidence analytic">Verified analytic</span></div>
        <p>{atomicData.source}. The full ¹⁷¹Yb uncertainty is open. The experimental papers provide context for this prototype.</p>
        <ul>{assumptions.map(item => <li key={item}>{item}</li>)}</ul>
        <p>Angular frequencies use rad/s. Ordinary frequencies use Hz. The ν₀ reference is {atomicData.clockFrequencyCipmText} Hz (CIPM 2025). Computation uses relative laser offsets to retain numerical precision.</p>
        <p>At focus the Gaussian model uses w₀ as the 1/e² intensity radius. The paraxial beam surfaces show w(z), and color encodes ideal population. Screen playback expands the pulse to 4.8 s at 1×.</p>
        <div className="source-links">
          <a href={atomicData.calculationUrl} target="_blank" rel="noreferrer">Calculation #23 · R009 ↗</a>
          <a href={atomicData.sourceUrl} target="_blank" rel="noreferrer">Höhn et al. · polarizabilities ↗</a>
          <a href="https://doi.org/10.1103/PhysRevX.13.041035" target="_blank" rel="noreferrer">Lis et al. · 532 nm shifts ↗</a>
          <a href="https://doi.org/10.1103/PhysRevX.13.041034" target="_blank" rel="noreferrer">Norcia et al. · magic trapping ↗</a>
          <a href="https://doi.org/10.1103/PRXQuantum.6.020334" target="_blank" rel="noreferrer">Muniz et al. · clock control ↗</a>
        </div>
      </div>
    </Dialog>}
    {dialog === 'bloch' && <Dialog title="Bloch sphere" onClose={closeDialog}>
      <BlochSphere model={model} vector={state.bloch} />
      <div className="bloch-notes"><span><i className="dot cyan" /> State vector</span><span><i className="dot gold" /> Drive axis</span>
        <output>{(time / us(1)).toFixed(2)} µs</output></div>
      <input aria-label="Bloch pulse time" className="bloch-timeline" type="range" min={0} max={model.pulseSeconds} step="any"
        value={time} onChange={event => playback.seek(Number(event.target.value))} />
    </Dialog>}
  </div>;
}
