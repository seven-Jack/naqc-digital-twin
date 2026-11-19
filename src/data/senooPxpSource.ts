/// <reference types="vite/client" />
import bellCsv from '../../references/knowledge/data/senoo-fig2f-bell.csv?raw';

export type SenooPxpObservationStageId = 'r-to-m' | 'rotate' | 'm-to-o';

export interface SenooPxpPoint {
  readonly id: string;
  readonly kind: 'population' | 'parity';
  readonly state: string | null;
  readonly phaseOverPi: number | null;
  readonly observed: number;
  readonly lowerError: number;
  readonly upperError: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly sourceCells: string;
  readonly fixedFit: number | null;
  readonly freeFit: number | null;
  readonly fixedResidual: number | null;
  readonly freeResidual: number | null;
}

export interface SenooPxpObservationGroup {
  readonly points: readonly SenooPxpPoint[];
  readonly targetPopulation: number;
  readonly fixedFidelity: number | null;
  readonly fixedFidelityError: number | null;
  readonly freeFidelity: number | null;
  readonly freeFidelityError: number | null;
  readonly publishedFidelity: number | null;
  readonly publishedFidelityError: number | null;
}

const doi = '10.1038/s41567-026-03258-8';

export const SENOO_PXP_SOURCE = {
  doi,
  url: `https://doi.org/${doi}`,
  figure: 'Fig. 2f',
  workbook: {
    file: 'yb-senoo-source-fig2.xls',
    sha256: '81a4c54bd1619b23ce8d60e6f136b2c20912c0f22d8dcef8a053b36a400688f4',
  },
  derivedTable: {
    file: 'senoo-fig2f-bell.csv',
    sha256: '4a1c4472c7b56f81a76b83252663f362724896c0a7bf31994be9ea0bf40a0e31',
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
  captionPopulationCountRange: [3000, 4000],
  captionParityCountMoreThan: 100,
} as const;

const columns = [
  'stage', 'source_cells', 'observable', 'state', 'phase_over_pi', 'observed',
  'source_error_lower', 'source_error_upper', 'fitted_parity', 'fit_minus_observed',
  'inside_source_interval', 'selection', 'inferred_event', 'inferred_event_count',
  'inferred_complement_count', 'inferred_valid_pairs', 'count_provenance', 'cp_lower_tail',
  'cp_upper_tail', 'fitted_parity_free_harmonic', 'free_harmonic_fit_minus_observed',
  'inside_source_interval_free_harmonic',
] as const;

const layouts = {
  r_to_m_odd: {
    id: 'r-to-m', populationSheet: 'Fig2f_left_bottom', paritySheet: null,
    states: ['00', '01', '10', '11'], targetStates: ['01', '10'],
  },
  m_even: {
    id: 'rotate', populationSheet: 'Fig2f_left_top', paritySheet: 'Fig2f_right_top',
    states: ['00', '01', '10', '11'], targetStates: ['00', '11'],
  },
  o_even: {
    id: 'm-to-o', populationSheet: 'Fig2f_center_bottom', paritySheet: 'Fig2f_right_bottom',
    states: ['gg', 'gm', 'mg', 'mm'], targetStates: ['gg', 'mm'],
  },
} as const;

type Layout = typeof layouts[keyof typeof layouts];

const summaries = {
  'r-to-m': {
    fixedFidelity: null, fixedFidelityError: null, freeFidelity: null, freeFidelityError: null,
    publishedFidelity: null, publishedFidelityError: null,
  },
  rotate: {
    fixedFidelity: 0.9625082240783538, fixedFidelityError: 0.00732133419715055,
    freeFidelity: 0.9629401153630742, freeFidelityError: 0.007470549700674796,
    publishedFidelity: 0.963, publishedFidelityError: 0.008,
  },
  'm-to-o': {
    fixedFidelity: 0.9201466377734067, fixedFidelityError: 0.009754720322120587,
    freeFidelity: 0.9233586064260877, freeFidelityError: 0.008921681423256205,
    publishedFidelity: 0.924, publishedFidelityError: 0.009,
  },
} as const;

function cellNumber(value: string, name: string, sourceCells: string) {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) throw new Error(`${sourceCells} 的 ${name} 数值无效。`);
  return parsed;
}

function sourceColumn(index: number) {
  // Fig. 2f uses B–AF for phase points and B–E for populations.
  const letterIndex = index + 1;
  const letter = String.fromCharCode(65 + letterIndex % 26);
  return letterIndex < 26 ? letter : `A${letter}`;
}

function close(a: number, b: number) {
  return Math.abs(a - b) < 1e-12;
}

