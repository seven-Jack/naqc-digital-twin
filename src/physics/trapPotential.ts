import { C, EPSILON_0, POLARIZABILITY_AU, TAU, YB171_MASS } from './constants';
import { rayleighLength, type Beam } from './gaussianBeam';
import { joulesToHz } from './units';

export const potentialJ = (alphaAu: number, intensity: number) =>
  -alphaAu * POLARIZABILITY_AU * intensity / (2 * EPSILON_0 * C);

export function statePotentials(alphaGroundAu: number, alphaExcitedAu: number, intensity: number) {
  const groundJ = potentialJ(alphaGroundAu, intensity);
  const excitedJ = potentialJ(alphaExcitedAu, intensity);
  const differenceJ = excitedJ - groundJ;
  return { groundJ, excitedJ, differenceJ, starkHz: joulesToHz(differenceJ) };
}
export function harmonicFrequencies(depthJ: number, beam: Beam, massKg = YB171_MASS) {
  return {
    radialHz: Math.sqrt(4 * depthJ / massKg) / (TAU * beam.waistM),
    axialHz: Math.sqrt(2 * depthJ / massKg) / (TAU * rayleighLength(beam)),
  };
}

export const harmonicLevelHz = (bottomHz: number, modeHz: number, n: number) =>
  bottomHz + (n + 0.5) * modeHz;
