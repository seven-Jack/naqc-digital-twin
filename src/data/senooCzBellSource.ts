/// <reference types="vite/client" />
import fig1cCsv from '../../references/knowledge/data/senoo-fig1c-bell.csv?raw';
import fig1dCsv from '../../references/knowledge/data/senoo-fig1d-bell.csv?raw';
import type { SenooPxpObservationGroup, SenooPxpPoint } from './senooPxpSource';

export type SenooCzBellObservationStageId = 'measure-m' | 'm-to-o';

const doi = '10.1038/s41567-026-03258-8';
export const SENOO_CZ_BELL_SOURCE = {
  doi,
  url: `https://doi.org/${doi}`,
  figure: 'Fig. 1c–d',
  workbook: {
    file: 'yb-senoo-source-fig1.xls',
    sha256: '4541abdfa77a39fc4f8da775ec968a74c30682a0f4c5c0188511818c59b56cee',
  },
  derivedTables: {
    '1c': {
      file: 'senoo-fig1c-bell.csv',
      sha256: '19cc83dfd78b55c52aa436520b7521574b83005e7e106a6004c5cf8727165d6b',
    },
    '1d': {
      file: 'senoo-fig1d-bell.csv',
      sha256: '0557ff19315984d3762ca5a5aa9a6341447377fa8f0a589f4a043d18f21e8062',
    },
  },
  evidenceKind: 'published-figure-source',
  isotope: 171,
  states: ['g₀', 'm₀', 'm₁', 'r₀'],
  tweezerWavelengthNm: 767,
  rydbergDriveWavelengthNm: 302,
  selection: 'loss_detected',
  selectionLabel: '丢失检测后保留的有效观测',
  countProvenance: 'inferred_from_68pct_clopper_pearson',
  countProvenanceLabel: '分母由公开误差条按 68% Clopper–Pearson 区间反推',
  fidelityCondition: 'uncorrected_measurement_errors',
} as const;

const header = [
  'source_cells', 'observable', 'state', 'phase_over_pi', 'observed', 'source_error_lower', 'source_error_upper',
  'fitted_parity', 'fit_minus_observed', 'inside_source_interval', 'selection', 'inferred_event',
  'inferred_event_count', 'inferred_complement_count', 'inferred_valid_pairs', 'count_provenance',
  'cp_lower_tail', 'cp_upper_tail',
].join(',');

const layouts = {
  '1c': {
    states: ['00', '01', '10', '11'], parityCount: 41,
    fixedFidelity: 0.9854887601112499, fixedFidelityError: 0.003132505321654091,
    publishedFidelity: 0.986, publishedFidelityError: 0.003,
  },
  '1d': {
    states: ['gg', 'gm', 'mg', 'mm'], parityCount: 60,
    fixedFidelity: 0.9385406582104048, fixedFidelityError: 0.006141884634911691,
    publishedFidelity: 0.938, publishedFidelityError: 0.006,
  },
} as const;

function cellNumber(value: string, name: string, sourceCells: string) {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) throw new Error(`${sourceCells} 的 ${name} 数值无效。`);
  return parsed;
}

function sourceColumn(index: number) {
  // Source ranges start at B. The second letter appears at AA, then BA.
  const prefix = Math.floor((index + 1) / 26);
  const letter = String.fromCharCode(65 + (index + 1) % 26);
  return prefix > 0 ? `${String.fromCharCode(64 + prefix)}${letter}` : letter;
}

