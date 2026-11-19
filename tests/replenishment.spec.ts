import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Bell 一次补位依赖占位观测，回退与倍速重播同步恢复三维和计数', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#machine');
  await page.getByLabel('实验协议', { exact: true }).selectOption('bell-replenishment');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('64');
  await page.getByRole('slider', { name: '单比特读出翻转' }).fill('0');

  const timeline = page.getByRole('slider', { name: '演示时间轴' });
  const stage = page.getByTestId('machine-stage');
  const canvas = page.getByTestId('quantum-scene-canvas');
  const occupancy = page.getByTestId('machine-occupancy');
  const initial = page.getByTestId('machine-occupancy-initial');
  const recheck = page.getByTestId('machine-occupancy-recheck');
  const shots = page.getByTestId('machine-shots');
  const results = page.getByTestId('machine-results');
  const histogram = results.getByLabel('Z 基测量直方图');
  await expect(timeline).toHaveAttribute('max', '15200');

  await timeline.fill('4700');
  await expect(stage).toHaveAttribute('data-stage-id', 'occupancy-check');
  await expect(canvas).toHaveAttribute('data-stage', 'occupancy-check');
  await expect(occupancy).toHaveAttribute('data-decision', 'pending');
  await expect(initial).toHaveCount(0);
  await expect(recheck).toHaveCount(0);
  await expect.poll(() => canvas.getAttribute('data-occupancy')).toBeNull();
  await expect.poll(() => canvas.getAttribute('data-moving-atom')).toBeNull();

  await timeline.fill('5000');
  await expect(initial).toContainText('1 / 2');
  await expect(occupancy).toHaveAttribute('data-decision', 'pending');
  await expect(canvas).toHaveAttribute('data-occupancy', '10');
  await expect.poll(() => canvas.getAttribute('data-moving-atom')).toBeNull();
  const beforeLayout = await canvas.getAttribute('data-atom-layout');
  const beforeReplenishment = await canvas.screenshot({ animations: 'disabled' });

  await timeline.fill('5900');
  await expect(stage).toHaveAttribute('data-stage-id', 'replenishment');
  await expect(occupancy).toHaveAttribute('data-decision', 'replenish');
  await expect(occupancy).toHaveAttribute('data-replenishment', 'moving');
  await expect(canvas).toHaveAttribute('data-active-path', 'transport');
  await expect(canvas).toHaveAttribute('data-moving-atom', /.+/);
  await expect.poll(() => canvas.getAttribute('data-atom-layout')).not.toBe(beforeLayout);
  await expect.poll(async () => (await canvas.screenshot({ animations: 'disabled' })).equals(beforeReplenishment)).toBe(false);
  await expect(shots).toHaveAttribute('data-completed-shots', '0');

  await timeline.fill('7350');
  await expect(stage).toHaveAttribute('data-stage-id', 'occupancy-recheck');
  await expect(recheck).toContainText('2 / 2');
  await expect(canvas).toHaveAttribute('data-occupancy', '11');
  await expect(canvas).toHaveAttribute('data-occupancy-phase', 'recheck');
  await timeline.fill('7550');
  await expect(occupancy).toHaveAttribute('data-decision', 'continue');
  await expect(stage).toHaveAttribute('data-stage-id', 'preparation');

  await timeline.fill('10930');
  await expect(canvas).toHaveAttribute('data-active-path', 'rydberg');
  await expect(page.getByText(/^第 1 次位串/)).toHaveCount(0);
  await timeline.fill('13279');
  await expect(canvas).toHaveAttribute('data-active-path', 'readout');
  await expect(canvas).toHaveAttribute('data-fluorescence', '11');
  await expect(page.getByTestId('machine-attempts')).toHaveAttribute('data-count', '4');
  await expect(shots).toHaveAttribute('data-completed-shots', '4');
  await expect(histogram.getByLabel(/^00 计数 1，/)).toBeVisible();
  await expect(histogram.getByLabel(/^11 计数 3，/)).toBeVisible();

  await timeline.fill('15200');
  await expect(shots).toHaveAttribute('data-completed-shots', '64');
  await expect(histogram.getByLabel(/^00 计数 34，/)).toBeVisible();
  await expect(histogram.getByLabel(/^11 计数 30，/)).toBeVisible();
  const finalLayout = await canvas.getAttribute('data-atom-layout');
  const firstDownload = page.waitForEvent('download');
  await results.getByRole('button', { name: '导出运行数据' }).click();
  const first = JSON.parse(await readFile((await (await firstDownload).path())!, 'utf8'));

  await timeline.fill('5000');
  await expect(initial).toContainText('1 / 2');
  await expect(recheck).toHaveCount(0);
  await expect(occupancy).toHaveAttribute('data-decision', 'pending');
  await expect(canvas).toHaveAttribute('data-occupancy', '10');
  await expect(canvas).toHaveAttribute('data-atom-layout', beforeLayout!);
  await expect.poll(() => canvas.getAttribute('data-fluorescence')).toBeNull();
  await expect(shots).toHaveAttribute('data-completed-shots', '0');
  await expect(results.getByRole('button', { name: '导出运行数据' })).toBeDisabled();
  await timeline.fill('4700');
  await expect(initial).toHaveCount(0);
  await expect.poll(() => canvas.getAttribute('data-occupancy')).toBeNull();

  await timeline.fill('10930');
  await page.getByLabel('播放速度', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '继续演示', exact: true }).click();
  await expect(timeline).toHaveValue('15200', { timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-fluorescence', '11');
  await expect(canvas).toHaveAttribute('data-atom-layout', finalLayout!);
  await expect(shots).toHaveAttribute('data-completed-shots', '64');
  const secondDownload = page.waitForEvent('download');
  await results.getByRole('button', { name: '导出运行数据' }).click();
  const second = JSON.parse(await readFile((await (await secondDownload).path())!, 'utf8'));
  expect(first.modelVersion).toBe(3);
  expect(first.records).toHaveLength(64);
  expect(second).toEqual(first);
  expect(errors).toEqual([]);
});

