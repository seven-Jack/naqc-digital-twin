import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';

async function enter(page: Page, name: string, value: string) {
  const input = page.getByRole('textbox', { name: name + '数值', exact: true });
  await input.fill(value);
  await input.press('Enter');
}

async function readAttribute(page: Page, id: string, name: string) {
  return Number(await page.getByTestId(id).getAttribute(name));
}

async function frame(page: Page) {
  const canvas = page.getByTestId('scene-canvas');
  await expect(canvas).toBeVisible();
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return canvas.screenshot({ animations: 'disabled' });
}

test('T17–T20 and T22: orbit, pick an atom and link 3D geometry, trapping and compensation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '钟跃迁模拟器' })).toBeVisible();
  const canvas = page.getByTestId('scene-canvas');
  const original = await frame(page);
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.54, rect.y + rect.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.63, rect.y + rect.height * 0.61, { steps: 8 });
  await page.mouse.up();
  expect((await frame(page)).equals(original)).toBe(false);
  const rotated = await frame(page);
  await page.mouse.wheel(0, -400);
  expect((await frame(page)).equals(rotated)).toBe(false);
  await page.getByRole('button', { name: '重置视角' }).click();
  await frame(page);

  const camera = new PerspectiveCamera(38, rect.width / rect.height, 0.1, 300);
  camera.position.set(29, 27, 41);
  camera.lookAt(0, 1.55, 0);
  camera.updateMatrixWorld();
  const atom = new Vector3(6, 0, 0).project(camera);
  await page.mouse.click(rect.x + (atom.x + 1) / 2 * rect.width, rect.y + (1 - atom.y) / 2 * rect.height);
  await expect(page.getByLabel('所选位点')).toHaveValue('13');
  await expect(page.getByTestId('site-position')).toHaveText('C4 · (6, 0, 0) µm');

  const shift = await readAttribute(page, 'stark-shift', 'data-hz');
  const well = await readAttribute(page, 'three-host', 'data-ground-hz');
  const excitedWell = await readAttribute(page, 'three-host', 'data-excited-hz');
  const intensity = await readAttribute(page, 'three-host', 'data-intensity');
  const rabi = page.getByRole('img', { name: '拉比动力学' }).locator('path[data-series="excited"]');
  const priorPath = await rabi.getAttribute('d');
  const selected = await frame(page);
  await enter(page, '光镊功率', '2');
  expect((await frame(page)).equals(selected)).toBe(false);
  expect(await readAttribute(page, 'stark-shift', 'data-hz')).toBeCloseTo(2 * shift, 6);
  expect(await readAttribute(page, 'three-host', 'data-ground-hz')).toBeCloseTo(2 * well, 6);
  expect(await readAttribute(page, 'three-host', 'data-excited-hz')).toBeCloseTo(2 * excitedWell, 6);
  await expect(rabi).not.toHaveAttribute('d', priorPath!);
  const stronger = await frame(page);
  await enter(page, '束腰', '2');
  expect((await frame(page)).equals(stronger)).toBe(false);
  await expect(page.getByTestId('three-host')).toHaveAttribute('data-waist-um', '2');
  expect(await readAttribute(page, 'three-host', 'data-intensity')).toBeCloseTo(intensity / 2, 5);
  expect(await readAttribute(page, 'stark-shift', 'data-hz')).toBeCloseTo(shift / 2, 6);

  await page.getByRole('button', { name: '势阱', exact: true }).click();
  const both = await frame(page);
  await page.getByLabel('势阱显示').selectOption('difference');
  expect((await frame(page)).equals(both)).toBe(false);
  await page.getByLabel('势阱显示').selectOption('axial');
  await expect(page.getByLabel('势阱显示')).toHaveValue('axial');

  await enter(page, '拉比频率', '200');
  expect(await readAttribute(page, 'pi-time', 'data-us')).toBeCloseTo(2.5, 9);
  expect(await readAttribute(page, 'effective-detuning', 'data-hz')).toBeCloseTo(-shift / 2, 6);
  const beforeCompensation = await rabi.getAttribute('d');
  await page.getByRole('button', { name: '施加频率补偿' }).click();
  await expect(page.getByTestId('effective-detuning')).toHaveAttribute('data-hz', '0');
  await expect(page.getByTestId('max-population')).toHaveText('100.0%');
  await expect(rabi).not.toHaveAttribute('d', beforeCompensation!);
  expect(errors).toEqual([]);
});

