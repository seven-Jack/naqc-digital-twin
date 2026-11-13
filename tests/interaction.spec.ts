import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';

async function enter(page: Page, name: string, value: string) {
  const input = page.getByRole('textbox', { name: name + ' value', exact: true });
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
  await expect(page.getByRole('heading', { name: 'Clock transition simulator' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await frame(page);

  const camera = new PerspectiveCamera(38, rect.width / rect.height, 0.1, 300);
  camera.position.set(29, 27, 41);
  camera.lookAt(0, 1.55, 0);
  camera.updateMatrixWorld();
  const atom = new Vector3(6, 0, 0).project(camera);
  await page.mouse.click(rect.x + (atom.x + 1) / 2 * rect.width, rect.y + (1 - atom.y) / 2 * rect.height);
  await expect(page.getByLabel('Selected site')).toHaveValue('13');
  await expect(page.getByTestId('site-position')).toHaveText('C4 · (6, 0, 0) µm');

  const shift = await readAttribute(page, 'stark-shift', 'data-hz');
  const well = await readAttribute(page, 'three-host', 'data-ground-hz');
  const excitedWell = await readAttribute(page, 'three-host', 'data-excited-hz');
  const intensity = await readAttribute(page, 'three-host', 'data-intensity');
  const rabi = page.getByRole('img', { name: 'Rabi dynamics' }).locator('path[data-series="excited"]');
  const priorPath = await rabi.getAttribute('d');
  const selected = await frame(page);
  await enter(page, 'Tweezer power', '2');
  expect((await frame(page)).equals(selected)).toBe(false);
  expect(await readAttribute(page, 'stark-shift', 'data-hz')).toBeCloseTo(2 * shift, 6);
  expect(await readAttribute(page, 'three-host', 'data-ground-hz')).toBeCloseTo(2 * well, 6);
  expect(await readAttribute(page, 'three-host', 'data-excited-hz')).toBeCloseTo(2 * excitedWell, 6);
  await expect(rabi).not.toHaveAttribute('d', priorPath!);
  const stronger = await frame(page);
  await enter(page, 'Beam waist', '2');
  expect((await frame(page)).equals(stronger)).toBe(false);
  await expect(page.getByTestId('three-host')).toHaveAttribute('data-waist-um', '2');
  expect(await readAttribute(page, 'three-host', 'data-intensity')).toBeCloseTo(intensity / 2, 5);
  expect(await readAttribute(page, 'stark-shift', 'data-hz')).toBeCloseTo(shift / 2, 6);

  await page.getByRole('button', { name: 'Potentials', exact: true }).click();
  const both = await frame(page);
  await page.getByLabel('Potential display').selectOption('difference');
  expect((await frame(page)).equals(both)).toBe(false);
  await page.getByLabel('Potential display').selectOption('axial');
  await expect(page.getByLabel('Potential display')).toHaveValue('axial');

  await enter(page, 'Rabi frequency', '200');
  expect(await readAttribute(page, 'pi-time', 'data-us')).toBeCloseTo(2.5, 9);
  expect(await readAttribute(page, 'effective-detuning', 'data-hz')).toBeCloseTo(-shift / 2, 6);
  const beforeCompensation = await rabi.getAttribute('d');
  await page.getByRole('button', { name: 'Apply Compensation' }).click();
  await expect(page.getByTestId('effective-detuning')).toHaveAttribute('data-hz', '0');
  await expect(page.getByTestId('max-population')).toHaveText('100.0%');
  await expect(rabi).not.toHaveAttribute('d', beforeCompensation!);
  expect(errors).toEqual([]);
});

test('T21: playback, chart cursor, Bloch sphere, phase and JSON export share the same time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start pulse' }).click();
  await expect.poll(() => readAttribute(page, 'playback-time', 'data-seconds')).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const stopped = await readAttribute(page, 'playback-time', 'data-seconds');
  expect(stopped).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.waitForTimeout(120);
  expect(await readAttribute(page, 'playback-time', 'data-seconds')).toBe(stopped);
  expect(await readAttribute(page, 'rabi-time-cursor', 'data-time-us')).toBeCloseTo(stopped * 1e6, 10);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => readAttribute(page, 'playback-time', 'data-seconds')).toBeGreaterThan(stopped);
  await page.getByRole('button', { name: 'Reset pulse' }).click();
  await expect(page.getByTestId('excited-population')).toHaveText('0.0%');

  const time = page.getByRole('slider', { name: 'Pulse time', exact: true });
  await time.fill('0.000005');
  const detuned = Number((await page.getByTestId('excited-population').innerText()).replace('%', ''));
  expect(detuned).toBeLessThan(5);
  await page.getByRole('button', { name: 'Apply Compensation' }).click();
  await time.fill('0.000005');
  await expect(page.getByTestId('excited-population')).toHaveText('100.0%');
  expect(await readAttribute(page, 'rabi-time-cursor', 'data-time-us')).toBeCloseTo(5, 10);
  await page.getByRole('button', { name: 'Bloch sphere', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bloch sphere' });
  await expect(dialog.locator('canvas')).toBeVisible();
  const vector = JSON.parse((await page.getByTestId('bloch-vector').getAttribute('data-vector'))!);
  expect(vector.z).toBeCloseTo(-1, 12);
  await dialog.getByRole('slider').fill('0.000010');
  const returned = JSON.parse((await page.getByTestId('bloch-vector').getAttribute('data-vector'))!);
  expect(returned.z).toBeCloseTo(1, 12);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByTestId('excited-population')).toHaveText('0.0%');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
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
  await expect(page.getByRole('button', { name: 'Compensation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Laser tuning', { exact: true })).toHaveValue('free');
  await expect(page.getByLabel('Pulse duration value')).toHaveValue('5.00');
  const time = page.getByRole('slider', { name: 'Pulse time', exact: true });
  await time.fill('0.000005');
  await expect(page.getByTestId('excited-population')).toHaveText('4.0%');
  await page.getByRole('button', { name: 'Apply Compensation' }).click();
  await time.fill('0.000005');
  await expect(page.getByTestId('effective-detuning')).toHaveAttribute('data-hz', '0');
  await expect(page.getByTestId('excited-population')).toHaveText('100.0%');
});

