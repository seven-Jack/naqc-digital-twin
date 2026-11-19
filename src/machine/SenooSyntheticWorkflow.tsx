import { useState } from 'react';
import type { SenooMeasurementReport } from '../physics/senooMeasurements';
import { freezeSenooSyntheticRule, verifySenooSyntheticRule } from '../physics/senooSyntheticWorkflow';
import './senoo-synthetic-workflow.css';

type FrozenRule = ReturnType<typeof freezeSenooSyntheticRule>;
type Verification = ReturnType<typeof verifySenooSyntheticRule>;

const preparedLabels = { m1: 'm₁', m0: 'm₀', empty_control: '空位对照' };
const outcomeLabels: Record<string, string> = { m0: 'm₀', m1: 'm₁', 'no-atom': '双暗', ambiguous: '歧义' };

function fraction(count: number, total: number) {
  return total ? `${count}/${total}` : '—';
}

function Denominators({ counts }: { counts: FrozenRule['denominators'] }) {
  return <dl className="ssw-denominators">
    <div><dt>尝试位点</dt><dd>{counts.attemptedSites}</dd></div>
    <div><dt>制备通过</dt><dd>{counts.prepPassed}</dd></div>
    <div><dt>有效配对</dt><dd>{counts.validPairs}</dd></div>
    <div><dt>原记录纳入</dt><dd>{counts.included}</dd></div>
    <div><dt>可评估</dt><dd>{counts.evaluated}</dd></div>
  </dl>;
}

