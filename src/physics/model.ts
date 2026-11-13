import { atomicData, assumptions } from '../data/atomicData';
import { centerIntensity, intensity, rayleighLength, type Beam } from './gaussianBeam';
import { driveFor, effectiveDetuningHz, piPulseSeconds } from './clockDynamics';
import { harmonicFrequencies, statePotentials } from './trapPotential';
import { joulesToHz, kHz, mW, um, us } from './units';

export const MODEL_VERSION = '0.1.0';
export const ARRAY_SIDE = 5;
export const SITE_COUNT = ARRAY_SIDE ** 2;
export const PITCH_UM = 6;
export const DEFAULT_SITE = Math.floor(SITE_COUNT / 2);
export const bounds = {
  powerMw: [0.1, 5], waistUm: [0.6, 2.5], rabiKhz: [1, 300], detuningKhz: [-1000, 1000],
} as const;
export type InputKey = keyof typeof bounds;

export interface PhysicsParameterState {
  powerMw: number;
  waistUm: number;
  rabiKhz: number;
  detuningKhz: number;
  pulseUs: number;
  mode: 'free' | 'manual' | 'compensated';
  laserEnabled: boolean;
  site: number;
}

export const defaults: PhysicsParameterState = {
  powerMw: 1, waistUm: 1, rabiKhz: 100, detuningKhz: 0, pulseUs: 15,
  mode: 'free', laserEnabled: true, site: DEFAULT_SITE,
};

export const pulseBoundsUs = (rabiKhz: number) => [50 / rabiKhz, 4000 / rabiKhz] as const;
const finiteWithin = (value: unknown, [min, max]: readonly [number, number], fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizeParameters(input: Partial<PhysicsParameterState> = {}): PhysicsParameterState {
  const rabiKhz = finiteWithin(input.rabiKhz, bounds.rabiKhz, defaults.rabiKhz);
  const powerMw = finiteWithin(input.powerMw, bounds.powerMw, defaults.powerMw);
  const waistUm = finiteWithin(input.waistUm, bounds.waistUm, defaults.waistUm);
  return {
    powerMw, waistUm, rabiKhz,
    detuningKhz: finiteWithin(input.detuningKhz, bounds.detuningKhz, defaults.detuningKhz),
    pulseUs: finiteWithin(input.pulseUs ?? defaults.pulseUs, pulseBoundsUs(rabiKhz), 2000 / rabiKhz),
    mode: input.mode === 'compensated' || input.mode === 'manual' ? input.mode : 'free',
    laserEnabled: typeof input.laserEnabled === 'boolean' ? input.laserEnabled : defaults.laserEnabled,
    site: Math.round(finiteWithin(input.site, [0, SITE_COUNT - 1], DEFAULT_SITE)),
  };
}

export function siteLocation(site: number) {
  const row = Math.floor(site / ARRAY_SIDE);
  const column = site % ARRAY_SIDE;
  const midpoint = (ARRAY_SIDE - 1) / 2;
  return {
    id: String.fromCharCode(65 + row) + (column + 1),
    xUm: (column - midpoint) * PITCH_UM,
    yUm: (row - midpoint) * PITCH_UM,
  };
}

export function calculateModel(input: Partial<PhysicsParameterState>) {
  const parameters = normalizeParameters(input);
  const beam: Beam = {
    powerW: mW(parameters.powerMw), waistM: um(parameters.waistUm), wavelengthM: atomicData.trapWavelengthM,
  };
  const { alphaGroundAu, alphaExcitedAu } = atomicData;
  const potentials = (radialM: number, axialM: number) =>
    statePotentials(alphaGroundAu, alphaExcitedAu, intensity(beam, radialM, axialM));
  const focus = potentials(0, 0);
  const groundHz = joulesToHz(focus.groundJ);
  const excitedHz = joulesToHz(focus.excitedJ);
  const starkHz = focus.starkHz;
  const laserOffsetHz = parameters.mode === 'compensated' ? starkHz :
    parameters.mode === 'manual' ? kHz(parameters.detuningKhz) : 0;
  const rabiHz = kHz(parameters.rabiKhz);
  const activeRabiHz = parameters.laserEnabled ? rabiHz : 0;
  const detuningHz = effectiveDetuningHz(laserOffsetHz, starkHz);
  return {
    parameters, beam, potentials, focus, groundHz, excitedHz, starkHz, laserOffsetHz, rabiHz, activeRabiHz,
    detuningHz, drive: driveFor(activeRabiHz, detuningHz),
    freeDrive: driveFor(activeRabiHz, -starkHz), compensatedDrive: driveFor(activeRabiHz, 0),
    pulseSeconds: us(parameters.pulseUs), piSeconds: piPulseSeconds(rabiHz),
    centerIntensityWm2: centerIntensity(beam), rayleighM: rayleighLength(beam),
    alphaRatio: alphaExcitedAu / alphaGroundAu, normalizedShift: starkHz / -groundHz,
    clockLocalHz: atomicData.clockFrequencyHz + starkHz,
    harmonicGround: harmonicFrequencies(-focus.groundJ, beam),
    harmonicExcited: harmonicFrequencies(-focus.excitedJ, beam),
    site: siteLocation(parameters.site),
    warnings: [
      atomicData.uncertainty,
      'Software exploration limits are independent of experimental hardware limits.',
      'The Gaussian model is paraxial. Vector focusing effects may matter near the tightest waists.',
      'Harmonic levels are local estimates. Levels above the escape threshold are omitted.',
    ],
  };
}
export type Model = ReturnType<typeof calculateModel>;

export function exportSnapshot(model: Model, timeSeconds: number) {
  const { drive, pulseSeconds } = model;
  return {
    modelVersion: MODEL_VERSION, timestamp: new Date().toISOString(),
    evidence: { atomicInputs: atomicData.evidence, dynamics: 'verified_analytic' },
    constantsEdition: 'CODATA 2022', atomicData, assumptions, warnings: model.warnings, parameters: model.parameters,
    units: { energy: 'J', frequency: 'Hz', angularFrequency: 'rad/s', time: 's', position: 'm' },
    selectedSite: { id: model.site.id, positionM: [um(model.site.xUm), um(model.site.yUm), 0] },
    beam: { ...model.beam, centerIntensityWm2: model.centerIntensityWm2, rayleighM: model.rayleighM },
    results: {
      ...model.focus, groundHz: model.groundHz, excitedHz: model.excitedHz, normalizedShift: model.normalizedShift,
      clockLocalHz: model.clockLocalHz, laserFrequencyHz: atomicData.clockFrequencyHz + model.laserOffsetHz,
      laserOffsetHz: model.laserOffsetHz, effectiveDetuningHz: model.detuningHz, deltaRadPerS: drive.delta,
      rabiHz: model.rabiHz, omegaRadPerS: drive.omega, piSeconds: model.piSeconds, pulseSeconds,
      timeSeconds, instantaneousState: drive.at(timeSeconds), pulseEndExcitation: drive.population(pulseSeconds),
      freePulseEndExcitation: model.freeDrive.population(pulseSeconds),
      compensatedPulseEndExcitation: model.compensatedDrive.population(pulseSeconds),
      harmonicGround: model.harmonicGround, harmonicExcited: model.harmonicExcited,
    },
  };
}
