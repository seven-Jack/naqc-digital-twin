import {
  parseSenooReadoutAcceptancePlan, senooReadoutAcceptanceMetrics, type SenooReadoutAcceptanceMetricKey,
  type SenooReadoutAcceptancePlan, type SenooReadoutAcceptanceResult as AcceptanceReport,
} from '../physics/senooReadoutAcceptance';
import { groupLabels } from './senooMeasurementLabels';

const limitGroups = (['m1', 'm0', 'empty_control'] as const).map(group => ({
  group, metrics: senooReadoutAcceptanceMetrics.filter(metric => metric.group === group),
}));

const statusLabels: Record<AcceptanceReport['status'], string> = {
  pass: '达到冻结判据', fail: '超出冻结判据', inconclusive: '现有证据不足', 'cross-workpoint': '跨工况对照',
};
const metricStatusLabels: Record<AcceptanceReport['metrics'][number]['status'], string> = {
  pass: '上界达标', fail: '下界超限', inconclusive: '区间证据不足',
};

function significant(value: number) {
  return Number(value.toPrecision(6));
}

function percentage(rate: number | null) {
  return rate === null ? '未计算' : `${significant(rate * 100)}%`;
}

export interface SenooReadoutAcceptanceDraft {
  enabled: boolean;
  confidencePercent: string;
  independenceRef: string;
  minAttemptsPerGroup: string;
  minEvaluablePercent: string;
  limits: Record<SenooReadoutAcceptanceMetricKey, string>;
}

export function createSenooReadoutAcceptanceDraft(): SenooReadoutAcceptanceDraft {
  return {
    enabled: false, confidencePercent: '', independenceRef: '', minAttemptsPerGroup: '', minEvaluablePercent: '',
    limits: Object.fromEntries(senooReadoutAcceptanceMetrics.map(({ key }) => [key, ''])) as SenooReadoutAcceptanceDraft['limits'],
  };
}

function requiredNumber(value: string, label: string) {
  const numeric = Number(value);
  if (!value.trim() || !Number.isFinite(numeric)) throw new Error(`请填写${label}。`);
  return numeric;
}

export function readSenooReadoutAcceptanceDraft(draft: SenooReadoutAcceptanceDraft): SenooReadoutAcceptancePlan | null {
  if (!draft.enabled) return null;
  const confidenceLevel = requiredNumber(draft.confidencePercent, '同时置信水平') / 100;
  const minAttemptsPerGroup = requiredNumber(draft.minAttemptsPerGroup, '每组最少可判读尝试轮数');
  const minEvaluableFraction = requiredNumber(draft.minEvaluablePercent, '每组最低可判读比例') / 100;
  const limits = Object.fromEntries(senooReadoutAcceptanceMetrics.map(({ key, group, label }) => [
    key, requiredNumber(draft.limits[key], `${groupLabels[group]}的${label}上限`) / 100,
  ]));
  return parseSenooReadoutAcceptancePlan({ confidenceLevel, minAttemptsPerGroup, minEvaluableFraction, limits, independenceRef: draft.independenceRef });
}

type EditorProps = {
  draft: SenooReadoutAcceptanceDraft;
  onChange: (value: SenooReadoutAcceptanceDraft) => void;
};

export function SenooReadoutAcceptanceEditor({ draft, onChange }: EditorProps) {
  return <div className="smf-acceptance-editor">
    <label className="smf-acceptance-switch">
      <input type="checkbox" checked={draft.enabled} onChange={event => onChange({ ...draft, enabled: event.target.checked })} />
      同时冻结数值验收判据
    </label>
    {draft.enabled && <div className="smf-fields smf-acceptance-fields" aria-label="独立验证的预设判据">
      <p className="smi-note">在查看独立批次结果前填写。可判读比例用各组纳入且具有有效双帧的位点数除以该组尝试位点数。</p>
      <div className="smf-acceptance-grid">
        <label>同时置信水平 (%)
          <input type="number" step="any" min="0" max="100" value={draft.confidencePercent}
            onChange={event => onChange({ ...draft, confidencePercent: event.target.value })} />
        </label>
        <label>每组最少可判读尝试轮数
          <input type="number" step="1" min="1" value={draft.minAttemptsPerGroup}
            onChange={event => onChange({ ...draft, minAttemptsPerGroup: event.target.value })} />
        </label>
        <label>每组最低可判读比例 (%)
          <input type="number" step="any" min="0" max="100" value={draft.minEvaluablePercent}
            onChange={event => onChange({ ...draft, minEvaluablePercent: event.target.value })} />
        </label>
        <label>尝试轮间独立性依据
          <input type="text" value={draft.independenceRef}
            onChange={event => onChange({ ...draft, independenceRef: event.target.value })} />
        </label>
      </div>
      {limitGroups.map(({ group, metrics }) => <fieldset className="smf-acceptance-group" key={group}>
        <legend>{groupLabels[group]}</legend>
        <div className="smf-acceptance-grid">{metrics.map(({ key, label }) => <label key={key}>{label}上限 (%)
          <input aria-label={`${groupLabels[group]} ${label}上限 (%)`} type="number" step="any" min="0" max="100"
            value={draft.limits[key]} onChange={event => onChange({ ...draft, limits: { ...draft.limits, [key]: event.target.value } })} />
        </label>)}</div>
      </fieldset>)}
    </div>}
  </div>;
}

