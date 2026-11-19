import { describe, expect, it } from 'vitest';
import {
  SENOO_BELL_SETTINGS, parseSenooBellObservations, summarizeSenooBellObservations,
  type SenooBellObservations,
} from '../src/physics/senooBellObservations';
import type { SenooCircuitFrame } from '../src/physics/senooCircuitBatch';
import {
  compareSenooBellPrediction, createSenooBellPredictionTemplate, parseSenooBellPrediction,
} from '../src/physics/senooBellPrediction';
import { freezeSenooMeasuredReadout } from '../src/physics/senooMeasuredReadout';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { bellObservationFixture, interleavedAttempt } from './helpers/senooBellFixture';
import { freshSheets, setCell } from './helpers/senooMeasurementFixture';

type State = Parameters<typeof bellObservationFixture>[0];

function parseObservations(input: unknown) {
  return parseSenooBellObservations(JSON.stringify(input));
}

function parsePrediction(input: unknown) {
  return parseSenooBellPrediction(JSON.stringify(input));
}

function observations(state: State = 'target', repetitions = 1) {
  const raw = bellObservationFixture(state);
  for (const setting of SENOO_BELL_SETTINGS) {
    const { batch } = raw.settings[setting];
    const attempts = Array.from({ length: repetitions }, (_, copy) =>
      batch.attempts.map((attempt, index) => {
        const id = `${attempt.attemptId}-${copy}`;
        const shifted = interleavedAttempt(attempt, id, copy * batch.attempts.length + index);
        const withFrameRef = (frame: SenooCircuitFrame) => ({
          ...frame, sourceRef: frame.sourceRef && `${frame.sourceRef}/${copy}`,
        });
        return {
          ...shifted,
          sourceRef: `${shifted.sourceRef}/${copy}`,
          sites: shifted.sites.map(({ frames: [first, second], ...site }) => ({
            ...site,
            frames: [withFrameRef(first), withFrameRef(second)] as const,
          })),
        };
      })).flat();
    raw.settings[setting].batch = {
      ...batch, expectedAttempts: attempts.length, attempts,
    };
  }
  return parseObservations(raw);
}

function rawPrediction(observation: SenooBellObservations = observations()) {
  const {
    apparatusVersion, protocolVersion, workingPoint, circuitId, circuitVersion, trapWavelengthM, siteIds, circuitSelectionRuleRef,
  } = observation.settings.population.batch;
  const { ensembleRef, phaseReferenceRef, independenceRef, confidenceLevel } = observation;
  const component = (name: string) => ({
    modelVersion: `engineering-${name}-v1`,
    sourceRef: `synthetic://bell-prediction-test-only/${name}`,
    calibrationRunIds: [] as string[],
  });
  return {
    ...createSenooBellPredictionTemplate(), sourceKind: 'synthetic',
    apparatusVersion, protocolVersion, workingPoint, circuitId, circuitVersion, trapWavelengthM, siteIds, circuitSelectionRuleRef,
    ensembleRef, phaseReferenceRef, independenceRef, confidenceLevel,
    modelVersion: 'engineering-frozen-bell-target-v1', evidenceRef: 'synthetic://bell-prediction-test-only/archived-prediction',
    predictedAtUtc: '2026-10-31T21:00:00Z', holdoutSealRef: null,
    components: { load: component('load'), transport: component('transport'), gate: component('gate'), readout: component('readout') },
    readoutCalibration: null,
    settings: {
      population: { analysisPhaseRad: null, expected: 1, tolerance: 0.11, minDenominator: 4 },
      plus: { analysisPhaseRad: Math.PI / 4, expected: -1, tolerance: 0.18, minDenominator: 6 },
      minus: { analysisPhaseRad: -Math.PI / 4, expected: 1, tolerance: 0.16, minDenominator: 8 },
    },
    derivedTolerances: { coherenceImag: 0.10, overlap: 0.14 },
  };
}

