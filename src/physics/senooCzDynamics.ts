import { SENOO_CZ_EVOLUTION_CONVENTION, type SenooCzWaveform } from './senooCzWaveform';
import { hzToAngular } from './units';

const logicalInputs = [
  { input: '00', index: 0 }, { input: '01', index: 1 },
  { input: '10', index: 3 }, { input: '11', index: 4 },
] as const;
const rydbergIndices = [2, 5, 6, 7, 8] as const;
const rrIndex = 8;
const maxStepBudget = 60_000;
const phaseAmplitudeFloor = 1e-12;

type DriveSample = SenooCzWaveform['samples'][number];
type SiteDrive = DriveSample['first'];

interface Complex {
  readonly real: number;
  readonly imag: number;
}

interface LocalPropagator {
  readonly m1m1: Complex;
  readonly m1r: Complex;
  readonly rm1: Complex;
  readonly rr: Complex;
}

interface Wavefunction {
  readonly real: Float64Array;
  readonly imag: Float64Array;
}

interface Segment {
  readonly durationS: number;
  readonly steps: number;
  readonly first: SiteDrive;
  readonly second: SiteDrive;
}

export interface SenooCzDynamicsOptions {
  readonly sampling: 'zero-order-hold';
  readonly maxStepS: number;
  /** Combined coarse and fine steps per logical input. */
  readonly maxTotalSteps?: number;
}

export interface SenooCzDynamicsInputResult {
  readonly input: typeof logicalInputs[number]['input'];
  readonly diagonal: Complex;
  readonly logicalReturnProbability: number;
  readonly logicalPopulation: number;
  readonly rydbergLeakageProbability: number;
  readonly normError: number;
}

export interface SenooCzDynamicsResult {
  readonly inputs: readonly SenooCzDynamicsInputResult[];
  readonly conditionalPhaseRad: number | null;
  readonly convergence: {
    readonly coarseStepCount: number;
    readonly fineStepCount: number;
    readonly maxDiagonalAbsChange: number;
    readonly maxLeakageAbsChange: number;
    readonly conditionalPhaseAbsChangeRad: number | null;
  };
}

function validDrive(drive: SiteDrive) {
  return Number.isFinite(drive.omegaRadPerS) && drive.omegaRadPerS >= 0
    && Number.isFinite(drive.detuningRadPerS) && Number.isFinite(drive.phaseRad);
}

function planSegments(record: SenooCzWaveform, options: SenooCzDynamicsOptions) {
  const { sampling, maxStepS, maxTotalSteps = maxStepBudget } = options;
  if (sampling !== 'zero-order-hold') throw new Error('请选择明确的零阶保持采样解释。');
  if (!Number.isFinite(maxStepS) || maxStepS <= 0) throw new Error('最大数值步长应为正的秒数。');
  if (!Number.isSafeInteger(maxTotalSteps) || maxTotalSteps <= 0 || maxTotalSteps > maxStepBudget) {
    throw new Error(`总数值步数预算应为 1–${maxStepBudget} 的整数。`);
  }
  const { window, samples } = record;
  if (!window || !Number.isFinite(window.startS) || !Number.isFinite(window.endS)
    || !Number.isFinite(window.endS - window.startS) || window.endS <= window.startS) {
    throw new Error('需要有效的门起止时标。');
  }
  if (samples.length < 2 || samples[0].timeS > window.startS || samples[samples.length - 1].timeS < window.endS) {
    throw new Error('采样时标应覆盖整个门时窗。');
  }
  if (samples.some((sample, index) => !Number.isFinite(sample.timeS) || !validDrive(sample.first) || !validDrive(sample.second)
    || (index > 0 && sample.timeS <= samples[index - 1].timeS))) {
    throw new Error('两位点驱动数值应有限，Rabi 振幅应非负，采样时标应严格递增。');
  }
  const segments: Segment[] = [];
  let coarseStepCount = 0;
  for (let index = 0; index + 1 < samples.length; index++) {
    const sample = samples[index];
    const startS = Math.max(window.startS, sample.timeS);
    const endS = Math.min(window.endS, samples[index + 1].timeS);
    if (endS <= startS) continue;
    const durationS = endS - startS;
    const steps = Math.max(1, Math.ceil(durationS / maxStepS));
    coarseStepCount += steps;
    if (coarseStepCount * 3 > maxTotalSteps) throw new Error('门时窗的粗细网格传播超过数值步数预算。');
    if (durationS / (steps * 2) === 0) throw new Error('细化步长小于可表示的时间尺度。');
    segments.push({ durationS, steps, first: sample.first, second: sample.second });
  }
  return { segments, coarseStepCount };
}

