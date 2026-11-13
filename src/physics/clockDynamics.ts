import { TAU } from './constants';
import { hzToAngular } from './units';

export const effectiveDetuningHz = (laserOffsetHz: number, starkHz: number) => laserOffsetHz - starkHz;
export const piPulseSeconds = (rabiHz: number) => 0.5 / rabiHz;

export function rabiPopulation(omega: number, delta: number, seconds: number) {
  const rate = Math.hypot(omega, delta);
  if (rate === 0) return 0;
  return ((omega / rate) * Math.sin(rate * seconds / 2)) ** 2;
}

// H/ħ = (Ωσx + δσz)/2, σz = diag(+1, −1) in the (g, e) basis.
export function clockState(omega: number, delta: number, seconds: number) {
  const rate = Math.hypot(omega, delta);
  const phase = rate * seconds / 2;
  const sine = rate === 0 ? 0 : Math.sin(phase) / rate;
  const a = { re: Math.cos(phase), im: -delta * sine };
  const b = { re: 0, im: -omega * sine };
  const excited = rabiPopulation(omega, delta, seconds);
  return {
    a, b, excited, ground: 1 - excited,
    bloch: {
      x: 2 * a.im * b.im,
      y: 2 * a.re * b.im,
      z: 1 - 2 * excited,
    },
  };
}

export function driveFor(rabiHz: number, detuningHz: number) {
  const omega = hzToAngular(rabiHz);
  const delta = hzToAngular(detuningHz);
  const generalizedHz = Math.hypot(rabiHz, detuningHz);
  return {
    omega, delta, generalizedHz,
    maxExcited: generalizedHz === 0 ? 0 : (rabiHz / generalizedHz) ** 2,
    at: (seconds: number) => clockState(omega, delta, seconds),
    population: (seconds: number) => rabiPopulation(omega, delta, seconds),
    periodSeconds: generalizedHz === 0 ? null : TAU / Math.hypot(omega, delta),
  };
}
