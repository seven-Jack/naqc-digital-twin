import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bellObservationFixture } from './helpers/senooBellFixture';

const frozenAt = '2026-11-01T02:00:00.000Z';
const cases = [
  { state: 'target', parity: [-1, 1], coherence: 0.5, overlap: 1, status: 'inconclusive' },
  { state: 'mixture', parity: [0, 0], coherence: 0, overlap: 0.5, status: 'inconclusive' },
  { state: 'opposite', parity: [1, -1], coherence: -0.5, overlap: 0, status: 'fail' },
] as const;

function predictionFixture() {
  const { ensembleRef, phaseReferenceRef, independenceRef, confidenceLevel, settings } = bellObservationFixture();
  const {
    apparatusVersion, protocolVersion, workingPoint, circuitId, circuitVersion, trapWavelengthM, siteIds, circuitSelectionRuleRef,
  } = settings.population.batch;
  const component = {
    modelVersion: 'synthetic-bell-component-v1', sourceRef: 'synthetic://bell-prediction-fixture/component', calibrationRunIds: [],
  };
  return {
    kind: 'senoo-bell-prediction', schemaVersion: 1, sourceKind: 'synthetic',
    apparatusVersion, protocolVersion, workingPoint, circuitId, circuitVersion, trapWavelengthM, siteIds, circuitSelectionRuleRef,
    ensembleRef, phaseReferenceRef, independenceRef, confidenceLevel, holdoutSealRef: null, readoutCalibration: null,
    predictedAtUtc: '2026-11-01T01:00:00Z', evidenceRef: 'synthetic://bell-prediction-fixture/predeclared',
    modelVersion: 'synthetic-bell-prediction-v1', components: { load: component, transport: component, gate: component, readout: component },
    settings: {
      population: { analysisPhaseRad: null, expected: 1, tolerance: 0.1, minDenominator: 4 },
      plus: { analysisPhaseRad: Math.PI / 4, expected: -1, tolerance: 0.1, minDenominator: 6 },
      minus: { analysisPhaseRad: -Math.PI / 4, expected: 1, tolerance: 0.1, minDenominator: 8 },
    },
    derivedTolerances: { coherenceImag: 0.1, overlap: 0.1 },
  };
}

const jsonFile = (name: string, value: unknown) => ({
  name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
});

test('冻结同一份 Bell 联合预测后比较相同布居的三个不同相位样本', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date(frozenAt));
  await page.goto('/#senoo');
  const panel = page.getByTestId('senoo-bell-observations');
  await panel.getByText('Bell 布居与相干核对', { exact: true }).click();
  const result = panel.getByTestId('senoo-bell-observation-result');
  const comparison = panel.getByTestId('senoo-bell-prediction-comparison');
  const predictionInput = panel.getByLabel('导入 Bell 联合预测 JSON', { exact: true });
  const observationInput = panel.getByLabel('导入 Bell 观测 JSON', { exact: true });
  const freeze = panel.getByRole('button', { name: '冻结 Bell 联合预测', exact: true });

  const downloadingTemplate = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载 Bell 联合预测模板 JSON', exact: true }).click();
  const template = JSON.parse(await readFile((await (await downloadingTemplate).path())!, 'utf8'));
  expect(template).toMatchObject({
    kind: 'senoo-bell-prediction', schemaVersion: 1, sourceKind: null,
    settings: {
      population: { analysisPhaseRad: null, expected: null, tolerance: null, minDenominator: null },
      plus: { analysisPhaseRad: Math.PI / 4, expected: null, tolerance: null, minDenominator: null },
      minus: { analysisPhaseRad: -Math.PI / 4, expected: null, tolerance: null, minDenominator: null },
    },
  });
  const prediction = predictionFixture();
  const file = jsonFile('synthetic-frozen-bell-prediction.json', prediction);
  const digest = createHash('sha256').update(file.buffer).digest('hex');
  await predictionInput.setInputFiles(file);
  await expect(freeze).toBeEnabled();
  await expect(result).toHaveCount(0);
  await expect(comparison).toHaveCount(0);
  await freeze.click();

  const downloadingFrozen = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出已冻结 Bell 预测 JSON', exact: true }).click();
  const frozen = JSON.parse(await readFile((await (await downloadingFrozen).path())!, 'utf8'));
  expect(frozen).toMatchObject({ frozenInSessionAtUtc: frozenAt, prediction });

  for (const { state, parity: [plus, minus], coherence, overlap, status } of cases) {
    const observation = bellObservationFixture(state);
    const observationFile = jsonFile(`synthetic-bell-${state}.json`, observation);
    await observationInput.setInputFiles(observationFile);
    await expect(result).toContainText(observationFile.name);
    await expect(comparison.locator('[data-prediction-metric="overlap"]')).toHaveAttribute('data-status', status);

    const downloadingComparison = page.waitForEvent('download');
    await panel.getByRole('button', { name: '导出 Bell 观测核对 JSON', exact: true }).click();
    const report = JSON.parse(await readFile((await (await downloadingComparison).path())!, 'utf8'));
    expect(report).toMatchObject({
      inputs: { bellPrediction: { filename: file.name, sha256: digest } },
      frozenPrediction: { frozenInSessionAtUtc: frozenAt, prediction },
      statistics: {
        sourceKind: 'synthetic',
        settings: [
          { setting: 'population', metric: { value: 1, denominator: 4 } },
          { setting: 'plus', metric: { value: plus, denominator: 6 } },
          { setting: 'minus', metric: { value: minus, denominator: 8 } },
        ],
      },
      predictionComparison: {
        scope: 'synthetic', status,
        settings: [
          { setting: 'population', residual: 0, denominator: 4, minDenominator: 4 },
          { setting: 'plus', residual: plus + 1, denominator: 6, minDenominator: 6 },
          { setting: 'minus', residual: minus - 1, denominator: 8, minDenominator: 8 },
        ],
        derived: {
          coherenceImag: { residual: coherence - 0.5, denominators: { plus: 6, minus: 8 } },
          overlap: { residual: overlap - 1, status, denominators: { population: 4, plus: 6, minus: 8 } },
        },
      },
    });
    const [zz, positive, negative] = report.statistics.settings.map(({ metric }: { metric: { lower: number; upper: number } }) => metric);
    const coherenceLower = (negative.lower - positive.upper) / 4;
    const coherenceUpper = (negative.upper - positive.lower) / 4;
    const { coherenceImag, overlap: overlapMetric } = report.predictionComparison.derived;
    expect(coherenceImag.residualLower).toBeCloseTo(coherenceLower - 0.5, 12);
    expect(coherenceImag.residualUpper).toBeCloseTo(coherenceUpper - 0.5, 12);
    expect(overlapMetric.residualLower).toBeCloseTo(zz.lower / 2 + coherenceLower - 1, 12);
    expect(overlapMetric.residualUpper).toBeCloseTo(zz.upper / 2 + coherenceUpper - 1, 12);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.reload();
  await panel.getByText('Bell 布居与相干核对', { exact: true }).click();
  await predictionInput.setInputFiles(file);
  await expect(freeze).toBeEnabled();
  const alreadySeen = jsonFile('synthetic-bell-seen-first.json', bellObservationFixture());
  await observationInput.setInputFiles(alreadySeen);
  await expect(result).toContainText(alreadySeen.name);
  await expect(freeze).toBeDisabled();
  await expect(comparison).toHaveCount(0);
});
