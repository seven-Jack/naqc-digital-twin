import { useId, useRef, useState } from 'react';
import { ChartScatter, FileDown } from 'lucide-react';
import type { Model } from '../physics/model';
import { fitStarkShift, intensityProxy, parseStarkCsv, STARK_CSV_HEADER } from '../physics/starkCalibration';
import { kHz } from '../physics/units';
import { colors, sample } from '../plots/curves';
import { ScientificPlot } from '../plots/ScientificPlot';

type ImportedFit = { filename: string; source: string; result: ReturnType<typeof fitStarkShift> };

export function Calibration({ model }: { model: Model }) {
  const formatId = useId();
  const [source, setSource] = useState('');
  const [fit, setFit] = useState<ImportedFit>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);

  async function importFile(file: File) {
    const request = ++revision.current;
    const origin = source.trim();
    setFit(undefined);
    setError('');
    setLoading(true);
    try {
      if (!origin) throw new Error('请填写数据来源和实验条件。');
      if (file.size > 256_000) throw new Error('CSV 文件须小于 256 kB。');
      const rows = parseStarkCsv(await file.text());
      if (revision.current === request) setFit({ filename: file.name, source: origin, result: fitStarkShift(rows) });
    } catch (reason) {
      if (revision.current === request) setError(reason instanceof Error ? reason.message : '无法读取 CSV。');
    } finally {
      if (revision.current === request) setLoading(false);
    }
  }

  return <details className="panel research-panel">
    <summary><ChartScatter size={17} /> 实验光移校准</summary>
    <div className="research-detail">
      <p className="research-note">导入同一 ¹⁷¹Yb 钟跃迁分支与 532 nm 光镊条件下的实测光移。文件在当前浏览器内处理。拟合结果用于比较当前模型，预测精度可用独立数据检查。</p>
      <div className="research-inputs">
        <label className="calibration-source">数据来源与实验条件
          <input type="text" placeholder="实验编号、偏振与参考频率" maxLength={240} value={source} onChange={event => setSource(event.target.value)} />
        </label>
        <label>导入光移 CSV<input type="file" accept=".csv,text/csv" aria-describedby={formatId} disabled={!source.trim()} onChange={event => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = '';
        }} /></label>
        <a className="research-download" download="yb171-stark-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(STARK_CSV_HEADER + '\n')}`}>
          <FileDown size={15} /> 下载空白模板
        </a>
      </div>
      <p className="research-note" id={formatId}>每行填写原子处光镊功率 (mW)、束腰 (µm)、钟跃迁光移 (kHz)、光移的 1σ 不确定度 (kHz) 和分组。至少 3 行标为 <code>fit</code>，独立验证数据标为 <code>validation</code>。拟合模型为 Δν = b + a·P/w₀²。</p>
      {loading && <p role="status" className="research-note">正在读取 CSV…</p>}
      {error && <p role="alert" className="research-alert">{error}</p>}
      {fit && <FitResult fit={fit} model={model} />}
    </div>
  </details>;
}

function FitResult({ fit, model }: { fit: ImportedFit; model: Model }) {
  const { result } = fit;
  const x = intensityProxy(model.parameters.powerMw, model.parameters.waistUm);
  const atOperatingPoint = result.prediction(x);
  const xRange: [number, number] = [0, Math.max(x, ...result.residuals.map(row => row.x)) * 1.05];
  const theoreticalSlope = model.starkHz / kHz(1) / x;
  const predicted = sample(...xRange, 60, value => result.prediction(value).value);
  const theory = sample(...xRange, 60, value => theoreticalSlope * value);
  const values = [...predicted.map(point => point[1]), ...theory.map(point => point[1]), ...result.residuals.map(row => row.shiftKhz)];
  const yMin = Math.min(0, ...values);
  const yMax = Math.max(0, ...values);
  const margin = Math.max(1, (yMax - yMin) * 0.08);
  if (![atOperatingPoint.value, atOperatingPoint.sigma, yMin - margin, yMax + margin, yMax - yMin + 2 * margin].every(Number.isFinite)) {
    return <p role="alert" className="research-alert">拟合超出当前工作点可用的数值范围，请核对数据与单位。</p>;
  }
  const extrapolated = x < result.minX || x > result.maxX;
  const f = (value: number) => value.toPrecision(4);
  return <>
    <p className="research-note" data-testid="calibration-result">{fit.filename} · {fit.source} · {result.fitCount} 条拟合数据，{result.validationCount} 条独立验证数据</p>
    <dl className="research-metrics">
      <div><dt>拟合斜率 [kHz/(mW/µm²)]</dt><dd>{f(result.slope)} ± {f(result.slopeSigma)}</dd></div>
      <div><dt>拟合零功率截距 (kHz)</dt><dd>{f(result.intercept)} ± {f(result.interceptSigma)}</dd></div>
      <div><dt>当前工作点预测 (kHz)</dt><dd>{f(atOperatingPoint.value)} ± {f(atOperatingPoint.sigma)}</dd></div>
      <div><dt>独立验证均方根误差 (kHz)</dt><dd data-testid="calibration-validation-rmse">{result.validationRmse === null ? '待提供验证数据' : f(result.validationRmse)}</dd></div>
    </dl>
    <p className="research-note">约化 χ² = {f(result.reducedChiSquared)}。误差估计采用输入的独立光移标准不确定度，功率与束腰按给定值处理。{extrapolated && '当前工作点超出拟合范围，预测属于外推。'}</p>
    <ScientificPlot label="理论与实测光移比较" xLabel="P / w₀² (mW/µm²)" yLabel="光移 (kHz)" xRange={xRange} yRange={[yMin - margin, yMax + margin]}
      series={[
        { id: 'fit', label: '加权拟合', color: colors.cyan, points: predicted },
        { id: 'theory', label: '条件理论', color: colors.gold, dashed: true, points: theory },
      ]}
      markers={[{ x, color: colors.muted }]}
      dots={result.residuals.map(row => ({ x: row.x, y: row.shiftKhz, color: row.split === 'fit' ? colors.cyan : colors.violet }))} />
    <p className="research-note">青色点用于拟合，紫色点用于独立验证，竖线标出当前工作点。</p>
    <details className="research-residuals">
      <summary>逐点残差</summary>
      <table className="research-table">
        <thead><tr><th scope="col">分组</th><th scope="col">P / w₀²</th><th scope="col">实测 (kHz)</th><th scope="col">实测 − 拟合 (kHz)</th></tr></thead>
        <tbody>{result.residuals.map((row, i) => <tr key={i}><th scope="row">{row.split === 'fit' ? '拟合' : '验证'}</th>
          <td>{f(row.x)}</td><td>{f(row.shiftKhz)}</td><td>{f(row.residualKhz)}</td></tr>)}</tbody>
      </table>
    </details>
  </>;
}
