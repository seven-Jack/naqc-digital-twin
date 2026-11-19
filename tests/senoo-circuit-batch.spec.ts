import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { senooCircuitPredictionMetricKeys } from '../src/physics/senooCircuitPrediction';
import { circuitFixture } from './helpers/senooCircuitFixture';

test('整机合成批次保留全量与筛选分母，可核对预设预测并追溯原始记录', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const panel = page.getByTestId('senoo-circuit-batch');
  const stats = panel.getByTestId('senoo-circuit-statistics');
  const batchInput = panel.getByLabel('导入整机批次 JSON', { exact: true });
  const predictionInput = panel.getByLabel('导入整机预测 JSON', { exact: true });
  const templateDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载整机批次模板 JSON', exact: true }).click();
  const template = JSON.parse(await readFile((await (await templateDownload).path())!, 'utf8'));
  expect(template).toMatchObject({ kind: 'senoo-circuit-batch', schemaVersion: 1, sourceKind: null, expectedAttempts: null, attempts: [] });

  const batch = circuitFixture();
  const component = { modelVersion: 'engineering-v1', sourceRef: `${batch.sourceRef}/component`, calibrationRunIds: [] };
  const prediction = {
    kind: 'senoo-circuit-prediction', schemaVersion: 1, sourceKind: 'synthetic',
    apparatusVersion: batch.apparatusVersion, protocolVersion: batch.protocolVersion, workingPoint: batch.workingPoint,
    trapWavelengthM: batch.trapWavelengthM, circuitSelectionRuleRef: batch.circuitSelectionRuleRef,
    circuitId: batch.circuitId, circuitVersion: batch.circuitVersion, basis: batch.basis,
    siteIds: batch.siteIds, targetBitstrings: batch.targetBitstrings, predictedAtUtc: '2026-11-01T02:00:00Z',
    evidenceRef: `${batch.sourceRef}/predeclared-prediction`, independenceRef: `${batch.sourceRef}/independent-attempts`,
    modelVersion: 'engineering-only-model', confidenceLevel: 0.95, readoutCalibration: null,
    components: { load: component, transport: component, gate: component, readout: component },
    metrics: Object.fromEntries(senooCircuitPredictionMetricKeys.map(key => [key, { expected: 0.5, tolerance: 0.15, minDenominator: 20 }])),
  };
  const predictionBytes = Buffer.from(JSON.stringify(prediction));
  await predictionInput.setInputFiles({ name: 'synthetic-circuit-prediction.json', mimeType: 'application/json', buffer: predictionBytes });
  await expect(stats).toHaveCount(0);
  const batchBytes = Buffer.from(JSON.stringify(batch));
  await batchInput.setInputFiles({ name: 'synthetic-circuit-batch.json', mimeType: 'application/json', buffer: batchBytes });
  await expect(panel).toHaveAttribute('data-source-kind', 'synthetic');
  await expect(stats).toHaveAttribute('data-readout-status', 'synthetic');
  await expect(stats.locator('[data-metric="validReadout"]')).toContainText('3 / 8');
  await expect(stats.locator('[data-metric="reportedLossGivenCompleteFrames"]')).toContainText('1 / 4');
  await expect(stats.locator('[data-metric="targetBitstringPopulation"]')).toContainText('2 / 2');
  await expect(stats.locator('[data-count="selectedValidReadout"] dd')).toHaveText('2');
  const statsTable = stats.getByRole('region', { name: '整机统计指标' });
  expect(await statsTable.evaluate(table => table.scrollWidth === table.clientWidth)).toBe(true);

  await panel.getByText('查看所选尝试的原始记录', { exact: true }).click();
  const attemptNumber = panel.getByLabel('整机尝试序号', { exact: true });
  const attempt = panel.getByTestId('senoo-circuit-attempt-detail');
  await attemptNumber.fill('4');
  await expect(attempt).toHaveAttribute('data-attempt-id', 'trial-4');
  await expect(attempt).toContainText('缺帧');
  await expect(attempt).toContainText('engineering-roi-site-left');
  await attemptNumber.fill('8');
  await expect(attempt).toHaveAttribute('data-selection-status', 'excluded');
  await expect(attempt).toContainText('engineering-only analysis exclusion');

  const comparison = panel.getByTestId('senoo-circuit-prediction-comparison');
  await expect(comparison).toHaveAttribute('data-comparison-status', 'inconclusive');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const pendingReport = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出整机统计 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await pendingReport).path())!, 'utf8'));
  expect(report).toMatchObject({
    kind: 'senoo-circuit-statistics', evidence: 'synthetic-circuit',
    inputs: { circuitBatch: { sha256: createHash('sha256').update(batchBytes).digest('hex') },
      frozenReadout: null, prediction: { sha256: createHash('sha256').update(predictionBytes).digest('hex') } },
    batch, prediction,
    statistics: { counts: { attempted: 8, completeFramePairs: 4, selectedCompleteFramePairs: 3, validReadout: 3, selectedValidReadout: 2 } },
    comparison: { status: 'inconclusive', scope: 'synthetic', predictedBeforeAcquisition: true },
  });
  expect(report.comparison.metrics.find(({ key }: { key: string }) => key === 'validReadout')).toMatchObject({
    numerator: 3, denominator: 8, residual: -0.125,
  });

  await batchInput.setInputFiles({
    name: 'incomplete-engineering-batch.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...batch, expectedAttempts: 9 })),
  });
  await expect(panel.getByRole('alert')).toContainText('完整尝试总数');
  await expect(stats.locator('[data-metric="validReadout"]')).toContainText('3 / 8');
});
