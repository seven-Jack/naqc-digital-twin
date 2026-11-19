import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { senooPairShiftHz } from '../src/physics/senooPair';
import { um } from '../src/physics/units';
import {
  compareBlockade, envelopeBoundsSeconds, fitBlockade, meanError, rms, summarizeBlockade, type BlockadePoint,
} from './senoo-rabi-profile';

type Direction = 'perpendicular' | 'parallel';

interface ShiftPoint {
  cells: string;
  direction: Direction;
  distanceUm: number;
  distanceErrorUm: number;
  shiftMHz: number;
  shiftErrorMHz: number;
}

interface PairSource {
  doi: string;
  ed4Sha256: string;
  ed5Sha256: string;
  shifts: ShiftPoint[];
  blockade: BlockadePoint[];
}

const reportedC6GHzUm6 = { perpendicular: 24, parallel: 21 };
const reportedSingleMHz = 3.24;
const reportedBlockadeHz = 4.49e6;
const frequencyBoundsHz = [4e6, 5e6] as const;
const reportedBranchBoundsHz = [4.39e6, 4.59e6] as const;

function compareShift(point: ShiftPoint) {
  const coefficientHzM6 = reportedC6GHzUm6[point.direction] * 1e-27;
  const shiftMHz = (distanceUm: number) => senooPairShiftHz(um(distanceUm), coefficientHzM6) / 1e6;
  const centralModel = shiftMHz(point.distanceUm);
  // For a positive C6, the prediction decreases monotonically over the X error bar.
  const distanceLow = point.distanceUm - point.distanceErrorUm;
  const distanceHigh = point.distanceUm + point.distanceErrorUm;
  const modelLow = shiftMHz(distanceHigh);
  const modelHigh = shiftMHz(distanceLow);
  const observedLow = point.shiftMHz - point.shiftErrorMHz;
  const observedHigh = point.shiftMHz + point.shiftErrorMHz;
  return {
    ...point,
    coefficientGHzUm6: reportedC6GHzUm6[point.direction],
    centralModel,
    residual: centralModel - point.shiftMHz,
    modelLow,
    modelHigh,
    centralInsideY: observedLow <= centralModel && centralModel <= observedHigh,
    overlapsErrorBox: modelLow <= observedHigh && observedLow <= modelHigh,
    compatibleC6Low: observedLow * distanceLow ** 6 / 1000,
    compatibleC6High: observedHigh * distanceHigh ** 6 / 1000,
  };
}

function compareShifts(points: ShiftPoint[]) {
  const rows = points.map(compareShift);
  const byDirection = (['perpendicular', 'parallel'] as const).map(direction => {
    const group = rows.filter(row => row.direction === direction);
    return {
      direction,
      points: group.length,
      residualRmsMHz: rms(group.map(row => row.residual)),
      errorBoxesIntersected: group.filter(row => row.overlapsErrorBox).length,
      compatibleC6GHzUm6: [
        Math.max(...group.map(row => row.compatibleC6Low)),
        Math.min(...group.map(row => row.compatibleC6High)),
      ],
    };
  });
  return { rows, byDirection };
}

function writeCsv(path: string, header: string, rows: (string | number | boolean)[][]) {
  writeFileSync(path, header + '\n' + rows.map(row => row.join(',')).join('\n') + '\n');
}

const output = process.argv[2];
if (!output) throw new Error('Supply the directory for the two CSV outputs');
const source: PairSource = JSON.parse(readFileSync(0, 'utf8'));
if (source.doi !== '10.1038/s41567-026-03258-8' ||
    source.shifts.filter(point => point.direction === 'perpendicular').length !== 4 ||
    source.shifts.filter(point => point.direction === 'parallel').length !== 1 || source.shifts.length !== 5 ||
    source.blockade.length !== 60 ||
    source.blockade.some((point, index) => point.window !== 1 + Math.floor(index / 15) || meanError(point) <= 0)) {
  throw new Error('Expected the published ED5f and ED4f archive inputs');
}