function parseRow(line: string, layout: Layout, existing: readonly SenooPxpPoint[]) {
  const values = line.split(',');
  if (values.length !== columns.length) throw new Error('图 2f 的源表列数不符。');
  const [, sourceCells, kind, stateValue, phaseValue, observedValue, lowerValue, upperValue, fixedValue,
    fixedResidualValue, fixedInterval, selection, event, numeratorValue, complementValue, denominatorValue,
    countProvenance, , , freeValue, freeResidualValue, freeInterval] = values;
  if (selection !== SENOO_PXP_SOURCE.selection || countProvenance !== SENOO_PXP_SOURCE.countProvenance) {
    throw new Error(`${sourceCells} 的筛选条件或反推口径不符。`);
  }
  if (kind !== 'population' && kind !== 'parity') throw new Error(`${sourceCells} 的观测类型无效。`);
  const index = existing.filter(point => point.kind === kind).length;
  const column = sourceColumn(index);
  const sheet = kind === 'population' ? layout.populationSheet : layout.paritySheet;
  if (sheet === null || sourceCells !== `${sheet}!${column}2:${column}5`) {
    throw new Error(`图 2f 源单元格 ${sourceCells} 不符。`);
  }

  const observed = cellNumber(observedValue, '观测', sourceCells);
  const lowerError = cellNumber(lowerValue, '下误差', sourceCells);
  const upperError = cellNumber(upperValue, '上误差', sourceCells);
  const numerator = cellNumber(numeratorValue, '反推分子', sourceCells);
  const denominator = cellNumber(denominatorValue, '反推分母', sourceCells);
  const complement = cellNumber(complementValue, '反推补集', sourceCells);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1
      || numerator < 0 || numerator > denominator || complement !== denominator - numerator
      || lowerError < 0 || upperError < 0 || lowerError + upperError <= 0) {
    throw new Error(`${sourceCells} 的误差或反推有效计数不符。`);
  }
  const probability = numerator / denominator;
  if (!close(observed, kind === 'population' ? probability : 2 * probability - 1)) {
    throw new Error(`${sourceCells} 的源值与反推有效计数不符。`);
  }
  const point = { id: sourceCells, kind, sourceCells, observed, lowerError, upperError, numerator, denominator } as const;

  if (kind === 'population') {
    if (stateValue !== layout.states[index] || event !== `state_${stateValue}` || phaseValue
        || fixedValue || freeValue || fixedResidualValue || freeResidualValue || fixedInterval || freeInterval) {
      throw new Error(`${sourceCells} 的布居标签或数据列不符。`);
    }
    return { ...point, state: stateValue, phaseOverPi: null, fixedFit: null, freeFit: null,
      fixedResidual: null, freeResidual: null };
  }

  const phaseOverPi = cellNumber(phaseValue, '分析相位', sourceCells);
  const previousPhase = existing.at(-1)?.phaseOverPi;
  if (stateValue || event !== 'even_parity' || (previousPhase != null && phaseOverPi <= previousPhase)) {
    throw new Error(`${sourceCells} 的奇偶扫描标签或相位顺序不符。`);
  }
  const fixedFit = cellNumber(fixedValue, '固定谐波拟合', sourceCells);
  const fixedResidual = cellNumber(fixedResidualValue, '固定谐波残差', sourceCells);
  const freeFit = cellNumber(freeValue, '自由谐波拟合', sourceCells);
  const freeResidual = cellNumber(freeResidualValue, '自由谐波残差', sourceCells);
  const within = (residual: number) => residual >= -lowerError && residual <= upperError ? 'True' : 'False';
  if (!close(fixedFit - observed, fixedResidual) || !close(freeFit - observed, freeResidual)
      || fixedInterval !== within(fixedResidual) || freeInterval !== within(freeResidual)) {
    throw new Error(`${sourceCells} 的拟合残差或误差区间标记不符。`);
  }
  return { ...point, state: null, phaseOverPi, fixedFit, freeFit, fixedResidual, freeResidual };
}

function parseObservations(csv: string): Readonly<Record<SenooPxpObservationStageId, SenooPxpObservationGroup>> {
  const [header, ...rows] = csv.trimEnd().split(/\r?\n/);
  if (header !== columns.join(',') || rows.length !== 74) throw new Error('图 2f 的 74 点源表格式不符。');
  const staged: Record<SenooPxpObservationStageId, SenooPxpPoint[]> = { 'r-to-m': [], rotate: [], 'm-to-o': [] };
  for (const row of rows) {
    const stage = row.slice(0, row.indexOf(','));
    if (!Object.hasOwn(layouts, stage)) throw new Error(`图 2f 源表阶段 ${stage} 无效。`);
    const layout = layouts[stage as keyof typeof layouts];
    staged[layout.id].push(parseRow(row, layout, staged[layout.id]));
  }

  function group(layout: Layout): SenooPxpObservationGroup {
    const points = staged[layout.id];
    const populations = points.filter(point => point.kind === 'population');
    const denominator = populations[0]?.denominator;
    if (populations.length !== 4 || points.length !== (layout.paritySheet ? 35 : 4)
        || populations.some(point => point.denominator !== denominator)
        || populations.reduce((total, point) => total + point.numerator, 0) !== denominator) {
      throw new Error(`图 2f 的 ${layout.populationSheet} 布居分母或观测数量不符。`);
    }
    const targetStates: readonly string[] = layout.targetStates;
    const targetCount = populations.reduce((sum, point) =>
      targetStates.includes(point.state ?? '') ? sum + point.numerator : sum, 0);
    return { points, targetPopulation: targetCount / denominator, ...summaries[layout.id] };
  }

  return {
    'r-to-m': group(layouts.r_to_m_odd),
    rotate: group(layouts.m_even),
    'm-to-o': group(layouts.o_even),
  };
}

export const SENOO_PXP_OBSERVATIONS = parseObservations(bellCsv);
