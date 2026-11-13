import { driveFor, rabiPopulation } from '../physics/clockDynamics';
import type { Model } from '../physics/model';
import { intensity } from '../physics/gaussianBeam';
import { hzToAngular, joulesToHz, kHz, mW, um, us } from '../physics/units';

export type Point = [x: number, y: number];
export interface Series {
  id: string;
  label: string;
  color: string;
  points: Point[];
  dashed?: boolean;
  fill?: boolean;
}
export const colors = { cyan: '#62e0f6', violet: '#af96ff', gold: '#f4c56a', teal: '#58dfae', muted: '#6c8aa3' };
export const sample = (min: number, max: number, intervals: number, fn: (x: number) => number): Point[] =>
  Array.from({ length: intervals + 1 }, (_, i) => {
    const x = min + (max - min) * i / intervals;
    return [x, fn(x)];
  });

export function rabiCurves(model: Model) {
  const { parameters, drive, freeDrive, compensatedDrive, pulseSeconds } = model;
  const maxCycles = 100;
  function trace(id: string, label: string, color: string, source: Model['drive'], ground = false): Series {
    const cycles = source.generalizedHz * pulseSeconds;
    if (cycles > maxCycles && source.maxExcited > 0) {
      const bound = ground ? 1 - source.maxExcited : source.maxExcited;
      return { id, label: label + (ground ? '下限' : '上限'), color,
        points: [[0, bound], [parameters.pulseUs, bound]], dashed: true };
    }
    const points = sample(0, parameters.pulseUs, source.maxExcited === 0 ? 240 : Math.max(240, Math.ceil(cycles * 18)), x => {
      const population = source.population(us(x));
      return ground ? 1 - population : population;
    });
    return { id, label, color, points, fill: id === 'excited', dashed: id !== 'excited' };
  }
  const series = [
    trace('excited', 'Pₑ · 当前调谐', colors.cyan, drive),
    trace('ground', 'Pᵍ · 当前调谐', colors.muted, drive, true),
  ];
  if (parameters.mode !== 'compensated') series.push(trace('compensated', 'Pₑ · 补偿后', colors.violet, compensatedDrive));
  if (parameters.mode !== 'free') series.push(trace('free', 'Pₑ · 自由原子共振', colors.gold, freeDrive));
  return series;
}

export function spectrumCurves(model: Model) {
  const { starkHz, laserOffsetHz, pulseSeconds, activeRabiHz, rabiHz, drive } = model;
  const shiftKhz = starkHz / kHz(1);
  const tuneKhz = laserOffsetHz / kHz(1);
  const width = Math.max(2.1 * rabiHz, 1.35 / pulseSeconds) / kHz(1);
  const range: [number, number] = [Math.min(-width, tuneKhz - width * 0.25), Math.max(shiftKhz + width, tuneKhz + width * 0.25)];
  // Use a broad scan plus dense samples around each narrow resonance. Include exact centers.
  const denseWidth = Math.max(12 * rabiHz, 4 / pulseSeconds) / kHz(1);
  const grid = [
    ...sample(...range, 650, () => 0),
    ...sample(-denseWidth, denseWidth, 640, () => 0),
    ...sample(shiftKhz - denseWidth, shiftKhz + denseWidth, 640, () => 0),
    [0, 0], [shiftKhz, 0], [tuneKhz, 0],
  ].map(([x]) => x).filter(x => x >= range[0] && x <= range[1]).sort((a, b) => a - b);
  const omega = hzToAngular(activeRabiHz);
  const spectrum = (center: number) => grid.map((x): Point => [x, rabiPopulation(omega, hzToAngular(kHz(x - center)), pulseSeconds)]);
  const onResonance = driveFor(activeRabiHz, 0).population(pulseSeconds);
  return {
    range,
    series: [
      { id: 'free', label: '自由原子', color: colors.muted, points: spectrum(0), dashed: true },
      { id: 'local', label: '光镊焦点', color: colors.violet, points: spectrum(shiftKhz), fill: true },
    ],
    markers: [
      { x: 0, color: colors.muted, label: 'ν₀' },
      { x: shiftKhz, color: colors.violet, label: 'νlocal' },
    ],
    dots: [
      { x: tuneKhz, y: drive.population(pulseSeconds), color: colors.gold },
      { x: shiftKhz, y: onResonance, color: colors.violet },
    ],
  };
}

export function potentialCurves(model: Model, axial: boolean) {
  const halfWidth = axial ? model.rayleighM / um(1) * 3 : 5.5;
  const frequency = (key: 'groundJ' | 'excitedJ' | 'differenceJ', x: number) => {
    const p = axial ? model.potentials(0, um(x)) : model.potentials(um(x), 0);
    return joulesToHz(p[key]) / kHz(1);
  };
  const points = (key: Parameters<typeof frequency>[0]) => sample(-halfWidth, halfWidth, 220, x => frequency(key, x));
  return {
    range: [-halfWidth, halfWidth] as [number, number],
    series: [
      { id: 'ground', label: '¹S₀', color: colors.cyan, points: points('groundJ'), fill: true },
      { id: 'excited', label: '³P₀', color: colors.violet, points: points('excitedJ') },
      { id: 'difference', label: 'ΔU/h', color: colors.gold, points: points('differenceJ'), dashed: true },
    ],
  };
}

export function starkCurve(model: Model) {
  const points = sample(0, 5, 125, x => model.starkHz * intensity({ ...model.beam, powerW: mW(x) }, 0, 0) / model.centerIntensityWm2 / kHz(1));
  return [{ id: 'stark', label: '光移 Δν', color: colors.teal, points, fill: true }];
}
