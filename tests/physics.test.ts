import { describe, expect, it } from 'vitest';
import { atomicData } from '../src/data/atomicData';
import { C, EPSILON_0, H, HBAR, POLARIZABILITY_AU, TAU, YB171_MASS } from '../src/physics/constants';
import { calculateModel, defaults, normalizeParameters, siteLocation } from '../src/physics/model';
import { beamRadius, intensity, rayleighLength } from '../src/physics/gaussianBeam';
import { clockState, driveFor, rabiPopulation } from '../src/physics/clockDynamics';
import { harmonicLevelHz, statePotentials } from '../src/physics/trapPotential';
import { hzToAngular, kHz, mW, nm, um, us } from '../src/physics/units';

const base = calculateModel(defaults);
describe('Gaussian beam and Stark shift', () => {
  it('T01 equal polarizabilities give zero shift', () => expect(statePotentials(100, 100, 1e9).starkHz).toBe(0));
  it('T02 negative differential polarizability gives a blue shift', () => {
    expect(base.focus.excitedJ).toBeGreaterThan(base.focus.groundJ);
    expect(base.starkHz).toBeGreaterThan(0);
  });
  it('T03 twice the power doubles the shift', () => expect(calculateModel({powerMw: 2}).starkHz / base.starkHz).toBeCloseTo(2, 12));
  it('T04 twice the waist quarters the shift', () => expect(calculateModel({waistUm: 2}).starkHz / base.starkHz).toBeCloseTo(0.25, 12));
  it('T05 Gaussian radial factor and Rayleigh-length half intensity', () => {
    const { beam } = base;
    const z = rayleighLength(beam);
    expect(beamRadius(beam, z) / beam.waistM).toBeCloseTo(Math.SQRT2, 12);
    expect(intensity(beam, beam.waistM, 0) / intensity(beam, 0, 0)).toBeCloseTo(Math.exp(-2), 12);
    expect(intensity(beam, 0, z) / intensity(beam, 0, 0)).toBeCloseTo(0.5, 12);
  });
  it('T06 CODATA conversion and unit adapters', () => {
    expect(POLARIZABILITY_AU / (4 * Math.PI * EPSILON_0 * (5.29177210544e-11 ** 3))).toBeCloseTo(1, 9);
    expect(HBAR * TAU).toBe(H);
    expect(nm(532) / um(1)).toBeCloseTo(0.532, 12);
    expect(mW(1)).toBe(0.001);
    expect(us(1)).toBe(0.000001);
    expect(kHz(1)).toBe(1000);
    expect(hzToAngular(1)).toBe(TAU);
    expect(C / atomicData.clockWavelengthM).toBe(atomicData.clockFrequencyHz);
  });
  it('T07 depth-normalized shift', () => {
    expect(base.normalizedShift).toBeCloseTo(1 - 99.98 / 257.91, 12);
    expect(base.normalizedShift).toBeCloseTo(0.61235, 5);
  });
  it('matches the supplied conditional benchmark', () => {
    expect(Math.abs(base.centerIntensityWm2 / 6.366e8 - 1)).toBeLessThan(0.0001);
    expect(Math.abs(-base.groundHz / 770000 - 1)).toBeLessThan(0.001);
    expect(Math.abs(base.starkHz / 471000 - 1)).toBeLessThan(0.001);
  });
  it('harmonic curvature agrees with an independent finite difference at focus', () => {
    const h = base.beam.waistM * 1e-3;
    const groundCurvature = 2 * (base.potentials(h, 0).groundJ - base.focus.groundJ) / h ** 2;
    const axialCurvature = 2 * (base.potentials(0, h).groundJ - base.focus.groundJ) / h ** 2;
    expect(Math.sqrt(groundCurvature / YB171_MASS) / (TAU * base.harmonicGround.radialHz)).toBeCloseTo(1, 5);
    expect(Math.sqrt(axialCurvature / YB171_MASS) / (TAU * base.harmonicGround.axialHz)).toBeCloseTo(1, 5);
    expect(harmonicLevelHz(-100, 10, 1)).toBe(-85);
  });
});

describe('closed two-level square pulse', () => {
  const omega = hzToAngular(100_000);
  it('T08 analytical resonance at half a π-pulse', () => expect(rabiPopulation(omega, 0, us(2.5))).toBeCloseTo(0.5, 12));
  it('T09 100 kHz gives 5 µs', () => expect(base.piSeconds / us(1)).toBeCloseTo(5, 12));
  it('T10 resonant π-pulse inverts', () => expect(clockState(omega, 0, us(5)).excited).toBeCloseTo(1, 12));
  it('T11 resonant 2π-pulse returns', () => expect(clockState(omega, 0, us(10)).excited).toBeCloseTo(0, 12));
  it('T12 |δ| = Ω gives maximum 0.5', () => expect(rabiPopulation(omega, -omega, Math.PI / Math.hypot(omega, omega))).toBeCloseTo(0.5, 12));
  it('T13–14 conserves norm and bounds populations over signed detuning', () => {
    for (const delta of [-1e9, -omega, 0, omega, 1e9]) {
      for (let n = 0; n <= 30; n++) {
        const { a, b, excited, ground, bloch } = clockState(omega, delta, us(n));
        expect(a.re ** 2 + a.im ** 2 + b.re ** 2 + b.im ** 2).toBeCloseTo(1, 12);
        expect(ground + excited).toBe(1);
        expect(excited).toBeGreaterThanOrEqual(0);
        expect(excited).toBeLessThanOrEqual(1);
        expect(Math.hypot(bloch.x, bloch.y, bloch.z)).toBeCloseTo(1, 12);
      }
    }
  });
  it('T15–16 changes signed detuning and cancels at the selected site', () => {
    expect(base.detuningHz).toBe(-base.starkHz);
    expect(calculateModel({ powerMw: 2 }).detuningHz / base.detuningHz).toBeCloseTo(2, 12);
    expect(calculateModel({ mode: 'compensated', site: 7 }).detuningHz).toBe(0);
    expect(calculateModel({ mode: 'manual', detuningKhz: 100 }).detuningHz).toBeCloseTo(100_000 - base.starkHz, 12);
  });
  it('checks Bloch poles and signed tilted rotation axis', () => {
    expect(clockState(omega, 0, 0).bloch.z).toBe(1);
    expect(clockState(omega, 0, us(5)).bloch.z).toBeCloseTo(-1, 12);
    expect(clockState(omega, 0, us(10)).bloch.z).toBeCloseTo(1, 12);
    expect(clockState(omega, omega, us(3)).bloch.x).toBeGreaterThan(0);
    expect(clockState(omega, -omega, us(3)).bloch.x).toBeLessThan(0);
    expect(driveFor(0, 0).at(us(5)).excited).toBe(0);
  });
  it('normalizes invalid values, preserves legal zeros and keeps a legal pulse range', () => {
    const p = normalizeParameters({ powerMw: NaN, waistUm: 200, rabiKhz: 1, detuningKhz: 0, site: 100 });
    expect(p.powerMw).toBe(1);
    expect(p.waistUm).toBe(2.5);
    expect(p.pulseUs).toBe(50);
    expect(siteLocation(p.site).id).toBe('E5');
    expect(calculateModel({ laserEnabled: false }).drive.population(us(5))).toBe(0);
  });
});
