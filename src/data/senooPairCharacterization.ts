import windowCsv from '../../references/knowledge/data/senoo-ed4-rabi-window-diagnostics.csv?raw';
import blockadeCsv from '../../references/knowledge/data/senoo-ed4f-blockade-rabi.csv?raw';
import shiftsCsv from '../../references/knowledge/data/senoo-ed5f-pair-shifts.csv?raw';
import { TAU } from '../physics/constants';
import { senooPairShiftHz } from '../physics/senooPair';
import { um } from '../physics/units';

const doi = '10.1038/s41567-026-03258-8';
export const SENOO_PAIR_SOURCE = {
  doi,
  url: `https://doi.org/${doi}`,
  figures: ['Extended Data Fig. 5f', 'Extended Data Fig. 4f'],
  evidenceKind: 'literature_reproduction',
  isotope: 171,
  states: ['m₁', 'r₀'],
  tweezerWavelengthNm: 767,
  rydbergDriveWavelengthNm: 302,
  distanceUm: 2.4,
  selectionLabel: '通过丢失检测后的单激发布居',
  exactDenominators: null,
  localPhaseData: 'window_summary_only',
  branchLabels: { free: '源表自由频率拟合', published: '固定刊版频率复算' },
  workbooks: {
    ed4: { file: 'yb-senoo-source-edfig4.xls', sha256: '3d9b826aebf68aa42e68a58cda041e85fd3884814bd1faf5320e17f574b7938a' },
    ed5: { file: 'yb-senoo-source-edfig5.xls', sha256: '50e0c772922806070d0396798eb8f3cf3f2d10d106b9fda69ada5ac0d2c0a3c0' },
  },
  derivedTables: {
    shifts: { file: 'senoo-ed5f-pair-shifts.csv', sha256: 'dfbb6cf89fb203d2bac21b03c2a05b3094a280a465e165328c0bd2f94f01e43a' },
    blockade: { file: 'senoo-ed4f-blockade-rabi.csv', sha256: 'ee2f81ac9b49b8aa909b08d0b8cc72eb5bb3c81316c7928f9f41af6417b9b093' },
    windows: {
      file: 'senoo-ed4-rabi-window-diagnostics.csv',
      sha256: 'cfa88c3bee833014f8e9fabde4eefdb2c2a8fbe83b88d9388cd306dcb671c856',
    },
  },
} as const;

export const SENOO_BLOCKADE_WINDOW_IDS = [1, 2, 3, 4] as const;
export type SenooBlockadeWindowId = typeof SENOO_BLOCKADE_WINDOW_IDS[number];
export type SenooPairDirection = 'perpendicular' | 'parallel';
type Branch = 'free' | 'published';
const archivedBranch = { free: 'free_fit', published: 'published' } as const;
const branchFrequencyHz = { free: 4242415.771484375, published: 4490000 } as const;
const pointsPerWindow = 15;
const hzPerMHz = 1e6;
const hzM6PerGHzUm6 = 1e-27;

function readRows(csv: string, columns: readonly string[], count: number, figure: string) {
  const [header, ...rows] = csv.trimEnd().split(/\r?\n/);
  if (header !== columns.join(',') || rows.length !== count) {
    throw new Error(`${figure} 的复算表结构或行数不符。`);
  }
  return rows.map(row => {
    const fields = row.split(',');
    if (fields.length !== columns.length) throw new Error(`${figure} 的复算表列数不符。`);
    return fields;
  });
}

function readNumbers(fields: readonly string[], cells: string) {
  const values = fields.map(Number);
  if (values.some((value, index) => !Number.isFinite(value) || !fields[index].trim())) {
    throw new Error(`${cells} 的数值字段无效。`);
  }
  return values;
}

function close(actual: number, expected: number, tolerance = 1e-12) {
  return Math.abs(actual - expected) <= tolerance;
}

