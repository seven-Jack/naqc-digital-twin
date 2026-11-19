import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const depths = [0, 4, 8, 12, 16, 20];
const columns = ['B', 'C', 'D', 'E', 'F', 'G'];
const series = [
  { id: 'prep', sheet: 'Fig3b_prep', counts: ['2779 / 3269', '2775 / 3282', '2692 / 3332', '2618 / 3273', '2543 / 3258', '2433 / 3259'] },
  { id: 'decay', sheet: 'Fig3b_decay', counts: ['2654 / 2952', '2616 / 2932', '2544 / 2965', '2486 / 2889', '2387 / 2851', '2290 / 2826'] },
  { id: 'loss', sheet: 'Fig3b_loss', counts: ['2787 / 2922', '2779 / 2908', '2696 / 2891', '2627 / 2815', '2558 / 2779', '2450 / 2661'] },
  { id: 'prep_site_loss', sheet: 'Fig3c_single', counts: ['358 / 6538', '404 / 6564', '481 / 6664', '496 / 6546', '540 / 6516', '670 / 6518'] },
  { id: 'prep_correlated_pair_loss', sheet: 'Fig3c_corr', counts: ['9 / 3269', '31 / 3282', '40 / 3332', '36 / 3273', '52 / 3258', '63 / 3259'] },
];