const shifts = compareShifts(source.shifts);
const gaussian = fitBlockade(source.blockade, 'gaussian', frequencyBoundsHz);
const blockaded = compareBlockade(source.blockade, gaussian);
const atReported = fitBlockade(source.blockade, 'gaussian', [reportedBlockadeHz, reportedBlockadeHz]);
const reportedRows = compareBlockade(source.blockade, atReported);
const reportedBranch = fitBlockade(source.blockade, 'gaussian', reportedBranchBoundsHz);
const exponential = fitBlockade(source.blockade, 'exponential', frequencyBoundsHz);
const summary = summarizeBlockade(blockaded);
const reportedSummary = summarizeBlockade(reportedRows);
const toleranceInMeanErrorUnits = 2;
const shiftsPass = shifts.rows.every(row => row.overlapsErrorBox);
const freeFrequencyPass =
  blockaded.every(row => row.prediction >= 0 && row.prediction <= 1) &&
  summary.scaledResidualRms <= toleranceInMeanErrorUnits;

mkdirSync(output, { recursive: true });
writeCsv(join(output, 'senoo-ed5f-pair-shifts.csv'),
  'cells,direction,distance_um,error_distance_um,observed_mhz,error_shift_mhz,c6_over_2pi_ghz_um6,' +
  'model_mhz,model_minus_observed_mhz,model_low_over_x_error_mhz,model_high_over_x_error_mhz,inside_y_error,overlaps_xy_error_box',
  shifts.rows.map(row => [
    row.cells, row.direction, row.distanceUm, row.distanceErrorUm, row.shiftMHz, row.shiftErrorMHz,
    row.coefficientGHzUm6, row.centralModel, row.residual, row.modelLow, row.modelHigh, row.centralInsideY, row.overlapsErrorBox,
  ]));
writeCsv(join(output, 'senoo-ed4f-blockade-rabi.csv'),
  'cells,time_us,window,single_excitation_observed,error_lower,error_upper,single_excitation_model,model_minus_observed,' +
  'residual_over_mean_error,inside_error_bar,model_at_reported_4p49_mhz,reported_model_minus_observed,' +
  'reported_residual_over_mean_error,reported_inside_error_bar',
  blockaded.map((row, index) => [
    row.cells, row.timeUs, row.window, row.population, row.lowerError, row.upperError,
    row.prediction, row.residual, row.scaledResidual, row.insideErrorBar,
    reportedRows[index].prediction, reportedRows[index].residual,
    reportedRows[index].scaledResidual, reportedRows[index].insideErrorBar,
  ]));
console.log(JSON.stringify({
  evidenceKind: 'literature-reproduction',
  doi: source.doi,
  ed4Sha256: source.ed4Sha256,
  ed5Sha256: source.ed5Sha256,
  energyShift: { coefficients: reportedC6GHzUm6, byDirection: shifts.byDirection },
  blockade: {
    distanceUm: 2.4,
    filtering: 'loss-detected',
    timeRangeUs: [blockaded[0].timeUs, blockaded[blockaded.length - 1].timeUs],
    frequencyBoundsHz, envelopeBoundsSeconds,
    gaussian, exponential,
    cyclesAt1e: gaussian.frequencyHz * gaussian.envelopeSeconds,
    reportedFrequencyRatioToEd4e: reportedBlockadeHz / (reportedSingleMHz * 1e6),
    summary,
    atReportedFrequency: { parameters: atReported, summary: reportedSummary },
    nearReportedFrequency: {
      frequencyBoundsHz: reportedBranchBoundsHz, parameters: reportedBranch,
      summary: summarizeBlockade(compareBlockade(source.blockade, reportedBranch)),
    },
    sensitivityExponential: summarizeBlockade(compareBlockade(source.blockade, exponential)),
    byWindow: [1, 2, 3, 4].map(window => summarizeBlockade(blockaded.filter(row => row.window === window))),
    largestAbsoluteResidual: blockaded.reduce((worst, row) =>
      Math.abs(row.residual) > Math.abs(worst.residual) ? row : worst),
  },
  acceptance: {
    toleranceInMeanErrorUnits, shiftsPass, freeFrequencyPass,
    reportedFrequencyPass: reportedSummary.scaledResidualRms <= toleranceInMeanErrorUnits,
  },
}, null, 2));
if (!shiftsPass || !freeFrequencyPass) process.exitCode = 1;
