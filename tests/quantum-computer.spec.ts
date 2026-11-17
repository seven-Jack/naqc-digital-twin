import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('整机演示逐阶段执行 GHZ 电路并以 X 基读出', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');

  const fullTitle = '中性原子量子计算机整机数字孪生';
  await expect(page).toHaveTitle(fullTitle);
  await expect(page.getByRole('heading', { level: 1, name: fullTitle, exact: true })).toBeVisible();
  await expect(page.getByText('Neutral-Atom Quantum Computer Digital Twin', { exact: true })).toBeVisible();
  await expect(page.getByTestId('quantum-scene-canvas')).toBeVisible();
  const ghz = page.getByRole('button', { name: /GHZ/ });
  await ghz.click();
  await expect(ghz).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('1024');
  await page.getByLabel('测量基', { exact: true }).selectOption('X');
  await page.getByRole('slider', { name: '单比特读出翻转' }).fill('0');

  const stage = page.getByTestId('machine-stage');
  const step = page.getByRole('button', { name: '下一阶段', exact: true });
  const shots = page.getByTestId('machine-shots');
  await expect(stage).toHaveAttribute('data-stage-id', 'cooling');
  await expect(shots).toHaveAttribute('data-completed-shots', '0');
  for (const id of ['loading', 'rearrangement', 'preparation', 'transfer', 'gates', 'analysis', 'return', 'readout']) {
    await step.click();
    await expect(stage).toHaveAttribute('data-stage-id', id);
  }
  await expect(page.getByTestId('machine-loaded-count')).toBeVisible();
  await page.getByRole('button', { name: '继续演示', exact: true }).click();
  await expect(shots).toHaveAttribute('data-completed-shots', '1024', { timeout: 15_000 });

  const results = page.getByTestId('machine-results');
  const histogram = results.getByLabel('X 基测量直方图');
  let histogramTotal = 0;
  for (const bitstring of ['000', '001', '010', '011', '100', '101', '110', '111']) {
    const bar = histogram.getByLabel(new RegExp(`^${bitstring} 计数`));
    await expect(bar).toBeVisible();
    const label = await bar.getAttribute('aria-label');
    const count = Number(label?.match(/计数 (\d+)/)?.[1]);
    const evenParity = bitstring.replace(/0/g, '').length % 2 === 0;
    expect(count > 0).toBe(evenParity);
    histogramTotal += count;
  }
  expect(histogramTotal).toBe(1024);
  await expect(results.getByText('1.000', { exact: true })).toBeVisible();

  const pending = page.waitForEvent('download');
  await results.getByRole('button', { name: '导出运行数据' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('neutral-atom-ghz-171.json');
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(saved.kind).toBe('neutral-atom-quantum-computer-simulation');
  expect(saved.modelVersion).toBe(2);
  expect(saved.config.circuit).toBe('ghz');
  expect(saved.config.basis).toBe('X');
  expect(saved.attemptedShots).toBe(1024);
  expect(saved.rejectedShots + saved.lostShots + saved.completedShots).toBe(1024);
  expect(saved.attempts).toHaveLength(1024);
  expect(saved.completedShots).toBe(1024);
  expect(saved.samples).toHaveLength(1024);

  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(stage).toHaveAttribute('data-stage-id', 'cooling');
  await expect(shots).toHaveAttribute('data-completed-shots', '0');
  expect(errors).toEqual([]);
});

test('独立统计未填满和末端丢失，首轮失败仍可采集有效位串', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('单阱装载概率', { exact: true }).fill('0.02');
  await page.getByLabel('单原子丢失概率', { exact: true }).fill('0.31');
  await page.getByRole('button', { name: /荧光读出 09/ }).click();
  await expect(page.getByText('第 1 次尝试重排后仍有空位，跳过该次的制备、门和读出。')).toBeVisible();
  await page.getByRole('button', { name: '下一阶段', exact: true }).click();
  await expect(page.getByTestId('machine-attempts')).toHaveAttribute('data-count', '256');

  const rejected = Number(await page.getByTestId('machine-rejected').getAttribute('data-count'));
  const lost = Number(await page.getByTestId('machine-lost').getAttribute('data-count'));
  const measured = Number(await page.getByTestId('machine-shots').getAttribute('data-completed-shots'));
  expect(rejected).toBeGreaterThan(0);
  expect(lost).toBeGreaterThan(0);
  expect(measured).toBeGreaterThan(0);
  expect(rejected + lost + measured).toBe(256);
  await expect(page.getByText(/^第 1 次位串/)).toHaveCount(0);

  await page.getByRole('button', { name: '真机实验依据' }).click();
  await expect(page.getByRole('heading', { name: '真机实验依据' })).toBeFocused();
  await expect(page.getByRole('link', { name: /Muniz 等/ })).toHaveAttribute('href', 'https://doi.org/10.1103/PRXQuantum.6.020334');
});

test('播放可暂停，且三维视图可切换与复位', async ({ page }) => {
  await page.goto('/');
  const time = page.getByRole('slider', { name: '演示时间轴' });
  await page.getByRole('button', { name: '启动演示', exact: true }).click();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pausedTime = await time.inputValue();
  await expect(page.getByRole('button', { name: '继续演示', exact: true })).toBeVisible();

  const scene = page.getByTestId('quantum-scene');
  const canvas = scene.getByTestId('quantum-scene-canvas');
  const wholeMachine = await canvas.screenshot({ animations: 'disabled' });
  await scene.getByRole('button', { name: '阵列视图', exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot({ animations: 'disabled' })).equals(wholeMachine)).toBe(false);
  await scene.getByRole('button', { name: '重置视角', exact: true }).click();
  await scene.getByRole('button', { name: '整机视图', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(time).toHaveValue(pausedTime);
});

test('移动端可操作整机界面并切换钟跃迁子系统', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('quantum-scene')).toBeVisible();
  const pageWidth = await page.evaluate(() => ({ view: window.innerWidth, content: document.documentElement.scrollWidth }));
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.view);

  await page.getByRole('link', { name: '钟跃迁子系统' }).click();
  await expect(page).toHaveURL(/#clock$/);
  await expect(page.getByRole('heading', { name: '钟跃迁模拟器' })).toBeVisible();
  await page.getByRole('link', { name: '返回整机演示' }).click();
  await expect(page).toHaveTitle('中性原子量子计算机整机数字孪生');
});
