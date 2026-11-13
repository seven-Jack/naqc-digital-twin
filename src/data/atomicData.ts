import { C } from '../physics/constants';
import { nm } from '../physics/units';

const clockFrequencyHz = 518_295_836_590_863.632;
export const atomicData = {
  version: 'R009-rounded-532-v1',
  evidence: 'conditional_theory',
  trapWavelengthM: nm(532),
  clockWavelengthM: C / clockFrequencyHz,
  clockFrequencyHz,
  clockFrequencyCipmText: '518295836590863.632',
  alphaGroundAu: 257.91,
  alphaExcitedAu: 99.98,
  source: 'Höhn et al. ¹⁷⁴Yb empirical model evaluated in Calculation R009, rounded and adopted as a ¹⁷¹Yb proxy',
  sourceUrl: 'https://doi.org/10.1103/PhysRevA.108.053325',
  calculationUrl: 'https://github.com/seven-Jack/Calculation/issues/23',
  referenceRun: 'R009_yb171_clock_polarizability/results/20261031T112331.757267Z',
  uncertainty: 'Full ¹⁷¹Yb standard uncertainty is open',
} as const;

export const assumptions = [
  '¹⁷¹Yb ¹S₀ ↔ ³P₀, F = ½, mF = +½, π-polarized clock drive.',
  'Circular Gaussian 532 nm tweezer with ideal linear polarization and scalar polarizabilities.',
  'Identical, independent sites at their respective beam waists. The 578 nm drive is spatially uniform.',
  'Stationary atom at focus and closed two-level rotating-wave approximation with a square pulse.',
  'Trap frequencies and vibrational levels use the harmonic expansion about focus.',
  'Zeeman shifts, motion-dependent coupling, scattering, heating, decoherence and detection are outside the model.',
];
