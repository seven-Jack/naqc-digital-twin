import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Senoo 双曝光回放按步骤联动光路、源表计数和判决', async ({ page }) => {
  await page.goto('/#machine');
  await page.getByRole('link', { name: 'Senoo 装置', exact: true }).click();
  await expect(page).toHaveURL(/#senoo$/);
  await page.getByLabel('文献制备组', { exact: true }).selectOption('spin0');
  await page.getByRole('spinbutton', { name: '图 2b 样本序号', exact: true }).fill('129');

  const stage = page.getByTestId('senoo-apparatus-stage');
  const scene = page.getByTestId('senoo-optical-scene');
  const first = page.getByTestId('senoo-replay-first-count');
  const second = page.getByTestId('senoo-replay-second-count');
  const outcome = page.getByTestId('senoo-replay-outcome');
  const image1 = page.getByRole('button', { name: /第一次曝光/ });
  const rotate = page.getByRole('button', { name: /亚稳态翻转/ });
  const image2 = page.getByRole('button', { name: /第二次曝光/ });
  const decide = page.getByRole('button', { name: /双帧判决/ });

  await image1.click();
  await expect(stage).toHaveAttribute('data-stage', 'image-1');
  await expect(scene).toHaveAttribute('data-state', 'm0');
  await expect(scene).toHaveAttribute('data-active-channels', 'tweezer fluorescence camera');
  await expect(first).toContainText('—');
  await expect(second).toContainText('—');
  await expect(outcome).toHaveAttribute('data-outcome', 'pending');

  await rotate.click();
  await expect(stage).toHaveAttribute('data-stage', 'rotate');
  await expect(first).toContainText('20.17751863 counts');
  await expect(second).toContainText('—');

  await image2.click();
  await expect(stage).toHaveAttribute('data-stage', 'image-2');
  await expect(scene).toHaveAttribute('data-state', 'g0');
  await expect(scene).toHaveAttribute('data-active-channels', 'tweezer fluorescence camera');
  await expect(second).toContainText('—');
  await expect(outcome).toHaveAttribute('data-outcome', 'pending');

  await decide.click();
  await expect(stage).toHaveAttribute('data-stage', 'decision');
  await expect(scene).toHaveAttribute('data-state', 'removed');
  await expect(second).toContainText('167.17751863 counts');
  await expect(outcome).toHaveAttribute('data-outcome', 'm0');
  await expect(page.locator('main')).toContainText('Fig2b_spin0');
  await expect(page.locator('main')).toContainText('DZ2');
  await expect(page.locator('main')).toContainText('DZ3');

  await image2.click();
  await expect(scene).toHaveAttribute('data-state', 'g0');
  await expect(first).toContainText('20.17751863 counts');
  await expect(second).toContainText('—');
  await expect(outcome).toHaveAttribute('data-outcome', 'pending');
  await image1.click();
  await expect(scene).toHaveAttribute('data-state', 'm0');
  await expect(first).toContainText('—');
  await decide.click();
  await expect(first).toContainText('20.17751863 counts');
  await expect(second).toContainText('167.17751863 counts');
  await expect(outcome).toHaveAttribute('data-outcome', 'm0');
});

test('移动端可导出并恢复 Senoo 回放位置和配对样本', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#machine');
  await page.getByRole('link', { name: 'Senoo 装置', exact: true }).click();
  await expect(page).toHaveURL(/#senoo$/);
  const group = page.getByLabel('文献制备组', { exact: true });
  const sample = page.getByRole('spinbutton', { name: '图 2b 样本序号', exact: true });
  const decide = page.getByRole('button', { name: /双帧判决/ });
  const first = page.getByTestId('senoo-replay-first-count');
  const second = page.getByTestId('senoo-replay-second-count');
  const outcome = page.getByTestId('senoo-replay-outcome');
  await expect(group).toHaveValue('spin1');
  await sample.fill('255');
  await decide.click();
  await expect(first).toContainText('86.67751863 counts');
  await expect(second).toContainText('26.17751863 counts');
  await expect(outcome).toHaveAttribute('data-outcome', 'm1');

  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出回放 JSON', exact: true }).click();
  const downloaded = await downloadStarted;
  const content = await readFile((await downloaded.path())!);
  expect(JSON.parse(content.toString())).toMatchObject({
    schema: 'senoo-literature-replay',
    version: 1,
    position: expect.any(Number),
    sample: {
      groupId: 'spin1',
      pointId: 'Fig2b_spin1:IV',
      sourceIndex: 254,
      sheet: 'Fig2b_spin1',
      cells: { first: 'IV2', second: 'IV3' },
      counts: { first: 86.67751863, second: 26.17751863 },
    },
  });

  await group.selectOption('loss');
  await sample.fill('1');
  await decide.click();
  await expect(page.getByTestId('senoo-optical-scene')).toHaveAttribute('data-state', 'empty');
  await expect(first).toContainText('19.67751863 counts');
  await expect(second).toContainText('19.67751863 counts');
  await expect(outcome).toHaveAttribute('data-outcome', 'no-atom');
  await page.getByRole('button', { name: /第一次曝光/ }).click();

  await page.getByLabel('导入回放 JSON', { exact: true }).setInputFiles({
    name: 'senoo-replay.json', mimeType: 'application/json', buffer: content,
  });
  await expect(group).toHaveValue('spin1');
  await expect(sample).toHaveValue('255');
  await expect(page.getByTestId('senoo-apparatus-stage')).toHaveAttribute('data-stage', 'decision');
  await expect(first).toContainText('86.67751863 counts');
  await expect(second).toContainText('26.17751863 counts');
  await expect(outcome).toHaveAttribute('data-outcome', 'm1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('link', { name: '整机演示', exact: true }).click();
  await expect(page).toHaveURL(/#machine$/);
  await expect(page.getByLabel('实验协议', { exact: true })).toHaveValue('standard');
});
