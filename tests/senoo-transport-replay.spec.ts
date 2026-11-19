import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const synthetic = fileURLToPath(new URL('./fixtures/senoo-transport-synthetic.json', import.meta.url));

test('装载与输运日志回放同步原始占位、轨迹、时标并恢复归档游标', async ({ page }, testInfo) => {
  await page.goto('/#senoo');
  const replay = page.getByTestId('senoo-transport-replay');
  const input = replay.getByLabel('导入装载与输运 JSON', { exact: true });
  const selector = replay.getByLabel('选择输运轮次', { exact: true });
  const slider = replay.getByRole('slider', { name: '装载与输运时间轴', exact: true });
  const previous = replay.getByRole('button', { name: '上一步', exact: true });
  const next = replay.getByRole('button', { name: '下一步', exact: true });
  const scene = replay.getByTestId('senoo-transport-scene');
  const statistics = replay.getByTestId('senoo-transport-statistics');

  async function seek(timeS: number) {
    await slider.fill(String(timeS));
    await expect(replay).toHaveAttribute('data-position-s', String(timeS));
  }

  await input.setInputFiles(synthetic);
  await expect(replay).toHaveAttribute('data-attempt-id', 'assembled');
  await expect(scene.locator('canvas')).toBeVisible();
  await expect(statistics.locator('[data-metric="loading"]')).toContainText('6 / 10');
  await expect(statistics.locator('[data-metric="assembly"]')).toContainText('1 / 3');
  await expect(statistics.locator('[data-metric="survival"]')).toContainText('1 / 2');
  await seek(0.002);
  await expect(scene).toHaveAttribute('data-occupied', '2');
  await expect(scene).toHaveAttribute('data-occupied-site-ids', 'T1 R1');
  await expect(scene).not.toHaveAttribute('data-active-track', /tracked-A2/);
  await seek(0.005);
  await expect(scene).toHaveAttribute('data-active-track', 'tracked-A2');
  await next.click();
  await expect(replay).toHaveAttribute('data-position-s', '0.006');
  await previous.click();
  await expect(scene).toHaveAttribute('data-active-track', 'tracked-A2');
  await seek(0.009);
  await expect(replay).toHaveAttribute('data-assembly', 'complete');
  await expect(scene).toHaveAttribute('data-occupied', '2');
  await expect(scene).toHaveAttribute('data-occupied-site-ids', 'T1 T2');
  await expect(scene).not.toHaveAttribute('data-active-track', /tracked-A2/);
  await seek(0.005);
  await expect(scene).toHaveAttribute('data-active-track', 'tracked-A2');
  await expect(replay).not.toHaveAttribute('data-assembly', 'complete');

  const exported = page.waitForEvent('download');
  await replay.getByRole('button', { name: '导出装载与输运回放 JSON', exact: true }).click();
  const archive = testInfo.outputPath('transport-record.json');
  await (await exported).saveAs(archive);

  await selector.selectOption('incomplete');
  await expect(replay).toHaveAttribute('data-attempt-id', 'incomplete');
  await seek(0.105);
  await expect(scene).not.toHaveAttribute('data-active-track', /command-B2/);
  await expect(replay.getByRole('list', { name: '已开始的搬运' })).toContainText('指令路径');
  await seek(0.109);
  await expect(replay).toHaveAttribute('data-assembly', 'incomplete');

  await selector.selectOption('missing-final');
  await seek(0.210);
  await expect(replay).toHaveAttribute('data-assembly', 'unknown');
  await input.setInputFiles({
    name: 'transport-reimport.json', mimeType: 'application/json', buffer: await readFile(synthetic),
  });
  await expect(replay).toContainText('transport-reimport.json');
  await expect(replay).toHaveAttribute('data-attempt-id', 'missing-final');
  await expect(replay).toHaveAttribute('data-position-s', '0.21');

  await selector.selectOption('skipped');
  await seek(0.310);
  await expect(replay).toHaveAttribute('data-attempt-id', 'skipped');
  await expect(scene).not.toHaveAttribute('data-active-track', /.+/);
  await page.setViewportSize({ width: 390, height: 844 });
  await input.setInputFiles(archive);
  await expect(replay).toHaveAttribute('data-attempt-id', 'assembled');
  await expect(replay).toHaveAttribute('data-position-s', '0.005');
  await expect(scene).toHaveAttribute('data-active-track', 'tracked-A2');
  await expect(statistics.locator('[data-metric="survival"]')).toContainText('1 / 2');

  await input.setInputFiles({
    name: 'invalid-transport.json', mimeType: 'application/json', buffer: Buffer.from('invalid'),
  });
  await expect(replay.getByRole('alert')).toBeVisible();
  await expect(replay).toHaveAttribute('data-position-s', '0.005');
  await expect(scene).toHaveAttribute('data-active-track', 'tracked-A2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
