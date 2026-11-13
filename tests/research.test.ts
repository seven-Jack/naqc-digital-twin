import { expect, it } from 'vitest';
import { HBAR, TAU, YB171_MASS } from '../src/physics/constants';
import { driveFor } from '../src/physics/clockDynamics';
import { motionalClock, recoilOverlaps } from '../src/physics/motionalClock';
import { fitStarkShift, parseStarkCsv, STARK_CSV_HEADER } from '../src/physics/starkCalibration';

const input = {
  groundHz: 13000, excitedHz: 8100, projectedWaveNumber: 1.08e7, basisSize: 12,
  groundDepthHz: 770000, excitedDepthHz: 298000,
  temperatureK: 0.2e-6, rabiHz: 100000, detuningHz: -471200,
};

it('recovers orthogonality at equal curvatures and zero projected recoil', () => {
  const { overlaps } = recoilOverlaps(13000, 13000, 0, 16);
  for (let m = 0; m < overlaps.length; m++) {
    for (let n = 0; n < overlaps.length; n++) expect(overlaps[m][n]).toBeCloseTo(Number(m === n), 10);
  }
});

it('recovers analytic Franck–Condon and recoil strengths from the oscillator ground state', () => {
  const groundLength = Math.sqrt(HBAR / (YB171_MASS * TAU * input.groundHz));
  const excitedLength = Math.sqrt(HBAR / (YB171_MASS * TAU * input.excitedHz));
  const k = input.projectedWaveNumber;
  const carrier = 2 * groundLength * excitedLength / (groundLength ** 2 + excitedLength ** 2) *
    Math.exp(-(k ** 2 * groundLength ** 2 * excitedLength ** 2) / (groundLength ** 2 + excitedLength ** 2));
  const unlike = recoilOverlaps(input.groundHz, input.excitedHz, k, 12);
  expect(unlike.overlaps[0][0] ** 2).toBeCloseTo(carrier, 10);
  expect(recoilOverlaps(input.groundHz, input.excitedHz, 0, 12).overlaps[1][0]).toBeCloseTo(0, 10);
  const equal = recoilOverlaps(input.groundHz, input.groundHz, k, 12);
  const etaSquared = (k * groundLength) ** 2 / 2;
  expect(equal.overlaps[0][0] ** 2).toBeCloseTo(Math.exp(-etaSquared), 10);
  expect(equal.overlaps[1][0] ** 2).toBeCloseTo(etaSquared * Math.exp(-etaSquared), 10);
});

it('reduces to the analytic Rabi solution for equal traps without projected recoil', () => {
  const parameters = { ...input, excitedHz: input.groundHz, projectedWaveNumber: 0, detuningHz: 23000 };
  const motion = motionalClock(parameters);
  const reference = driveFor(parameters.rabiHz, parameters.detuningHz);
  for (const time of [0, 2e-6, 5e-6, 10e-6, 25e-6]) {
    expect(motion.population(time)).toBeCloseTo(reference.population(time), 10);
  }
});

it('converges with a larger basis at the compensated 5 µs demo point', () => {
  const motion = motionalClock({ ...input, detuningHz: 0 });
  const larger = motionalClock({ ...input, detuningHz: 0, basisSize: 16 });
  expect(motion.thermalTail).toBeLessThan(0.001);
  expect(motion.recoilRetainedFromGround).toBeGreaterThan(0.999);
  expect(motion.transition(1, 0).relativeToBottomHz).toBeLessThan(motion.transition(0, 0).relativeToBottomHz);
  expect(motion.transition(0, 1).relativeToBottomHz).toBeGreaterThan(motion.transition(0, 0).relativeToBottomHz);
  for (const time of [0, 2e-6, 5e-6, 10e-6]) expect(motion.population(time)).toBeCloseTo(larger.population(time), 3);
  expect(motion.population(5e-6)).toBeLessThan(0.995);
});

it('fits synthetic points with independent uncertainties and keeps validation out of the fit', () => {
  const data = parseStarkCsv(`\uFEFF${STARK_CSV_HEADER}\r\n0,1,2,1,fit\r\n1,1,5,1,fit\r\n8,2,8,1,fit\r\n3,1,13,1,validation`);
  const fit = fitStarkShift(data);
  expect(fit.slope).toBeCloseTo(3, 12);
  expect(fit.intercept).toBeCloseTo(2, 12);
  expect(fit.slopeSigma).toBeCloseTo(1 / Math.sqrt(2), 12);
  expect(fit.prediction(1).sigma).toBeCloseTo(1 / Math.sqrt(3), 12);
  expect(fit.reducedChiSquared).toBeCloseTo(0, 12);
  expect(fit.validationCount).toBe(1);
  expect(fit.validationRmse).toBeCloseTo(2, 12);
});

it('rejects missing uncertainties and a degenerate intensity range', () => {
  expect(() => parseStarkCsv(`${STARK_CSV_HEADER}\n1,1,10,,fit`)).toThrow(/第 2 行/);
  const rows = parseStarkCsv(`${STARK_CSV_HEADER}\n1,1,1,1,fit\n4,2,3,1,fit\n9,3,5,1,fit`);
  expect(() => fitStarkShift(rows)).toThrow(/不同的 P/);
});