function workbookCells(sheet: string, index: number) {
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(index + 1) % 26];
  const prefix = ['', 'A', 'B'][Math.floor((index + 1) / 26)];
  return `${sheet}!${prefix}${letter}2:${prefix}${letter}5`;
}

const shiftRows = readRows(shiftsCsv, [
  'cells', 'direction', 'distance_um', 'error_distance_um', 'observed_mhz', 'error_shift_mhz', 'c6_over_2pi_ghz_um6',
  'model_mhz', 'model_minus_observed_mhz', 'model_low_over_x_error_mhz', 'model_high_over_x_error_mhz',
  'inside_y_error', 'overlaps_xy_error_box',
], 5, '扩展数据图 5f');

export const SENOO_PAIR_SHIFTS = Object.freeze(shiftRows.map((row, index) => {
  const [sourceCells, sourceDirection] = row;
  const direction: SenooPairDirection = index < 4 ? 'perpendicular' : 'parallel';
  const [
    distanceUm, distanceErrorUm, observedMHz, shiftErrorMHz, coefficientGHzUm6, modelMHz, residualMHz, modelLowMHz, modelHighMHz,
  ] = readNumbers(row.slice(2, 11), sourceCells);
  const source = direction === 'perpendicular' ? { sheet: 'ExtendedDataFig5f_1', index, coefficient: 24 }
    : { sheet: 'ExtendedDataFig5f_2', index: 0, coefficient: 21 };
  const observedLowMHz = observedMHz - shiftErrorMHz;
  const observedHighMHz = observedMHz + shiftErrorMHz;
  const insideYError = observedLowMHz <= modelMHz && modelMHz <= observedHighMHz;
  const overlapsErrorBox = modelLowMHz <= observedHighMHz && observedLowMHz <= modelHighMHz;
  if (sourceCells !== workbookCells(source.sheet, source.index) || sourceDirection !== direction
      || coefficientGHzUm6 !== source.coefficient || distanceErrorUm <= 0 || distanceUm <= distanceErrorUm
      || observedMHz <= 0 || shiftErrorMHz <= 0) {
    throw new Error(`${sourceCells} 的方向、距离、能移或误差无效。`);
  }
  const coefficientHzM6 = coefficientGHzUm6 * hzM6PerGHzUm6;
  const predictMHz = (candidateUm: number) => senooPairShiftHz(um(candidateUm), coefficientHzM6) / hzPerMHz;
  if (!close(modelMHz, predictMHz(distanceUm))
      || !close(modelLowMHz, predictMHz(distanceUm + distanceErrorUm))
      || !close(modelHighMHz, predictMHz(distanceUm - distanceErrorUm))
      || !close(residualMHz, modelMHz - observedMHz)
      || row[11] !== String(insideYError) || row[12] !== String(overlapsErrorBox)) {
    throw new Error(`${sourceCells} 的固定系数曲线、残差或误差区间判定不符。`);
  }
  return {
    index, sourceCells, direction, distanceUm, distanceErrorUm, observedMHz, shiftErrorMHz, coefficientGHzUm6,
    modelMHz, residualMHz, modelLowMHz, modelHighMHz, insideYError, overlapsErrorBox,
  };
}));

const blockadeRows = readRows(blockadeCsv, [
  'cells', 'time_us', 'window', 'single_excitation_observed', 'error_lower', 'error_upper',
  'single_excitation_model', 'model_minus_observed', 'residual_over_mean_error', 'inside_error_bar',
  'model_at_reported_4p49_mhz', 'reported_model_minus_observed', 'reported_residual_over_mean_error', 'reported_inside_error_bar',
], 60, '扩展数据图 4f');

function readBranch(fields: readonly string[], sourceCells: string, observed: number, lowerError: number, upperError: number) {
  const [fitted, residual, scaledResidual] = readNumbers(fields.slice(0, 3), sourceCells);
  const insideErrorBar = observed - lowerError <= fitted && fitted <= observed + upperError;
  if (fitted < 0 || fitted > 1 || !close(residual, fitted - observed)
      || !close(scaledResidual, residual / ((lowerError + upperError) / 2))
      || fields[3] !== String(insideErrorBar)) {
    throw new Error(`${sourceCells} 的复算布居或残差不符。`);
  }
  return { fitted, residual, scaledResidual, insideErrorBar };
}

