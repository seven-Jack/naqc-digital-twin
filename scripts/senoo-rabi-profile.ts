import { senooBlockadeExcitationProbability, type SenooBlockadeRabiParameters } from '../src/physics/senooPair';
import { us } from '../src/physics/units';

type Envelope = SenooBlockadeRabiParameters['envelope'];

export interface BlockadePoint {
  cells: string;
  timeUs: number;
  population: number;
  lowerError: number;
  upperError: number;
  window: number;
}

export const envelopeBoundsSeconds = [us(2), us(128)] as const;

export function rms(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length);
}

export const meanError = (point: BlockadePoint) => (point.lowerError + point.upperError) / 2;

export function fitBlockade(
  points: BlockadePoint[],
  envelope: Envelope,
  [frequencyMin, frequencyMax]: readonly [number, number],
) {
  const samples = points.map(point => ({
    timeSeconds: us(point.timeUs),
    datum: point.population - 0.5,
    weight: 1 / meanError(point) ** 2,
  }));
  const observedSquares = samples.reduce((sum, point) => sum + point.weight * point.datum ** 2, 0);

  function profile(frequencyHz: number, envelopeSeconds: number) {
    const cosine = { envelope, frequencyHz, envelopeSeconds, contrast: 1, phaseRad: 0 };
    const sine = { ...cosine, phaseRad: Math.PI / 2 };
    let cosineSquared = 0;
    let cross = 0;
    let sineSquared = 0;
    let cosineObserved = 0;
    let sineObserved = 0;
    for (const point of samples) {
      const c = senooBlockadeExcitationProbability(point.timeSeconds, cosine) - 0.5;
      const s = senooBlockadeExcitationProbability(point.timeSeconds, sine) - 0.5;
      cosineSquared += point.weight * c ** 2;
      cross += point.weight * c * s;
      sineSquared += point.weight * s ** 2;
      cosineObserved += point.weight * c * point.datum;
      sineObserved += point.weight * s * point.datum;
    }

    // At fixed frequency and envelope time, the two quadratures are linear.
    // Solve within a unit disk so the initial contrast does not exceed one.
    function solve(penalty: number) {
      const left = cosineSquared + penalty;
      const right = sineSquared + penalty;
      const determinant = left * right - cross ** 2;
      const c = (right * cosineObserved - cross * sineObserved) / determinant;
      const s = (left * sineObserved - cross * cosineObserved) / determinant;
      return { c, s, contrast: Math.hypot(c, s) };
    }

    let result = solve(0);
    if (result.contrast > 1) {
      let low = 0;
      let high = Math.hypot(cosineObserved, sineObserved);
      for (let step = 0; step < 36; step++) {
        const penalty = (low + high) / 2;
        if (solve(penalty).contrast > 1) low = penalty;
        else high = penalty;
      }
      result = solve(high);
    }
    const { c, s, contrast } = result;
    const score = observedSquares - 2 * (cosineObserved * c + sineObserved * s) +
      cosineSquared * c ** 2 + 2 * cross * c * s + sineSquared * s ** 2;
    return { score, parameters: { envelope, frequencyHz, envelopeSeconds, contrast, phaseRad: Math.atan2(s, c) } };
  }

  const envelopeMin = Math.log(envelopeBoundsSeconds[0]);
  const envelopeMax = Math.log(envelopeBoundsSeconds[1]);
  let best = profile(frequencyMin, envelopeBoundsSeconds[0]);
  function scan(startHz: number, stepHz: number, stepsHz: number, startLogT: number, stepLogT: number, stepsLogT: number) {
    for (let i = 0; i <= stepsHz; i++) {
      const frequency = startHz + i * stepHz;
      if (frequency < frequencyMin || frequency > frequencyMax) continue;
      for (let j = 0; j <= stepsLogT; j++) {
        const logT = startLogT + j * stepLogT;
        if (logT < envelopeMin || logT > envelopeMax) continue;
        const candidate = profile(frequency, Math.exp(logT));
        if (candidate.score < best.score) best = candidate;
      }
    }
  }
  const coarseStepsHz = Math.ceil((frequencyMax - frequencyMin) / 5_000);
  let stepHz = coarseStepsHz === 0 ? 0 : (frequencyMax - frequencyMin) / coarseStepsHz;
  let stepLogT = (envelopeMax - envelopeMin) / 30;
  scan(frequencyMin, stepHz, coarseStepsHz, envelopeMin, stepLogT, 30);
  for (let pass = 0; pass < 6; pass++) {
    const { frequencyHz, envelopeSeconds } = best.parameters;
    scan(frequencyHz - stepHz, stepHz / 4, coarseStepsHz === 0 ? 0 : 8,
      Math.log(envelopeSeconds) - stepLogT, stepLogT / 4, 8);
    stepHz /= 4;
    stepLogT /= 4;
  }
  return best.parameters;
}

export function compareBlockade(points: BlockadePoint[], parameters: SenooBlockadeRabiParameters) {
  return points.map(point => {
    const prediction = senooBlockadeExcitationProbability(us(point.timeUs), parameters);
    const residual = prediction - point.population;
    return {
      ...point,
      prediction,
      residual,
      scaledResidual: residual / meanError(point),
      insideErrorBar: -point.lowerError <= residual && residual <= point.upperError,
    };
  });
}

export function summarizeBlockade(rows: ReturnType<typeof compareBlockade>) {
  return {
    points: rows.length,
    rmse: rms(rows.map(row => row.residual)),
    scaledResidualRms: rms(rows.map(row => row.scaledResidual)),
    insideErrorBars: rows.filter(row => row.insideErrorBar).length,
    meanResidual: rows.reduce((sum, row) => sum + row.residual, 0) / rows.length,
  };
}
