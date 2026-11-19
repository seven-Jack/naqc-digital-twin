import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { circuitFixture } from './helpers/senooCircuitFixture';

const syntheticWorkbook = fileURLToPath(new URL('./fixtures/senoo-readout-synthetic.xlsx', import.meta.url));

async function engineeringReadoutWorkbook(role: 'CAL' | 'VAL') {
  const archive = unzipSync(await readFile(syntheticWorkbook));
  const other = role === 'CAL' ? 'VAL' : 'CAL';
  for (const sheet of [2, 3, 4, 5]) {
    const path = `xl/worksheets/sheet${sheet}.xml`;
    const xml = strFromU8(archive[path]);
    const roleOnly = xml.replace(/<x:row r="\d+">[\s\S]*?<\/x:row>/g, row =>
      row.match(/<x:v>([^<]*)<\/x:v>/)?.[1] === `SYN-${other}` ? '' : row);
    // The declaration exercises the measured path. This in-memory fixture is engineering evidence only.
    archive[path] = strToU8(roleOnly.replaceAll('<x:v>synthetic</x:v>', '<x:v>measured</x:v>')
      .replaceAll('synthetic', 'engineering-fixture').replaceAll('SYN-', 'ENGINEERING-'));
  }
  return {
    name: `engineering-only-readout-${role.toLowerCase()}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(zipSync(archive)),
  };
}

test('正式读出标定等待同装置实测，合成工作簿只运行合成验收', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const measurement = page.getByTestId('senoo-measurement-import');
  const measured = page.getByTestId('senoo-measured-readout');
  const synthetic = page.getByTestId('senoo-synthetic-workflow');
  const measuredActions = ['评估候选阈值', '冻结已评估规则', '运行独立验证', '导出冻结规则 JSON'];

  async function expectMeasuredActionsDisabled() {
    for (const name of measuredActions) {
      await expect(measured.getByRole('button', { name, exact: true })).toBeDisabled();
    }
  }

  await expect(measured).toHaveAccessibleName('双曝光正式标定与独立验证');
  await expect(measured).toContainText('待同装置实测');
  await expectMeasuredActionsDisabled();
  await expect(synthetic).toHaveCount(0);

  const frozenInput = measured.getByLabel('导入冻结规则 JSON', { exact: true });
  await expect(frozenInput).toBeEnabled();
  await frozenInput.setInputFiles({
    name: 'invalid-frozen-rule.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(measured.getByRole('alert')).toBeVisible();
  await expectMeasuredActionsDisabled();

  await measurement.getByLabel('导入实测 XLSX', { exact: true }).setInputFiles(syntheticWorkbook);
  await expect(measurement.getByTestId('senoo-measurement-filename')).toContainText('senoo-readout-synthetic.xlsx');
  await expect(measured).toContainText('待同装置实测');
  await expectMeasuredActionsDisabled();
  await expect(synthetic.getByLabel('合成标定批次')).toHaveValue('SYN-CAL');
  await expect(synthetic.getByLabel('合成验证批次')).toHaveValue('SYN-VAL');

  await synthetic.getByRole('button', { name: '冻结合成阈值', exact: true }).click();
  await expect(synthetic.getByTestId('senoo-frozen-thresholds')).toContainText('37 / 47 counts');
  await synthetic.getByRole('button', { name: '运行合成验证', exact: true }).click();
  await expect(synthetic.getByTestId('senoo-holdout-results')).toContainText('SYN-VAL');
  await expectMeasuredActionsDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('工程记录可扫描标定阈值、冻结判据、重算报告并核对整机运行隔离', async ({ page }) => {
  const calibration = await engineeringReadoutWorkbook('CAL');
  const validation = await engineeringReadoutWorkbook('VAL');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const importPanel = page.getByTestId('senoo-measurement-import');
  const readout = page.getByTestId('senoo-measured-readout');
  const workbook = importPanel.getByLabel('导入实测 XLSX', { exact: true });
  const verify = readout.getByRole('button', { name: '运行独立验证', exact: true });
  await workbook.setInputFiles(calibration);
  await expect(importPanel.getByTestId('senoo-measurement-filename')).toContainText(calibration.name);
  await expect(importPanel.getByTestId('senoo-measurement-batch')).toHaveCount(1);
  await expect(readout.getByRole('combobox', { name: '实测标定批次', exact: true })).toHaveValue('ENGINEERING-CAL');
  await expect(verify).toBeDisabled();

  const independenceRef = 'engineering-fixture://attempt-independence-test-only';
  const scan = readout.getByTestId('senoo-calibration-threshold-scan');
  const scanButton = scan.getByRole('button', { name: '扫描标定候选', exact: true });
  await expect(scanButton).toBeDisabled();
  await scan.getByLabel('第一帧阈值下界', { exact: true }).fill('0');
  await scan.getByLabel('第一帧阈值上界', { exact: true }).fill('37');
  await scan.getByLabel('第二帧阈值下界', { exact: true }).fill('12');
  await scan.getByLabel('第二帧阈值上界', { exact: true }).fill('47');
  await scan.getByRole('combobox', { name: '候选排序', exact: true }).selectOption('worst-group-error');
  await scanButton.click();
  const scanResult = scan.getByTestId('senoo-calibration-scan-result');
  await expect(scanResult).toHaveAttribute('data-tested-pairs', '4');
  await scan.getByRole('button', { name: '填入候选阈值', exact: true }).click();
  await expect(readout.getByLabel('Image 1 候选阈值', { exact: true })).toHaveValue('37');
  await expect(readout.getByLabel('Image 2 候选阈值', { exact: true })).toHaveValue('47');
  await expect(readout.getByRole('button', { name: '冻结已评估规则', exact: true })).toBeDisabled();
  const scanDownload = page.waitForEvent('download');
  await scan.getByRole('button', { name: '导出标定扫描 JSON', exact: true }).click();
  const scanReport = JSON.parse(await readFile((await (await scanDownload).path())!, 'utf8'));
  expect(scanReport).toMatchObject({
    kind: 'senoo-calibration-threshold-scan', schemaVersion: 1,
    scan: { batchId: 'ENGINEERING-CAL', sha256: createHash('sha256').update(calibration.buffer).digest('hex'), testedPairs: 4,
      options: { rankBy: 'worst-group-error' } },
    chosenCandidate: { first: 37, second: 47, firstComparison: 'ge', secondComparison: 'ge' },
  });
  expect(scanReport.scan.rows[0]).toMatchObject({ totalErrors: 0, worstGroupError: 0,
    groups: { m1: { denominator: 1 }, m0: { denominator: 1 }, empty_control: { denominator: 1 } } });
  await readout.getByRole('combobox', { name: 'Image 1 判亮' }).selectOption('gt');
  await expect(scanResult).toHaveCount(0);
  await readout.getByRole('combobox', { name: 'Image 1 判亮' }).selectOption('ge');
  await readout.getByLabel('同时冻结数值验收判据', { exact: true }).check();
  await readout.getByLabel('同时置信水平 (%)', { exact: true }).fill('95');
  await readout.getByLabel('每组最少可判读尝试轮数', { exact: true }).fill('2');
  await readout.getByLabel('每组最低可判读比例 (%)', { exact: true }).fill('50');
  await readout.getByLabel('尝试轮间独立性依据', { exact: true }).fill(independenceRef);
  const limitLabels = ['制备 m₁ 错标', '制备 m₁ 判丢失', '制备 m₁ 歧义', '制备 m₀ 错标',
    '制备 m₀ 判丢失', '制备 m₀ 歧义', '空位对照 误报', '空位对照 歧义'];
  for (const metric of limitLabels) await readout.getByLabel(`${metric}上限 (%)`, { exact: true }).fill('90');
  await readout.getByRole('button', { name: '评估候选阈值', exact: true }).click();
  await readout.getByRole('button', { name: '冻结已评估规则', exact: true }).click();
  await expect(scanResult).toHaveAttribute('data-tested-pairs', '4');
  await expect(scan.getByRole('button', { name: '填入候选阈值', exact: true })).toBeDisabled();
  await expect(scan.getByRole('button', { name: '导出标定扫描 JSON', exact: true })).toBeEnabled();
  const frozen = readout.getByTestId('senoo-measured-frozen');
  const planSummary = frozen.getByText('冻结的数值验收判据', { exact: true });
  await planSummary.click();
  await expect(frozen.getByText(independenceRef, { exact: true })).toBeVisible();
  await expect(verify).toBeDisabled();

  const pendingFreeze = page.waitForEvent('download');
  await readout.getByRole('button', { name: '导出冻结规则 JSON', exact: true }).click();
  const exportedFreeze = await pendingFreeze;
  const freezeBytes = await readFile((await exportedFreeze.path())!);
  const frozenData = JSON.parse(freezeBytes.toString('utf8'));
  expect(frozenData).toMatchObject({
    schemaVersion: 2, candidate: { first: 37, second: 47 },
    assessment: { batchId: 'ENGINEERING-CAL' },
    acceptancePlan: { confidenceLevel: 0.95, independenceRef, minAttemptsPerGroup: 2, minEvaluableFraction: 0.5,
      limits: { m1Wrong: 0.9, m1Loss: 0.9, m1Ambiguity: 0.9, m0Wrong: 0.9, m0Loss: 0.9, m0Ambiguity: 0.9,
        emptyFalsePositive: 0.9, emptyAmbiguity: 0.9 } },
  });

  await page.reload();
  await expect(frozen).toHaveCount(0);
  await readout.getByLabel('导入冻结规则 JSON', { exact: true }).setInputFiles({
    name: exportedFreeze.suggestedFilename(), mimeType: 'application/json', buffer: freezeBytes,
  });
  await planSummary.click();
  await expect(frozen.getByText(independenceRef, { exact: true })).toBeVisible();
  await expect(verify).toBeDisabled();
  await workbook.setInputFiles(validation);
  await expect(importPanel.getByTestId('senoo-measurement-filename')).toContainText(validation.name);
  await expect(importPanel.getByTestId('senoo-measurement-batch')).toHaveCount(1);
  await expect(readout.getByRole('combobox', { name: '实测验证批次', exact: true })).toHaveValue('ENGINEERING-VAL');
  await verify.click();
  const result = readout.getByTestId('senoo-readout-acceptance-result');
  await expect(result).toHaveAttribute('data-acceptance-status', 'inconclusive');
  await expect(result).toContainText('现有证据不足');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const pendingReport = page.waitForEvent('download');
  await readout.getByRole('button', { name: '导出独立验证 JSON', exact: true }).click();
  const exportedReport = await pendingReport;
  const reportBytes = await readFile((await exportedReport.path())!);
  const report = JSON.parse(reportBytes.toString('utf8'));
  const validationDigest = createHash('sha256').update(validation.buffer).digest('hex');
  expect(report).toMatchObject({
    kind: 'senoo-measured-verification', schemaVersion: 3, frozen: frozenData, holdoutConditions: frozenData.conditions,
    verification: { batchId: 'ENGINEERING-VAL', sha256: validationDigest,
      denominators: { uniqueAttempts: 1, attemptedSites: 3, evaluated: 3 },
      acceptance: { status: 'inconclusive', confidenceLevel: 0.95 },
      samples: expect.arrayContaining([expect.objectContaining({ preparedGroup: 'm1', outcome: 'no-atom',
        frames: expect.objectContaining({ first: expect.objectContaining({ actualThreshold: 36, thresholdOp: 'ge' }) }) })]),
    },
  });
  expect(report.verification.acceptance.metrics).toHaveLength(8);
  expect(report.verification.acceptance.metrics.find(({ key }: { key: string }) => key === 'm1Loss')).toMatchObject({
    numerator: 1, denominator: 1, attemptCount: 1, rate: 1, lower: 0, upper: 1, limit: 0.9,
    calibrationRate: 0, delta: 1,
  });

  await page.reload();
  const reportFile = { name: exportedReport.suggestedFilename(), mimeType: 'application/json', buffer: reportBytes };
  const reportInput = readout.getByLabel('导入独立验证报告 JSON', { exact: true });
  const replay = readout.getByTestId('senoo-measured-verification-replay');
  await reportInput.setInputFiles(reportFile);
  await expect(replay).toHaveAttribute('data-workbook-status', 'no-workbook');
  await expect(replay).toContainText('ENGINEERING-VAL');
  await expect(frozen).toHaveCount(0);
  await expect(verify).toBeDisabled();
  await workbook.setInputFiles(calibration);
  await expect(replay).toHaveAttribute('data-workbook-status', 'different-workbook');
  await workbook.setInputFiles(validation);
  await expect(replay).toHaveAttribute('data-workbook-status', 'match');

  const alteredReport = {
    ...report,
    verification: {
      ...report.verification,
      totals: { ...report.verification.totals, correct: report.verification.totals.correct + 1 },
    },
  };
  await reportInput.setInputFiles({
    name: 'invalid-engineering-verification-totals.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(alteredReport)),
  });
  await expect(readout.getByRole('alert')).toContainText('导入新报告失败');
  await expect(replay).toHaveAttribute('data-workbook-status', 'match');
  await expect(replay).toContainText('ENGINEERING-VAL');

  const sharedConditions = report.holdoutConditions;
  const circuit = {
    ...circuitFixture('measured'),
    apparatusVersion: sharedConditions.apparatus_version,
    protocolVersion: sharedConditions.protocol_version,
    cameraConfigRef: sharedConditions.camera_config_ref,
    roiMapVersion: sharedConditions.roi_map_version,
    countProcessingRef: sharedConditions.count_processing_ref,
    outcomePolicy: sharedConditions.outcome_policy,
    screeningRuleRef: sharedConditions.screening_rule_ref,
    workingPoint: report.verification.workingPoint,
    countUnit: report.verification.countUnit,
  };
  const circuitPanel = page.getByTestId('senoo-circuit-batch');
  const circuitStats = circuitPanel.getByTestId('senoo-circuit-statistics');
  const circuitInput = circuitPanel.getByLabel('导入整机批次 JSON', { exact: true });
  await circuitInput.setInputFiles({
    name: 'engineering-only-independent-circuit.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(circuit)),
  });
  await expect(circuitStats).toHaveAttribute('data-readout-status', 'awaiting-rule');
  await circuitPanel.getByLabel('导入整机用读出验证报告 JSON', { exact: true }).setInputFiles(reportFile);
  await expect(circuitStats).toHaveAttribute('data-readout-status', 'evaluated');
  await expect(circuitStats).toHaveAttribute('data-readout-evidence', 'replayed-insufficient');
  await expect(circuitPanel.getByTestId('senoo-circuit-readout-evidence')).toContainText(report.verification.runId);
  await expect(circuitStats.locator('[data-metric="validReadout"]')).toContainText('1 / 8');

  const circuitDownload = page.waitForEvent('download');
  await circuitPanel.getByRole('button', { name: '导出整机统计 JSON', exact: true }).click();
  const circuitReport = JSON.parse(await readFile((await (await circuitDownload).path())!, 'utf8'));
  expect(circuitReport.inputs).toMatchObject({
    frozenReadout: { source: 'verification-report', calibrationRunId: report.frozen.assessment.runId },
    readoutVerification: {
      sha256: createHash('sha256').update(reportBytes).digest('hex'), schemaVersion: 3,
      calibrationRunId: report.frozen.assessment.runId, validationRunId: report.verification.runId,
      validationSha256: validationDigest, decision: 'inconclusive', scope: 'same-workpoint', status: 'replayed-insufficient',
    },
  });

  await circuitInput.setInputFiles({
    name: 'engineering-only-reused-validation-run.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...circuit, acquisitionRunId: report.verification.runId })),
  });
  await expect(circuitStats).toHaveAttribute('data-readout-evidence', 'incompatible');
  await expect(circuitStats).toHaveAttribute('data-readout-status', 'awaiting-rule');
});
