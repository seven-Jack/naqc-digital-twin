export interface Beam {
  powerW: number;
  waistM: number;
  wavelengthM: number;
}

export const rayleighLength = (beam: Beam) => Math.PI * beam.waistM ** 2 / beam.wavelengthM;
export const centerIntensity = (beam: Beam) => 2 * beam.powerW / (Math.PI * beam.waistM ** 2);

export function beamRadius(beam: Beam, zM: number) {
  return beam.waistM * Math.hypot(1, zM / rayleighLength(beam));
}

export function intensity(beam: Beam, radialM: number, zM: number) {
  const radius = beamRadius(beam, zM);
  return 2 * beam.powerW / (Math.PI * radius ** 2) * Math.exp(-2 * (radialM / radius) ** 2);
}
