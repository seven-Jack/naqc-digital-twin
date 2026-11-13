export const STARK_CSV_HEADER = 'power_mW,waist_um,shift_kHz,sigma_kHz,split';

export interface StarkObservation {
  powerMw: number;
  waistUm: number;
  shiftKhz: number;
  sigmaKhz: number;
  split: 'fit' | 'validation';
}

export const intensityProxy = (powerMw: number, waistUm: number) => powerMw / waistUm ** 2;

export function parseStarkCsv(csv: string): StarkObservation[] {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines[0].split(',').map(column => column.trim()).join(',');
  if (header !== STARK_CSV_HEADER) throw new Error('CSV 表头与模板不一致。');
  if (lines.length > 501) throw new Error('每次最多导入 500 行数据。');
  return lines.slice(1).flatMap((line, index) => {
    if (!line.trim()) return [];
    const columns = line.split(',').map(value => value.trim());
    const [powerMw, waistUm, shiftKhz, sigmaKhz] = columns.slice(0, 4).map(value => value ? Number(value) : NaN);
    const split = columns[4];
    if (columns.length !== 5 || ![powerMw, waistUm, shiftKhz, sigmaKhz].every(Number.isFinite) ||
      powerMw < 0 || waistUm <= 0 || sigmaKhz <= 0 || (split !== 'fit' && split !== 'validation')) {
      throw new Error(`第 ${index + 2} 行有无效数据。功率须非负，束腰与标准不确定度须为正，分组须为 fit 或 validation。`);
    }
    return [{ powerMw, waistUm, shiftKhz, sigmaKhz, split }];
  });
}

export function fitStarkShift(observations: readonly StarkObservation[]) {
  const fit = observations.filter(row => row.split === 'fit');
  if (fit.length < 3) throw new Error('至少需要 3 行拟合数据，并覆盖不同的 P/w₀²。');
  const points = fit.map(row => ({ x: intensityProxy(row.powerMw, row.waistUm), y: row.shiftKhz, w: (1 / row.sigmaKhz) ** 2 }));
  const weight = points.reduce((sum, row) => sum + row.w, 0);
  const meanX = points.reduce((sum, row) => sum + row.w * row.x, 0) / weight;
  const meanY = points.reduce((sum, row) => sum + row.w * row.y, 0) / weight;
  const xx = points.reduce((sum, row) => sum + row.w * (row.x - meanX) ** 2, 0);
  const xy = points.reduce((sum, row) => sum + row.w * (row.x - meanX) * (row.y - meanY), 0);
  const slope = xy / xx;
  const intercept = meanY - slope * meanX;
  if (![weight, xx, slope, intercept].every(Number.isFinite) || weight <= 0 || xx <= 0) {
    throw new Error('拟合需要不同的 P/w₀²，且数值范围必须支持稳定计算。');
  }
  const prediction = (x: number) => ({
    value: intercept + slope * x,
    sigma: Math.sqrt(1 / weight + (x - meanX) ** 2 / xx),
  });
  const residuals = observations.map(row => {
    const x = intensityProxy(row.powerMw, row.waistUm);
    return { ...row, x, residualKhz: row.shiftKhz - prediction(x).value };
  });
  const chiSquared = residuals.reduce((sum, row) => sum + (row.split === 'fit' ? (row.residualKhz / row.sigmaKhz) ** 2 : 0), 0);
  const validation = residuals.filter(row => row.split === 'validation');
  const validationRmse = validation.length ? Math.hypot(...validation.map(row => row.residualKhz)) / Math.sqrt(validation.length) : null;
  const slopeSigma = 1 / Math.sqrt(xx);
  const interceptSigma = prediction(0).sigma;
  const minX = Math.min(...points.map(row => row.x));
  const maxX = Math.max(...points.map(row => row.x));
  const plotEdge = 1.05 * Math.max(1, ...residuals.map(row => row.x));
  if (![chiSquared, slopeSigma, interceptSigma, validationRmse ?? 0, plotEdge, prediction(plotEdge).value,
    ...residuals.map(row => row.residualKhz)].every(Number.isFinite)) {
    throw new Error('数据数值范围过大，无法计算有限的不确定度或残差。');
  }
  return {
    slope, slopeSigma, intercept, interceptSigma, reducedChiSquared: chiSquared / (fit.length - 2),
    fitCount: fit.length, validationCount: validation.length, validationRmse, residuals, prediction,
    minX, maxX,
  };
}