export function SenooReadoutAcceptanceSummary({ plan }: { plan: SenooReadoutAcceptancePlan | null }) {
  if (!plan) return <p className="smi-note">数值验收判据未登记，可导出独立批次的描述性统计。</p>;
  return <details className="smf-acceptance-summary">
    <summary>冻结的数值验收判据</summary>
    <dl className="smf-acceptance-facts">
      <div><dt>同时置信水平</dt><dd>{percentage(plan.confidenceLevel)}</dd></div>
      <div><dt>每组最少可判读尝试轮数</dt><dd>{plan.minAttemptsPerGroup}</dd></div>
      <div><dt>每组最低可判读比例</dt><dd>{percentage(plan.minEvaluableFraction)}</dd></div>
      <div><dt>尝试轮间独立性依据</dt><dd>{plan.independenceRef}</dd></div>
    </dl>
    {limitGroups.map(({ group, metrics }) => <div className="smf-acceptance-summary-group" key={group}>
      <h5>{groupLabels[group]}</h5>
      <dl className="smf-acceptance-facts">{metrics.map(({ key, label }) => <div key={key}>
        <dt>{label}上限</dt><dd>{percentage(plan.limits[key])}</dd>
      </div>)}</dl>
    </div>)}
  </details>;
}

export function SenooReadoutAcceptanceResult({ result }: { result: AcceptanceReport | null }) {
  if (!result) return null;
  return <section className="smf-acceptance-result" aria-label="冻结判据核对" data-testid="senoo-readout-acceptance-result"
    data-acceptance-status={result.status}>
    <div className="smf-acceptance-header">
      <h4>冻结判据核对</h4>
      <p className="smf-acceptance-status" data-status={result.status}>{statusLabels[result.status]}</p>
    </div>
    <p className="smi-note">同时置信水平 {percentage(result.confidenceLevel)}。区间以可判读位点为分母，允许同轮位点相关，依据尝试轮间独立的假设。</p>
    <div className="smf-acceptance-results-grid">
      {result.groups.map(group => <section className="smf-acceptance-card" key={group.group}>
        <div className="smf-acceptance-header">
          <h5>{groupLabels[group.group]}</h5>
          {!group.meetsMinimum && <span className="smf-acceptance-status" data-status="inconclusive">分母不足</span>}
        </div>
        <dl className="smf-acceptance-facts">
          <div><dt>可判读位点</dt><dd>{group.evaluableSites}/{group.attemptedSites} · {percentage(group.evaluableFraction)}</dd></div>
          <div><dt>可判读尝试</dt><dd>{group.attemptCount} 轮</dd></div>
        </dl>
        {result.metrics.filter(metric => metric.group === group.group).map(metric => <div className="smf-acceptance-metric" key={metric.key}>
          <div className="smf-acceptance-header">
            <h6>{metric.label}</h6>
            <span className="smf-acceptance-status" data-status={metric.status}>{metricStatusLabels[metric.status]}</span>
          </div>
          <dl className="smf-acceptance-facts">
            <div><dt>观测</dt><dd>{metric.numerator}/{metric.denominator} · {percentage(metric.rate)}</dd></div>
            <div><dt>置信区间</dt><dd>{metric.lower === null || metric.upper === null
              ? '未计算' : `${percentage(metric.lower)} – ${percentage(metric.upper)}`}</dd></div>
            <div><dt>冻结上限</dt><dd>{percentage(metric.limit)}</dd></div>
            <div><dt>验证减标定</dt><dd>{metric.delta === null ? '未计算' : `${significant(metric.delta * 100)} 个百分点`}</dd></div>
          </dl>
        </div>)}
      </section>)}
    </div>
  </section>;
}
