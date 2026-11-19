import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const synthetic = fileURLToPath(new URL('./fixtures/senoo-readout-synthetic.xlsx', import.meta.url));

test('Senoo XLSX 逐轮回放同步记录时标、光路、双帧和原判决', async ({ page }) => {
  await page.goto('/#senoo');
  const importer = page.getByTestId('senoo-measurement-import');
  const input = importer.getByLabel('导入实测 XLSX', { exact: true });
  const selector = importer.getByRole('spinbutton', { name: '实测记录序号', exact: true });
  const calibration = importer.getByTestId('senoo-measurement-batch').filter({ hasText: 'SYN-CAL' });
  const replay = page.getByTestId('senoo-measurement-replay');
  const totals = replay.getByTestId('senoo-measurement-replay-totals');
  const timeline = replay.getByRole('slider');
  const scene = replay.getByTestId('senoo-optical-scene');
  const image1 = replay.getByTestId('senoo-measurement-replay-frame-1');
  const image2 = replay.getByTestId('senoo-measurement-replay-frame-2');
  const verdict = replay.getByTestId('senoo-measurement-replay-verdict');
  const next = replay.getByRole('button', { name: '下一步', exact: true });
  const previous = replay.getByRole('button', { name: '上一步', exact: true });

  async function seek(timeUs: number) {
    await timeline.fill(String(timeUs));
    await expect(timeline).toHaveValue(String(timeUs));
    await expect(replay).toHaveAttribute('data-position-us', String(timeUs));
  }

  async function expectTotals(attempt: string[]) {
    await expect(calibration).toHaveAttribute('data-source-kind', 'synthetic');
    await expect(calibration.getByRole('cell')).toHaveText(['标定批次', '合成数据', '3', '5', '4', '3', '3', '1', '2', '0', '0']);
    await expect(totals.getByRole('row', { name: /^当前尝试/ }).getByRole('cell')).toHaveText(attempt);
    await expect(totals.getByRole('row', { name: /^整批/ }).getByRole('cell')).toHaveText(['5', '4', '3', '3']);
  }

  await input.setInputFiles(synthetic);
  const filename = importer.getByTestId('senoo-measurement-filename');
  await expect(filename).toContainText('senoo-readout-synthetic.xlsx');
  await expect(scene).toHaveAttribute('data-mode', 'webgl');
  await expect(scene.locator('canvas')).toBeVisible();
  await expectTotals(['3', '3', '3', '3']);

  await test.step('正常双曝光，照明、曝光、计数和判决按各自时标出现', async () => {
    await expect(replay).toHaveAttribute('data-attempt-id', '0001');
    await expect(replay).toHaveAttribute('data-site-id', '01');
    await seek(1100);
    await expect(scene).toHaveAttribute('data-active-channels', /\bclock\b/);
    await expect(image1).toHaveAttribute('data-state', 'pending');
    await seek(1131);
    await expect(scene).toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(scene).not.toHaveAttribute('data-active-channels', /\bfluorescence\b/);
    await expect(image1).toHaveAttribute('data-state', 'exposing');
    await seek(1140);
    await expect(scene).toHaveAttribute('data-active-channels', /\bfluorescence\b/);
    await expect(scene).toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(image1).not.toContainText('74 counts');
    await seek(1185);
    await expect(scene).not.toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(image1).toHaveAttribute('data-state', 'waiting-count');
    await seek(1190);
    await expect(image1).toHaveAttribute('data-state', 'available');
    await expect(image1).toContainText('74 counts');
    await expect(image2).toHaveAttribute('data-state', 'pending');
    await next.click();
    await expect(replay).toHaveAttribute('data-position-us', '1210');
    await expect(scene).toHaveAttribute('data-active-channels', /\braman\b/);
    await seek(1269);
    await expect(scene).toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(scene).toHaveAttribute('data-active-channels', /\bfluorescence\b/);
    await expect(image2).toHaveAttribute('data-state', 'exposing');
    await seek(1325);
    await expect(image1).toContainText('74 counts');
    await expect(image2).toContainText('12 counts');
    await expect(verdict).toHaveAttribute('data-state', 'pending');
    await seek(1340);
    await expect(verdict).toHaveAttribute('data-state', 'recorded');
    await expect(verdict).toContainText('m₁');
    await seek(1140);
    await expect(scene).toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(image1).toHaveAttribute('data-state', 'exposing');
    await expect(image1).not.toContainText('74 counts');
    await expect(image2).not.toContainText('12 counts');
    await expect(verdict).toHaveAttribute('data-state', 'pending');
    await selector.fill('2');
    await seek(1190);
    await expect(replay).toHaveAttribute('data-site-id', '02');
    await expect(image1.getByText('0 counts', { exact: true })).toBeVisible();
    await expectTotals(['3', '3', '3', '3']);
  });

  await test.step('缺帧不会产生第二帧计数或判决', async () => {
    await selector.fill('4');
    await expect(replay).toHaveAttribute('data-attempt-id', '0002');
    await seek(2140);
    await expect(scene).toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(scene).toHaveAttribute('data-active-channels', /\bfluorescence\b/);
    await expect(image1).not.toContainText('18 counts');
    await seek(2190);
    await expect(scene).not.toHaveAttribute('data-active-channels', /\b(camera|fluorescence)\b/);
    await expect(image1).toContainText('18 counts');
    await expect(image2).toHaveAttribute('data-state', 'pending');
    await expect(verdict).toHaveAttribute('data-state', 'pending');
    await next.click();
    await expect(replay).toHaveAttribute('data-position-us', '');
    await expect(image2).toHaveAttribute('data-state', 'missing');
    await expect(image2).toContainText('缺帧');
    await expect(verdict).toHaveAttribute('data-state', 'not_available');
    await expect(scene).not.toHaveAttribute('data-active-channels', /\b(camera|fluorescence)\b/);
    await expectTotals(['1', '1', '0', '0']);
    await previous.click();
    await expect(replay).toHaveAttribute('data-position-us', '2190');
    await expect(image2).toHaveAttribute('data-state', 'pending');
    await expect(verdict).toHaveAttribute('data-state', 'pending');
    await seek(2140);
    await expect(image1).not.toContainText('18 counts');
    await expectTotals(['1', '1', '0', '0']);
  });

  await test.step('制备失败时两帧跳过，回退不会触发曝光', async () => {
    await selector.fill('5');
    await expect(replay).toHaveAttribute('data-attempt-id', '0003');
    await seek(3060);
    await expect(image1).toHaveAttribute('data-state', 'pending');
    await expect(image2).toHaveAttribute('data-state', 'pending');
    await next.click();
    await expect(replay).toHaveAttribute('data-position-us', '');
    await expect(image1).toHaveAttribute('data-state', 'skipped');
    await expect(image2).toHaveAttribute('data-state', 'skipped');
    await expect(image1).toContainText('跳过');
    await expect(image2).toContainText('跳过');
    await expect(verdict).toHaveAttribute('data-state', 'not_available');
    await expect(scene).not.toHaveAttribute('data-active-channels', /\b(camera|fluorescence|clock|raman)\b/);
    await expectTotals(['1', '0', '0', '0']);
    await previous.click();
    await expect(replay).toHaveAttribute('data-position-us', '3060');
    await expect(image1).toHaveAttribute('data-state', 'pending');
    await expect(image2).toHaveAttribute('data-state', 'pending');
    await seek(3040);
    await expect(scene).not.toHaveAttribute('data-active-channels', /\b(camera|fluorescence|clock|raman)\b/);
    await expectTotals(['1', '0', '0', '0']);
  });

  await test.step('重新导入相同内容可恢复选中的尝试、回放时刻和批次分母', async () => {
    await selector.fill('4');
    await seek(2140);
    await page.setViewportSize({ width: 390, height: 844 });
    await input.setInputFiles({
      name: 'senoo-readout-synthetic-reimport.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await readFile(synthetic),
    });
    await expect(filename).toContainText('senoo-readout-synthetic-reimport.xlsx');
    await expect(selector).toHaveValue('4');
    await expect(replay).toHaveAttribute('data-attempt-id', '0002');
    await expect(replay).toHaveAttribute('data-position-us', '2140');
    await expect(timeline).toHaveValue('2140');
    await expect(scene).toHaveAttribute('data-active-channels', /\bcamera\b/);
    await expect(scene).toHaveAttribute('data-active-channels', /\bfluorescence\b/);
    await expect(image1).toHaveAttribute('data-state', 'exposing');
    await expect(verdict).toHaveAttribute('data-state', 'pending');
    await expectTotals(['1', '1', '0', '0']);
    await selector.fill('1');
    await seek(1140);
    await expect(scene).toHaveAttribute('data-active-channels', /\bfluorescence\b/);
    await expect(image1).not.toContainText('74 counts');
    await seek(1340);
    await expect(image1).toContainText('74 counts');
    await expect(image2).toContainText('12 counts');
    await expect(verdict).toContainText('m₁');
    await expectTotals(['3', '3', '3', '3']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