function parseGroup(csv: string, panel: keyof typeof layouts): SenooPxpObservationGroup {
  const { states, parityCount, ...fidelity } = layouts[panel];
  const [storedHeader, ...rows] = csv.trimEnd().split(/\r?\n/);
  if (storedHeader !== header || rows.length !== states.length + parityCount) {
    throw new Error(`图 ${panel} 的源表格式或观测点数量不符。`);
  }

  let lastPhase = -Infinity;
  const points = rows.map((row, index): SenooPxpPoint => {
    const values = row.split(',');
    if (values.length !== 18) throw new Error(`图 ${panel} 的源表列数不符。`);
    const [sourceCells, kind, state, rawPhase, rawObserved, rawLower, rawUpper, rawFit, rawResidual, inside,
      selection, event, rawNumerator, rawComplement, rawDenominator, countProvenance] = values;
    const population = index < states.length;
    const column = sourceColumn(population ? index : index - states.length);
    const sheet = `Fig${panel}_${population ? 'left' : 'right'}`;
    if (sourceCells !== `${sheet}!${column}2:${column}5` || kind !== (population ? 'population' : 'parity')) {
      throw new Error(`图 ${panel} 的源单元格 ${sourceCells} 或观测类型不符。`);
    }
    if (selection !== SENOO_CZ_BELL_SOURCE.selection || countProvenance !== SENOO_CZ_BELL_SOURCE.countProvenance) {
      throw new Error(`${sourceCells} 的筛选条件或反推口径不符。`);
    }

    const observed = cellNumber(rawObserved, '观测', sourceCells);
    const lowerError = cellNumber(rawLower, '下误差', sourceCells);
    const upperError = cellNumber(rawUpper, '上误差', sourceCells);
    const numerator = cellNumber(rawNumerator, '反推分子', sourceCells);
    const denominator = cellNumber(rawDenominator, '反推分母', sourceCells);
    const complement = cellNumber(rawComplement, '反推补集', sourceCells);
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1
        || numerator < 0 || numerator > denominator || complement !== denominator - numerator
        || lowerError < 0 || upperError < 0 || lowerError + upperError <= 0) {
      throw new Error(`${sourceCells} 的误差或反推有效计数不符。`);
    }
    const probability = numerator / denominator;
    if (Math.abs(observed - (population ? probability : 2 * probability - 1)) >= 1e-12) {
      throw new Error(`${sourceCells} 的源值与反推有效计数不符。`);
    }
    const common = {
      id: sourceCells, sourceCells, observed, lowerError, upperError, numerator, denominator,
      freeFit: null, freeResidual: null,
    };

    if (population) {
      if (state !== states[index] || event !== `state_${state}` || rawPhase || rawFit || rawResidual || inside) {
        throw new Error(`${sourceCells} 的布居标签或数据列不符。`);
      }
      return { ...common, kind: 'population', state, phaseOverPi: null, fixedFit: null, fixedResidual: null };
    }

    const phaseOverPi = cellNumber(rawPhase, '分析相位', sourceCells);
    const fixedFit = cellNumber(rawFit, '固定谐波拟合', sourceCells);
    const fixedResidual = cellNumber(rawResidual, '固定谐波残差', sourceCells);
    const within = fixedResidual >= -lowerError && fixedResidual <= upperError ? 'True' : 'False';
    if (state || event !== 'even_parity' || phaseOverPi <= lastPhase
        || Math.abs(fixedFit - observed - fixedResidual) >= 1e-12 || inside !== within) {
      throw new Error(`${sourceCells} 的奇偶标签、相位或拟合残差不符。`);
    }
    lastPhase = phaseOverPi;
    return { ...common, kind: 'parity', state: null, phaseOverPi, fixedFit, fixedResidual };
  });

  const populations = points.slice(0, states.length);
  const denominator = populations[0].denominator;
  if (populations.some(point => point.denominator !== denominator)
      || populations.reduce((total, point) => total + point.numerator, 0) !== denominator) {
    throw new Error(`图 ${panel} 的布居有效计数不符。`);
  }
  return {
    points, targetPopulation: (populations[0].numerator + populations[3].numerator) / denominator,
    freeFidelity: null, freeFidelityError: null, ...fidelity,
  };
}

export const SENOO_CZ_BELL_OBSERVATIONS: Readonly<Record<SenooCzBellObservationStageId, SenooPxpObservationGroup>> = {
  'measure-m': parseGroup(fig1cCsv, '1c'),
  'm-to-o': parseGroup(fig1dCsv, '1d'),
};
