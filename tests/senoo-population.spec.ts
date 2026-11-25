import { expect, test } from '@playwright/test';

test('Senoo 布居图的样本选择保留两条曲线的源值和上下误差', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#sources');
  const panel = page.getByTestId('senoo-population-source');
  const plot = panel.getByRole('img', { name: '带丢失检测的 m₁ 与 r₀ 布居观测及上下误差' });
  await expect(plot.locator('circle.sr-point')).toHaveCount(160);

  const index = panel.getByRole('spinbutton', { name: 'Senoo 布居采样点序号' });
  const sample = panel.getByTestId('senoo-population-sample');
  await expect(sample).toContainText('0.01 µs');
  await expect(sample).toContainText('Fig2c_right_blue!B2:B5');
  await expect(sample).toContainText('0.00974600445279483');
  await expect(sample).toContainText('0.00654660357878045');

  await index.fill('40');
  await expect(sample).toContainText('0.498734177215189 µs');
  await expect(sample).toContainText('Fig2c_right_blue!AO2:AO5');
  await expect(sample).toContainText('Fig2c_right_red!AO2:AO5');
  await expect(sample).toContainText('0.00581395348837209');
  await expect(sample).toContainText('0.994186046511627');

  await index.fill('80');
  await expect(sample).toContainText('Fig2c_right_red!CC2:CC5');
  await expect(panel.getByRole('link', { name: /图 2c 右图源数据/ }))
    .toHaveAttribute('href', 'https://doi.org/10.1038/s41567-026-03258-8');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
