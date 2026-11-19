import { describe, expect, it } from 'vitest';
import { MUNIZ_DEMO_PROFILE } from '../src/data/machineProfile';
import { bindClockOperationReference, getDemoClockBinding } from '../src/data/yb171AtomicSnapshot';

describe('versioned 171Yb clock reference', () => {
  it('links the schematic 578 nm channel to traceable T3 reference quantities', () => {
    const binding = getDemoClockBinding(MUNIZ_DEMO_PROFILE.id);
    expect(binding).toMatchObject({
      status: 'reference-only',
      transitionId: 'T3',
      isotope: 171,
      lower: { term: '¹S₀', F: 0.5 },
      upper: { term: '³P₀', F: 0.5 },
      frequencyDecimalTHz: '518.29583659086363',
      frequencyDecimalHz: '518295836590863.63',
      sourceUrl: 'https://arxiv.org/abs/2509.04416v2',
      conditions: { driveFrequencyHz: null, rabiFrequencyHz: null, powerWAtAtoms: null, polarization: null },
    });
    expect(binding?.wavelengthVacuumM).toBeCloseTo(578.4195759161624e-9, 18);
    expect(binding?.frequencyHz).toBe(518295836590863.63);
    expect(getDemoClockBinding('unknown-device')).toBeNull();
  });

  it('refuses mismatched isotope, optical channel, or hyperfine state', () => {
    const request = {
      profileId: MUNIZ_DEMO_PROFILE.id,
      channel: 'clock',
      isotope: 171,
      nominalWavelengthNm: 578,
      lowerLevelId: 'yb171-6s2-1s0',
      upperLevelId: 'yb171-6s6p-3p0',
      lowerF: 0.5,
      upperF: 0.5,
    };
    expect(bindClockOperationReference(request)).not.toBeNull();
    expect(bindClockOperationReference({ ...request, isotope: 174 })).toBeNull();
    expect(bindClockOperationReference({ ...request, nominalWavelengthNm: 556 })).toBeNull();
    expect(bindClockOperationReference({ ...request, upperF: 1.5 })).toBeNull();
    expect(bindClockOperationReference({ ...request, upperLevelId: 'yb171-6s6p-3p1' })).toBeNull();
  });
});
