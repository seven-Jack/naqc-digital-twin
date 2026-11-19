import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('CZ 波形模板保留空白，合成导入保持文献表征可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  await page.getByRole('button', { name: '图 3b–d CZ 表征', exact: true }).click();

  const characterization = page.getByTestId('senoo-cz-characterization');
  const waveform = page.getByTestId('senoo-cz-waveform');
  const sample = waveform.getByTestId('senoo-cz-waveform-sample');
  await expect(waveform).toBeVisible();
  await expect(waveform).toHaveAttribute('data-model-ready', 'false');
  await expect(sample).toHaveCount(0);

  const pending = page.waitForEvent('download');
  await waveform.getByRole('button', { name: '下载 CZ 波形模板 JSON', exact: true }).click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  const template = JSON.parse(await readFile(path!, 'utf-8'));
  expect(template).toMatchObject({ kind: 'senoo-cz-waveform', schemaVersion: 1, sourceKind: null, samples: [] });

  const syntheticWaveform = {
    ...template,
    sourceKind: 'synthetic',
    sourceRef: 'synthetic://cz-test/trace',
    apparatusVersion: 'synthetic-cz-v1',
    gateVersion: 'synthetic-gate-v1',
    acquisitionRunId: 'synthetic-cz-run-01',
    workingPoint: 'synthetic-cz-working-point',
    isotope: 171,
    driveWavelengthM: 302e-9,
    clockId: 'synthetic-clock',
    timeOriginRef: 'synthetic://cz-test/t0',
    phaseReference: 'synthetic-phase-zero',
    detuningReference: 'synthetic-detuning-zero',
    siteIds: ['site-01', 'site-02'],
    window: { startS: 0, endS: 1e-6 },
    samples: [
      { timeS: 0,
        first: { omegaRadPerS: 1100000, detuningRadPerS: -101, phaseRad: 0.25 },
        second: { omegaRadPerS: 1200000, detuningRadPerS: -201, phaseRad: 0.75 } },
      { timeS: 1e-6,
        first: { omegaRadPerS: 1300000, detuningRadPerS: -301, phaseRad: 0.5 },
        second: { omegaRadPerS: 1400000, detuningRadPerS: -401, phaseRad: 1.25 } },
    ],
  };
  const input = waveform.getByLabel('导入 CZ 波形 JSON', { exact: true });
  await input.setInputFiles({
    name: 'synthetic-cz-waveform.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(syntheticWaveform)),
  });
  await expect(waveform).toHaveAttribute('data-source-kind', 'synthetic');
  await expect(waveform).toHaveAttribute('data-model-ready', 'false');
  await expect(waveform).toContainText('合成记录');
  await expect(waveform.getByTestId('senoo-cz-dynamics')).toHaveAttribute('data-runnable', 'false');
  const sampleIndex = waveform.getByRole('spinbutton', { name: 'CZ 波形采样点序号', exact: true });
  await expect(sampleIndex).toHaveValue('1');
  await expect(sample).toContainText('site-01');
  await expect(sample).toContainText('site-02');
  await expect(sample).toContainText('0.25');
  await expect(sample).toContainText('0.75');
  await sampleIndex.fill('2');
  await expect(sample).toContainText('1300000');
  await expect(sample).toContainText('1400000');
  await expect(sample).toContainText('0.5');
  await expect(sample).toContainText('1.25');

  await input.setInputFiles({
    name: 'invalid-cz-waveform.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...syntheticWaveform, schemaVersion: 2 })),
  });
  await expect(waveform.getByRole('alert')).toBeVisible();
  await expect(waveform).toHaveAttribute('data-source-kind', 'synthetic');
  await expect(sampleIndex).toHaveValue('2');
  await expect(sample).toContainText('1.25');

  const depth = characterization.getByRole('group', { name: 'CZ 门深度' });
  await depth.getByRole('button', { name: '4', exact: true }).click();
  await expect(characterization).toHaveAttribute('data-depth', '4');
  await expect(characterization.getByTestId('senoo-cz-point-detail')
    .and(characterization.locator('[data-series="prep_site_loss"]'))).toContainText('404 / 6564');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('CZ 相干演化要求显式约定，导出保留条件计算的波形溯源', async ({ page }) => {
  await page.goto('/#senoo');
  await page.getByRole('button', { name: '图 3b–d CZ 表征', exact: true }).click();
  const waveform = page.getByTestId('senoo-cz-waveform');
  const input = waveform.getByLabel('导入 CZ 波形 JSON', { exact: true });
  const dynamics = waveform.getByTestId('senoo-cz-dynamics');
  const calculate = dynamics.getByRole('button', { name: '核对相干演化', exact: true });
  const result = dynamics.getByTestId('senoo-cz-dynamics-result');

  // The measured declaration exercises the import path with an in-memory engineering fixture only.
  const filename = 'engineering-test-only.json';
  const fixtureRef = 'engineering-fixture://cz-dynamics';
  const zeroDrive = { omegaRadPerS: 0, detuningRadPerS: 0, phaseRad: 0 };
  const legacyFixture = {
    kind: 'senoo-cz-waveform', schemaVersion: 1,
    sourceKind: 'measured', sourceRef: `${fixtureRef}/waveform`,
    apparatusVersion: 'engineering-fixture-apparatus', gateVersion: 'engineering-fixture-gate',
    acquisitionRunId: 'engineering-fixture-run', workingPoint: 'engineering-fixture-zero-drive',
    isotope: 171, driveWavelengthM: 302e-9,
    clockId: 'engineering-fixture-clock', timeOriginRef: `${fixtureRef}/time-origin`,
    phaseReference: `${fixtureRef}/phase-zero`, detuningReference: `${fixtureRef}/detuning-zero`,
    siteIds: ['engineering-site-1', 'engineering-site-2'], window: { startS: 0, endS: 1e-6 },
    samples: [
      { timeS: 0, first: zeroDrive, second: zeroDrive },
      { timeS: 1e-6, first: zeroDrive, second: zeroDrive },
    ],
    geometry: {
      distanceM: 2.4e-6, angleToMagneticFieldRad: 0, magneticFieldT: 0, electricFieldVPerM: 0,
      interactionHz: 0, sourceRef: `${fixtureRef}/geometry`,
    },
    driveCalibrationRef: `${fixtureRef}/drive`, trapTimingRef: `${fixtureRef}/trap`,
    erasureTimingRef: `${fixtureRef}/erasure`, ionizationTimingRef: `${fixtureRef}/ionization`,
    zCompensationRef: `${fixtureRef}/z-compensation`, responseDataRef: null,
  };
  await input.setInputFiles({
    name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyFixture)),
  });
  await expect(waveform).toHaveAttribute('data-model-ready', 'true');
  await expect(dynamics).toContainText('evolutionConvention');
  await dynamics.getByLabel(/^采样解释/).selectOption('zero-order-hold');
  await dynamics.getByLabel('粗步长上限 (ns)', { exact: true }).fill('1000');
  await expect(dynamics).toHaveAttribute('data-runnable', 'false');
  await expect(calculate).toBeDisabled();
  await expect(result).toHaveCount(0);

  const evolutionConvention = 'drive-minus-transition-positive-coupling-phase';
  const buffer = Buffer.from(JSON.stringify({ ...legacyFixture, evolutionConvention }));
  await input.setInputFiles({ name: filename, mimeType: 'application/json', buffer });
  await expect(dynamics).toHaveAttribute('data-runnable', 'true');
  await calculate.click();
  await expect(dynamics).toContainText('条件计算 · 待实验验收');
  await expect(result).toContainText('条件相位 0.000000 rad');
  const rows = result.locator('tbody').getByRole('row');
  const inputs = ['00', '01', '10', '11'];
  await expect(rows).toHaveCount(inputs.length);
  for (const [index, basis] of inputs.entries()) {
    const row = rows.nth(index);
    await expect(row.getByRole('rowheader')).toHaveText(basis);
    await expect(row.getByRole('cell')).toHaveText(['1.000000 + 0.000000i', '100.000000%', '0.000000%']);
  }

  const pending = page.waitForEvent('download');
  await dynamics.getByRole('button', { name: '导出相干计算 JSON', exact: true }).click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  const bundle = JSON.parse(await readFile(path!, 'utf-8'));
  expect(bundle).toMatchObject({
    schemaVersion: 1,
    evidence: 'conditional-closed-system-forward-model',
    waveform: {
      filename, sha256: createHash('sha256').update(buffer).digest('hex'),
      sourceRef: legacyFixture.sourceRef, evolutionConvention,
    },
    options: { sampling: 'zero-order-hold' },
    result: {
      conditionalPhaseRad: 0,
      inputs: inputs.map(basis => ({ input: basis, logicalReturnProbability: 1, rydbergLeakageProbability: 0 })),
    },
  });
  expect(bundle.options.maxStepS).toBeCloseTo(1e-6, 18);

  await page.setViewportSize({ width: 390, height: 844 });
  const response = dynamics.getByTestId('senoo-cz-response');
  const responseInput = response.getByLabel('导入 CZ 门响应 JSON', { exact: true });
  const responseResult = response.getByTestId('senoo-cz-response-result');
  const responseTemplate = page.waitForEvent('download');
  await response.getByRole('button', { name: '下载 CZ 门响应模板 JSON', exact: true }).click();
  expect(JSON.parse(await readFile((await (await responseTemplate).path())!, 'utf8'))).toMatchObject({
    kind: 'senoo-cz-response', sourceKind: null, waveformSha256: null, expectedAttempts: null, attempts: [], phase: null,
  });
  const reportRef = 'synthetic://engineering-cz-response';
  const attempts = [
    { input: '00', prep: 'accepted', outcome: 'returned' },
    { input: '00', prep: 'accepted', outcome: 'first-site-loss' },
    { input: '00', prep: 'rejected', outcome: null },
    { input: '01', prep: 'accepted', outcome: 'other-logical' },
    { input: '10', prep: 'accepted', outcome: 'rydberg' },
    { input: '11', prep: 'rejected', outcome: null },
  ].map((row, index) => ({ ...row, attemptId: `engineering-response-${index + 1}`, sourceRef: `${reportRef}/shot/${index + 1}` }));
  const independent = {
    kind: 'senoo-cz-response', schemaVersion: 1, sourceKind: 'synthetic', sourceRef: reportRef,
    waveformSha256: createHash('sha256').update(buffer).digest('hex'), apparatusVersion: legacyFixture.apparatusVersion,
    gateVersion: legacyFixture.gateVersion, workingPoint: legacyFixture.workingPoint, siteIds: legacyFixture.siteIds,
    acquisitionRunId: 'engineering-independent-response-run', clockId: 'engineering-independent-clock', timeOriginRef: `${reportRef}/t0`,
    readoutCalibrationRef: `${reportRef}/readout`, screeningRef: `${reportRef}/screening`,
    observationProtocolRef: `${reportRef}/state-selective-observation`, independenceRef: `${reportRef}/independence`, confidenceLevel: 0.95,
    phase: { estimateRad: 0.125, halfWidthRad: 0.2, confidenceLevel: 0.9, sourceRef: `${reportRef}/fitted-phase`, phaseReference: legacyFixture.phaseReference },
    expectedAttempts: attempts.length, attempts,
  };
  await responseInput.setInputFiles({ name: 'wrong-cz-response.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...independent, waveformSha256: '0'.repeat(64) })) });
  await expect(response.getByRole('alert')).toContainText('waveformSha256');
  await expect(responseResult).toHaveCount(0);

  const responseBytes = Buffer.from(JSON.stringify(independent));
  await responseInput.setInputFiles({ name: 'synthetic-cz-response.json', mimeType: 'application/json', buffer: responseBytes });
  await expect(responseResult).toHaveAttribute('data-scope', 'synthetic');
  await expect(responseResult.locator('[data-input="00"]')).toContainText('尝试 3 · 制备拒绝 1 · 纳入 2 · 未解析 1');
  await expect(responseResult.locator('[data-input="11"]')).toContainText('分母为 0');
  await expect(responseResult.locator('[data-phase-status="comparable"]')).toContainText('环绕残差 0.125000 rad');
  await expect(responseResult.locator('[data-phase-status="comparable"]')).toContainText('合成估计');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const verificationDownload = page.waitForEvent('download');
  await response.getByRole('button', { name: '导出 CZ 门响应核对 JSON', exact: true }).click();
  const verification = JSON.parse(await readFile((await (await verificationDownload).path())!, 'utf8'));
  expect(verification).toMatchObject({
    evidence: 'synthetic-response-comparison', response: independent,
    inputs: { responseSha256: createHash('sha256').update(responseBytes).digest('hex'), waveformSha256: independent.waveformSha256 },
    comparison: { scope: 'synthetic', phase: { status: 'comparable', confidenceLevel: 0.9 } },
  });
  expect(verification.comparison.rows[0].return).toMatchObject({ hits: 1, denominator: 2, identification: [0.5, 1] });
  expect(verification.comparison.rows[0].rydbergLeakage).toMatchObject({ hits: 0, denominator: 2, identification: [0, 0.5] });
});