test('Senoo 图 3b–d 的门深度联动五组源点，保留各自计数与误差', async ({ page }) => {
  await page.goto('/#senoo');
  const openCharacterization = page.getByRole('button', { name: '图 3b–d CZ 表征', exact: true });
  await openCharacterization.click();
  const panel = page.getByTestId('senoo-cz-characterization');
  const depth = panel.getByRole('group', { name: 'CZ 门深度' });
  const grb = panel.getByTestId('senoo-cz-grb-plot');
  const loss = panel.getByTestId('senoo-cz-loss-plot');
  const points = panel.getByTestId('senoo-cz-observed-point');
  const selectedPoints = points.and(panel.locator('[data-selected="true"]'));

  await expect(panel).toContainText('文献复现');
  await expect(panel).toHaveAttribute('data-depth', '0');
  await expect(depth.getByRole('button')).toHaveCount(6);
  await expect(grb).toBeVisible();
  await expect(loss).toBeVisible();
  await expect(grb.getByTestId('senoo-cz-observed-point')).toHaveCount(18);
  await expect(loss.getByTestId('senoo-cz-observed-point')).toHaveCount(12);
  await expect(points.locator('path.czc-error-bar')).toHaveCount(30);
  await expect(panel).toContainText('实际门波形待测');
  await expect(panel).toContainText('正式读出标定待同装置实测和独立验证批次');
  const provenance = panel.getByRole('region', { name: '表征来源与适用条件' });
  await provenance.getByText('工作簿与复算源表校验值', { exact: true }).click();
  await expect(provenance.getByText('yb-senoo-source-fig3.xls', { exact: true })).toBeVisible();
  await expect(provenance.getByText('senoo-fig3-cz-by-depth.csv', { exact: true })).toBeVisible();

  const detail = (id: string) => panel.getByTestId('senoo-cz-point-detail').and(panel.locator(`[data-series="${id}"]`));
  const fit = (id: string) => panel.getByTestId('senoo-cz-fit-summary').and(panel.locator(`[data-series="${id}"]`));
  const fitResults = [
    '99.37192% ± 0.06855', '99.50650% ± 0.06188', '99.78382% ± 0.04196',
    '0.21365359% ± 0.02482929', '0.07896026% ± 0.01165943',
  ];
  for (const [index, { id }] of series.entries()) {
    await expect(fit(id)).toContainText(fitResults[index]);
  }

  for (const [index, gateCount] of depths.entries()) {
    const selectedDepth = String(gateCount);
    const depthButton = depth.getByRole('button', { name: selectedDepth, exact: true });
    await depthButton.click();
    await expect(depthButton).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toHaveAttribute('data-depth', selectedDepth);
    await expect(selectedPoints).toHaveCount(5);
    await expect(selectedPoints.and(panel.locator(`[data-depth="${selectedDepth}"]`))).toHaveCount(5);
    for (const { id, sheet, counts } of series) {
      const row = detail(id);
      const column = columns[index];
      await expect(row).toHaveAttribute('data-depth', selectedDepth);
      await expect(row).toContainText(`${sheet}!${column}2:${column}5`);
      await expect(row).toContainText(counts[index]);
    }
  }

  const depth20Sources = [
    ['prep', '0.746548020865296', '0.00780647350573893', '0.00765328368130358'],
    ['prep_site_loss', '0.102792267566738', '0.00375574369967211', '0.0038791878122719'],
    ['prep_correlated_pair_loss', '0.0193310831543418', '0.0023987115996744', '0.00271016086715433'],
  ];
  for (const [id, observed, lower, upper] of depth20Sources) {
    await expect(detail(id)).toHaveAttribute('data-observed', observed);
    await expect(detail(id)).toHaveAttribute('data-error-lower', lower);
    await expect(detail(id)).toHaveAttribute('data-error-upper', upper);
    const marker = selectedPoints.and(panel.locator(`[data-series="${id}"]`));
    const center = Number(await marker.locator('circle.czc-point').getAttribute('cy'));
    const errorPath = await marker.locator('path.czc-error-bar').getAttribute('d');
    const errorBounds = /^M[-\d.]+,([-\d.]+)V([-\d.]+)/.exec(errorPath ?? '');
    expect(errorBounds).not.toBeNull();
    const [, top, bottom] = errorBounds!;
    expect((Number(bottom) - center) / (center - Number(top))).toBeCloseTo(Number(lower) / Number(upper), 8);
  }
  for (const [index, { id }] of series.entries()) {
    await expect(fit(id)).toContainText(fitResults[index]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const openBell = page.getByRole('button', { name: '图 1c→1d CZ 对照', exact: true });
  const bell = page.getByTestId('senoo-cz-replay');
  const bellTimeline = bell.getByRole('slider', { name: '图 1c–d 协议时间轴' });
  await openBell.click();
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeVisible();
  await bellTimeline.fill('2');
  await openCharacterization.click();
  await expect(panel).toHaveAttribute('data-depth', '20');
  await expect(bell).toHaveCount(0);
  await loss.getByTestId('senoo-cz-observed-point')
    .and(loss.locator('[data-series="prep_site_loss"][data-depth="4"]')).locator('circle.czc-hit').click();
  await expect(depth.getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(detail('prep_site_loss')).toContainText('404 / 6564');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await openBell.click();
  await expect(bellTimeline).toHaveValue('2');
});

test('独立 gRB 逐轮批次保留非嵌套筛选、存活证据与分母', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  await page.getByRole('button', { name: '图 3b–d CZ 表征', exact: true }).click();
  const panel = page.getByTestId('senoo-cz-benchmark');
  const template = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载 CZ gRB 模板 JSON', exact: true }).click();
  expect(JSON.parse(await readFile((await (await template).path())!, 'utf8'))).toMatchObject({
    kind: 'senoo-cz-benchmark', sourceKind: null, attempts: [], sequences: [],
  });

  const ref = 'synthetic://engineering-grb-test-only';
  const siteIds = ['engineering-left', 'engineering-right'];
  const drive = { omegaRadPerS: 0, detuningRadPerS: 0, phaseRad: 0 };
  const waveform = {
    kind: 'senoo-cz-waveform', schemaVersion: 1, sourceKind: 'synthetic', sourceRef: `${ref}/waveform`,
    isotope: 171, apparatusVersion: 'engineering-apparatus', gateVersion: 'engineering-cz', workingPoint: 'engineering-point',
    acquisitionRunId: 'engineering-waveform-run', siteIds, window: { startS: 0, endS: 1e-6 },
    samples: [0, 1e-6].map(timeS => ({ timeS, first: drive, second: drive })),
  };
  const waveformBytes = Buffer.from(JSON.stringify(waveform));
  const sequences = [0, 4, 8].map(depth => ({ sequenceId: `sequence-${depth}`, seed: `engineering-seed-${depth}`,
    depth, target: '00', sourceRef: `${ref}/sequence-${depth}` }));
  function shot(id: string, depth: number, masks: { prep: boolean; decay: boolean; loss: boolean },
    bitstring: string | null, survival = ['present', 'present']) {
    return { attemptId: id, pairId: 'engineering-pair', blockId: `block-${id}`, sequenceId: `sequence-${depth}`,
      siteIds, masks, bitstring, survival, sourceRef: `${ref}/attempt-${id}`, survivalRef: `${ref}/survival-${id}` };
  }
  const all = { prep: true, decay: true, loss: true };
  const attempts = [shot('01', 0, all, '00'), shot('02', 0, { ...all, loss: false }, '01'),
    shot('03', 4, { prep: true, decay: false, loss: false }, null, ['lost', 'unknown']),
    shot('04', 4, { ...all, prep: false }, '00'), shot('05', 4, { ...all, loss: false }, '00'),
    shot('06', 8, all, '01'), shot('07', 8, { ...all, loss: false }, null, ['lost', 'lost'])];
  const batch = {
    kind: 'senoo-cz-benchmark', schemaVersion: 1, sourceKind: 'synthetic', sourceRef: ref,
    waveformSha256: createHash('sha256').update(waveformBytes).digest('hex'), apparatusVersion: waveform.apparatusVersion,
    gateVersion: waveform.gateVersion, workingPoint: waveform.workingPoint, acquisitionRunId: 'engineering-holdout-run',
    protocolRef: `${ref}/protocol`, maskRef: `${ref}/mask`, readoutCalibrationRef: `${ref}/readout`,
    survivalProtocolRef: `${ref}/survival`, independenceRef: `${ref}/blocks`, confidenceLevel: 0.95,
    mode: 'non-echo', expectedAttempts: attempts.length, sequences, attempts,
  };
  const bytes = Buffer.from(JSON.stringify(batch));
  const input = panel.getByLabel('导入 CZ gRB 批次 JSON', { exact: true });
  await input.setInputFiles({ name: 'synthetic-grb-test-only.json', mimeType: 'application/json', buffer: bytes });
  const binding = panel.getByTestId('senoo-cz-benchmark-binding');
  await expect(binding).toHaveAttribute('data-binding', 'awaiting-waveform');
  await page.getByLabel('导入 CZ 波形 JSON', { exact: true }).setInputFiles({
    name: 'synthetic-grb-waveform.json', mimeType: 'application/json', buffer: waveformBytes,
  });
  await expect(binding).toHaveAttribute('data-binding', 'associated');
  await expect(binding).toContainText('1 个');
  const rates = panel.getByTestId('senoo-cz-benchmark-depth');
  await panel.getByRole('combobox', { name: 'gRB 门深度' }).selectOption('4');
  await expect(rates).toHaveAttribute('data-depth', '4');
  for (const [series, counts] of Object.entries({ prep: '1/2', decay: '2/2', loss: '1/1', siteLoss: '1/4', pairLoss: '0/2' })) {
    await expect(rates.locator(`[data-benchmark-series="${series}"]`)).toContainText(counts);
  }
  await panel.getByText('当前深度的逐轮记录', { exact: true }).click();
  const attempt = panel.getByTestId('senoo-cz-benchmark-attempt');
  await expect(attempt).toContainText('lost、unknown');
  await panel.getByLabel('gRB 尝试序号', { exact: true }).fill('2');
  await expect(attempt).toContainText('衰变擦除、丢失检测');
  await panel.getByText('描述性拟合', { exact: true }).click();
  await expect(panel.getByTestId('senoo-cz-benchmark-fits')).toContainText('存在未判明结局');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const exportDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出 CZ gRB 核对 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await exportDownload).path())!, 'utf8'));
  expect(report).toMatchObject({ evidence: 'synthetic-benchmark', batch,
    input: { sha256: createHash('sha256').update(bytes).digest('hex') }, binding: { status: 'associated', sameOrderedPairs: 1 },
    fits: { grb: { prep: { status: 'fit' } }, loss: { siteLoss: { status: 'unavailable', reason: 'unresolved' } } },
  });
  expect(report.summary.rows[1].rates.siteLoss).toMatchObject({ hits: 1, denominator: 4, unresolved: 1, blocks: 2 });
});