function multiply(left: Complex, right: Complex): Complex {
  return {
    real: left.real * right.real - left.imag * right.imag,
    imag: left.real * right.imag + left.imag * right.real,
  };
}

function unitPhase(angle: number): Complex {
  if (!Number.isFinite(angle)) throw new Error('传播相位超出有限数值范围。');
  return { real: Math.cos(angle), imag: Math.sin(angle) };
}

function localPropagator(drive: SiteDrive, timeS: number): LocalPropagator {
  // On m1/r0, H(r0,m1)/ħ = Ω exp(iφ)/2 and H(r0,r0)/ħ = −Δ. State m0 is a spectator.
  const halfTimeS = timeS / 2;
  const omega = drive.omegaRadPerS * halfTimeS;
  const detuning = drive.detuningRadPerS * halfTimeS;
  const angle = Math.hypot(omega, detuning);
  if (!Number.isFinite(angle)) throw new Error('驱动传播角超出有限数值范围。');
  const weight = angle === 0 ? 1 : Math.sin(angle) / angle;
  const cosine = Math.cos(angle);
  const transverse = omega * weight;
  const longitudinal = detuning * weight;
  const phase = unitPhase(drive.phaseRad);
  const global = unitPhase(detuning);
  return {
    m1m1: multiply(global, { real: cosine, imag: -longitudinal }),
    m1r: multiply(global, { real: -transverse * phase.imag, imag: -transverse * phase.real }),
    rm1: multiply(global, { real: transverse * phase.imag, imag: -transverse * phase.real }),
    rr: multiply(global, { real: cosine, imag: longitudinal }),
  };
}

function applyLocal(state: Wavefunction, unitary: LocalPropagator, m1Offset: number, rOffset: number, stride: number) {
  const { real, imag } = state;
  const { m1m1, m1r, rm1, rr } = unitary;
  for (let other = 0; other < 3; other++) {
    const m = m1Offset + other * stride;
    const r = rOffset + other * stride;
    const mr = real[m];
    const mi = imag[m];
    const rrReal = real[r];
    const rrImag = imag[r];
    real[m] = m1m1.real * mr - m1m1.imag * mi + m1r.real * rrReal - m1r.imag * rrImag;
    imag[m] = m1m1.real * mi + m1m1.imag * mr + m1r.real * rrImag + m1r.imag * rrReal;
    real[r] = rm1.real * mr - rm1.imag * mi + rr.real * rrReal - rr.imag * rrImag;
    imag[r] = rm1.real * mi + rm1.imag * mr + rr.real * rrImag + rr.imag * rrReal;
  }
}

function applyInteraction(state: Wavefunction, phase: Complex) {
  const real = state.real[rrIndex];
  const imag = state.imag[rrIndex];
  state.real[rrIndex] = phase.real * real - phase.imag * imag;
  state.imag[rrIndex] = phase.real * imag + phase.imag * real;
}

function population(state: Wavefunction, index: number) {
  return state.real[index] ** 2 + state.imag[index] ** 2;
}

