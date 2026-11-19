import { readFileSync, writeFileSync } from 'node:fs';
import {
  compareBlockade, fitBlockade, summarizeBlockade, type BlockadePoint,
} from './senoo-rabi-profile';
import { TAU } from '../src/physics/constants';
import type { SenooBlockadeRabiParameters } from '../src/physics/senooPair';
import { us } from '../src/physics/units';

interface RabiSource {
  doi: string;
  ed4Sha256: string;
  singleAtom: BlockadePoint[];
  blockade: BlockadePoint[];
}

type FrequencyBranch = 'free_fit' | 'published';

function wrapPhase(phaseRad: number) {
  return Math.atan2(Math.sin(phaseRad), Math.cos(phaseRad));
}

function weightedSse(rows: ReturnType<typeof compareBlockade>) {
  return rows.reduce((sum, row) => sum + row.scaledResidual ** 2, 0);
}

function fitPhaseOnly(points: BlockadePoint[], global: SenooBlockadeRabiParameters) {
  let best = { phaseRad: global.phaseRad, cost: weightedSse(compareBlockade(points, global)) };
  function scan(start: number, step: number, steps: number) {
    for (let index = 0; index < steps; index++) {
      const phaseRad = start + index * step;
      const cost = weightedSse(compareBlockade(points, { ...global, phaseRad }));
      if (cost < best.cost) best = { phaseRad, cost };
    }
  }
  let step = TAU / 360;
  scan(-Math.PI, step, 360);
  for (let pass = 0; pass < 6; pass++) {
    scan(best.phaseRad - step, step / 4, 9);
    step /= 4;
  }
  return { ...global, phaseRad: wrapPhase(best.phaseRad) };
}

function summarizeWindow(points: BlockadePoint[], global: SenooBlockadeRabiParameters) {
  const startUs = points[0].timeUs;
  const endUs = points[points.length - 1].timeUs;
  const centerUs = (startUs + endUs) / 2;
  const local = fitPhaseOnly(points, global);
  const centerOffset = TAU * global.frequencyHz * us(centerUs);
  const sharedRows = compareBlockade(points, global);
  const independentRows = compareBlockade(points, local);
  return {
    window: points[0].window,
    firstSourceCell: points[0].cells,
    lastSourceCell: points[points.length - 1].cells,
    startUs, endUs, centerUs,
    sharedPhaseRad: wrapPhase(global.phaseRad + centerOffset),
    independentPhaseRad: wrapPhase(local.phaseRad + centerOffset),
    phaseCorrectionRad: wrapPhase(local.phaseRad - global.phaseRad),
    shared: { ...summarizeBlockade(sharedRows), weightedSse: weightedSse(sharedRows) },
    independent: { ...summarizeBlockade(independentRows), weightedSse: weightedSse(independentRows) },
  };
}

function compareBranches(points: BlockadePoint[], fitBounds: readonly [number, number], publishedHz: number) {
  if (points.length !== 60 || points.some((point, index) => point.window !== 1 + Math.floor(index / 15) ||
      point.lowerError + point.upperError <= 0 || (index > 0 && point.timeUs <= points[index - 1].timeUs))) {
    throw new Error('Expected four ordered, 15-point windows with source error magnitudes');
  }
  const windows = [1, 2, 3, 4].map(window => points.filter(point => point.window === window));
  function evaluate(branch: FrequencyBranch, frequencyBounds: readonly [number, number]) {
    const parameters = fitBlockade(points, 'gaussian', frequencyBounds);
    const summaries = windows.map(window => summarizeWindow(window, parameters));
    return {
      branch, parameters,
      sharedWeightedSse: summaries.reduce((sum, window) => sum + window.shared.weightedSse, 0),
      independentWeightedSse: summaries.reduce((sum, window) => sum + window.independent.weightedSse, 0),
      windows: summaries,
    };
  }
  const free = evaluate('free_fit', fitBounds);
  const published = evaluate('published', [publishedHz, publishedHz]);
  const sharedGap = published.sharedWeightedSse - free.sharedWeightedSse;
  const independentGap = published.independentWeightedSse - free.independentWeightedSse;
  const separationHz = publishedHz - free.parameters.frequencyHz;
  const centers = free.windows.map(window => window.centerUs);
  const adjacent = centers.slice(1).map((center, index) => {
    const gapUs = center - centers[index];
    const cycles = separationHz * us(gapUs);
    return { gapUs, cycles, wrappedPhaseRad: wrapPhase(TAU * cycles) };
  });
  return {
    fitBounds, free, published,
    phaseDiagnostic: {
      sharedGap, independentGap,
      fractionOfExtraWeightedSseRemoved: sharedGap > 0 ? (sharedGap - independentGap) / sharedGap : null,
    },
    samplingGeometry: {
      separationHz,
      aliasSpacingHz: (centers.length - 1) / us(centers[centers.length - 1] - centers[0]),
      adjacent,
      withinWindowPhaseSpanRad: free.windows.map(window => TAU * separationHz * us(window.endUs - window.startUs)),
    },
  };
}

const csvPath = process.argv[2];
if (!csvPath) throw new Error('Supply the destination for the per-window CSV');
const source: RabiSource = JSON.parse(readFileSync(0, 'utf8'));
if (source.doi !== '10.1038/s41567-026-03258-8') throw new Error('Expected the Senoo ED4 workbook');
const results = {
  '4e': compareBranches(source.singleAtom, [2.5e6, 3.75e6], 3.24e6),
  '4f': compareBranches(source.blockade, [4e6, 5e6], 4.49e6),
};
const headers = [
  'panel', 'branch', 'frequency_hz', 'window', 'first_source_cell', 'last_source_cell', 'points',
  'start_us', 'end_us', 'center_us', 'shared_phase_at_center_rad', 'fitted_phase_at_center_rad', 'local_phase_correction_rad',
  'shared_rmse', 'local_rmse', 'shared_mean_residual', 'local_mean_residual',
  'shared_weighted_sse', 'local_weighted_sse', 'shared_inside_error_bar', 'local_inside_error_bar',
];
const records = Object.entries(results).flatMap(([panel, { free, published }]) =>
  [free, published].flatMap(({ branch, parameters, windows }) => windows.map(window => [
    panel, branch, parameters.frequencyHz, window.window, window.firstSourceCell, window.lastSourceCell, window.shared.points,
    window.startUs, window.endUs, window.centerUs, window.sharedPhaseRad, window.independentPhaseRad, window.phaseCorrectionRad,
    window.shared.rmse, window.independent.rmse, window.shared.meanResidual, window.independent.meanResidual,
    window.shared.weightedSse, window.independent.weightedSse, window.shared.insideErrorBars, window.independent.insideErrorBars,
  ])));
writeFileSync(csvPath, [headers, ...records].map(row => row.join(',')).join('\n') + '\n');
console.log(JSON.stringify({ evidenceKind: 'literature-reproduction', doi: source.doi, ed4Sha256: source.ed4Sha256, results }, null, 2));