export const SENOO_BLOCKADE_POINTS = Object.freeze(blockadeRows.map((row, index) => {
  const [sourceCells] = row;
  const [timeUs, rawWindow, observed, lowerError, upperError] = readNumbers(row.slice(1, 6), sourceCells);
  const window = SENOO_BLOCKADE_WINDOW_IDS[Math.floor(index / pointsPerWindow)];
  const previousTimeUs = index > 0 ? Number(blockadeRows[index - 1][1]) : 0;
  if (sourceCells !== workbookCells('ExtendedDataFig4f', index) || rawWindow !== window || timeUs <= previousTimeUs
      || observed < 0 || observed > 1 || lowerError < 0 || upperError < 0 || lowerError + upperError <= 0
      || observed - lowerError < -1e-12 || observed + upperError > 1 + 1e-12) {
    throw new Error(`${sourceCells} 的时点、时窗、观测值或误差无效。`);
  }
  return {
    index, indexInWindow: index % pointsPerWindow, sourceCells, timeUs, window, observed, lowerError, upperError,
    free: readBranch(row.slice(6, 10), sourceCells, observed, lowerError, upperError),
    published: readBranch(row.slice(10, 14), sourceCells, observed, lowerError, upperError),
  };
}));

const windowRows = readRows(windowCsv, [
  'panel', 'branch', 'frequency_hz', 'window', 'first_source_cell', 'last_source_cell', 'points',
  'start_us', 'end_us', 'center_us', 'shared_phase_at_center_rad', 'fitted_phase_at_center_rad', 'local_phase_correction_rad',
  'shared_rmse', 'local_rmse', 'shared_mean_residual', 'local_mean_residual', 'shared_weighted_sse', 'local_weighted_sse',
  'shared_inside_error_bar', 'local_inside_error_bar',
], 16, '扩展数据图 4e、4f 逐窗诊断').filter(row => row[0] === '4f');
if (windowRows.length !== SENOO_BLOCKADE_WINDOW_IDS.length * 2) {
  throw new Error('扩展数据图 4f 的两个频率分支或时窗数量不符。');
}

type BlockadePoint = typeof SENOO_BLOCKADE_POINTS[number];
function readDiagnostic(branch: Branch, id: SenooBlockadeWindowId, points: readonly BlockadePoint[]) {
  const offset = branch === 'free' ? 0 : SENOO_BLOCKADE_WINDOW_IDS.length;
  const row = windowRows[offset + id - 1];
  const [panel, frequencySource, rawFrequency, rawWindow, firstSourceCell, lastSourceCell] = row;
  const [frequencyHz, window] = readNumbers([rawFrequency, rawWindow], firstSourceCell);
  const [
    count, startUs, endUs, centerUs, sharedPhaseRad, localPhaseRad, phaseCorrectionRad, sharedRmse, localRmse,
    sharedMeanResidual, localMeanResidual, sharedWeightedSse, localWeightedSse, sharedInsideErrorBar, localInsideErrorBar,
  ] = readNumbers(row.slice(6), firstSourceCell);
  const first = points[0];
  const last = points[points.length - 1];
  let residualSum = 0;
  let residualSquares = 0;
  let weightedSse = 0;
  let inside = 0;
  for (const point of points) {
    const { residual, scaledResidual, insideErrorBar } = point[branch];
    residualSum += residual;
    residualSquares += residual ** 2;
    weightedSse += scaledResidual ** 2;
    inside += Number(insideErrorBar);
  }
  const phases = [sharedPhaseRad, localPhaseRad, phaseCorrectionRad];
  const phaseDifference = localPhaseRad - sharedPhaseRad - phaseCorrectionRad;
  if (panel !== '4f' || frequencySource !== archivedBranch[branch] || frequencyHz !== branchFrequencyHz[branch] || window !== id
      || firstSourceCell !== first.sourceCells || lastSourceCell !== last.sourceCells || count !== points.length
      || startUs !== first.timeUs || endUs !== last.timeUs || !close(centerUs, (startUs + endUs) / 2)
      || phases.some(phase => Math.abs(phase) > Math.PI) || !close(phaseDifference, TAU * Math.round(phaseDifference / TAU))
      || !close(sharedRmse, Math.sqrt(residualSquares / count)) || !close(sharedMeanResidual, residualSum / count)
      || !close(sharedWeightedSse, weightedSse) || sharedInsideErrorBar !== inside
      || localRmse < Math.abs(localMeanResidual) || localWeightedSse < 0 || localWeightedSse > sharedWeightedSse
      || !Number.isInteger(localInsideErrorBar) || localInsideErrorBar < 0 || localInsideErrorBar > count) {
    throw new Error(`${firstSourceCell} 至 ${lastSourceCell} 的逐窗诊断与复算表不符。`);
  }
  return {
    sourceBranch: frequencySource, firstSourceCell, lastSourceCell, count, startUs, endUs, centerUs, frequencyHz,
    sharedPhaseRad, localPhaseRad, phaseCorrectionRad, sharedRmse, localRmse, sharedMeanResidual, localMeanResidual,
    sharedWeightedSse, localWeightedSse, sharedInsideErrorBar, localInsideErrorBar,
  };
}

