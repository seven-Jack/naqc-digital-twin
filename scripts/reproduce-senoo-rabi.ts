import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SENOO_POPULATION_SOURCE } from '../src/data/senooPopulationSource';
import { TAU } from '../src/physics/constants';
import { piPulseSeconds } from '../src/physics/clockDynamics';
import { senooRabiPopulation, type SenooRabiParameters } from '../src/physics/senooRabi';
import { us } from '../src/physics/units';

const [m1, r0] = SENOO_POPULATION_SOURCE.traces;
const meanError = (point: (typeof r0.points)[number]) => (point.lowerError + point.upperError) / 2;
const observations = r0.points.map(point => {
  const scale = meanError(point);
  if (scale <= 0) throw new Error(`Missing fit weight at ${r0.sheet}!${point.sourceColumn}`);
  return { time: us(point.timeUs), measured: point.population, weight: 1 / scale ** 2 };
});

const frequencyBoundsHz = [2.5e6, 4e6] as const;
const tolerance = { rmse: 0.03, rmsInMeanErrorUnits: 2 };
const unitInterval = (value: number) => Math.max(0, Math.min(1, value));

function profile(frequencyHz: number, phaseRad: number) {
  // At fixed frequency and phase, the model is linear in its minimum and maximum.
  const unitShape = { frequencyHz, phaseRad, minimumR0: 0, maximumR0: 1 };
  const samples = observations.map(point => {
    const { m1: lowBasis, r0: highBasis } = senooRabiPopulation(point.time, unitShape);
    return { ...point, lowBasis, highBasis };
  });
  let lowSquared = 0;
  let cross = 0;
  let highSquared = 0;
  let lowObserved = 0;
  let highObserved = 0;
  for (const { weight, measured, lowBasis, highBasis } of samples) {
    lowSquared += weight * lowBasis ** 2;
    cross += weight * lowBasis * highBasis;
    highSquared += weight * highBasis ** 2;
    lowObserved += weight * lowBasis * measured;
    highObserved += weight * highBasis * measured;
  }

  // A constrained optimum is either the interior solution or the minimum on one edge.
  const constant = (lowObserved + highObserved) / (lowSquared + 2 * cross + highSquared);
  const candidates = [
    [0, unitInterval(highObserved / highSquared)],
    [unitInterval((lowObserved - cross) / lowSquared), 1],
    [constant, constant],
  ];
  const determinant = lowSquared * highSquared - cross ** 2;
  const low = (highSquared * lowObserved - cross * highObserved) / determinant;
  const high = (lowSquared * highObserved - cross * lowObserved) / determinant;
  if (0 <= low && low <= high && high <= 1) candidates.push([low, high]);

  let best = null;
  for (const [minimumR0, maximumR0] of candidates) {
    const score = samples.reduce((sum, point) => {
      const residual = minimumR0 * point.lowBasis + maximumR0 * point.highBasis - point.measured;
      return sum + point.weight * residual ** 2;
    }, 0);
    if (best === null || score < best.score) {
      best = { parameters: { frequencyHz, phaseRad, minimumR0, maximumR0 }, score };
    }
  }
  if (best === null) throw new Error('No Rabi fit candidate');
  return best;
}

function fit() {
  const [minimum, maximum] = frequencyBoundsHz;
  let best = profile(minimum, -Math.PI);
  function scan(frequency: number, stepHz: number, frequencySteps: number, phase: number, stepRad: number, phaseSteps: number) {
    for (let i = 0; i <= frequencySteps; i++) {
      const candidateHz = frequency + i * stepHz;
      if (candidateHz < minimum || candidateHz > maximum) continue;
      for (let j = 0; j < phaseSteps; j++) {
        const candidate = profile(candidateHz, phase + j * stepRad);
        if (candidate.score < best.score) best = candidate;
      }
    }
  }

  let stepHz = (maximum - minimum) / 60;
  let stepRad = TAU / 64;
  scan(minimum, stepHz, 60, -Math.PI, stepRad, 64);
  for (let pass = 0; pass < 6; pass++) {
    const { frequencyHz, phaseRad } = best.parameters;
    scan(frequencyHz - stepHz, stepHz / 4, 8, phaseRad - stepRad, stepRad / 4, 9);
    stepHz /= 4;
    stepRad /= 4;
  }
  const { phaseRad } = best.parameters;
  return { ...best.parameters, phaseRad: Math.atan2(Math.sin(phaseRad), Math.cos(phaseRad)) };
}