test('T21: playback, chart cursor, Bloch sphere, phase and JSON export share the same time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始脉冲' }).click();
  await expect.poll(() => readAttribute(page, 'playback-time', 'data-seconds')).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const stopped = await readAttribute(page, 'playback-time', 'data-seconds');
  expect(stopped).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '继续' })).toBeVisible();
  await page.waitForTimeout(120);
  expect(await readAttribute(page, 'playback-time', 'data-seconds')).toBe(stopped);
  expect(await readAttribute(page, 'rabi-time-cursor', 'data-time-us')).toBeCloseTo(stopped * 1e6, 10);
  await page.getByRole('button', { name: '继续' }).click();
  await expect.poll(() => readAttribute(page, 'playback-time', 'data-seconds')).toBeGreaterThan(stopped);
  await page.getByRole('button', { name: '重置脉冲' }).click();
  await expect(page.getByTestId('excited-population')).toHaveText('0.0%');

  const time = page.getByRole('slider', { name: '脉冲时间', exact: true });
  await time.fill('0.000005');
  const detuned = Number((await page.getByTestId('excited-population').innerText()).replace('%', ''));
  expect(detuned).toBeLessThan(5);
  await page.getByRole('button', { name: '施加频率补偿' }).click();
  await time.fill('0.000005');
  await expect(page.getByTestId('excited-population')).toHaveText('100.0%');
  expect(await readAttribute(page, 'rabi-time-cursor', 'data-time-us')).toBeCloseTo(5, 10);
  await page.getByRole('button', { name: '布洛赫球', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '布洛赫球' });
  await expect(dialog.locator('canvas')).toBeVisible();
  const vector = JSON.parse((await page.getByTestId('bloch-vector').getAttribute('data-vector'))!);
  expect(vector.z).toBeCloseTo(-1, 12);
  await dialog.getByRole('slider').fill('0.000010');
  const returned = JSON.parse((await page.getByTestId('bloch-vector').getAttribute('data-vector'))!);
  expect(returned.z).toBeCloseTo(1, 12);
  await dialog.getByRole('button', { name: '关闭对话框' }).click();
  await expect(page.getByTestId('excited-population')).toHaveText('0.0%');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出数据' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('yb171-clock-C3.json');
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.evidence.atomicInputs).toBe('conditional_theory');
  expect(data.results.timeSeconds).toBeCloseTo(0.000010, 15);
  expect(data.results.deltaRadPerS).toBe(0);
  expect(data.results.laserOffsetHz).toBeCloseTo(data.results.starkHz, 8);
  expect(data.results.instantaneousState.bloch.z).toBeCloseTo(1, 12);
});

test('project card entry opens a 5 µs pulse at free-atom tuning', async ({ page }) => {
  await page.goto('/?demo=compensation');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveTitle('¹⁷¹Yb 钟跃迁数字孪生');
  await expect(page.getByRole('button', { name: '频率补偿', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('激光调谐', { exact: true })).toHaveValue('free');
  await expect(page.getByLabel('脉冲时长数值')).toHaveValue('5.00');
  const time = page.getByRole('slider', { name: '脉冲时间', exact: true });
  await time.fill('0.000005');
  await expect(page.getByTestId('excited-population')).toHaveText('4.0%');
  await page.getByRole('button', { name: '施加频率补偿' }).click();
  await time.fill('0.000005');
  await expect(page.getByTestId('effective-detuning')).toHaveAttribute('data-hz', '0');
  await expect(page.getByTestId('excited-population')).toHaveText('100.0%');
});

test('T23–T24: presets, supported bounds, laser off, refresh, reset and Showcase', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '光镊俘获', exact: true }).click();
  await expect(page.getByLabel('势阱显示')).toHaveValue('both');
  await page.getByRole('button', { name: '频率补偿', exact: true }).click();
  await expect(page.getByLabel('激光调谐', { exact: true })).toHaveValue('free');
  await expect(page.getByLabel('脉冲时长数值')).toHaveValue('5.00');
  await page.getByRole('button', { name: '施加频率补偿' }).click();
  await expect(page.getByLabel('激光调谐', { exact: true })).toHaveValue('compensated');
  await page.getByRole('button', { name: '拉比振荡', exact: true }).click();
  await expect(page.getByLabel('脉冲时长数值')).toHaveValue('20.00');
  await page.getByRole('button', { name: '钟跃迁失谐', exact: true }).click();
  await expect(page.getByLabel('激光调谐', { exact: true })).toHaveValue('free');
  await enter(page, '光镊功率', 'Infinity');
  await expect(page.getByRole('alert')).toContainText('请输入');
  await expect(page.getByLabel('光镊功率数值')).toHaveValue('1.00');
  await enter(page, '光镊功率', '5');
  await enter(page, '束腰', '0.6');
  await enter(page, '拉比频率', '1');
  await enter(page, '脉冲时长', '4000');
  await expect(page.getByRole('img', { name: '拉比动力学' }).locator('path[data-series="excited"]')).toBeVisible();
  await expect(page.getByText('Pₑ · 当前调谐上限', { exact: true })).toBeVisible();
  await page.getByLabel('启用方波脉冲驱动').uncheck();
  await expect(page.getByTestId('max-population')).toHaveText('0.0%');
  await expect(page.locator('main')).not.toContainText(/\bNaN\b|\bInfinity\b/);
  await page.getByRole('button', { name: '重置参数' }).click();
  await expect(page.getByLabel('光镊功率数值')).toHaveValue('1.00');
  await expect(page.getByLabel('启用方波脉冲驱动')).toBeChecked();
  await enter(page, '束腰', '1.5');
  await page.reload();
  await expect(page.getByLabel('束腰数值')).toHaveValue('1.00');
  await page.getByRole('button', { name: '展示', exact: true }).click();
  await expect(page.getByRole('button', { name: '展示', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: '参数控制' })).toBeHidden();
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await page.getByRole('button', { name: '研究', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '参数控制' })).toBeVisible();
  await page.getByRole('button', { name: '模型说明', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '模型说明' })).toContainText('¹⁷¹Yb 的完整标准不确定度仍待确定');
});
