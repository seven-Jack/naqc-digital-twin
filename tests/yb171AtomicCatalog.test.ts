import { describe, expect, it } from 'vitest';
import snapshot from '../src/data/yb171AtomicSnapshot.generated.json';
import { getDemoClockBinding } from '../src/data/yb171AtomicSnapshot';
import { MUNIZ_DEMO_PROFILE } from '../src/data/machineProfile';

describe('versioned local 171Yb atom data', () => {
  it('matches the reviewed catalogue scope and retains failed or unknown evidence', () => {
    const { dataset, levels, hyperfine, transitions, rydbergZeroField, decay } = snapshot;
    expect(dataset.version).toBe('2026.11.11.1');
    expect(dataset.sourceCommit).toBe('2e2e9d5');
    expect(dataset.files['data/transitions.json'])
      .toBe('32b8c4998b5b5feab5fe378bcd3677d7b220fe658badf5b421009603828c0e70');
    expect(Object.keys(levels)).toHaveLength(12);
    expect(Object.keys(transitions)).toHaveLength(14);
    expect(Object.keys(hyperfine.states)).toHaveLength(11);
    expect(decay.records).toHaveLength(8);
    expect(rydbergZeroField.states).toHaveLength(144);
    expect([rydbergZeroField.B_T, rydbergZeroField.E_V_m, rydbergZeroField.physicalUncertainty]).toEqual([0, 0, null]);
    expect(rydbergZeroField.states).toEqual(expect.arrayContaining([
      expect.objectContaining({ n: 29, Fp: 0.5, dipole_ea0: 0.009560902014655329 }),
      expect.objectContaining({ n: 100, Fp: 1.5 }),
    ]));
    expect(transitions.T3.quantities.oscillator_strength_f_num.siValue).toBeNull();
    expect(transitions.T3.quantities.d_num.siUncertainty).toBeNull();
    expect(transitions.T3.quantities.linewidth_frequency_coefficient_Hz.reviewStatus).toBe('conflict-unresolved');
  });

  it('retains the full-catalogue provenance and T3 values in the isolated clock binding', () => {
    const { dataset, levels, hyperfine, transitions, sources } = snapshot;
    const transition = transitions.T3;
    const frequency = transition.quantities.frequency_THz;
    const wavelength = transition.quantities.wavelength_vac_nm;
    const lower = hyperfine.states['¹S₀'];
    const upper = hyperfine.states['³P₀'];
    expect(getDemoClockBinding(MUNIZ_DEMO_PROFILE.id)).toMatchObject({
      isotope: snapshot.isotope,
      snapshotVersion: dataset.version,
      snapshotSourceCommit: dataset.sourceCommit,
      snapshotContentHash: dataset.contentHash,
      sourceUrl: sources['ref-01'].url,
      sourceLocator: frequency.sourceLocator,
      transitionId: transition.id,
      lower: { levelId: transition.lowerLevelId, term: levels['yb171-6s2-1s0'].attributes.term, F: lower.sublevelsHz[0].F },
      upper: { levelId: transition.upperLevelId, term: levels['yb171-6s6p-3p0'].attributes.term, F: upper.sublevelsHz[0].F },
      frequencyHz: frequency.siValue,
      frequencyDecimalTHz: frequency.conditions.sourceDecimal,
      frequencyDecimalHz: frequency.siDecimalValue,
      frequencyReportedUncertaintyHz: frequency.siUncertainty,
      frequencyEvidenceKind: frequency.evidenceKind,
      frequencyReviewStatus: frequency.reviewStatus,
      frequencySourceId: frequency.sourceId,
      frequencyConvention: frequency.convention,
      wavelengthVacuumNm: wavelength.value,
      wavelengthVacuumM: wavelength.siValue,
      wavelengthSourceLocator: wavelength.sourceLocator,
    });
  });
});
