/// <reference types="vite/client" />
import czCsv from '../../references/knowledge/data/senoo-fig3-cz-by-depth.csv?raw';

const doi = '10.1038/s41567-026-03258-8';
const countProvenance = 'inferred_from_68pct_clopper_pearson';
export const SENOO_CZ_CHARACTERIZATION_SOURCE = {
  doi,
  url: `https://doi.org/${doi}`,
  figure: 'Fig. 3b–d',
  evidenceKind: 'literature_reproduction',
  isotope: 171,
  states: ['m₀', 'm₁', 'r₀'],
  tweezerWavelengthNm: 767,
  rydbergDriveWavelengthNm: 302,
  workbook: {
    file: 'yb-senoo-source-fig3.xls',
    sha256: '6f1ee3166116ca72325f07397d1eaf3a095a4d398e8ecdf529a85df819728ff6',
  },
  derivedTable: {
    file: 'senoo-fig3-cz-by-depth.csv',
    sha256: '3fa65935284ab1d6957c8ee8006d217e849f9ee12c630ce922e527bcfb77c7c9',
  },
  countProvenance,
  countProvenanceLabel: '有效计数与分母根据公开观测和 68% Clopper–Pearson 区间反推',
} as const;

export const SENOO_CZ_DEPTHS = [0, 4, 8, 12, 16, 20] as const;

export interface SenooCzCharacterizationPoint {
  readonly depth: typeof SENOO_CZ_DEPTHS[number];
  readonly sourceCells: string;
  readonly probability: number;
  readonly lowerError: number;
  readonly upperError: number;
  readonly fittedProbability: number;
  readonly residual: number;
  readonly residualOverMeanError: number;
  readonly insideSourceInterval: boolean;
  readonly numerator: number;
  readonly denominator: number;
  readonly denominatorUnit: 'atom_pair' | 'atom_site';
  readonly countProvenance: typeof countProvenance;
  readonly cpLowerTail: number;
  readonly cpUpperTail: number;
}

const header = [
  'source_cells', 'condition', 'denominator_unit', 'cz_depth', 'observed_probability',
  'source_error_lower', 'source_error_upper', 'fitted_probability', 'fit_minus_observation',
  'residual_over_mean_error', 'inside_source_interval', 'inferred_numerator', 'inferred_denominator',
  'count_provenance', 'cp_lower_tail', 'cp_upper_tail',
].join(',');

// Fidelity follows the saved fitted curve. Its standard errors retain the reproduction report's precision.
const grbDefinitions = [
  {
    id: 'prep', sheet: 'Fig3b_prep', denominatorUnit: 'atom_pair', label: '制备擦除',
    selectionLabel: '通过序列前的制备擦除检查',
    summary: { fidelity: 0.9937191745597218, standardError: 0.0006855, asymptote: 0, publishedLabel: '99.37(7)%' },
  },
  {
    id: 'decay', sheet: 'Fig3b_decay', denominatorUnit: 'atom_pair', label: '加衰变擦除',
    selectionLabel: '制备擦除后加测序列期间的衰变，CZ 驱动期间关闭该探测光',
    summary: { fidelity: 0.9950649794687032, standardError: 0.0006188, asymptote: 0, publishedLabel: '99.51(6)%' },
  },
  {
    id: 'loss', sheet: 'Fig3b_loss', denominatorUnit: 'atom_pair', label: '丢失检测',
    selectionLabel: '通过丢失检测的有效原子对',
    summary: { fidelity: 0.9978382292896364, standardError: 0.0004196, asymptote: 0.25, publishedLabel: '99.78(4)%' },
  },
] as const;

const lossSelection = '通过制备擦除，包含 CZ 后电离掉的残余里德堡布居';
const lossDefinitions = [
  {
    id: 'prep_site_loss', sheet: 'Fig3c_single', denominatorUnit: 'atom_site', label: '单站点丢失',
    selectionLabel: lossSelection,
    summary: {
      rate: 0.0021365359, standardError: 0.0002482929, intercept: 0.05349572,
      publishedRate: 0.00213653585342831, publishedStandardError: 0.000248292861919871, publishedCells: 'Fig3d!B3:B4',
    },
  },
  {
    id: 'prep_correlated_pair_loss', sheet: 'Fig3c_corr', denominatorUnit: 'atom_pair', label: '相关丢失',
    selectionLabel: lossSelection,
    summary: {
      rate: 0.0007896026, standardError: 0.0001165943, intercept: 0.00358667,
      publishedRate: 0.000789602644582073, publishedStandardError: 0.000116594341429885, publishedCells: 'Fig3d!C3:C4',
    },
  },
] as const;

