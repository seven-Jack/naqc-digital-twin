import { useMemo, useRef, useState } from 'react';
import {
  associateSenooCzBenchmarkWaveform, createSenooCzBenchmarkTemplate, parseSenooCzBenchmark, type SenooCzBenchmark,
} from '../physics/senooCzBenchmark';
import { fitSenooCzBenchmark } from '../physics/senooCzBenchmarkFit';
import { summarizeSenooCzBenchmark } from '../physics/senooCzBenchmarkStatistics';
import type { SenooCzWaveform } from '../physics/senooCzWaveform';
import './senoo-cz-benchmark.css';

const masks = ['prep', 'decay', 'loss'] as const;
const lossKeys = ['siteLoss', 'pairLoss'] as const;
const labels = { prep: '制备擦除', decay: '衰变擦除', loss: '丢失检测', siteLoss: '单站点丢失', pairLoss: '双位点丢失' };
const fitIssues = {
  echo: 'echo 协议，仅汇总观测', unresolved: '存在未判明结局', 'insufficient-depths': '有效深度少于 3 个',
  'zero-amplitude': '无可辨衰减振幅',
};
const percent = (value: number) => `${(100 * value).toFixed(3)}%`;

type Summary = ReturnType<typeof summarizeSenooCzBenchmark>;
type Fits = ReturnType<typeof fitSenooCzBenchmark>;
type Loaded = { batch: SenooCzBenchmark; summary: Summary; fits: Fits; filename: string; sha256: string | null };

