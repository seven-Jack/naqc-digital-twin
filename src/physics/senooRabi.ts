import { rabiPopulation } from './clockDynamics';
import { hzToAngular } from './units';

export interface SenooRabiParameters {
  readonly frequencyHz: number;
  readonly phaseRad: number;
  readonly minimumR0: number;
  readonly maximumR0: number;
}

// Resonant population with a fitted phase and affine observation bounds.
// The fit uses a positive frequency and populations bounded by [0, 1].
export function senooRabiPopulation(timeSeconds: number, parameters: SenooRabiParameters) {
  const omega = hzToAngular(parameters.frequencyHz);
  const excitation = rabiPopulation(omega, 0, timeSeconds + parameters.phaseRad / omega);
  const r0 = parameters.minimumR0 + (parameters.maximumR0 - parameters.minimumR0) * excitation;
  return { m1: 1 - r0, r0 };
}