describe('Senoo frozen Bell joint prediction', () => {
  it('has a separate v1 template and enforces the three axes, finite tolerances, and integer per-setting floors', () => {
    const template = createSenooBellPredictionTemplate();
    expect(template).toMatchObject({
      kind: 'senoo-bell-prediction', schemaVersion: 1,
      settings: {
        population: { analysisPhaseRad: null },
        plus: { analysisPhaseRad: Math.PI / 4 },
        minus: { analysisPhaseRad: -Math.PI / 4 },
      },
    });
    expect(() => parsePrediction(template)).toThrow();
    const raw = rawPrediction();
    const updatePlus = (fields: Partial<typeof raw.settings.plus>) => ({
      ...raw, settings: { ...raw.settings, plus: { ...raw.settings.plus, ...fields } },
    });
    expect(() => parsePrediction(updatePlus({ analysisPhaseRad: -Math.PI / 4 }))).toThrow(/analysisPhaseRad|相位/);
    expect(() => parsePrediction(updatePlus({ expected: -1.1 }))).toThrow(/plus/);
    expect(() => parsePrediction(updatePlus({ tolerance: -0.1 }))).toThrow(/plus/);
    expect(() => parsePrediction(updatePlus({ minDenominator: 4.5 }))).toThrow(/plus/);
    expect(() => parsePrediction({ ...raw, predictedAtUtc: '2026-02-30T01:00:00Z' })).toThrow(/UTC/);
    expect(() => parsePrediction({ ...raw, derivedTolerances: { coherenceImag: -0.01, overlap: 0.14 } })).toThrow(/coherenceImag|容差/);
  });

  it.each([
    ['target', -1, 1, 0.5, 1, 'pass'],
    ['mixture', 0, 0, 0, 0.5, 'fail'],
    ['opposite', 1, -1, -0.5, 0, 'fail'],
  ] as const)('distinguishes %s at equal ZZ population and fixed prediction using per-setting denominators', (
    state, plus, minus, coherenceImag, overlap, status,
  ) => {
    const prediction = parsePrediction(rawPrediction());
    const compared = compareSenooBellPrediction(prediction, observations(state, 64));

    expect(compared.status).toBe(status);
    expect(compared.settings).toMatchObject([
      { setting: 'population', numerator: 256, denominator: 256, expected: 1, observed: 1, residual: 0, status: 'pass' },
      { setting: 'plus', numerator: plus * 384, denominator: 384, expected: -1, observed: plus, residual: plus + 1, status },
      { setting: 'minus', numerator: minus * 512, denominator: 512, expected: 1, observed: minus, residual: minus - 1, status },
    ]);
    expect(compared.derived.coherenceImag).toMatchObject({
      expected: 0.5, observed: coherenceImag, denominators: { plus: 384, minus: 512 }, residual: coherenceImag - 0.5, status,
    });
    expect(compared.derived.overlap).toMatchObject({
      expected: 1, observed: overlap, denominators: { population: 256, plus: 384, minus: 512 }, residual: overlap - 1, status,
    });
    const log = Math.log(120);
    const popLower = 1 - Math.sqrt(log / (2 * 256));
    const plusRadius = 2 * Math.sqrt(log / (2 * 384));
    const minusRadius = 2 * Math.sqrt(log / (2 * 512));
    const cohLower = (Math.max(-1, minus - minusRadius) - Math.min(1, plus + plusRadius)) / 4;
    const cohUpper = (Math.min(1, minus + minusRadius) - Math.max(-1, plus - plusRadius)) / 4;
    const [population, plusSetting, minusSetting] = compared.settings;
    expect(population.lower).toBeCloseTo(popLower);
    expect(plusSetting.residualUpper).toBeCloseTo(Math.min(1, plus + plusRadius) + 1);
    expect(minusSetting.residualLower).toBeCloseTo(Math.max(-1, minus - minusRadius) - 1);
    expect(compared.derived.coherenceImag.lower).toBeCloseTo(cohLower);
    expect(compared.derived.coherenceImag.residualUpper).toBeCloseTo(cohUpper - 0.5);
    expect(compared.derived.overlap.lower).toBeCloseTo(popLower / 2 + cohLower);
    expect(compared.derived.overlap.residualLower).toBeCloseTo(popLower / 2 + cohLower - 1);
    expect(compared.derived.overlap.residualUpper).toBeCloseTo(0.5 + cohUpper - 1);
  });

  it('applies each floor to the actually valid attempts and only affects derived metrics that use that setting', () => {
    const raw = rawPrediction();
    const prediction = parsePrediction({
      ...raw, settings: {
        population: { ...raw.settings.population, tolerance: 1, minDenominator: 5 },
        plus: { ...raw.settings.plus, tolerance: 2 },
        minus: { ...raw.settings.minus, tolerance: 2 },
      },
      derivedTolerances: { coherenceImag: 1, overlap: 1 },
    });
    const obs = observations();
    const compared = compareSenooBellPrediction(prediction, obs);
    expect(compared.status).toBe('inconclusive');
    expect(compared.settings[0]).toMatchObject({ denominator: 4, minDenominator: 5, status: 'inconclusive' });
    expect(compared.settings[1]).toMatchObject({ denominator: 6, minDenominator: 6, status: 'pass' });
    expect(compared.settings[2]).toMatchObject({ denominator: 8, minDenominator: 8, status: 'pass' });
    expect(compared.derived.coherenceImag).toMatchObject({ denominators: { plus: 6, minus: 8 }, status: 'pass' });
    expect(compared.derived.overlap).toMatchObject({
      observed: 1, denominators: { population: 4, plus: 6, minus: 8 }, status: 'inconclusive',
    });
  });

  it('blocks different phase references, confidence, screening rules, and overlapping model runs', () => {
    const obs = observations();
    const raw = rawPrediction(obs);
    const compare = (changes: object) => compareSenooBellPrediction(parsePrediction({ ...raw, ...changes }), obs);
    expect(() => compare({ phaseReferenceRef: 'synthetic://inverted-axis' })).toThrow(/phaseReferenceRef|相位/);
    expect(() => compare({ confidenceLevel: 0.9 })).toThrow(/confidenceLevel|置信/);
    expect(() => compare({ circuitSelectionRuleRef: 'synthetic://different-mask' })).toThrow(/circuitSelectionRuleRef|筛选/);
    expect(() => compare({ siteIds: [...raw.siteIds].reverse() })).toThrow(/siteIds|位点/);
    expect(() => compare({ components: {
      ...raw.components, gate: { ...raw.components.gate, calibrationRunIds: [obs.settings.minus.batch.acquisitionRunId] },
    } })).toThrow(/重叠|重复|独立/);
  });

  it('requires the actual frozen readout fingerprint and a seal when measured acquisition precedes prediction', () => {
    // A test-only relabeling of the packaged synthetic workbook exercises the measured code path without real data.
    const sheets = freshSheets();
    for (const rows of Object.values(sheets)) for (const row of rows) for (const [index, value] of row.entries()) {
      if (typeof value === 'string') row[index] = value.replaceAll('synthetic://', 'engineering-bell-prediction-fixture://');
    }
    setCell(sheets, '批次配置', 2, 'source_kind', 'measured');
    const frozen = freezeSenooMeasuredReadout({
      report: validateSenooMeasurements(sheets), filename: 'engineering-bell-prediction-only.xlsx', sha256: 'a'.repeat(64),
    }, 'SYN-CAL', { first: 40, second: 40, firstComparison: 'ge', secondComparison: 'ge' }, '2026-10-30T00:00:00Z');
    const fields = frozen.conditions;
    const measured = JSON.parse(JSON.stringify(observations()).replaceAll('synthetic://', 'engineering-bell-prediction-fixture://')) as SenooBellObservations;
    const obs = parseObservations({
      ...measured,
      settings: Object.fromEntries(SENOO_BELL_SETTINGS.map(setting => {
        const group = measured.settings[setting];
        return [setting, { ...group, batch: {
          ...group.batch, sourceKind: 'measured', apparatusVersion: fields.apparatus_version,
          protocolVersion: fields.protocol_version, workingPoint: frozen.assessment.workingPoint,
          cameraConfigRef: fields.camera_config_ref, roiMapVersion: fields.roi_map_version,
          countProcessingRef: fields.count_processing_ref, outcomePolicy: fields.outcome_policy,
          screeningRuleRef: fields.screening_rule_ref, countUnit: frozen.assessment.countUnit,
        } }];
      })),
    });
    const raw = rawPrediction(obs);
    expect(() => compareSenooBellPrediction(parsePrediction(raw), obs)).toThrow(/证据类型|来源/);
    const ref = 'engineering-bell-prediction-fixture://';
    const components = Object.fromEntries(Object.entries(raw.components).map(([name, component]) => [
      name, {
        ...component, sourceRef: `${ref}${name}`,
        calibrationRunIds: [name === 'readout' ? frozen.assessment.runId : `${name}-independent-run`],
      },
    ]));
    const actual = summarizeSenooBellObservations(obs, frozen, null);
    const measuredModel = {
      ...raw, sourceKind: 'measured-model', evidenceRef: `${ref}archive`, components,
      readoutCalibration: { calibrationRunId: frozen.assessment.runId, calibrationSha256: frozen.assessment.sha256, candidate: frozen.candidate },
    };
    expect(() => compareSenooBellPrediction(parsePrediction({
      ...measuredModel, readoutCalibration: { ...measuredModel.readoutCalibration, calibrationSha256: 'b'.repeat(64) },
    }), obs, actual)).toThrow(/冻结|读出|SHA-256/);
    const late = { ...measuredModel, predictedAtUtc: '2026-11-02T00:00:00Z' };
    expect(() => compareSenooBellPrediction(parsePrediction(late), obs, actual)).toThrow(/封存|holdoutSealRef/);
    expect(compareSenooBellPrediction(parsePrediction({ ...late, holdoutSealRef: `${ref}seal` }), obs, actual)
      .settings.map(setting => setting.denominator)).toEqual([4, 6, 8]);
  });
});
