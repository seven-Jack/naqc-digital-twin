import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Senoo 双曝光回放按步骤联动光路、源表计数和判决', async ({ page }) => {
  await page.goto('/#senoo');
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
  await page.goto('/#senoo');
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
});

test('五个子系统可定位和筛选，文献深链与浏览器历史保留所选依据', async ({ page }) => {
  await page.goto('/#evidence');
  const systems = page.getByRole('navigation', { name: '整机子系统' });
  const detail = page.getByTestId('twin-evidence-detail');
  await expect(systems.getByRole('link')).toHaveCount(5);
  for (const id of ['array', 'transport', 'control', 'readout', 'bell']) {
    await systems.locator(`a[href="#evidence/${id}"]`).click();
    await expect(detail).toHaveAttribute('data-subsystem', id);
  }

  const kind = page.getByLabel('证据类型', { exact: true });
  await kind.selectOption('comparison');
  await expect(systems.getByRole('link')).toHaveCount(1);
  await expect(detail).toHaveAttribute('data-subsystem', 'transport');
  await expect(page).toHaveURL(/#evidence\/transport\?kind=comparison$/);
  const p19 = page.getByTestId('p19-holdout-evidence');
  await expect(p19).toBeVisible();
  const threshold = p19.getByLabel('P19 占位阈值');
  await threshold.selectOption('6500');
  await expect(threshold).toHaveValue('6500');
  await expect(p19.getByRole('row', { name: /Pic1/ })).toContainText('3,348–5,539');
  await expect(p19.getByRole('row', { name: /Pic2/ })).toContainText('3,319–5,407');
  await expect(p19).toContainText('0/7,200');
  await expect(p19).toContainText('不可估计');
  await page.reload();
  await expect(kind).toHaveValue('comparison');
  await expect(p19).toBeVisible();

  await kind.selectOption('all');
  await systems.locator('a[href="#evidence/control"]').click();
  await detail.getByRole('link', { name: '核对单原子 Rabi' }).click();
  await expect(page).toHaveURL(/#senoo\/rabi$/);
  await expect(page.getByTestId('senoo-rabi-characterization')).toBeVisible();
  await page.goBack();
  await expect(detail).toHaveAttribute('data-subsystem', 'control');
  await page.goForward();
  await expect(page.getByTestId('senoo-rabi-characterization')).toBeVisible();
});
