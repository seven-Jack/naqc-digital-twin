import { describe, expect, it } from 'vitest';
import { senooRabiPopulation } from '../src/physics/senooRabi';

describe('Senoo single-atom Rabi population', () => {
  const frequencyHz = 3e6;

  it('reaches the observation bounds at the resonant extrema in SI time', () => {
    const parameters = { frequencyHz, phaseRad: 0, minimumR0: 0.02, maximumR0: 0.98 };
    expect(senooRabiPopulation(0, parameters).r0).toBeCloseTo(0.02, 14);
    expect(senooRabiPopulation(0.5 / frequencyHz, parameters).r0).toBeCloseTo(0.98, 14);
    expect(senooRabiPopulation(1 / frequencyHz, parameters).r0).toBeCloseTo(0.02, 14);
  });

  it('applies phase in radians and returns complementary conditional populations', () => {
    const parameters = { frequencyHz, phaseRad: Math.PI / 2, minimumR0: 0.02, maximumR0: 0.96 };
    const initial = senooRabiPopulation(0, parameters);
    const quarterPeriod = senooRabiPopulation(0.25 / frequencyHz, parameters);
    expect(initial.r0).toBeCloseTo(0.49, 14);
    expect(quarterPeriod.r0).toBeCloseTo(0.96, 14);
    for (const prediction of [initial, quarterPeriod]) {
      expect(prediction.m1 + prediction.r0).toBeCloseTo(1, 14);
    }
  });
});