function HoldoutResult({ result, countUnit }: { result: Verification; countUnit: string }) {
  const { totals, groups, samples } = result;
  return <div className="ssw-result" data-testid="senoo-holdout-results" aria-live="polite">
    <h4>独立批次核对 <code>{result.validationBatchId}</code></h4>
    <p className="smi-note">采集运行 <code>{result.validationRunId}</code></p>
    <Denominators counts={result.denominators} />
    <dl className="ssw-denominators ssw-outcomes">
      <div><dt>自旋错标</dt><dd>{fraction(totals.wrongSpin, totals.spinEvaluated)}</dd></div>
      <div><dt>自旋判丢失</dt><dd>{fraction(totals.falseLoss, totals.spinEvaluated)}</dd></div>
      <div><dt>全组歧义</dt><dd>{fraction(totals.ambiguous, totals.evaluated)}</dd></div>
      <div><dt>空位误报</dt><dd>{fraction(totals.emptyFalsePositive, totals.emptyEvaluated)}</dd></div>
    </dl>
    <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="合成验证按制备组统计">
      <table className="ssw-table">
        <thead><tr>
          <th scope="col">制备组</th><th scope="col">尝试位点</th><th scope="col">制备通过</th>
          <th scope="col">有效配对</th><th scope="col">原记录纳入</th><th scope="col">可评估</th>
          <th scope="col">错标／误报</th><th scope="col">双暗</th><th scope="col">歧义</th>
        </tr></thead>
        <tbody>{groups.map(group => <tr key={group.preparedGroup}>
          <th scope="row">{preparedLabels[group.preparedGroup]}</th>
          <td>{group.attemptedSites}</td><td>{group.prepPassed}</td><td>{group.validPairs}</td>
          <td>{group.included}</td><td>{group.evaluated}</td>
          <td>{fraction(group.wrongLabel, group.evaluated)}</td>
          <td>{fraction(group.reportedLoss, group.evaluated)}</td>
          <td>{fraction(group.ambiguous, group.evaluated)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="smi-note">双暗在已制备原子的位点记为判丢失，在空位对照中记为判空位。各组比率以可评估位点数为分母。</p>
    <details className="ssw-samples" open={samples.length <= 5}>
      <summary>逐位点判读（{samples.length}）</summary>
      <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="合成验证逐位点判读">
        <table className="ssw-table ssw-sample-table">
          <thead><tr>
            <th scope="col">尝试</th><th scope="col">位点</th><th scope="col">制备组</th>
            <th scope="col">Image 1（{countUnit}）</th><th scope="col">Image 2（{countUnit}）</th>
            <th scope="col">冻结规则判读</th>
          </tr></thead>
          <tbody>{samples.map(sample => <tr key={JSON.stringify([sample.attemptId, sample.siteId])}>
            <th scope="row"><code>{sample.attemptId}</code></th><td><code>{sample.siteId}</code></td>
            <td>{preparedLabels[sample.preparedGroup]}</td><td>{sample.counts.first}</td><td>{sample.counts.second}</td>
            <td>{sample.outcome === 'no-atom' ? (sample.preparedGroup === 'empty_control' ? '判空位' : '判丢失') : outcomeLabels[sample.outcome]}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}

export function SenooSyntheticWorkflow({ report, filename }: { report: SenooMeasurementReport; filename: string }) {
  const [calibrationId, setCalibrationId] = useState('');
  const [validationId, setValidationId] = useState('');
  const [freeze, setFreeze] = useState<{ report: SenooMeasurementReport; value: FrozenRule } | null>(null);
  const [validation, setValidation] = useState<{ frozen: FrozenRule; value: Verification } | null>(null);
  const [failure, setFailure] = useState<{ report: SenooMeasurementReport; message: string } | null>(null);
  const calibrations = report.batches.filter(batch => batch.role === 'calibration' && batch.sourceKind === 'synthetic');
  const validations = report.batches.filter(batch => batch.role === 'validation' && batch.sourceKind === 'synthetic');
  if (!calibrations.length || !validations.length) return null;

  const frozen = freeze?.report === report ? freeze.value : null;
  const verification = frozen && validation?.frozen === frozen ? validation.value : null;
  const calibrationBatch = calibrations.find(batch => batch.id === calibrationId) ?? calibrations[0];
  const validationBatch = validations.find(batch => batch.id === validationId) ?? validations[0];
  const error = failure?.report === report ? failure.message : null;

  function freezeRule() {
    setFailure(null);
    try {
      setFreeze({ report, value: freezeSenooSyntheticRule(report, calibrationBatch.id) });
    } catch (problem) {
      setFailure({ report, message: problem instanceof Error ? problem.message : '合成阈值冻结失败。' });
    }
  }

  function verifyRule() {
    if (!frozen) return;
    setFailure(null);
    try {
      setValidation({ frozen, value: verifySenooSyntheticRule(frozen, report, validationBatch.id) });
    } catch (problem) {
      setFailure({ report, message: problem instanceof Error ? problem.message : '合成验证失败。' });
    }
  }

  function exportResult() {
    if (!frozen) return;
    const summary = { evidence: frozen.evidence, schemaVersion: frozen.schemaVersion, filename, frozen, verification };
    const url = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'senoo-synthetic-acceptance.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="ssw-panel" data-testid="senoo-synthetic-workflow" aria-label="双曝光合成验收">
    <h3>双曝光合成验收</h3>
    <p className="smi-note">只用标定批次中原记录纳入且两帧都有效、有数值的配对选阈值。冻结后按同一规则判读独立批次。</p>
    <div className="ssw-steps">
      <section className="ssw-step" aria-label="阈值冻结">
        <h4>阈值冻结</h4>
        <div className="smi-detail-controls">
          <label>合成标定批次
            <select value={frozen?.calibrationBatchId ?? calibrationBatch.id} disabled={!!frozen}
              onChange={event => setCalibrationId(event.target.value)}>
              {calibrations.map(batch => <option key={batch.id} value={batch.id}>{batch.id}</option>)}
            </select>
          </label>
          <button type="button" disabled={!!frozen} onClick={freezeRule}>冻结合成阈值</button>
        </div>
        {frozen && <div className="ssw-frozen" data-testid="senoo-frozen-thresholds" aria-live="polite">
          <p>冻结阈值 <strong><code>{frozen.rule.thresholds.first} / {frozen.rule.thresholds.second} {frozen.countUnit}</code></strong></p>
          <p className="smi-note">采集运行 <code>{frozen.calibrationRunId}</code></p>
          <p className="smi-note">Image 1 与 Image 2 分别取暗态最大计数和亮态最小计数的中点。计数达到阈值即判亮。</p>
          <dl className="ssw-denominators">
            <div><dt>Image 1 暗态上界／亮态下界</dt><dd>{frozen.channelBounds.first.darkMax} / {frozen.channelBounds.first.brightMin}</dd></div>
            <div><dt>Image 2 暗态上界／亮态下界</dt><dd>{frozen.channelBounds.second.darkMax} / {frozen.channelBounds.second.brightMin}</dd></div>
          </dl>
          <Denominators counts={frozen.denominators} />
        </div>}
      </section>
      <section className="ssw-step" aria-label="独立验证">
        <h4>独立验证</h4>
        <div className="smi-detail-controls">
          <label>合成验证批次
            <select value={verification?.validationBatchId ?? validationBatch.id} disabled={!!verification}
              onChange={event => setValidationId(event.target.value)}>
              {validations.map(batch => <option key={batch.id} value={batch.id}>{batch.id}</option>)}
            </select>
          </label>
          <button type="button" disabled={!frozen || !!verification} onClick={verifyRule}>运行合成验证</button>
        </div>
      </section>
    </div>
    {error && <p className="smi-error" role="alert">{error}</p>}
    {frozen && verification && <HoldoutResult result={verification} countUnit={frozen.countUnit} />}
    {frozen && <div className="ssw-actions">
      <button type="button" onClick={exportResult}>导出合成验收 JSON</button>
      <button type="button" onClick={() => { setFreeze(null); setValidation(null); setFailure(null); }}>清除冻结规则</button>
    </div>}
  </section>;
}
