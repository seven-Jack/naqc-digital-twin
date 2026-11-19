import { useState } from 'react';
import { simulateSenooCzDynamics, type SenooCzDynamicsResult } from '../physics/senooCzDynamics';
import { SENOO_CZ_EVOLUTION_CONVENTION, type SenooCzWaveform } from '../physics/senooCzWaveform';
import { SenooCzResponsePanel } from './SenooCzResponsePanel';

interface Props {
  readonly record: SenooCzWaveform | null;
  readonly ready: boolean;
  readonly filename?: string;
  readonly sha256?: string | null;
}

interface Run {
  readonly record: SenooCzWaveform;
  readonly maxStepS: number;
  readonly result: SenooCzDynamicsResult;
}

function probability(value: number) {
  return `${(100 * value).toFixed(6)}%`;
}

function amplitude({ real, imag }: { real: number; imag: number }) {
  return `${real.toFixed(6)} ${imag < 0 ? '−' : '+'} ${Math.abs(imag).toFixed(6)}i`;
}

function magnitude(value: number | null) {
  return value === null ? '未定义' : value.toExponential(3);
}

export function SenooCzDynamicsPanel({ record, ready, filename, sha256 }: Props) {
  const [sampling, setSampling] = useState<'' | 'zero-order-hold'>('');
  const [step, setStep] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [failure, setFailure] = useState<{ record: SenooCzWaveform; message: string } | null>(null);
  const validConvention = record?.evolutionConvention === SENOO_CZ_EVOLUTION_CONVENTION;
  const maxStepS = Number(step) * 1e-9;
  const enabled = ready && validConvention && sampling !== '' && Number.isFinite(maxStepS) && maxStepS > 0;
  const current = run && run.record === record && run.maxStepS === maxStepS && sampling !== '' ? run : null;
  const result = current?.result;

  function calculate() {
    if (!enabled || !record) return;
    setFailure(null);
    setRun(null);
    try {
      const result = simulateSenooCzDynamics(record, { sampling, maxStepS });
      setRun({ record, maxStepS, result });
    } catch (problem) {
      setFailure({ record, message: problem instanceof Error ? problem.message : '相干演化计算失败。' });
    }
  }

  function exportResult() {
    if (!current) return;
    const bundle = {
      schemaVersion: 1, evidence: 'conditional-closed-system-forward-model',
      waveform: {
        filename, sha256, sourceKind: current.record.sourceKind, sourceRef: current.record.sourceRef,
        gateVersion: current.record.gateVersion, acquisitionRunId: current.record.acquisitionRunId, siteIds: current.record.siteIds,
        window: current.record.window, evolutionConvention: current.record.evolutionConvention,
      },
      options: { sampling, maxStepS: current.maxStepS },
      result: current.result,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'senoo-cz-coherent-prediction-v1.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="cw-dynamics" aria-label="两原子 CZ 相干前向模型" data-testid="senoo-cz-dynamics" data-runnable={enabled}>
    <div className="cw-summary"><h3>两原子 CZ 相干前向模型</h3><span className="cw-readiness">条件计算 · 待实验验收</span></div>
    {!ready && <p>等待资料齐备的实测波形输入。</p>}
    {ready && !validConvention && <p>计算前须在波形中声明已归一的 <code>evolutionConvention</code>。</p>}
    <p>使用 Δ = 驱动角频率 − 裸跃迁角频率，且取 〈r₀|H/ℏ|m₁〉 = Ωe<sup>iφ</sup>/2。保留输入相位参考，门后 Z 补偿另行核对。</p>
    <div className="smi-detail-controls">
      <label>采样解释
        <select value={sampling} onChange={event => {
          setSampling(event.currentTarget.value === 'zero-order-hold' ? 'zero-order-hold' : '');
          setFailure(null);
        }}>
          <option value="">请选择</option><option value="zero-order-hold">左样点零阶保持</option>
        </select>
      </label>
      <label>粗步长上限 (ns)
        <input type="number" step="any" value={step} onChange={event => {
          setStep(event.currentTarget.value);
          setFailure(null);
        }} />
      </label>
    </div>
    <div className="md-controls">
      <button type="button" disabled={!enabled} onClick={calculate}>核对相干演化</button>
      {result && <button type="button" onClick={exportResult}>导出相干计算 JSON</button>}
    </div>
    {failure && failure.record === record && <p className="smi-error" role="alert">{failure.message}</p>}
    {result && <div className="cw-dynamics-result" data-testid="senoo-cz-dynamics-result" aria-live="polite">
      <p>条件相位 <strong><code>{result.conditionalPhaseRad === null ? '未定义' : `${result.conditionalPhaseRad.toFixed(6)} rad`}</code></strong></p>
      <table className="cw-table">
        <thead><tr><th scope="col">输入</th><th scope="col">原态复振幅</th><th scope="col">原态返回</th><th scope="col">里德堡泄漏</th></tr></thead>
        <tbody>{result.inputs.map(input => <tr key={input.input}>
          <th scope="row"><code>{input.input}</code></th><td><code>{amplitude(input.diagonal)}</code></td>
          <td><code>{probability(input.logicalReturnProbability)}</code></td><td><code>{probability(input.rydbergLeakageProbability)}</code></td>
        </tr>)}</tbody>
      </table>
      <dl className="cw-facts">
        <div><dt>传播步数（粗／细）</dt><dd><code>{result.convergence.coarseStepCount} / {result.convergence.fineStepCount}</code></dd></div>
        <div><dt>缩步最大振幅变化</dt><dd><code>{magnitude(result.convergence.maxDiagonalAbsChange)}</code></dd></div>
        <div><dt>缩步最大泄漏变化</dt><dd><code>{magnitude(result.convergence.maxLeakageAbsChange)}</code></dd></div>
        <div><dt>缩步条件相位变化</dt><dd><code>{magnitude(result.convergence.conditionalPhaseAbsChangeRad)}</code> rad</dd></div>
      </dl>
    </div>}
    <p>计算限于封闭相干演化。实际原子损失、读出误差和 gRB 结果由独立实验核对。</p>
    <SenooCzResponsePanel waveform={record} waveformSha256={sha256 ?? null} prediction={result} maxStepS={current?.maxStepS} />
  </section>;
}
