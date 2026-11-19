export type SenooCzWaveformSource = 'measured' | 'control-setpoint' | 'synthetic';
export const SENOO_CZ_EVOLUTION_CONVENTION = 'drive-minus-transition-positive-coupling-phase';

interface SiteDrive {
  readonly omegaRadPerS: number;
  readonly detuningRadPerS: number;
  readonly phaseRad: number;
}

interface DriveSample {
  readonly timeS: number;
  readonly first: SiteDrive;
  readonly second: SiteDrive;
}

interface Geometry {
  readonly distanceM: number | null;
  readonly angleToMagneticFieldRad: number | null;
  readonly magneticFieldT: number | null;
  readonly electricFieldVPerM: number | null;
  readonly interactionHz: number | null;
  readonly sourceRef: string | null;
}

export interface SenooCzWaveform {
  readonly kind: 'senoo-cz-waveform';
  readonly schemaVersion: 1;
  readonly sourceKind: SenooCzWaveformSource | null;
  readonly sourceRef: string | null;
  readonly apparatusVersion: string | null;
  readonly gateVersion: string | null;
  readonly acquisitionRunId: string | null;
  readonly workingPoint: string | null;
  readonly isotope: number | null;
  readonly driveWavelengthM: number | null;
  readonly clockId: string | null;
  readonly timeOriginRef: string | null;
  readonly phaseReference: string | null;
  readonly detuningReference: string | null;
  readonly evolutionConvention: typeof SENOO_CZ_EVOLUTION_CONVENTION | null;
  readonly siteIds: readonly [string, string] | null;
  readonly window: { readonly startS: number; readonly endS: number } | null;
  readonly samples: readonly DriveSample[];
  readonly geometry: Geometry;
  readonly driveCalibrationRef: string | null;
  readonly trapTimingRef: string | null;
  readonly erasureTimingRef: string | null;
  readonly ionizationTimingRef: string | null;
  readonly zCompensationRef: string | null;
  readonly responseDataRef: string | null;
}

interface WaveformIssue {
  readonly field: string;
  readonly message: string;
  readonly kind: 'waveform' | 'conditions' | 'evidence';
}

export interface SenooCzWaveformAssessment {
  readonly coverage: {
    readonly startS: number | null;
    readonly endS: number | null;
    readonly count: number;
    readonly coversWindow: boolean;
  };
  readonly issues: readonly WaveformIssue[];
  readonly readyForModelInput: boolean;
}

