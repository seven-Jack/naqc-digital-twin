import { describe, expect, it } from 'vitest';
import {
  senooBlockadeExcitationProbability,
  senooPairShiftHz,
  type SenooBlockadeRabiParameters,
} from '../src/physics/senooPair';
import { um, us } from '../src/physics/units';

describe('Senoo pair interaction shift', () => {
  it('uses Hz and metres with inverse-sixth distance scaling', () => {
    const coefficient = 24e-27;
    const shift = senooPairShiftHz(um(4), coefficient);
    expect(shift / 1e6).toBeCloseTo(5.859375, 10);
    expect(senooPairShiftHz(um(8), coefficient) / shift).toBeCloseTo(1 / 64, 14);
    expect(() => senooPairShiftHz(0, coefficient)).toThrow(RangeError);
  });
});

describe('Senoo blockaded Rabi population', () => {
  const parameters: SenooBlockadeRabiParameters = {
    frequencyHz: 1e6,
    phaseRad: 0,
    contrast: 0.8,
    envelopeSeconds: us(2),
    envelope: 'gaussian',
  };

  it('uses phase and contrast in the one-excitation probability', () => {
    expect(senooBlockadeExcitationProbability(0, parameters)).toBeCloseTo(0.1, 14);
    const oppositePhase = { ...parameters, phaseRad: Math.PI };
    expect(senooBlockadeExcitationProbability(0, oppositePhase)).toBeCloseTo(0.9, 14);
    expect(senooBlockadeExcitationProbability(us(1000), parameters)).toBeCloseTo(0.5, 14);
  });

  it('distinguishes the Gaussian and exponential envelopes and gives 1/e contrast at T', () => {
    const exponential = { ...parameters, envelope: 'exponential' as const };
    expect(senooBlockadeExcitationProbability(us(1), parameters)).toBeCloseTo(0.5 - 0.4 * Math.exp(-0.25), 14);
    expect(senooBlockadeExcitationProbability(us(1), exponential)).toBeCloseTo(0.5 - 0.4 * Math.exp(-0.5), 14);
    for (const model of [parameters, exponential]) {
      expect(senooBlockadeExcitationProbability(model.envelopeSeconds, model)).toBeCloseTo(0.5 - 0.4 / Math.E, 14);
    }
  });
});
