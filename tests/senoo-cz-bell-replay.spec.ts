import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const metastablePoint = 'Fig1c_right!AA2:AA5';
const clockPoint = 'Fig1d_right!BI2:BI5';

test('图 1c→1d CZ 对照同步装置、协议步骤和各图源点，支持跨模式导入', async ({ page }) => {
  await page.goto('/#senoo');
  await page.getByRole('button', { name: '图 1c→1d CZ 对照', exact: true }).click();
  const replay = page.getByTestId('senoo-cz-replay');
  const scene = replay.getByTestId('senoo-optical-scene');
  const timeline = replay.getByRole('slider', { name: '图 1c–d 协议时间轴' });
  const observations = replay.getByTestId('senoo-pxp-observations');
  const figure1c = observations.getByRole('combobox', { name: '图 1c 数据点' });
  const figure1d = observations.getByRole('combobox', { name: '图 1d 数据点' });
  const comparison = observations.getByTestId('senoo-bell-comparison');
  const next = replay.getByRole('button', { name: '下一步', exact: true });
  const previous = replay.getByRole('button', { name: '上一步', exact: true });

  await expect(timeline).toHaveValue('0');
  await expect(scene).toHaveAttribute('data-site-count', '2');
  await expect(scene).toHaveAttribute('data-mode', 'webgl');
  await expect(scene.locator('canvas')).toBeVisible();
  await expect(scene).toHaveAttribute('data-state', 'metastable-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'raman');
  await expect(observations).toHaveAttribute('data-point-id', '');

  await next.click();
  await expect(replay).toHaveAttribute('data-stage', 'cz');
  await expect(timeline).toHaveValue('1');
  await expect(scene).toHaveAttribute('data-active-channels', 'rydberg');
  await expect(observations).toHaveAttribute('data-point-id', '');
  await expect(replay.getByTestId('senoo-cz-time-status')).toHaveText('实际时标待测');

  await next.click();
  await expect(timeline).toHaveValue('2');
  await expect(scene).toHaveAttribute('data-state', 'metastable-even-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'raman');
  await expect(figure1c.locator('option')).toHaveCount(45);
  await expect(observations).toContainText('未施加测量误差修正');
  await expect(observations.getByText('自由谐波拟合', { exact: true })).toHaveCount(0);
  await expect(comparison.getByRole('row', { name: 'CZ 98.73% 98.37%' })).toBeVisible();
  await selectSourcePoint(figure1c, metastablePoint, '218 / 218');
  await expect(observations.getByTestId('senoo-pxp-error-upper')).toHaveText('0');

  await next.click();
  await expect(timeline).toHaveValue('3');
  await expect(scene).toHaveAttribute('data-state', 'clock-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'clock raman');
  await expect(figure1d.locator('option')).toHaveCount(64);
  await expect(comparison.getByRole('row', { name: 'CZ 98.64% 89.06%' })).toBeVisible();
  await expect(comparison.getByRole('row', { name: 'PXP 96.40% 87.63%' })).toBeVisible();
  await selectSourcePoint(figure1d, clockPoint, '183 / 196');
  await expect(observations.getByTestId('senoo-pxp-selection')).toHaveText('丢失检测后');

  const downloadStarted = page.waitForEvent('download');
  await replay.getByRole('button', { name: '导出回放 JSON', exact: true }).click();
  const downloaded = await downloadStarted;
  const data = await readFile((await downloaded.path())!);
  expect(JSON.parse(data.toString())).toMatchObject({
    schema: 'senoo-cz-bell-replay',
    timebase: 'protocol-step',
    experimentalTimestampsS: null,
    source: { selection: 'loss_detected', fidelityCondition: 'uncorrected_measurement_errors' },
    selection: { stageId: 'm-to-o', pointIds: { 'measure-m': metastablePoint, 'm-to-o': clockPoint } },
  });

  await previous.click();
  await expect(timeline).toHaveValue('2');
  await expect(observations).toHaveAttribute('data-point-id', metastablePoint);
  await timeline.fill('1');
  await expect(observations).toHaveAttribute('data-point-id', '');
  await expect(scene).toHaveAttribute('data-active-channels', 'rydberg');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '图 2f 阻塞 Bell 映射', exact: true }).click();
  await page.getByLabel('导入回放 JSON', { exact: true }).setInputFiles({
    name: 'senoo-cz-bell-replay.json', mimeType: 'application/json', buffer: data,
  });
  await expect(replay).toHaveAttribute('data-stage', 'm-to-o');
  await expect(timeline).toHaveValue('3');
  await expect(scene).toHaveAttribute('data-active-channels', 'clock raman');
  await expect(observations).toHaveAttribute('data-figure', '图 1d');
  await expect(observations.getByTestId('senoo-pxp-source-cell')).toHaveText(clockPoint);
  await previous.click();
  await expect(observations).toHaveAttribute('data-figure', '图 1c');
  await expect(observations).toHaveAttribute('data-point-id', metastablePoint);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  async function selectSourcePoint(select: typeof figure1c, cell: string, count: string) {
    await select.selectOption(cell);
    await expect(observations.getByTestId('senoo-pxp-source-cell')).toHaveText(cell);
    await expect(observations.getByTestId('senoo-pxp-inferred-count')).toHaveText(count);
  }
});