function compare(trace: typeof r0, index: number, predicted: number) {
  const point = trace.points[index];
  const { sourceColumn, population, lowerError, upperError } = point;
  const residual = predicted - population;
  return {
    cells: `${trace.sheet}!${sourceColumn}2:${sourceColumn}5`,
    population, lowerError, upperError, predicted, residual,
    residualInMeanErrorUnits: residual / meanError(point),
    withinErrorBar: population - lowerError <= predicted && predicted <= population + upperError,
  };
}

function pointwise(parameters: SenooRabiParameters) {
  if (m1.id !== 'm1' || r0.id !== 'r0' || m1.points.length !== 80 || r0.points.length !== 80) {
    throw new Error('Expected Fig. 2c paired m1 and r0 populations at 80 time points');
  }
  return r0.points.map((point, index) => {
    const paired = m1.points[index];
    if (point.sourceIndex !== index || paired.sourceIndex !== index ||
        point.timeUs !== paired.timeUs || point.sourceColumn !== paired.sourceColumn ||
        Math.abs(point.population + paired.population - 1) > 1e-12) {
      throw new Error(`Inconsistent Fig. 2c pairing at index ${index}`);
    }
    const predicted = senooRabiPopulation(us(point.timeUs), parameters);
    return { timeUs: point.timeUs, m1: compare(m1, index, predicted.m1), r0: compare(r0, index, predicted.r0) };
  });
}

function summarize(rows: ReturnType<typeof pointwise>, state: 'm1' | 'r0') {
  const points = rows.map(row => ({ ...row[state], timeUs: row.timeUs }));
  const mean = (field: 'residual' | 'residualInMeanErrorUnits', power: 1 | 2) =>
    points.reduce((sum, point) => sum + point[field] ** power, 0) / points.length;
  return {
    meanResidual: mean('residual', 1),
    rmse: Math.sqrt(mean('residual', 2)),
    rmsInMeanErrorUnits: Math.sqrt(mean('residualInMeanErrorUnits', 2)),
    insideErrorBars: points.filter(point => point.withinErrorBar).length,
    largestAbsoluteResidual: points.reduce((worst, point) =>
      Math.abs(point.residual) > Math.abs(worst.residual) ? point : worst),
    largestScaledResidual: points.reduce((worst, point) =>
      Math.abs(point.residualInMeanErrorUnits) > Math.abs(worst.residualInMeanErrorUnits) ? point : worst),
  };
}

const out = process.argv[2];
if (!out) throw new Error('Supply the output path for the 80-point CSV');
const parameters = fit();
const rows = pointwise(parameters);
const r0Summary = summarize(rows, 'r0');
const physical = rows.every(row => row.r0.predicted >= 0 && row.r0.predicted <= 1 &&
  Math.abs(row.r0.predicted + row.m1.predicted - 1) < 1e-12);
const passed = physical && r0Summary.rmse <= tolerance.rmse &&
  r0Summary.rmsInMeanErrorUnits <= tolerance.rmsInMeanErrorUnits;

const fields = [
  ['cells', 'cells'], ['population', 'observed'], ['lowerError', 'error_lower'],
  ['upperError', 'error_upper'], ['predicted', 'model'], ['residual', 'model_minus_observed'],
  ['residualInMeanErrorUnits', 'residual_over_mean_error'], ['withinErrorBar', 'inside_error_bar'],
] as const;
const states = ['m1', 'r0'] as const;
const header = ['time_us', ...states.flatMap(state => fields.map(([, column]) => `${state}_${column}`))];
const records = rows.map(row => [row.timeUs, ...states.flatMap(state => fields.map(([key]) => row[state][key]))]);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, [header, ...records].map(record => record.join(',')).join('\n') + '\n');
console.log(JSON.stringify({
  evidenceKind: 'literature-reproduction',
  source: SENOO_POPULATION_SOURCE.source,
  timePoints: rows.length,
  fittedTrace: r0.sheet,
  timeRangeUs: [rows[0].timeUs, rows[rows.length - 1].timeUs],
  frequencyBoundsHz, parameters,
  contrast: parameters.maximumR0 - parameters.minimumR0,
  timeOfFirstPeakSeconds: (Math.PI - parameters.phaseRad) / (TAU * parameters.frequencyHz),
  piPulseSeconds: piPulseSeconds(parameters.frequencyHz),
  m1: summarize(rows, 'm1'),
  r0: r0Summary,
  acceptance: { physical, tolerance, passed },
}, null, 2));
if (!passed) process.exitCode = 1;