test('Bell 补位无可用原子时只尝试一次，并跳过代表轮的门和读出', async ({ page }) => {
  await page.goto('/#machine');
  await page.getByLabel('实验协议', { exact: true }).selectOption('bell-replenishment');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('64');
  await page.getByRole('slider', { name: '单阱装载概率' }).fill('0.02');
  await page.getByRole('slider', { name: '单比特读出翻转' }).fill('0');
  const timeline = page.getByRole('slider', { name: '演示时间轴' });
  const canvas = page.getByTestId('quantum-scene-canvas');
  const occupancy = page.getByTestId('machine-occupancy');

  await timeline.fill('5000');
  await expect(page.getByTestId('machine-occupancy-initial')).toContainText('1 / 2');
  await timeline.fill('5900');
  await expect(occupancy).toHaveAttribute('data-decision', 'replenish');
  await expect(occupancy).toHaveAttribute('data-replenishment', 'no-source');
  await expect(canvas).toHaveAttribute('data-stage', 'replenishment');
  await expect.poll(() => canvas.getAttribute('data-moving-atom')).toBeNull();
  await timeline.fill('7350');
  await expect(page.getByTestId('machine-occupancy-recheck')).toContainText('1 / 2');
  await expect(canvas).toHaveAttribute('data-occupancy', '10');
  await timeline.fill('10930');
  await expect(occupancy).toHaveAttribute('data-decision', 'skip');
  await expect(canvas).toHaveAttribute('data-stage', 'gates');
  await expect(canvas).toHaveAttribute('data-stage-skipped', 'true');
  await expect.poll(() => canvas.getAttribute('data-active-path')).toBeNull();
  await expect(page.locator('.md-sequence [aria-current="step"]')).toHaveAttribute('data-stage-status', 'skipped');

  await timeline.fill('15200');
  await expect(canvas).toHaveAttribute('data-stage-skipped', 'true');
  await expect.poll(() => canvas.getAttribute('data-fluorescence')).toBeNull();
  await expect.poll(() => canvas.getAttribute('data-active-path')).toBeNull();
  await expect(page.getByText(/^第 1 次位串/)).toHaveCount(0);
  await expect(page.getByTestId('machine-attempts')).toHaveAttribute('data-count', '64');
  await expect(page.getByTestId('machine-rejected')).toHaveAttribute('data-count', '51');
  await expect(page.getByTestId('machine-shots')).toHaveAttribute('data-completed-shots', '13');
  const histogram = page.getByTestId('machine-results').getByLabel('Z 基测量直方图');
  await expect(histogram.getByLabel(/^00 计数 10，/)).toBeVisible();
  await expect(histogram.getByLabel(/^11 计数 3，/)).toBeVisible();

  await timeline.fill('4700');
  await expect(occupancy).toHaveAttribute('data-decision', 'pending');
  await expect(page.getByTestId('machine-occupancy-initial')).toHaveCount(0);
  await expect(page.getByTestId('machine-occupancy-recheck')).toHaveCount(0);
  await expect(page.getByTestId('machine-attempts')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('machine-rejected')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('machine-shots')).toHaveAttribute('data-completed-shots', '0');
});