test('T23–T24: presets, supported bounds, laser off, refresh, reset and Showcase', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Optical trapping', exact: true }).click();
  await expect(page.getByLabel('Potential display')).toHaveValue('both');
  await page.getByRole('button', { name: 'Compensation', exact: true }).click();
  await expect(page.getByLabel('Laser tuning', { exact: true })).toHaveValue('free');
  await expect(page.getByLabel('Pulse duration value')).toHaveValue('5.00');
  await page.getByRole('button', { name: 'Apply Compensation' }).click();
  await expect(page.getByLabel('Laser tuning', { exact: true })).toHaveValue('compensated');
  await page.getByRole('button', { name: 'Rabi oscillation', exact: true }).click();
  await expect(page.getByLabel('Pulse duration value')).toHaveValue('20.00');
  await page.getByRole('button', { name: 'Clock detuning', exact: true }).click();
  await expect(page.getByLabel('Laser tuning', { exact: true })).toHaveValue('free');
  await enter(page, 'Tweezer power', 'Infinity');
  await expect(page.getByRole('alert')).toContainText('Enter a value');
  await expect(page.getByLabel('Tweezer power value')).toHaveValue('1.00');
  await enter(page, 'Tweezer power', '5');
  await enter(page, 'Beam waist', '0.6');
  await enter(page, 'Rabi frequency', '1');
  await enter(page, 'Pulse duration', '4000');
  await expect(page.getByRole('img', { name: 'Rabi dynamics' }).locator('path[data-series="excited"]')).toBeVisible();
  await expect(page.getByText('Pₑ · active maximum', { exact: true })).toBeVisible();
  await page.getByLabel('Enable square-pulse drive').uncheck();
  await expect(page.getByTestId('max-population')).toHaveText('0.0%');
  await expect(page.locator('main')).not.toContainText(/\bNaN\b|\bInfinity\b/);
  await page.getByRole('button', { name: 'Reset parameters' }).click();
  await expect(page.getByLabel('Tweezer power value')).toHaveValue('1.00');
  await expect(page.getByLabel('Enable square-pulse drive')).toBeChecked();
  await enter(page, 'Beam waist', '1.5');
  await page.reload();
  await expect(page.getByLabel('Beam waist value')).toHaveValue('1.00');
  await page.getByRole('button', { name: 'Showcase', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Showcase', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: 'Controls' })).toBeHidden();
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Research', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Controls' })).toBeVisible();
  await page.getByRole('button', { name: 'Model info', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Model information' })).toContainText('full ¹⁷¹Yb uncertainty');
});
