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
  const evidence = inspector.getByRole('link', { name: '查看子系统依据' });
  const completed = page.getByTestId('machine-shots');

  await timeline.fill('7730');
  await expect(canvas).toHaveAttribute('data-active-path', 'rydberg');
  const gateOptics = '302 nm · Rydberg 条件相位';
  await expect(scene.getByText(gateOptics, { exact: true })).toBeVisible();
  await expect(inspector.getByTestId('inspector-optics')).toHaveText(gateOptics);
  await expect(observation).toHaveText('本轮尚无观测');
  await expect(evidence).toHaveAttribute('href', '#evidence/control');

  await evidence.click();
  await expect(page.getByTestId('twin-evidence-detail')).toHaveAttribute('data-subsystem', 'control');
  await page.goBack();
  await expect(timeline).toHaveValue('7730');
  await expect(canvas).toHaveAttribute('data-stage', 'gates');
  await expect(inspector.getByTestId('inspector-optics')).toHaveText(gateOptics);
  await expect(page.getByLabel('尝试次数', { exact: true })).toHaveValue('64');

  await page.getByRole('button', { name: '批次末帧', exact: true }).click();
  await expect(completed).toHaveAttribute('data-completed-shots', '64');
  await expect(canvas).toHaveAttribute('data-fluorescence', '11');
  await expect(observation).toHaveText('荧光位串 11');
  await expect(evidence).toHaveAttribute('href', '#evidence/readout');
  await timeline.fill('7730');
  await expect(completed).toHaveAttribute('data-completed-shots', '0');
  await expect(canvas).not.toHaveAttribute('data-fluorescence');
  await expect(observation).toHaveText('本轮尚无观测');
  await expect(evidence).toHaveAttribute('href', '#evidence/control');
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

test('窄屏可用键盘切换工作区，旧钟跃迁锚点和操作区可直接定位', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/#optical-controls');
  await expect(page.locator('#optical-controls')).toBeFocused();
  const navigation = page.getByRole('navigation', { name: '工作区导航' });
  const machine = navigation.getByRole('link', { name: '返回整机演示' });
  await machine.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#machine$/);
  const configLink = page.getByRole('navigation', { name: '本次运行' }).getByRole('link', { name: '配置电路' });
  await configLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '运行配置', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/#machine\/config$/);

  const clock = navigation.getByRole('link', { name: '钟跃迁子系统' });
  const evidence = navigation.getByRole('link', { name: '整机证据' });
  await clock.focus();
  await page.keyboard.press('Tab');
  await expect(evidence).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#evidence$/);
  await expect(page.getByTestId('twin-evidence-detail')).toBeVisible();
  await expect(navigation.getByRole('link', { name: '整机证据' })).toHaveAttribute('aria-current', 'page');
  const fitsWidth = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsWidth).toBe(true);

  await page.goto('/#research-models');
  await expect(page.locator('#research-models')).toBeFocused();
});
