import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const rToMPoint = 'Fig2f_left_bottom!D2:D5';
const metastablePoint = 'Fig2f_right_top!T2:T5';
const clockPoint = 'Fig2f_right_bottom!AF2:AF5';

test('图 2f 同步两位点、协议时轴和各阶段观测，并在导入时恢复源点', async ({ page }) => {
  await page.goto('/#senoo');
  await page.getByRole('button', { name: '图 2f 阻塞 Bell 映射', exact: true }).click();
  const replay = page.getByTestId('senoo-pxp-replay');
  const scene = replay.getByTestId('senoo-optical-scene');
  const observations = replay.getByTestId('senoo-pxp-observations');
  const timeline = replay.getByRole('slider', { name: '图 2f 协议时间轴' });
  const inspect = observations.getByRole('combobox', { name: '图 2f 数据点' });
  const next = replay.getByRole('button', { name: '下一步', exact: true });
  const previous = replay.getByRole('button', { name: '上一步', exact: true });

  await expect(replay).toHaveAttribute('data-stage', 'pxp');
  await expect(scene).toHaveAttribute('data-site-count', '2');
  await expect(scene).toHaveAttribute('data-mode', 'webgl');
  await expect(scene.locator('canvas')).toBeVisible();
  await expect(scene).toHaveAttribute('data-state', 'rydberg-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'rydberg');
  await expect(timeline).toHaveValue('0');
  await expect(previous).toBeDisabled();
  await expect(observations).toContainText('公开布居从 r→m 映射后开始');
  await expect(replay.getByTestId('senoo-pxp-time-status')).toHaveText('实际时标待测');

  await next.click();
  await expect(replay).toHaveAttribute('data-stage', 'r-to-m');
  await expect(timeline).toHaveValue('1');
  await expect(scene).toHaveAttribute('data-state', 'metastable-odd-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'raman rydberg');
  await expect(inspect.locator('option')).toHaveCount(4);
  await expect(observations.getByTestId('senoo-pxp-parity-chart')).toHaveCount(0);
  await inspect.selectOption(rToMPoint);
  await expect(observations.getByTestId('senoo-pxp-inferred-count')).toHaveText('1551 / 3154');

  await next.click();
  await expect(timeline).toHaveValue('2');
  await expect(scene).toHaveAttribute('data-state', 'metastable-even-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'raman');
  await expect(observations.getByTestId('senoo-pxp-parity-chart')).toBeVisible();
  await expect(inspect.locator('option')).toHaveCount(35);
  await inspect.selectOption(metastablePoint);
  await expect(observations.getByTestId('senoo-pxp-inferred-count')).toHaveText('77 / 146');

  await next.click();
  await expect(timeline).toHaveValue('3');
  await expect(next).toBeDisabled();
  await expect(scene).toHaveAttribute('data-state', 'clock-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'clock raman');
  await expect(inspect.locator('option')).toHaveCount(35);
  await inspect.selectOption(clockPoint);
  await expect(observations.getByTestId('senoo-pxp-inferred-count')).toHaveText('29 / 113');
  await expect(observations.getByTestId('senoo-pxp-error-lower')).toHaveText('0.0854948313839778');
  await expect(observations.getByTestId('senoo-pxp-error-upper')).toHaveText('0.0949147493778043');
  await expect(observations.getByTestId('senoo-pxp-selection')).toHaveText('丢失检测后');

  const downloadStarted = page.waitForEvent('download');
  await replay.getByRole('button', { name: '导出回放 JSON', exact: true }).click();
  const downloaded = await downloadStarted;
  const data = await readFile((await downloaded.path())!);
  expect(JSON.parse(data.toString())).toMatchObject({
    schema: 'senoo-fig2f-replay',
    version: 1,
    timebase: 'protocol-step',
    experimentalTimestampsS: null,
    selection: {
      stageId: 'm-to-o',
      pointIds: { 'r-to-m': rToMPoint, rotate: metastablePoint, 'm-to-o': clockPoint },
    },
  });

  await previous.click();
  await expect(timeline).toHaveValue('2');
  await expect(observations).toHaveAttribute('data-point-id', metastablePoint);
  await timeline.fill('1');
  await expect(scene).toHaveAttribute('data-state', 'metastable-odd-pair');
  await expect(observations).toHaveAttribute('data-point-id', rToMPoint);
  await previous.click();
  await expect(scene).toHaveAttribute('data-state', 'rydberg-pair');
  await expect(observations).toHaveAttribute('data-point-id', '');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '图 2b 双曝光读出', exact: true }).click();
  await page.getByLabel('导入回放 JSON', { exact: true }).setInputFiles({
    name: 'senoo-fig2f-replay.json', mimeType: 'application/json', buffer: data,
  });
  await expect(replay).toHaveAttribute('data-stage', 'm-to-o');
  await expect(timeline).toHaveValue('3');
  await expect(scene).toHaveAttribute('data-state', 'clock-pair');
  await expect(scene).toHaveAttribute('data-active-channels', 'clock raman');
  await expect(observations.getByTestId('senoo-pxp-source-cell')).toHaveText(clockPoint);
  await expect(observations.getByTestId('senoo-pxp-inferred-count')).toHaveText('29 / 113');
  await expect(replay.getByTestId('senoo-pxp-time-status')).toHaveText('实际时标待测');
  await previous.click();
  await expect(observations).toHaveAttribute('data-point-id', metastablePoint);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
