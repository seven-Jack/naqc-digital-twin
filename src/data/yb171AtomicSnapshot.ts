import { MUNIZ_DEMO_PROFILE } from './machineProfile';
import { MUNIZ_DEMO_WAVELENGTHS_NM } from './machineSceneProfile';
import clock from './yb171ClockReference.generated.json';

export interface ClockOperationReferenceRequest {
  profileId: string;
  channel: string;
  isotope: number;
  nominalWavelengthNm: number;
  lowerLevelId: string;
  upperLevelId: string;
  lowerF: number;
  upperF: number;
}

/** Bind an isolated-atom reference. An apparatus drive needs its own operating data. */
export function bindClockOperationReference(request: ClockOperationReferenceRequest) {
  const { lower, upper, frequency, wavelength } = clock;
  const compatible = request.channel === 'clock'
    && request.isotope === clock.isotope
    && request.nominalWavelengthNm === Math.round(wavelength.value)
    && request.lowerLevelId === lower.levelId
    && request.upperLevelId === upper.levelId
    && lower.allowedF.includes(request.lowerF)
    && upper.allowedF.includes(request.upperF);
  if (!compatible) return null;

  return {
    status: 'reference-only',
    snapshotVersion: clock.dataset.version,
    snapshotSourceCommit: clock.dataset.sourceCommit,
    snapshotContentHash: clock.dataset.contentHash,
    sourceUrl: clock.sourceUrl,
    sourceLocator: frequency.sourceLocator,
    profileId: request.profileId,
    transitionId: clock.transitionId,
    channel: request.channel,
    isotope: request.isotope,
    nominalWavelengthNm: request.nominalWavelengthNm,
    lower: { levelId: lower.levelId, term: lower.term, F: request.lowerF },
    upper: { levelId: upper.levelId, term: upper.term, F: request.upperF },
    frequencyHz: frequency.siValue,
    frequencyDecimalTHz: frequency.sourceDecimal,
    frequencyDecimalHz: frequency.siDecimalValue,
    frequencyReportedUncertaintyHz: frequency.siUncertainty,
    frequencyEvidenceKind: frequency.evidenceKind,
    frequencyReviewStatus: frequency.reviewStatus,
    frequencySourceId: frequency.sourceId,
    frequencyConvention: frequency.convention,
    wavelengthVacuumNm: wavelength.value,
    wavelengthVacuumM: wavelength.siValue,
    wavelengthSourceLocator: wavelength.sourceLocator,
    conditions: {
      purpose: 'clock-state-transfer',
      quantizationAxis: null,
      magneticFieldT: null,
      polarization: null,
      lowerMF: null,
      upperMF: null,
      powerWAtAtoms: null,
      waistMAtAtoms: null,
      rabiFrequencyHz: null,
      driveFrequencyHz: null,
    },
  } as const;
}

export function getDemoClockBinding(profileId: string) {
  if (profileId !== MUNIZ_DEMO_PROFILE.id) return null;
  return bindClockOperationReference({
    profileId,
    channel: 'clock',
    isotope: clock.isotope,
    nominalWavelengthNm: MUNIZ_DEMO_WAVELENGTHS_NM.clock,
    lowerLevelId: clock.lower.levelId,
    upperLevelId: clock.upper.levelId,
    lowerF: 0.5,
    upperF: 0.5,
  });
}
