import reproductionCsv from '../../references/knowledge/data/senoo-fig2c-rabi.csv?raw';
import { piPulseSeconds } from '../physics/clockDynamics';
import { TAU } from '../physics/constants';
import { senooRabiPopulation, type SenooRabiParameters } from '../physics/senooRabi';
import { us } from '../physics/units';
import { SENOO_POPULATION_SOURCE } from './senooPopulationSource';

export const SENOO_RABI_STATES = ['m1', 'r0'] as const;
type State = typeof SENOO_RABI_STATES[number];
type Trace = typeof SENOO_POPULATION_SOURCE.traces[number];

export interface SenooRabiObservation {
  readonly sourceCells: string;
  readonly population: number;
  readonly lowerError: number;
  readonly upperError: number;
  readonly prediction: number;
  readonly residual: number;
  readonly residualInMeanErrorUnits: number;
  readonly withinErrorBar: boolean;
}

export interface SenooRabiTimePoint {
  readonly sourceIndex: number;
  readonly timeUs: number;
  readonly m1: SenooRabiObservation;
  readonly r0: SenooRabiObservation;
}

const { source, traces: [m1Trace, r0Trace] } = SENOO_POPULATION_SOURCE;
export const SENOO_RABI_CHARACTERIZATION_SOURCE = {
  ...source,
  url: `https://doi.org/${source.doi}`,
  evidenceKind: 'literature_reproduction',
  selectionLabel: '通过最终丢失检测后的条件布居',
  derivedTable: {
    file: 'senoo-fig2c-rabi.csv',
    sha256: 'e20ab2b8e91a5c519e3b4cac0b2dc697a33a9f16bc43a133ec80effbe1b850ba',
  },
  sourceRanges: { m1: `${m1Trace.sheet}!${m1Trace.range}`, r0: `${r0Trace.sheet}!${r0Trace.range}` },
  timeRangeUs: [0.01, 1],
} as const;

// Archived parameters from scripts/reproduce-senoo-rabi.ts for the paired CSV.
const parameters = {
  frequencyHz: 3022088.623046875,
  phaseRad: -0.0370072865077411,
  minimumR0: 0.0052926929022051586,
  maximumR0: 1,
} as const satisfies SenooRabiParameters;

const columns = [
  'cells', 'observed', 'error_lower', 'error_upper', 'model',
  'model_minus_observed', 'residual_over_mean_error', 'inside_error_bar',
];
const header = ['time_us', ...SENOO_RABI_STATES.flatMap(state => columns.map(column => `${state}_${column}`))].join(',');
const [archivedHeader, ...rows] = reproductionCsv.trimEnd().split(/\r?\n/);
if (archivedHeader !== header || rows.length !== 80 || m1Trace.id !== 'm1' || r0Trace.id !== 'r0'
    || m1Trace.points.length !== rows.length || r0Trace.points.length !== rows.length) {
  throw new Error('图 2c 的复算表结构或配对时点数量不符。');
}

function readObservation(fields: readonly string[], trace: Trace, index: number, model: number): SenooRabiObservation {
  const point = trace.points[index];
  const { sourceColumn } = point;
  const sourceCells = `${trace.sheet}!${sourceColumn}2:${sourceColumn}5`;
  const numeric = fields.slice(1, -1);
  const [population, lowerError, upperError, prediction, residual, residualInMeanErrorUnits] = numeric.map(Number);
  const withinErrorBar = population - lowerError <= prediction && prediction <= population + upperError;
  if (fields[0] !== sourceCells || !numeric.every(value => value.trim() && Number.isFinite(Number(value)))
      || point.population !== population || point.lowerError !== lowerError || point.upperError !== upperError
      || lowerError < 0 || upperError < 0 || lowerError + upperError <= 0 || prediction < 0 || prediction > 1
      || fields.at(-1) !== String(withinErrorBar)
      || Math.abs(model - prediction) > 1e-12 || Math.abs(prediction - population - residual) > 1e-12
      || Math.abs(residual / ((lowerError + upperError) / 2) - residualInMeanErrorUnits) > 1e-12) {
    throw new Error(`${sourceCells} 的观测、误差条或模型残差与记录不符。`);
  }
  return { sourceCells, population, lowerError, upperError, prediction, residual, residualInMeanErrorUnits, withinErrorBar };
}

export const SENOO_RABI_POINTS: readonly SenooRabiTimePoint[] = Object.freeze(rows.map((row, sourceIndex) => {
  const fields = row.split(',');
  const timeUs = Number(fields[0]);
  const m1Point = m1Trace.points[sourceIndex];
  const r0Point = r0Trace.points[sourceIndex];
  if (fields.length !== 1 + SENOO_RABI_STATES.length * columns.length || !Number.isFinite(timeUs)
      || timeUs <= (r0Trace.points[sourceIndex - 1]?.timeUs ?? 0)
      || m1Point.sourceIndex !== sourceIndex || r0Point.sourceIndex !== sourceIndex
      || m1Point.sourceColumn !== r0Point.sourceColumn || timeUs !== m1Point.timeUs || timeUs !== r0Point.timeUs
      || Math.abs(m1Point.population + r0Point.population - 1) > 1e-12) {
    throw new Error(`图 2c 第 ${sourceIndex + 1} 个时点的时间或两态配对不符。`);
  }
  const prediction = senooRabiPopulation(us(timeUs), parameters);
  const m1 = readObservation(fields.slice(1, 1 + columns.length), m1Trace, sourceIndex, prediction.m1);
  const r0 = readObservation(fields.slice(1 + columns.length), r0Trace, sourceIndex, prediction.r0);
  return { sourceIndex, timeUs, m1, r0 };
}));

function summarize(state: State) {
  let sum = 0;
  let squares = 0;
  let scaledSquares = 0;
  let insideErrorBars = 0;
  let maxAbsResidual = 0;
  for (const point of SENOO_RABI_POINTS) {
    const { residual, residualInMeanErrorUnits, withinErrorBar } = point[state];
    sum += residual;
    squares += residual ** 2;
    scaledSquares += residualInMeanErrorUnits ** 2;
    insideErrorBars += Number(withinErrorBar);
    maxAbsResidual = Math.max(maxAbsResidual, Math.abs(residual));
  }
  const total = SENOO_RABI_POINTS.length;
  return {
    meanResidual: sum / total,
    rmse: Math.sqrt(squares / total),
    rmsInMeanErrorUnits: Math.sqrt(scaledSquares / total),
    insideErrorBars,
    maxAbsResidual,
  };
}

export const SENOO_RABI_FIT = {
  parameters,
  fittedState: 'r0',
  contrast: parameters.maximumR0 - parameters.minimumR0,
  piTimeUs: piPulseSeconds(parameters.frequencyHz) / us(1),
  firstMaximumUs: (Math.PI - parameters.phaseRad) / (TAU * parameters.frequencyHz * us(1)),
  summaries: { m1: summarize('m1'), r0: summarize('r0') },
} as const;