function propagate(segments: readonly Segment[], interactionRadPerS: number, refinement: number) {
  const states = logicalInputs.map(({ index }) => {
    const state: Wavefunction = { real: new Float64Array(9), imag: new Float64Array(9) };
    state.real[index] = 1;
    return state;
  });
  for (const segment of segments) {
    const steps = segment.steps * refinement;
    const timeS = segment.durationS / steps;
    const first = localPropagator(segment.first, timeS);
    const second = localPropagator(segment.second, timeS);
    const pairHalfPhase = unitPhase(-interactionRadPerS * (timeS / 2));
    // Symmetric splitting. The two exact local propagators commute at each held sample.
    for (let step = 0; step < steps; step++) {
      for (const state of states) {
        applyInteraction(state, pairHalfPhase);
        applyLocal(state, first, 3, 6, 1);
        applyLocal(state, second, 1, 2, 3);
        applyInteraction(state, pairHalfPhase);
      }
    }
  }
  return logicalInputs.map(({ input, index }, column): SenooCzDynamicsInputResult => {
    const state = states[column];
    const logicalPopulation = logicalInputs.reduce((total, basis) => total + population(state, basis.index), 0);
    const rydbergLeakageProbability = rydbergIndices.reduce((total, basis) => total + population(state, basis), 0);
    return {
      input, diagonal: { real: state.real[index], imag: state.imag[index] },
      logicalReturnProbability: population(state, index), logicalPopulation, rydbergLeakageProbability,
      normError: Math.abs(logicalPopulation + rydbergLeakageProbability - 1),
    };
  });
}

const wrapPhase = (radians: number) => Math.atan2(Math.sin(radians), Math.cos(radians));

function conditionalPhase(inputs: readonly SenooCzDynamicsInputResult[]) {
  const diagonal = inputs.map(input => input.diagonal);
  if (diagonal.some(amplitude => Math.hypot(amplitude.real, amplitude.imag) <= phaseAmplitudeFloor)) return null;
  const [a00, a01, a10, a11] = diagonal.map(amplitude => Math.atan2(amplitude.imag, amplitude.real));
  return wrapPhase(a11 + a00 - a10 - a01);
}

/** Coherent fixed-pair evolution. Output probabilities describe the retained basis, including r0 leakage. */
export function simulateSenooCzDynamics(record: SenooCzWaveform, options: SenooCzDynamicsOptions): SenooCzDynamicsResult {
  if (record.evolutionConvention !== SENOO_CZ_EVOLUTION_CONVENTION) {
    throw new Error('需要明确的 evolutionConvention 来解释失谐和耦合相位。');
  }
  const interactionHz = record.geometry.interactionHz;
  if (interactionHz === null || !Number.isFinite(interactionHz)) throw new Error('需要有限的双原子相互作用频移（Hz）。');
  const interactionRadPerS = hzToAngular(interactionHz);
  if (!Number.isFinite(interactionRadPerS)) throw new Error('双原子相互作用换算后超出有限数值范围。');
  const { segments, coarseStepCount } = planSegments(record, options);
  const coarse = propagate(segments, interactionRadPerS, 1);
  const inputs = propagate(segments, interactionRadPerS, 2);
  const phaseCoarse = conditionalPhase(coarse);
  const conditionalPhaseRad = conditionalPhase(inputs);
  const maxDiagonalAbsChange = Math.max(...inputs.map((input, index) => Math.hypot(
    input.diagonal.real - coarse[index].diagonal.real, input.diagonal.imag - coarse[index].diagonal.imag,
  )));
  const maxLeakageAbsChange = Math.max(...inputs.map((input, index) =>
    Math.abs(input.rydbergLeakageProbability - coarse[index].rydbergLeakageProbability)));
  return {
    inputs,
    conditionalPhaseRad,
    convergence: {
      coarseStepCount, fineStepCount: 2 * coarseStepCount, maxDiagonalAbsChange, maxLeakageAbsChange,
      conditionalPhaseAbsChangeRad: phaseCoarse === null || conditionalPhaseRad === null
        ? null : Math.abs(wrapPhase(conditionalPhaseRad - phaseCoarse)),
    },
  };
}