function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SenooCzBenchmarkPanel({ waveform, waveformSha256 }: { waveform: SenooCzWaveform | null; waveformSha256: string | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [depth, setDepth] = useState<number | null>(null);
  const [attemptIndex, setAttemptIndex] = useState(0);
  const request = useRef(0);
  const row = loaded?.summary.rows.find(point => point.depth === depth);
  const selected = useMemo(() => {
    if (!loaded || !row) return null;
    const sequences = new Map(loaded.batch.sequences.filter(sequence => sequence.depth === row.depth)
      .map(sequence => [sequence.sequenceId, sequence]));
    const attempts = loaded.batch.attempts.filter(attempt => sequences.has(attempt.sequenceId));
    const attempt = attempts[attemptIndex];
    return { count: attempts.length, attempt, sequence: attempt && sequences.get(attempt.sequenceId) };
  }, [loaded, row, attemptIndex]);
  const binding = useMemo(() => loaded ? associateSenooCzBenchmarkWaveform(loaded.batch, waveform, waveformSha256) : null,
    [loaded, waveform, waveformSha256]);

  async function open(file: File) {
    const generation = ++request.current;
    setPending(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      if (generation !== request.current) return;
      const batch = parseSenooCzBenchmark(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
      if (generation !== request.current) return;
      const sha256 = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : null;
      const summary = summarizeSenooCzBenchmark(batch);
      setLoaded({ batch, summary, fits: fitSenooCzBenchmark(batch, summary), filename: file.name, sha256 });
      setDepth(summary.rows[0]?.depth ?? null);
      setAttemptIndex(0);
    } catch (problem) {
      if (generation === request.current) setError(problem instanceof Error ? problem.message : 'CZ gRB 批次导入失败。');
    } finally {
      if (generation === request.current) setPending(false);
    }
  }

  return <section className="cw-response cb-panel" aria-label="CZ gRB 与丢失独立批次" data-testid="senoo-cz-benchmark"
    data-source-kind={loaded?.batch.sourceKind ?? 'unknown'}>
    <div className="cw-summary"><h3>CZ gRB 与丢失独立批次</h3><span className="cw-readiness">
      {loaded?.batch.sourceKind === 'synthetic' ? '合成记录' : loaded ? '实测声明 · 待证据核对' : '待导入逐轮记录'}</span></div>
    <div className="md-controls ss-file-actions">
      <button type="button" onClick={() => saveJson('senoo-cz-benchmark-template-v1.json', createSenooCzBenchmarkTemplate())}>下载 CZ gRB 模板 JSON</button>
      <label>导入 CZ gRB 批次 JSON<input type="file" aria-label="导入 CZ gRB 批次 JSON" accept=".json,application/json"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void open(file);
        }} /></label>
      {loaded && <button type="button" onClick={() => saveJson('senoo-cz-benchmark-report-v1.json', {
        kind: 'senoo-cz-benchmark-report', schemaVersion: 1,
        evidence: loaded.batch.sourceKind === 'synthetic' ? 'synthetic-benchmark' : 'declared-measured-benchmark',
        input: { filename: loaded.filename, sha256: loaded.sha256, loadedWaveformSha256: waveformSha256 },
        binding, batch: loaded.batch, summary: loaded.summary, fits: loaded.fits,
      })}>导出 CZ gRB 核对 JSON</button>}
    </div>
    {pending && <p role="status">正在校验 gRB 批次…</p>}
    {error && <p className="smi-error" role="alert">{error}</p>}
    {loaded && row && <>
      <p data-testid="senoo-cz-benchmark-binding" data-binding={binding?.status}>
        {binding?.message}{binding?.sameOrderedPairs !== null && binding?.sameOrderedPairs !== undefined
          ? ` · 位点顺序与该波形一致的原子对 ${binding.sameOrderedPairs} 个` : ''}
      </p>
      <p><code>{loaded.filename}</code> · 采集 <code>{loaded.batch.acquisitionRunId}</code> · {loaded.batch.mode} · {loaded.batch.expectedAttempts} 条原子对尝试</p>
      <div className="smi-detail-controls"><label>gRB 门深度<select aria-label="gRB 门深度" value={row.depth} onChange={event => {
        setDepth(Number(event.currentTarget.value));
        setAttemptIndex(0);
      }}>{loaded.summary.rows.map(point => <option key={point.depth} value={point.depth}>{point.depth}</option>)}</select></label></div>
      <p>当前深度有 {row.sequenceCount} 条预登记线路、{row.started} 条原子对尝试。{percent(loaded.summary.confidenceLevel)} 同时区间按采集块计算。</p>
      <div className="cb-rates" data-testid="senoo-cz-benchmark-depth" data-depth={row.depth}>
        {[...masks, ...lossKeys].map(key => {
          const rate = row.rates[key];
          return <dl key={key} data-benchmark-series={key} className="cb-rate">
            <div><dt>{labels[key]}</dt><dd>{rate.hits}/{rate.denominator}{key === 'siteLoss' ? ' 站点' : ' 原子对'}</dd></div>
            <div><dt>未判明 · 采集块</dt><dd>{rate.unresolved} · {rate.blocks}</dd></div>
            <div><dt>观测区间</dt><dd>{rate.interval ? rate.interval.map(percent).join(' 至 ') : '分母为 0'}</dd></div>
          </dl>;
        })}
      </div>
      <details className="cw-provenance"><summary>三种筛选的交集</summary><ul>
        {row.maskIntersections.filter(entry => entry.attempts > 0).map(entry => <li key={`${entry.prep}/${entry.decay}/${entry.loss}`}>
          {masks.filter(mask => entry[mask]).map(mask => labels[mask]).join('、') || '三种均未纳入'} · {entry.attempts} 对
        </li>)}
      </ul></details>
      <details className="cw-provenance"><summary>描述性拟合</summary>
        <ul data-testid="senoo-cz-benchmark-fits">
          {masks.map(key => {
            const fit = loaded.fits.grb[key];
            return <li key={key} data-fit-status={fit.status}>{labels[key]} · {fit.status === 'fit'
              ? `每 CZ 保真度 ${percent(fit.fidelityPerGate)} · 加权残差 RMS ${percent(fit.weightedRms)}` : fitIssues[fit.reason]}
              {fit.status === 'fit' && !fit.observesZeroDepth && ' · 深度零外推'}</li>;
          })}
          {lossKeys.map(key => {
            const fit = loaded.fits.loss[key];
            return <li key={key} data-fit-status={fit.status}>{labels[key]} · {fit.status === 'fit'
              ? `每 CZ 斜率 ${percent(fit.slopePerGate)} · 加权残差 RMS ${percent(fit.weightedRms)}` : fitIssues[fit.reason]}
              {fit.status === 'fit' && !fit.observesZeroDepth && ' · 深度零外推'}</li>;
          })}
        </ul>
        <p>按各深度分母加权。独立重复和采集块的相关性需要用于参数误差评估。</p>
      </details>
      {selected?.attempt && selected.sequence && <details className="cw-provenance">
        <summary>当前深度的逐轮记录</summary>
        <div className="smi-detail-controls"><label>gRB 尝试序号<input aria-label="gRB 尝试序号" type="number" min={1}
          max={selected.count} value={attemptIndex + 1} onChange={event => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isInteger(next) && next >= 1 && next <= selected.count) setAttemptIndex(next - 1);
          }} /></label><span>/ {selected.count}</span></div>
        <dl className="cb-rate" data-testid="senoo-cz-benchmark-attempt">
          <div><dt>尝试 · 原子对 · 采集块</dt><dd><code>{selected.attempt.attemptId} · {selected.attempt.pairId} · {selected.attempt.blockId}</code></dd></div>
          <div><dt>线路与种子</dt><dd><code>{selected.sequence.sequenceId} · {selected.sequence.seed}</code></dd></div>
          <div><dt>目标与观测位串</dt><dd><code>{selected.sequence.target} · {selected.attempt.bitstring ?? '未记录'}</code></dd></div>
          <div><dt>位点与存活</dt><dd><code>{selected.attempt.siteIds.join('、')} · {selected.attempt.survival.join('、')}</code></dd></div>
          <div><dt>纳入的筛选组</dt><dd>{masks.filter(key => selected.attempt.masks[key]).map(key => labels[key]).join('、') || '均未纳入'}</dd></div>
          <div><dt>尝试、线路与存活来源</dt><dd><code>{selected.attempt.sourceRef} · {selected.sequence.sourceRef} · {selected.attempt.survivalRef ?? '未记录'}</code></dd></div>
        </dl>
      </details>}
    </>}
    <p>单站点与双位点丢失使用制备擦除纳入组和存活证据。三种返回成功率按各自登记的筛选计算。</p>
  </section>;
}