export function createSenooCzWaveformTemplate(): SenooCzWaveform {
  return {
    kind: 'senoo-cz-waveform', schemaVersion: 1,
    sourceKind: null, sourceRef: null, apparatusVersion: null, gateVersion: null,
    acquisitionRunId: null, workingPoint: null, isotope: null, driveWavelengthM: null,
    clockId: null, timeOriginRef: null, phaseReference: null, detuningReference: null, evolutionConvention: null,
    siteIds: null, window: null, samples: [],
    geometry: {
      distanceM: null, angleToMagneticFieldRad: null, magneticFieldT: null,
      electricFieldVPerM: null, interactionHz: null, sourceRef: null,
    },
    driveCalibrationRef: null, trapTimingRef: null, erasureTimingRef: null,
    ionizationTimingRef: null, zCompensationRef: null, responseDataRef: null,
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 应为一个 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`${field} 应为文本或 null。`);
  return value.trim() || null;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} 应为有限数值。`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : finiteNumber(value, field);
}

function siteIds(value: unknown): SenooCzWaveform['siteIds'] {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 2) throw new Error('siteIds 应包含两个位点 ID。');
  const left = optionalText(value[0], 'siteIds[0]');
  const right = optionalText(value[1], 'siteIds[1]');
  if (!left || !right || left === right) throw new Error('siteIds 应包含两个不同且非空的位点 ID。');
  return [left, right];
}

function gateWindow(value: unknown): SenooCzWaveform['window'] {
  if (value === null || value === undefined) return null;
  const window = object(value, 'window');
  const startS = finiteNumber(window.startS, 'window.startS');
  const endS = finiteNumber(window.endS, 'window.endS');
  if (endS <= startS || !Number.isFinite(endS - startS)) {
    throw new Error('window 结束时刻应晚于开始时刻，且时长应为有限数值。');
  }
  return { startS, endS };
}

function drive(value: unknown, field: string): SiteDrive {
  const record = object(value, field);
  const omegaRadPerS = finiteNumber(record.omegaRadPerS, `${field}.omegaRadPerS`);
  if (omegaRadPerS < 0) throw new Error(`${field}.omegaRadPerS 应为非负的 Rabi 振幅。`);
  return {
    omegaRadPerS,
    detuningRadPerS: finiteNumber(record.detuningRadPerS, `${field}.detuningRadPerS`),
    phaseRad: finiteNumber(record.phaseRad, `${field}.phaseRad`),
  };
}

function samples(value: unknown): readonly DriveSample[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('samples 应为采样数组。');
  const result = value.map((item: unknown, index) => {
    const field = `samples[${index}]`;
    const sample = object(item, field);
    return {
      timeS: finiteNumber(sample.timeS, `${field}.timeS`),
      first: drive(sample.first, `${field}.first`),
      second: drive(sample.second, `${field}.second`),
    };
  });
  const outOfOrder = result.findIndex((sample, index) => index > 0 && sample.timeS <= result[index - 1].timeS);
  if (outOfOrder !== -1) throw new Error(`samples[${outOfOrder}].timeS 应严格递增。`);
  if (result.length > 1 && !Number.isFinite(result.at(-1)!.timeS - result[0].timeS)) {
    throw new Error('samples 的时间跨度应为有限数值。');
  }
  return result;
}

function geometry(value: unknown): Geometry {
  const raw = value === null || value === undefined ? {} : object(value, 'geometry');
  const read = (key: keyof Geometry) => optionalNumber(raw[key], `geometry.${key}`);
  const distanceM = read('distanceM');
  if (distanceM !== null && distanceM <= 0) throw new Error('geometry.distanceM 应为正的原子间距。');
  const angleToMagneticFieldRad = read('angleToMagneticFieldRad');
  if (angleToMagneticFieldRad !== null && (angleToMagneticFieldRad < 0 || angleToMagneticFieldRad > Math.PI)) {
    throw new Error('geometry.angleToMagneticFieldRad 应在 0–π rad 内。');
  }
  const magneticFieldT = read('magneticFieldT');
  const electricFieldVPerM = read('electricFieldVPerM');
  if ((magneticFieldT !== null && magneticFieldT < 0) || (electricFieldVPerM !== null && electricFieldVPerM < 0)) {
    throw new Error('geometry 中的磁场和电场大小应为非负值。');
  }
  return {
    distanceM, angleToMagneticFieldRad, magneticFieldT, electricFieldVPerM,
    interactionHz: read('interactionHz'), sourceRef: optionalText(raw.sourceRef, 'geometry.sourceRef'),
  };
}

export function parseSenooCzWaveform(text: string): SenooCzWaveform {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('波形文件中的 JSON 无效。');
  }
  const raw = object(parsed, '波形记录');
  if (raw.kind !== 'senoo-cz-waveform' || raw.schemaVersion !== 1) {
    throw new Error('请选择 Senoo CZ 波形 v1 JSON。');
  }
  const readText = (key: keyof SenooCzWaveform) => optionalText(raw[key], key);
  const sourceKind = readText('sourceKind');
  if (sourceKind !== null && sourceKind !== 'measured' && sourceKind !== 'control-setpoint' && sourceKind !== 'synthetic') {
    throw new Error('sourceKind 应填写 measured、control-setpoint、synthetic 或 null。');
  }
  const isotope = optionalNumber(raw.isotope, 'isotope');
  if (isotope !== null && (!Number.isSafeInteger(isotope) || isotope <= 0)) {
    throw new Error('isotope 应为正的整数质量数。');
  }
  const driveWavelengthM = optionalNumber(raw.driveWavelengthM, 'driveWavelengthM');
  if (driveWavelengthM !== null && driveWavelengthM <= 0) throw new Error('driveWavelengthM 应为正的米制波长。');
  const evolutionConvention = readText('evolutionConvention');
  if (evolutionConvention !== null && evolutionConvention !== SENOO_CZ_EVOLUTION_CONVENTION) {
    throw new Error(`evolutionConvention 请使用 ${SENOO_CZ_EVOLUTION_CONVENTION} 或 null。`);
  }
  return {
    kind: 'senoo-cz-waveform', schemaVersion: 1,
    sourceKind, sourceRef: readText('sourceRef'), apparatusVersion: readText('apparatusVersion'),
    gateVersion: readText('gateVersion'), acquisitionRunId: readText('acquisitionRunId'), workingPoint: readText('workingPoint'),
    isotope, driveWavelengthM, clockId: readText('clockId'), timeOriginRef: readText('timeOriginRef'),
    phaseReference: readText('phaseReference'), detuningReference: readText('detuningReference'), evolutionConvention,
    siteIds: siteIds(raw.siteIds), window: gateWindow(raw.window), samples: samples(raw.samples), geometry: geometry(raw.geometry),
    driveCalibrationRef: readText('driveCalibrationRef'), trapTimingRef: readText('trapTimingRef'),
    erasureTimingRef: readText('erasureTimingRef'), ionizationTimingRef: readText('ionizationTimingRef'),
    zCompensationRef: readText('zCompensationRef'), responseDataRef: readText('responseDataRef'),
  };
}

export function assessSenooCzWaveform(record: SenooCzWaveform): SenooCzWaveformAssessment {
  const { window, samples: points, geometry: pair } = record;
  const startS = points[0]?.timeS ?? null;
  const endS = points.at(-1)?.timeS ?? null;
  // The timestamp span covers the gate endpoints. It supplies no sampling-density or interpolation claim.
  const coversWindow = window !== null && points.length >= 2 && startS! <= window.startS && endS! >= window.endS;
  const issues: WaveformIssue[] = [];
  if (record.sourceKind !== 'measured') {
    issues.push({ field: 'sourceKind', message: '需登记同装置实际驱动的实测来源。', kind: 'waveform' });
  } else if (record.sourceRef && /^(synthetic|control-setpoint):/i.test(record.sourceRef)) {
    issues.push({ field: 'sourceRef', message: '实测声明与已知的合成或控制设定引用冲突。', kind: 'waveform' });
  }
  if (points.length < 2 || (window !== null && !coversWindow)) {
    issues.push({ field: 'samples', message: '至少需两个递增时点，采样时间跨度应覆盖门起止。', kind: 'waveform' });
  }
  if (record.isotope !== null && record.isotope !== 171) {
    issues.push({ field: 'isotope', message: '当前 Senoo 模型的同位素为 ¹⁷¹Yb。', kind: 'conditions' });
  }

  const required = [
    ['sourceRef', record.sourceRef, '原始波形或同步采集日志引用', 'waveform'],
    ['clockId', record.clockId, '采集时钟 ID', 'waveform'],
    ['timeOriginRef', record.timeOriginRef, '采集时零的参考', 'waveform'],
    ['window', window, '门起止时刻', 'waveform'],
    ['siteIds', record.siteIds, '与 first、second 波形顺序对应的两个位点', 'waveform'],
    ['driveCalibrationRef', record.driveCalibrationRef, '原子处幅度、失谐和相位的标定引用', 'waveform'],
    ['phaseReference', record.phaseReference, '驱动相位参考', 'waveform'],
    ['detuningReference', record.detuningReference, '失谐零点与正负约定', 'waveform'],
    ['apparatusVersion', record.apparatusVersion, '同装置的版本', 'conditions'],
    ['gateVersion', record.gateVersion, '门协议版本', 'conditions'],
    ['acquisitionRunId', record.acquisitionRunId, '采集运行 ID', 'conditions'],
    ['workingPoint', record.workingPoint, '门工况', 'conditions'],
    ['isotope', record.isotope, '同位素质量数', 'conditions'],
    ['driveWavelengthM', record.driveWavelengthM, '实际驱动波长', 'conditions'],
    ['geometry.distanceM', pair.distanceM, '原子间距', 'conditions'],
    ['geometry.angleToMagneticFieldRad', pair.angleToMagneticFieldRad, '原子对连线与磁场夹角', 'conditions'],
    ['geometry.magneticFieldT', pair.magneticFieldT, '磁场大小', 'conditions'],
    ['geometry.electricFieldVPerM', pair.electricFieldVPerM, '电场大小', 'conditions'],
    ['geometry.interactionHz', pair.interactionHz, '同工况的双原子相互作用频移', 'conditions'],
    ['geometry.sourceRef', pair.sourceRef, '几何、场与相互作用的原始记录引用', 'conditions'],
    ['trapTimingRef', record.trapTimingRef, '阱开关与斜坡时序引用', 'evidence'],
    ['erasureTimingRef', record.erasureTimingRef, '擦除探测时序引用', 'evidence'],
    ['ionizationTimingRef', record.ionizationTimingRef, '电离脉冲时序引用', 'evidence'],
    ['zCompensationRef', record.zCompensationRef, 'Z 补偿和参考帧记录', 'evidence'],
    ['responseDataRef', record.responseDataRef, '独立门响应数据及逐轮判读、掩码和分母引用', 'evidence'],
  ] as const;
  for (const [field, value, message, kind] of required) {
    if (value === null) issues.push({ field, message: `待补${message}。`, kind });
  }
  return {
    coverage: { startS, endS, count: points.length, coversWindow },
    issues,
    readyForModelInput: !issues.some(issue => issue.kind !== 'evidence'),
  };
}
