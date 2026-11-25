import { expect, test } from '@playwright/test';

test('Bell 设备检查与三维共享当前帧，从证据返回后可继续读出及回退', async ({ page }) => {
  await page.goto('/#machine');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('64');
  await page.getByRole('slider', { name: '单比特读出翻转' }).fill('0');
  const timeline = page.getByRole('slider', { name: '演示时间轴' });
  const scene = page.getByTestId('quantum-scene');
  const canvas = page.getByTestId('quantum-scene-canvas');
  const inspector = page.getByRole('region', { name: '当前阶段设备' });
  const observation = inspector.getByTestId('inspector-observation');
  const evidence = inspector.getByRole('link', { name: '查看实验依据' });
  const completed = page.getByTestId('machine-shots');

  await timeline.fill('7730');
  await expect(canvas).toHaveAttribute('data-active-path', 'rydberg');
  const gateOptics = '301.9 nm · Rydberg 条件相位';
  await expect(scene.getByText(gateOptics, { exact: true })).toBeVisible();
  await expect(inspector.getByTestId('inspector-optics')).toHaveText(gateOptics);
  await expect(observation).toHaveText('本轮尚无观测');

  await evidence.click();
  await expect(page.getByRole('heading', { name: '真机实验依据' })).toBeFocused();
  await page.goBack();
  await expect(timeline).toHaveValue('7730');
  await expect(canvas).toHaveAttribute('data-stage', 'gates');
  await expect(inspector.getByTestId('inspector-optics')).toHaveText(gateOptics);
  await expect(page.getByLabel('尝试次数', { exact: true })).toHaveValue('64');

  await page.getByRole('button', { name: '批次末帧', exact: true }).click();
  await expect(completed).toHaveAttribute('data-completed-shots', '64');
  await expect(canvas).toHaveAttribute('data-fluorescence', '11');
  await expect(observation).toHaveText('荧光位串 11');
  await timeline.fill('7730');
  await expect(completed).toHaveAttribute('data-completed-shots', '0');
  await expect(canvas).not.toHaveAttribute('data-fluorescence');
  await expect(observation).toHaveText('本轮尚无观测');
});

test('旧工作区和补偿演示链接均进入整机，保留其他参数和设备深链', async ({ page }) => {
  for (const old of ['#clock', '#optical-controls', '#research-models', '#senoo/rabi', '#evidence/control?kind=comparison', '?demo=compensation']) {
    await page.goto('/' + old);
    await expect(page).toHaveURL(/\/#machine$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('中性原子量子计算机整机数字孪生');
    await expect(page.getByRole('navigation', { name: '整机导航' }).getByRole('link')).toHaveCount(4);
    await expect(page.locator('a[href^="#clock"], a[href^="#senoo"], a[href^="#evidence"]')).toHaveCount(0);
    await expect(page.getByTestId('senoo-readout-source')).toHaveCount(0);
    await expect(page.getByTestId('senoo-population-source')).toHaveCount(0);
  }
  await page.goto('/?demo=compensation&lang=zh#machine/equipment/aod');
  await expect(page).toHaveURL(/\/\?lang=zh#machine\/equipment\/aod$/);
  await expect(page.getByTestId('equipment-panel')).toHaveAttribute('data-module', 'aod');
});

test('窄屏可用键盘在整机的架构、配置和读出区之间导航', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/#machine/config');
  await expect(page.getByRole('region', { name: '运行配置' })).toBeFocused();
  const nav = page.getByRole('navigation', { name: '整机导航' });
  await nav.getByRole('link', { name: '运行配置' }).focus();
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link', { name: '批次读出' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '批次读出' })).toBeFocused();
  await expect(nav.getByRole('link', { name: '批次读出' })).toHaveAttribute('aria-current', 'location');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
