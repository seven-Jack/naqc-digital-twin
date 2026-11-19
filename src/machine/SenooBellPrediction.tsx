import { Download, Lock, Upload } from 'lucide-react';
import { SENOO_BELL_SETTINGS } from '../physics/senooBellObservations';
import {
  createSenooBellPredictionTemplate, type compareSenooBellPrediction, type SenooBellPrediction,
} from '../physics/senooBellPrediction';
import type { CircuitImportNotice, ImportedCircuitDocument } from './SenooBellObservations';

export interface FrozenBellPrediction {
  readonly input: ImportedCircuitDocument<SenooBellPrediction>;
  readonly frozenInSessionAtUtc: string;
}

type Comparison = ReturnType<typeof compareSenooBellPrediction>;
const settingLabels = { population: 'ZZ 布居', plus: '+π/4 奇偶', minus: '−π/4 奇偶' } as const;
const statusLabels = { pass: '符合判据', fail: '超出容差', inconclusive: '证据不足' } as const;
const format = (value: number | null) => value === null ? '待判读' : value.toFixed(4);

export function SenooBellPredictionSetup({ candidate, frozen, observationOpened, notice, onOpen, onFreeze, saveJson }: {
  candidate: ImportedCircuitDocument<SenooBellPrediction> | null;
  frozen: FrozenBellPrediction | null;
  observationOpened: boolean;
  notice?: CircuitImportNotice;
  onOpen: (file: File) => void;
  onFreeze: (value: FrozenBellPrediction) => void;
  saveJson: (filename: string, value: unknown) => void;
}) {
  const locked = !!frozen || observationOpened;
  const ready = !locked && !!candidate?.sha256 && !notice;
  const record = frozen?.input.record ?? candidate?.record;

  return <section className="smi-detail scb-bell-prediction" aria-label="Bell 联合预测冻结">
    <div className="md-controls ss-file-actions">
      <button type="button" onClick={() => saveJson('senoo-bell-prediction-template-v1.json', createSenooBellPredictionTemplate())}>
        <Download size={14} />下载 Bell 联合预测模板 JSON
      </button>
      <label className={locked ? 'scb-input-disabled' : undefined}><Upload size={14} />导入 Bell 联合预测 JSON
        <input type="file" aria-label="导入 Bell 联合预测 JSON" accept=".json,application/json" disabled={locked} onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file && !locked) onOpen(file);
        }} />
      </label>
      <button type="button" disabled={!ready} onClick={() => {
        if (ready && candidate) onFreeze({ input: candidate, frozenInSessionAtUtc: new Date().toISOString() });
      }}><Lock size={14} />冻结 Bell 联合预测</button>
      {frozen && <button type="button" onClick={() => saveJson('senoo-bell-prediction-frozen-v1.json', {
        kind: 'senoo-bell-prediction-frozen', schemaVersion: 1, frozenInSessionAtUtc: frozen.frozenInSessionAtUtc,
        input: { filename: frozen.input.filename, sha256: frozen.input.sha256 }, prediction: frozen.input.record,
      })}><Download size={14} />导出已冻结 Bell 预测 JSON</button>}
    </div>
    {notice?.status === 'pending' && <p className="smi-note" role="status">正在核对 Bell 联合预测…</p>}
    {notice?.status === 'error' && <p className="smi-error" role="alert">{notice.message}</p>}
    <p className="smi-note">{frozen ? <>本页已冻结 · <code>{frozen.input.filename}</code> · {frozen.frozenInSessionAtUtc}</>
      : observationOpened ? '本页已有观测。启动新的核对会话后，可在导入观测前冻结预测。'
        : candidate?.sha256 ? <>待冻结 · <code>{candidate.filename}</code></>
          : candidate ? '当前环境未取得预测文件 SHA-256。' : '联合对照请先导入并冻结预测，再导入观测。'}</p>
    {record && !observationOpened && <p className="smi-note">
      {(100 * record.confidenceLevel).toFixed(1)}% 联合水平 · 相干容差 ±{format(record.derivedTolerances.coherenceImag)}
      {' · '}重叠容差 ±{format(record.derivedTolerances.overlap)}
    </p>}
    {record && !observationOpened && <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="三组 Bell 预测与预设判据">
      <table className="smi-table scb-bell-table">
        <thead><tr><th scope="col">设置</th><th scope="col">预测</th><th scope="col">容差</th><th scope="col">最低有效轮</th></tr></thead>
        <tbody>{SENOO_BELL_SETTINGS.map(setting => {
          const row = record.settings[setting];
          return <tr key={setting}><th scope="row">{settingLabels[setting]}</th><td>{format(row.expected)}</td>
            <td>{format(row.tolerance)}</td><td>{row.minDenominator}</td></tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}

export function SenooBellPredictionResult({ comparison }: { comparison: Comparison }) {
  const derivedRows = [
    { key: 'coherenceImag', label: '相干项 Im ρ₀₀,₁₁', denominator: '± 两组', ...comparison.derived.coherenceImag },
    { key: 'overlap', label: '目标态原始重叠', denominator: '全部三组', ...comparison.derived.overlap },
  ];
  const rows = [
    ...comparison.settings.map(row => ({
      ...row, key: row.setting, label: settingLabels[row.setting], denominator: `${row.denominator ?? '待判读'} / ${row.minDenominator}`,
    })),
    ...derivedRows,
  ];
  return <section className="smi-detail scb-bell-prediction" data-testid="senoo-bell-prediction-comparison" aria-label="Bell 联合预测对照">
    <p className="smi-note"><strong>{statusLabels[comparison.status]}</strong> · {(100 * comparison.confidenceLevel).toFixed(1)}% 联合区间
      {comparison.scope === 'synthetic' ? ' · 合成验收' : ' · 正式证据待核验'}</p>
    <div className="smi-table-scroll" role="region" tabIndex={0} aria-label="Bell 预测、残差与有效轮次">
      <table className="smi-table scb-bell-table scb-bell-prediction-table">
        <thead><tr><th scope="col">观测量</th><th scope="col">预测／观测</th><th scope="col">残差及区间</th>
          <th scope="col">有效／最低</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} data-prediction-metric={row.key} data-status={row.status}>
          <th scope="row">{row.label}<small>{statusLabels[row.status]}</small></th>
          <td>{format(row.expected)}<small>{format(row.observed)}</small></td>
          <td>{format(row.residual)}{row.residualLower !== null && <small>{format(row.residualLower)} 至 {format(row.residualUpper)}</small>}</td>
          <td>{row.denominator}<small>容差 ±{format(row.tolerance)}</small></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="smi-note">残差为观测减冻结预测。相干项要求两个相位组达到各自最低有效轮次，重叠要求三组均达到。</p>
  </section>;
}