export const SENOO_CZ_INDEPENDENT_LOSS = {
  label: '独立丢失比较值',
  rate: 0.00000456478545298466,
  standardError: 0.000000750221346699516,
  sourceCells: 'Fig3d!D3:D4',
} as const;

type SeriesDefinition = typeof grbDefinitions[number] | typeof lossDefinitions[number];

function cellNumber(value: string, field: string, cells: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`${cells} 的 ${field} 数值无效。`);
  return number;
}

function parsePoint(
  row: string, definition: SeriesDefinition, depth: SenooCzCharacterizationPoint['depth'], column: string,
): SenooCzCharacterizationPoint {
  const expectedCells = `${definition.sheet}!${column}2:${column}5`;
  const fields = row.split(',');
  const [sourceCells, condition, denominatorUnit, rawDepth, observed, lower, upper, fitted, fitMinusObservation,
    normalizedResidual, inside, inferredNumerator, inferredDenominator, provenance, lowerTail, upperTail] = fields;
  if (fields.length !== 16 || sourceCells !== expectedCells || condition !== definition.id
      || denominatorUnit !== definition.denominatorUnit || provenance !== countProvenance
      || cellNumber(rawDepth, 'CZ 门深度', sourceCells) !== depth) {
    throw new Error(`${expectedCells} 的源单元格、门深度或筛选口径不符。`);
  }

  const probability = cellNumber(observed, '观测概率', sourceCells);
  const lowerError = cellNumber(lower, '下误差', sourceCells);
  const upperError = cellNumber(upper, '上误差', sourceCells);
  const fittedProbability = cellNumber(fitted, '复算拟合值', sourceCells);
  const residual = cellNumber(fitMinusObservation, '残差', sourceCells);
  const residualOverMeanError = cellNumber(normalizedResidual, '标准化残差', sourceCells);
  const numerator = cellNumber(inferredNumerator, '反推计数', sourceCells);
  const denominator = cellNumber(inferredDenominator, '反推有效分母', sourceCells);
  const cpLowerTail = cellNumber(lowerTail, '反推下尾概率', sourceCells);
  const cpUpperTail = cellNumber(upperTail, '反推上尾概率', sourceCells);
  const insideSourceInterval = residual >= -lowerError && residual <= upperError;

  if (lowerError <= 0 || upperError <= 0 || probability - lowerError < 0 || probability + upperError > 1
      || fittedProbability < 0 || fittedProbability > 1
      || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1
      || numerator < 0 || numerator > denominator || Math.abs(numerator / denominator - probability) > 1e-12
      || Math.abs(cpLowerTail - 0.16) > 1e-8 || Math.abs(cpUpperTail - 0.16) > 1e-8
      || Math.abs(fittedProbability - probability - residual) > 1e-12
      || Math.abs(2 * residual / (lowerError + upperError) - residualOverMeanError) > 1e-12
      || inside !== (insideSourceInterval ? 'True' : 'False')) {
    throw new Error(`${sourceCells} 的误差、拟合残差或反推计数不符。`);
  }

  return {
    depth, sourceCells, probability, lowerError, upperError, fittedProbability, residual, residualOverMeanError,
    insideSourceInterval, numerator, denominator, denominatorUnit, countProvenance, cpLowerTail, cpUpperTail,
  };
}

const [storedHeader, ...rows] = czCsv.trimEnd().split(/\r?\n/);
if (storedHeader !== header || rows.length !== (grbDefinitions.length + lossDefinitions.length) * SENOO_CZ_DEPTHS.length) {
  throw new Error('图 3b、3c 的源表格式或观测点数量不符。');
}

function readSeries<T extends SeriesDefinition>(definition: T, index: number) {
  const points = SENOO_CZ_DEPTHS.map((depth, offset) =>
    parsePoint(rows[index * SENOO_CZ_DEPTHS.length + offset], definition, depth, 'BCDEFG'[offset]));
  return { ...definition, sourceRange: `${definition.sheet}!B2:G5`, points: Object.freeze(points) };
}

export const SENOO_CZ_GRB_SERIES = Object.freeze(grbDefinitions.map(readSeries));
export const SENOO_CZ_LOSS_SERIES = Object.freeze(lossDefinitions.map(
  (definition, index) => readSeries(definition, grbDefinitions.length + index),
));