export const SENOO_BLOCKADE_WINDOWS = Object.freeze(SENOO_BLOCKADE_WINDOW_IDS.map(id => {
  const points = Object.freeze(SENOO_BLOCKADE_POINTS.slice((id - 1) * pointsPerWindow, id * pointsPerWindow));
  const free = readDiagnostic('free', id, points);
  const published = readDiagnostic('published', id, points);
  return {
    id, points, free, published, startUs: free.startUs, endUs: free.endUs, centerUs: free.centerUs,
    sourceRange: `${free.firstSourceCell.split(':')[0]}:${free.lastSourceCell.split(':')[1]}`,
  };
}));

function summarize(branch: Branch) {
  let sharedSquares = 0;
  let localSquares = 0;
  let sharedWeightedSse = 0;
  let localWeightedSse = 0;
  let sharedInsideErrorBar = 0;
  let localInsideErrorBar = 0;
  for (const window of SENOO_BLOCKADE_WINDOWS) {
    const diagnostic = window[branch];
    sharedSquares += diagnostic.sharedRmse ** 2 * diagnostic.count;
    localSquares += diagnostic.localRmse ** 2 * diagnostic.count;
    sharedWeightedSse += diagnostic.sharedWeightedSse;
    localWeightedSse += diagnostic.localWeightedSse;
    sharedInsideErrorBar += diagnostic.sharedInsideErrorBar;
    localInsideErrorBar += diagnostic.localInsideErrorBar;
  }
  const count = SENOO_BLOCKADE_POINTS.length;
  return {
    count, frequencyHz: branchFrequencyHz[branch], sharedRmse: Math.sqrt(sharedSquares / count),
    localRmse: Math.sqrt(localSquares / count), rmsInMeanErrorUnits: Math.sqrt(sharedWeightedSse / count),
    sharedWeightedSse, localWeightedSse, sharedInsideErrorBar, localInsideErrorBar,
  };
}

const free = summarize('free');
const published = summarize('published');
const extraSharedWeightedSse = published.sharedWeightedSse - free.sharedWeightedSse;
const extraLocalWeightedSse = published.localWeightedSse - free.localWeightedSse;
export const SENOO_BLOCKADE_SUMMARY = {
  free, published, extraSharedWeightedSse, extraLocalWeightedSse,
  extraWeightedSseReduction: (extraSharedWeightedSse - extraLocalWeightedSse) / extraSharedWeightedSse,
};
