import { BOLTZMANN, H, HBAR, TAU, YB171_MASS } from './constants';

export const MOTIONAL_BASIS_SIZES = [8, 12, 16] as const;

interface MotionInput {
  groundHz: number;
  excitedHz: number;
  groundDepthHz: number;
  excitedDepthHz: number;
  projectedWaveNumber: number;
  rabiHz: number;
  detuningHz: number;
  temperatureK: number;
  basisSize: number;
}

function oscillatorValues(position: number, length: number, out: Float64Array) {
  const q = position / length;
  out[0] = Math.exp(-q * q / 2) / Math.sqrt(Math.sqrt(Math.PI) * length);
  if (out.length < 2) return;
  out[1] = Math.SQRT2 * q * out[0];
  for (let n = 1; n + 1 < out.length; n++) {
    out[n + 1] = Math.sqrt(2 / (n + 1)) * q * out[n] - Math.sqrt(n / (n + 1)) * out[n - 1];
  }
}

export function recoilOverlaps(groundHz: number, excitedHz: number, k: number, size: number) {
  const groundLength = Math.sqrt(HBAR / (YB171_MASS * TAU * groundHz));
  const excitedLength = Math.sqrt(HBAR / (YB171_MASS * TAU * excitedHz));
  const extent = Math.max(groundLength, excitedLength) * (Math.sqrt(2 * size + 1) + 6);
  const intervals = 2 * Math.max(384, Math.ceil(12 * extent * Math.abs(k) / TAU));
  const step = 2 * extent / intervals;
  const ground = new Float64Array(size);
  const excited = new Float64Array(size);
  const overlaps = Array.from({ length: size }, () => new Float64Array(size));
  for (let i = 0; i <= intervals; i++) {
    const x = (i - intervals / 2) * step;
    oscillatorValues(x, groundLength, ground);
    oscillatorValues(x, excitedLength, excited);
    const weight = step / 3 * (i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2);
    // Rephase |s,n⟩ by iⁿ. The transformed recoil matrix is real by parity.
    const factors = [Math.cos(k * x), -Math.sin(k * x), -Math.cos(k * x), Math.sin(k * x)];
    for (let m = 0; m < size; m++) {
      const weighted = excited[m] * weight;
      for (let n = 0; n < size; n++) overlaps[m][n] += weighted * ground[n] * factors[(n - m + 4 * size) % 4];
    }
  }
  return { overlaps, groundLength };
}

function diagonalize(matrix: Float64Array[]) {
  const size = matrix.length;
  const vectors = Array.from({ length: size }, (_, i) => Float64Array.from({ length: size }, (_, j) => Number(i === j)));
  const scale = Math.max(1, ...matrix.map(row => Math.max(...row.map(Math.abs))));
  const tolerance = scale * 1e-12;
  for (let sweep = 0; sweep < 48; sweep++) {
    let converged = true;
    for (let p = 0; p < size - 1; p++) {
      for (let q = p + 1; q < size; q++) {
        const off = matrix[p][q];
        if (Math.abs(off) <= tolerance) continue;
        converged = false;
        const tau = (matrix[q][q] - matrix[p][p]) / (2 * off);
        const tan = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.hypot(1, tau));
        const cos = 1 / Math.hypot(1, tan);
        const sin = tan * cos;
        matrix[p][p] -= tan * off;
        matrix[q][q] += tan * off;
        matrix[p][q] = matrix[q][p] = 0;
        for (let i = 0; i < size; i++) {
          if (i !== p && i !== q) {
            const a = matrix[i][p], b = matrix[i][q];
            matrix[p][i] = matrix[i][p] = cos * a - sin * b;
            matrix[q][i] = matrix[i][q] = sin * a + cos * b;
          }
          const a = vectors[i][p], b = vectors[i][q];
          vectors[i][p] = cos * a - sin * b;
          vectors[i][q] = sin * a + cos * b;
        }
      }
    }
    if (converged) return { values: matrix.map((row, i) => row[i]), vectors };
  }
  throw new Error('运动哈密顿量的对角化未收敛。');
}

export function motionalClock(input: MotionInput) {
  const { groundHz, excitedHz, groundDepthHz, excitedDepthHz, projectedWaveNumber, basisSize, temperatureK, rabiHz, detuningHz } = input;
  const { overlaps, groundLength } = recoilOverlaps(groundHz, excitedHz, projectedWaveNumber, basisSize);
  const boltzmannFactor = temperatureK === 0 ? 0 : Math.exp(-H * groundHz / (BOLTZMANN * temperatureK));
  const thermalTail = boltzmannFactor ** basisSize;
  const weights = Array.from({ length: basisSize }, (_, n) => (1 - boltzmannFactor) * boltzmannFactor ** n / (1 - thermalTail));
  // Retain the harmonic basis for the coherent calculation and report where it extends above the finite trap.
  const groundLevelsAboveDepth = weights.reduce((total, weight, n) => total + ((n + 0.5) * groundHz >= groundDepthHz ? weight : 0), 0);
  const excitedBasisAboveDepth = (basisSize - 0.5) * excitedHz >= excitedDepthHz;
  const matrix = Array.from({ length: 2 * basisSize }, () => new Float64Array(2 * basisSize));
  for (let n = 0; n < basisSize; n++) matrix[n][n] = n * groundHz;
  for (let m = 0; m < basisSize; m++) {
    const excited = basisSize + m;
    matrix[excited][excited] = (m + 0.5) * excitedHz - 0.5 * groundHz - detuningHz;
    for (let n = 0; n < basisSize; n++) matrix[n][excited] = matrix[excited][n] = rabiHz / 2 * overlaps[m][n];
  }
  const { values, vectors } = diagonalize(matrix);
  const re = new Float64Array(values.length), im = new Float64Array(values.length);
  const population = (seconds: number) => {
    if (seconds === 0 || rabiHz === 0) return 0;
    for (let j = 0; j < values.length; j++) {
      const phase = TAU * values[j] * seconds;
      re[j] = Math.cos(phase);
      im[j] = Math.sin(phase);
    }
    let total = 0;
    for (let n = 0; n < basisSize; n++) {
      if (!weights[n]) continue;
      let excited = 0;
      for (let m = basisSize; m < values.length; m++) {
        let real = 0, imaginary = 0;
        for (let j = 0; j < values.length; j++) {
          const amplitude = vectors[n][j] * vectors[m][j];
          real += amplitude * re[j];
          imaginary += amplitude * im[j];
        }
        excited += real * real + imaginary * imaginary;
      }
      total += weights[n] * excited;
    }
    return Math.max(0, Math.min(1, total));
  };
  const transition = (n: number, m: number) => ({
    n, m, relativeToBottomHz: (m + 0.5) * excitedHz - (n + 0.5) * groundHz,
    strength: overlaps[m][n] ** 2,
  });
  return {
    population, thermalTail, groundLevelsAboveDepth, excitedBasisAboveDepth, transition,
    bandwidthHz: Math.max(...values) - Math.min(...values),
    eta: Math.abs(projectedWaveNumber) * groundLength / Math.SQRT2,
    rmsGroundM: groundLength * Math.sqrt(0.5 + weights.reduce((mean, weight, n) => mean + weight * n, 0)),
    recoilRetainedFromGround: overlaps.reduce((sum, row) => sum + row[0] ** 2, 0),
  };
}
