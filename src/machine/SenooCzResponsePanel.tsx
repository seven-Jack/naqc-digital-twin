import { useMemo, useRef, useState } from 'react';
import type { SenooCzDynamicsResult } from '../physics/senooCzDynamics';
import { createSenooCzResponseTemplate, parseSenooCzResponse, type SenooCzResponse } from '../physics/senooCzResponse';
import { compareSenooCzResponse } from '../physics/senooCzResponseComparison';
import type { SenooCzWaveform } from '../physics/senooCzWaveform';

type Comparison = ReturnType<typeof compareSenooCzResponse>;
type Imported = { response: SenooCzResponse; filename: string; sha256: string | null };
interface Props {
  waveform: SenooCzWaveform | null;
  waveformSha256: string | null;
  prediction?: SenooCzDynamicsResult;
  maxStepS?: number;
}

const relationLabels = { below: '观测区间低于模型', inside: '观测区间覆盖模型', above: '观测区间高于模型', unavailable: '分母为 0' };
const phaseLabels = {
  comparable: '同相位参考', 'missing-response': '待独立相位估计', 'missing-model': '模型条件相位未定义',
  'incompatible-reference': '相位参考待对齐',
};

function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const points = (value: number) => (value * 100).toFixed(2);
const intervalText = (interval: readonly number[] | null, format = percent) => interval ? interval.map(format).join(' 至 ') : '未估计';

function ResponseComparison({ comparison }: { comparison: Comparison }) {
  const { phase } = comparison;
  return <div className="cw-response-results" data-testid="senoo-cz-response-result" data-scope={comparison.scope}>
    <p>布居比较使用 {percent(comparison.confidenceLevel)} 同时区间。区间涵盖计数波动和未解析分类，读出系统误差另行核对。</p>
    <div className="cw-response-grid">
      {comparison.rows.map(row => <div className="cw-response-card" key={row.input} data-input={row.input}>
        <h4>输入 <code>{row.input}</code></h4>
        <p>尝试 {row.started} · 制备拒绝 {row.rejected} · 纳入 {row.accepted} · 未解析 {row.unresolved}</p>
        {([['原态返回', row.return], ['里德堡泄漏', row.rydbergLeakage]] as const).map(([label, metric]) => <dl key={label} className="cw-response-metric">
          <div><dt>{label}</dt><dd>{metric.hits}/{metric.denominator}</dd></div>
          <div><dt>模型</dt><dd>{percent(metric.model)}</dd></div>
          <div><dt>观测区间</dt><dd>{intervalText(metric.interval)}</dd></div>
          <div><dt>观测减模型（百分点）</dt><dd>{intervalText(metric.residual, points)}</dd></div>
          <div><dt>比较</dt><dd>{relationLabels[metric.relation]}</dd></div>
        </dl>)}
        <details><summary>探测分类计数</summary>
          <p>原态 {row.counts.returned} · 其他逻辑态 {row.counts['other-logical']} · 里德堡 {row.counts.rydberg}</p>
          <p>首位点丢失 {row.counts['first-site-loss']} · 次位点丢失 {row.counts['second-site-loss']} · 双位点丢失 {row.counts['pair-loss']}</p>
          <p>歧义 {row.counts.ambiguous} · 判读缺失 {row.counts.unavailable}</p>
        </details>
      </div>)}
    </div>
    <div className="cw-response-phase" data-phase-status={phase.status}>
      <h4>条件相位 · {phaseLabels[phase.status]}</h4>
      {phase.status === 'comparable' && <p>{comparison.scope === 'synthetic' ? '合成估计' : '实验拟合'} {phase.estimateRad?.toFixed(6)} rad
        {' · '}模型 {phase.modelRad?.toFixed(6)} rad · 环绕残差 {phase.residualRad?.toFixed(6)} rad
        {' · '}输入区间半宽 {phase.halfWidthRad?.toFixed(6)} rad · 相位置信水平 {phase.confidenceLevel === null ? '未记录' : percent(phase.confidenceLevel)}</p>}
      {phase.residualIntervalsRad && <p>环绕残差区间 {phase.residualIntervalsRad.map(([lower, upper]) =>
        `${lower.toFixed(6)} 至 ${upper.toFixed(6)} rad`).join(' 或 ')}</p>}
    </div>
  </div>;
}

export function SenooCzResponsePanel({ waveform, waveformSha256, prediction, maxStepS }: Props) {
  const [imported, setImported] = useState<Imported | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const requestId = useRef(0);
  const result = useMemo(() => {
    if (!imported || !waveform || !prediction) return null;
    try {
      return { comparison: compareSenooCzResponse(imported.response, waveform, waveformSha256, prediction), issue: null };
    } catch (error) {
      return { comparison: null, issue: error instanceof Error ? error.message : '门响应与波形条件不匹配。' };
    }
  }, [imported, waveform, waveformSha256, prediction]);

  async function load(file: File) {
    const request = ++requestId.current;
    setIssue(null);
    try {
      const bytes = await file.arrayBuffer();
      const response = parseSenooCzResponse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const hash = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
      if (request !== requestId.current) return;
      const sha256 = hash ? Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('') : null;
      setImported({ response, filename: file.name, sha256 });
    } catch (error) {
      if (request === requestId.current) setIssue(error instanceof Error ? error.message : '门响应导入失败。');
    }
  }

  return <section className="cw-response" aria-label="两原子 CZ 独立门响应" data-testid="senoo-cz-response">
    <div className="cw-summary"><h3>两原子 CZ 独立门响应</h3>
      <span className="cw-readiness">{imported?.response.sourceKind === 'synthetic' ? '合成记录' : imported ? '实测声明 · 待来源核对' : '待导入响应'}</span></div>
    <div className="md-controls ss-file-actions">
      <button type="button" onClick={() => saveJson('senoo-cz-response-template-v1.json', createSenooCzResponseTemplate())}>下载 CZ 门响应模板 JSON</button>
      <label>导入 CZ 门响应 JSON<input type="file" aria-label="导入 CZ 门响应 JSON" accept=".json,application/json" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void load(file);
      }} /></label>
      {result?.comparison && imported && <button type="button" onClick={() => saveJson('senoo-cz-response-comparison-v1.json', {
        kind: 'senoo-cz-response-comparison', schemaVersion: 1, evidence: imported.response.sourceKind === 'synthetic'
          ? 'synthetic-response-comparison' : 'declared-measured-response-comparison',
        inputs: { responseFilename: imported.filename, responseSha256: imported.sha256, waveformSha256 },
        response: imported.response, options: { sampling: 'zero-order-hold', maxStepS }, prediction, comparison: result.comparison,
      })}>导出 CZ 门响应核对 JSON</button>}
    </div>
    {issue && <p className="smi-error" role="alert">{issue}</p>}
    {imported && <p><code>{imported.filename}</code> · 采集 <code>{imported.response.acquisitionRunId}</code> · {imported.response.attempts.length} 次尝试</p>}
    {imported && !prediction && <p>载入匹配波形并计算相干演化后显示对照。</p>}
    {result?.issue && <p className="smi-error" role="alert">{result.issue}</p>}
    {result?.comparison && <ResponseComparison comparison={result.comparison} />}
    <p>布居和条件相位按各自探测口径比较。gRB 与物理丢失用各自的实测协议验收。</p>
  </section>;
}
