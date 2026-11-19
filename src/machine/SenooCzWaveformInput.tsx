import { Download, Upload, Waves } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  assessSenooCzWaveform, createSenooCzWaveformTemplate, parseSenooCzWaveform,
  type SenooCzWaveform,
} from '../physics/senooCzWaveform';
import { SenooCzDynamicsPanel } from './SenooCzDynamicsPanel';
import { SenooCzBenchmarkPanel } from './SenooCzBenchmarkPanel';
import './senoo-cz-waveform.css';

const sourceLabels = {
  measured: '实测声明', 'control-setpoint': '控制器设定', synthetic: '合成记录',
} as const;

function downloadTemplate() {
  const template = JSON.stringify(createSenooCzWaveformTemplate(), null, 2);
  const url = URL.createObjectURL(new Blob([template], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'senoo-cz-waveform-template-v1.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Loaded = {
  filename: string;
  sha256: string | null;
  record: SenooCzWaveform;
  assessment: ReturnType<typeof assessSenooCzWaveform>;
};

function quantity(value: number | null, unit: string) {
  return value === null ? '未记录' : `${value} ${unit}`;
}

export function SenooCzWaveformInput() {
  const request = useRef(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [index, setIndex] = useState(0);
  const waveform = loaded?.record;
  const sample = waveform?.samples[index];
  const source = waveform?.sourceKind ?? null;
  const ready = loaded?.assessment.readyForModelInput ?? false;

  async function open(file: File) {
    const generation = ++request.current;
    setPending(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      if (generation !== request.current) return;
      const record = parseSenooCzWaveform(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
      if (generation !== request.current) return;
      const sha256 = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : null;
      setLoaded({ filename: file.name, sha256, record, assessment: assessSenooCzWaveform(record) });
      setIndex(0);
    } catch (problem) {
      if (generation === request.current) setError(problem instanceof Error ? problem.message : 'CZ 波形导入失败。');
    } finally {
      if (generation === request.current) setPending(false);
    }
  }

  return <section className="md-panel cw-panel" aria-labelledby="senoo-cz-waveform-title" data-testid="senoo-cz-waveform"
    data-model-ready={ready} data-source-kind={source ?? 'unknown'}>
    <div className="md-panel-header">
      <h2 id="senoo-cz-waveform-title"><Waves size={16} />两原子 CZ 波形输入</h2>
      <span className="cw-source">{source ? sourceLabels[source] : '待实测'}</span>
    </div>
    <div className="cw-body">
      <p>导入同一门版本的 302 nm 双位点记录，核对共同时标、驱动量、相位参考和采集条件。</p>
      <div className="md-controls ss-file-actions">
        <button type="button" onClick={downloadTemplate}><Download size={14} />下载 CZ 波形模板 JSON</button>
        <label><Upload size={14} />导入 CZ 波形 JSON
          <input type="file" aria-label="导入 CZ 波形 JSON" accept=".json,application/json" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void open(file);
          }} />
        </label>
      </div>
      {pending && <p role="status">正在校验波形记录…</p>}
      {error && <p className="smi-error" role="alert">{error}</p>}
      {loaded && waveform && <>
        <div className="cw-summary" aria-live="polite">
          <span>记录 <code>{loaded.filename}</code></span>
          <span className="cw-readiness">{ready ? '模型输入字段齐备，待核验来源' : '模型输入证据待补'}</span>
        </div>
        <dl className="cw-facts">
          <div><dt>门版本与采集运行</dt><dd><code>{waveform.gateVersion ?? '未记录'} · {waveform.acquisitionRunId ?? '未记录'}</code></dd></div>
          <div><dt>装置与工况</dt><dd><code>{waveform.apparatusVersion ?? '未记录'} · {waveform.workingPoint ?? '未记录'}</code></dd></div>
          <div><dt>时钟与原点</dt><dd><code>{waveform.clockId ?? '未记录'} · {waveform.timeOriginRef ?? '未记录'}</code></dd></div>
          <div><dt>门区间</dt><dd>{waveform.window ? <code>{waveform.window.startS} 至 {waveform.window.endS} s</code> : '未记录'}</dd></div>
          <div><dt>采样跨度</dt><dd>{loaded.assessment.coverage.count > 0
            ? <code>{loaded.assessment.coverage.startS} 至 {loaded.assessment.coverage.endS} s</code> : '未记录'}
            <small>{loaded.assessment.coverage.coversWindow ? '覆盖门区间' : '覆盖待核查'}</small></dd></div>
          <div><dt>相位／失谐参考</dt><dd><code>{waveform.phaseReference ?? '未记录'} · {waveform.detuningReference ?? '未记录'}</code></dd></div>
        </dl>
        {sample && <section className="cw-sample" data-testid="senoo-cz-waveform-sample" data-index={index}
          aria-label="选中 CZ 波形采样点">
          <div className="smi-detail-controls">
            <label>采样点
              <input type="number" aria-label="CZ 波形采样点序号" min={1} max={waveform.samples.length} value={index + 1}
                onChange={event => {
                  const next = event.currentTarget.valueAsNumber;
                  if (Number.isInteger(next) && next >= 1 && next <= waveform.samples.length) setIndex(next - 1);
                }} />
              <span>/ {waveform.samples.length}</span>
            </label>
            <output><code>{sample.timeS} s</code></output>
          </div>
          <table className="cw-table">
            <thead><tr><th scope="col">位点</th><th scope="col">Ω (rad/s)</th><th scope="col">Δ (rad/s)</th><th scope="col">相位 (rad)</th></tr></thead>
            <tbody>{[sample.first, sample.second].map((point, site) =>
              <tr key={site}><th scope="row"><code>{waveform.siteIds?.[site] ?? `位点 ${site + 1}`}</code></th>
                <td><code>{point.omegaRadPerS}</code></td><td><code>{point.detuningRadPerS}</code></td>
                <td><code>{point.phaseRad}</code></td></tr>)}</tbody>
          </table>
        </section>}
        {!!loaded.assessment.issues.length && <details className="cw-issues" open={loaded.assessment.issues.length <= 6}>
          <summary>所需证据（{loaded.assessment.issues.length} 项）</summary>
          <ul>{loaded.assessment.issues.map(issue => <li key={`${issue.field}:${issue.kind}`}><code>{issue.field}</code> · {issue.message}</li>)}</ul>
        </details>}
        <details className="cw-provenance">
          <summary>原始记录与工作条件</summary>
          <dl className="cw-facts">
            <div><dt>来源引用</dt><dd><code>{waveform.sourceRef ?? '未记录'}</code></dd></div>
            <div><dt>导入文件 SHA-256</dt><dd><code>{loaded.sha256 ?? '未取得'}</code></dd></div>
            <div><dt>同位素质量数与驱动波长</dt><dd><code>{waveform.isotope ?? '未记录'} · {quantity(waveform.driveWavelengthM, 'm')}</code></dd></div>
            <div><dt>原子间距与磁场夹角</dt><dd><code>{quantity(waveform.geometry.distanceM, 'm')} · {quantity(waveform.geometry.angleToMagneticFieldRad, 'rad')}</code></dd></div>
            <div><dt>磁场与电场大小</dt><dd><code>{quantity(waveform.geometry.magneticFieldT, 'T')} · {quantity(waveform.geometry.electricFieldVPerM, 'V/m')}</code></dd></div>
            <div><dt>相互作用频移</dt><dd><code>{quantity(waveform.geometry.interactionHz, 'Hz')}</code></dd></div>
            <div><dt>几何和相互作用引用</dt><dd><code>{waveform.geometry?.sourceRef ?? '未记录'}</code></dd></div>
            <div><dt>驱动标定引用</dt><dd><code>{waveform.driveCalibrationRef ?? '未记录'}</code></dd></div>
            <div><dt>逐轮响应引用</dt><dd><code>{waveform.responseDataRef ?? '未记录'}</code></dd></div>
            <div><dt>演化约定</dt><dd><code>{waveform.evolutionConvention ?? '未记录'}</code></dd></div>
          </dl>
        </details>
      </>}
      <p>采样跨度描述首末时标。正式验收需核对原始波形、实测相互作用和匹配筛选口径的门响应。</p>
      <SenooCzDynamicsPanel record={waveform ?? null} ready={ready} filename={loaded?.filename} sha256={loaded?.sha256} />
      <SenooCzBenchmarkPanel waveform={waveform ?? null} waveformSha256={loaded?.sha256 ?? null} />
    </div>
  </section>;
}
