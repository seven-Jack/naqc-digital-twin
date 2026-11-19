import { hzToAngular } from './units';

// C₆/(2π) in Hz·m⁶ gives the interaction shift V/(2π) in Hz.
export function senooPairShiftHz(distanceM: number, coefficientHzM6: number) {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    throw new RangeError('Pair separation must be positive and finite');
  }
  return coefficientHzM6 / distanceM ** 6;
}

export interface SenooBlockadeRabiParameters {
  readonly frequencyHz: number;
  readonly phaseRad: number;
  readonly contrast: number;
  readonly envelopeSeconds: number;
  readonly envelope: 'gaussian' | 'exponential';
}

// P_rm + P_mr conditioned on passing loss detection in the blockaded manifold.
// A contrast in [0, 1], positive envelope time and nonnegative pulse time give a valid probability.
export function senooBlockadeExcitationProbability(timeSeconds: number, parameters: SenooBlockadeRabiParameters) {
  const elapsed = timeSeconds / parameters.envelopeSeconds;
  const power = parameters.envelope === 'gaussian' ? 2 : 1;
  const envelope = Math.exp(-(elapsed ** power));
  const angle = hzToAngular(parameters.frequencyHz) * timeSeconds + parameters.phaseRad;
  return 0.5 - 0.5 * parameters.contrast * envelope * Math.cos(angle);
}
