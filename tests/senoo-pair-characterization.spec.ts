import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

function readRows(file: string) {
  return readFileSync(new URL(`../references/knowledge/data/${file}`, import.meta.url), 'utf8')
    .trimEnd().split(/\r?\n/).slice(1).map(row => row.split(','));
}

const shifts = readRows('senoo-ed5f-pair-shifts.csv');
const blockadePoints = readRows('senoo-ed4f-blockade-rabi.csv');
const diagnostics = readRows('senoo-ed4-rabi-window-diagnostics.csv').filter(([panel]) => panel === '4f');
const branches = ['free', 'published'] as const;

test('Senoo 扩展图 5f 保留能移的横纵误差，图 4f 联动四个时窗和两组残差', async ({ page }) => {
  await page.goto('/#senoo');
  const tab = page.getByRole('button', { name: '扩展图 4f、5f 双原子', exact: true });
  await tab.click();
  const panel = page.getByTestId('senoo-pair-characterization');
  await expect(panel).toContainText('文献复现');

  const shiftPlot = panel.getByTestId('senoo-pair-shift-plot');
  const shiftMarkers = shiftPlot.getByTestId('senoo-pair-shift-point');
  const shiftRows = panel.getByTestId('senoo-pair-shift-row');
  const shiftMarker = (index: number) => shiftMarkers.and(shiftPlot.locator(`[data-index="${index}"]`));
  const shiftRow = (index: number) => shiftRows.and(panel.locator(`[data-index="${index}"]`));
  await expect(shiftPlot).toBeVisible();
  await expect(shiftMarkers).toHaveCount(5);
  await expect(shiftRows).toHaveCount(5);
  await expect(shiftMarkers.and(shiftPlot.locator('[data-state="perpendicular"]'))).toHaveCount(4);
  await expect(shiftMarkers.and(shiftPlot.locator('[data-state="parallel"]'))).toHaveCount(1);
  for (const [index, [cells, direction, distance, errorX, shift, errorY]] of shifts.entries()) {
    const mark = shiftMarker(index);
    const row = shiftRow(index);
    await expect(mark).toHaveAttribute('data-state', direction);
    await expect(mark.locator('path.rbc-error[data-error="x"]')).toHaveCount(1);
    await expect(mark.locator('path.rbc-error[data-error="y"]')).toHaveCount(1);
    await expect(row).toContainText(cells);
    await expect(row).toHaveAttribute('data-x', distance);
    await expect(row).toHaveAttribute('data-error-x', errorX);
    await expect(row).toHaveAttribute('data-y', shift);
    await expect(row).toHaveAttribute('data-error-y', errorY);
  }
  const length = (index: number, axis: 'x' | 'y') => shiftMarker(index)
    .locator(`path.rbc-error[data-error="${axis}"]`).evaluate((path, direction) => {
      const bounds = (path as SVGPathElement).getBBox();
      return direction === 'x' ? bounds.width : bounds.height;
    }, axis);
  expect(await length(2, 'x') / await length(4, 'x')).toBeCloseTo(0.05 / 0.02, 3);
  expect(await length(2, 'y') / await length(4, 'y')).toBeCloseTo(0.15 / 0.23, 3);

  await shiftMarker(2).locator('circle.rbc-hit').click();
  await expect(shiftMarker(2)).toHaveAttribute('data-selected', 'true');
  await expect(shiftRow(2)).toHaveAttribute('data-selected', 'true');
  await expect(shiftRow(2).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  await shiftRow(4).getByRole('button').click();
  await expect(shiftMarker(4)).toHaveAttribute('data-selected', 'true');
  await expect(shiftRow(4)).toHaveAttribute('data-selected', 'true');

  const blockade = panel.getByTestId('senoo-blockade-section');
  const populationPlot = blockade.getByTestId('senoo-blockade-population-plot');
  const residualPlot = blockade.getByTestId('senoo-blockade-residual-plot');
  const populationMarkers = populationPlot.getByTestId('senoo-blockade-population-point');
  const residualMarkers = residualPlot.getByTestId('senoo-blockade-residual-point');
  const windows = blockade.getByRole('group', { name: '图 4f 采样时窗' });
  const sequence = blockade.getByRole('spinbutton', { name: '图 4f 源点序号', exact: true });
  const detail = blockade.getByTestId('senoo-blockade-point-detail');
  const diagnostic = (branch: typeof branches[number]) => blockade.getByTestId('senoo-blockade-diagnostic')
    .and(blockade.locator(`[data-branch="${branch}"]`));

  async function expectPoint(index: number) {
    const [source, time, window, observed, lower, upper, freeFit, freeResidual, , , publishedFit, publishedResidual] = blockadePoints[index];
    await expect(blockade).toHaveAttribute('data-index', String(index));
    await expect(blockade).toHaveAttribute('data-window', window);
    await expect(populationPlot).toHaveAttribute('data-index', String(index));
    await expect(residualPlot).toHaveAttribute('data-index', String(index));
    await expect(sequence).toHaveValue(String(index + 1));
    await expect(detail).toContainText(source);
    await expect(detail).toHaveAttribute('data-time-us', time);
    await expect(detail).toHaveAttribute('data-observed', observed);
    await expect(detail).toHaveAttribute('data-error-lower', lower);
    await expect(detail).toHaveAttribute('data-error-upper', upper);
    await expect(detail).toHaveAttribute('data-fit-free', String(Number(freeFit)));
    await expect(detail).toHaveAttribute('data-fit-published', String(Number(publishedFit)));
    await expect(detail).toHaveAttribute('data-residual-free', String(Number(freeResidual)));
    await expect(detail).toHaveAttribute('data-residual-published', String(Number(publishedResidual)));
  }

  await expect(blockade).toContainText('4.24242');
  await expect(blockade).toContainText('4.49');
  await expect(blockade).toContainText('丢失检测');
  await expect(blockade).toContainText('待核');
  await expect(windows.getByRole('button')).toHaveCount(4);
  for (const window of [1, 2, 3, 4]) {
    const button = windows.getByRole('button', { name: `时窗 ${window}`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectPoint((window - 1) * 15);
    await expect(populationMarkers).toHaveCount(15);
    await expect(residualMarkers).toHaveCount(30);
    await expect(populationMarkers.and(populationPlot.locator('[data-selected="true"]'))).toHaveCount(1);
    await expect(residualMarkers.and(residualPlot.locator('[data-selected="true"]'))).toHaveCount(2);

    for (const branch of branches) {
      await expect(residualMarkers.and(residualPlot.locator(`[data-state="${branch}"]`))).toHaveCount(15);
      const expected = diagnostics.find(row => row[1] === (branch === 'free' ? 'free_fit' : branch)
        && Number(row[3]) === window);
      expect(expected).toBeDefined();
      await expect(diagnostic(branch)).toHaveAttribute('data-window', String(window));
      await expect(diagnostic(branch)).toHaveAttribute('data-shared-rmse', expected![13]);
      await expect(diagnostic(branch)).toHaveAttribute('data-local-rmse', expected![14]);
    }
  }
  await populationMarkers.and(populationPlot.locator('[data-index="46"]')).locator('circle.rbc-hit').click();
  await expectPoint(46);

  await page.setViewportSize({ width: 390, height: 844 });
  await sequence.fill('16');
  await expectPoint(15);
  await expect(windows.getByRole('button', { name: '时窗 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sequence.fill('60');
  await expectPoint(59);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const singleTab = page.getByRole('button', { name: '图 2c 单原子 Rabi', exact: true });
  await singleTab.click();
  await expect(panel).toHaveCount(0);
  const single = page.getByTestId('senoo-rabi-characterization');
  await single.getByRole('spinbutton', { name: '图 2c 时点序号', exact: true }).fill('40');
  await tab.click();
  await expectPoint(59);
  await expect(shiftRow(4)).toHaveAttribute('data-selected', 'true');
  await singleTab.click();
  await expect(single).toHaveAttribute('data-index', '39');
});
