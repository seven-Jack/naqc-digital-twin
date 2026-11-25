import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SENOO_READOUT_SOURCE } from '../src/data/senooReadoutSource';

async function expectLogPlacement(plot: Locator, first: number, second: number) {
  const positions = await plot.evaluate((element, counts) => {
    const svg = element as SVGSVGElement;
    const lines = Array.from(svg.querySelectorAll<SVGLineElement>('.sr-grid'));
    const vertical = lines.filter(line => line.x1.baseVal.value === line.x2.baseVal.value);
    const horizontal = lines.filter(line => line.y1.baseVal.value === line.y2.baseVal.value);
    const ticks = Array.from(svg.querySelectorAll('.sr-tick'), node => Number(node.textContent));
    const minimum = Math.log10(Math.min(...ticks));
    const maximum = Math.log10(Math.max(...ticks));
    const ratio = (value: number) => (Math.log10(value) - minimum) / (maximum - minimum);
    const left = Math.min(...vertical.map(line => line.x1.baseVal.value));
    const right = Math.max(...vertical.map(line => line.x1.baseVal.value));
    const top = Math.min(...horizontal.map(line => line.y1.baseVal.value));
    const bottom = Math.max(...horizontal.map(line => line.y1.baseVal.value));
    const expected = new DOMPoint(
      left + ratio(counts.first) * (right - left),
      bottom - ratio(counts.second) * (bottom - top),
    ).matrixTransform(svg.getScreenCTM()!);
    const selected = svg.querySelector('[data-testid="senoo-selected-point"]')!.getBoundingClientRect();
    return {
      actual: { x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 },
      expected: { x: expected.x, y: expected.y },
    };
  }, { first, second });
  expect(positions.actual.x).toBeCloseTo(positions.expected.x, 4);
  expect(positions.actual.y).toBeCloseTo(positions.expected.y, 4);
}

test('Senoo 双曝光源表配对读数与固定对数坐标正确', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#sources');
  const source = page.getByTestId('senoo-readout-source');
  const plot = source.getByTestId('senoo-readout-plot');
  const groupControl = source.getByLabel('显示制备组', { exact: true });
  const sampleControl = source.getByLabel('源表样本序号', { exact: true });
  const detail = source.getByTestId('senoo-selected-sample');
  await source.scrollIntoViewIfNeeded();
  await expect(plot.locator('circle[data-source-point]')).toHaveCount(765);
  const initialTicks = await plot.locator('.sr-tick').allTextContents();

  const endpointCounts = [
    { id: 'loss', first: [19.67751863, 19.67751863], last: [27.67751863, 21.67751863] },
    { id: 'spin0', first: [23.67751863, 93.67751863], last: [24.17751863, 97.67751863] },
    { id: 'spin1', first: [63.67751863, 22.17751863], last: [86.67751863, 26.17751863] },
  ];
  for (const endpoint of endpointCounts) {
    await groupControl.selectOption(endpoint.id);
    await expect(plot.locator('circle[data-source-point]')).toHaveCount(255);
    await expect(sampleControl).toHaveValue('1');
    await expect(detail).toContainText(`Fig2b_${endpoint.id}!B2/B3`);
    await expect(source.getByTestId('senoo-first-count')).toHaveText(`${endpoint.first[0]} counts`);
    await expect(source.getByTestId('senoo-second-count')).toHaveText(`${endpoint.first[1]} counts`);
    await expectLogPlacement(plot, endpoint.first[0], endpoint.first[1]);
    await sampleControl.fill('255');
    await expect(detail).toContainText(`Fig2b_${endpoint.id}!IV2/IV3`);
    await expect(source.getByTestId('senoo-first-count')).toHaveText(`${endpoint.last[0]} counts`);
    await expect(source.getByTestId('senoo-second-count')).toHaveText(`${endpoint.last[1]} counts`);
    await expectLogPlacement(plot, endpoint.last[0], endpoint.last[1]);
    expect(await plot.locator('.sr-tick').allTextContents()).toEqual(initialTicks);
  }

  await groupControl.selectOption('spin0');
  await plot.locator('circle[data-source-point="Fig2b_spin0:DZ"]').click();
  await expect(sampleControl).toHaveValue('129');
  await expect(detail).toContainText('Fig2b_spin0!DZ2/DZ3');
  await expect(source.getByTestId('senoo-first-count')).toHaveText('20.17751863 counts');
  await expect(source.getByTestId('senoo-second-count')).toHaveText('167.17751863 counts');
  await expectLogPlacement(plot, 20.17751863, 167.17751863);
  await expect(source.getByRole('link', { name: /Senoo 等/ })).toHaveAttribute('href', SENOO_READOUT_SOURCE.source.url);
  await source.getByText('工作簿与来源定位', { exact: true }).click();
  await expect(source).toContainText(SENOO_READOUT_SOURCE.source.workbook.sha256);
  await groupControl.selectOption('all');
  await expect(plot.locator('circle[data-source-point]')).toHaveCount(765);

  expect(errors).toEqual([]);
});

test('390 px 源表选择支持数值输入并保持双曝光配对', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#sources');
  const source = page.getByTestId('senoo-readout-source');
  await source.scrollIntoViewIfNeeded();
  await source.getByLabel('显示制备组', { exact: true }).selectOption('spin1');
  const sample = source.getByLabel('源表样本序号', { exact: true });
  await sample.fill('255');
  await expect(source.getByTestId('senoo-selected-sample')).toContainText('Fig2b_spin1!IV2/IV3');
  await expect(source.getByTestId('senoo-first-count')).toHaveText('86.67751863 counts');
  await expect(source.getByTestId('senoo-second-count')).toHaveText('26.17751863 counts');
  await expectLogPlacement(source.getByTestId('senoo-readout-plot'), 86.67751863, 26.17751863);
  await sample.focus();
  await page.keyboard.press('ArrowDown');
  await expect(sample).toHaveValue('254');
  await expect(source.getByTestId('senoo-selected-sample')).toContainText('Fig2b_spin1!IU2/IU3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('双曝光阈值联动判决和全部制备组的计数', async ({ page }) => {
  await page.goto('/#sources');
  const source = page.getByTestId('senoo-readout-source');
  const plot = source.getByTestId('senoo-readout-plot');
  const firstInput = source.getByRole('spinbutton', { name: 'Image 1 阈值', exact: true });
  const secondInput = source.getByRole('spinbutton', { name: 'Image 2 阈值', exact: true });
  const decision = source.getByTestId('senoo-decision');
  const status = source.getByTestId('senoo-threshold-status');
  const matrix = source.getByTestId('senoo-readout-crosstab');
  const firstLine = plot.getByTestId('senoo-threshold-first');
  const secondLine = plot.getByTestId('senoo-threshold-second');

  const expectCounts = async (expected: Record<string, readonly number[]>) => {
    for (const [group, counts] of Object.entries(expected)) {
      const row = matrix.locator(`tr[data-preparation="${group}"]`);
      const outcomes = ['m0', 'm1', 'no-atom', 'ambiguous'];
      for (const [column, outcome] of outcomes.entries()) {
        await expect(row.locator(`[data-outcome="${outcome}"]`)).toHaveText(String(counts[column]));
      }
      await expect(row.getByRole('cell').last()).toHaveText('255');
    }
  };

  await expect(firstInput).toHaveValue('40');
  await expect(secondInput).toHaveValue('40');
  await expect(decision).toHaveAttribute('data-outcome', 'no-atom');
  await expect(plot.locator('[data-decision-region]')).toHaveCount(4);
  const initialCounts = { loss: [0, 0, 255, 0], spin0: [247, 0, 8, 0], spin1: [0, 249, 6, 0] };
  await expectCounts(initialCounts);

  await source.getByLabel('显示制备组', { exact: true }).selectOption('spin0');
  await source.getByLabel('源表样本序号', { exact: true }).fill('129');
  await expect(source.getByTestId('senoo-selected-sample')).toContainText('Fig2b_spin0!DZ2/DZ3');
  await expect(decision).toHaveAttribute('data-outcome', 'm0');
  await expectCounts(initialCounts);

  await firstInput.fill('20.17751863');
  await secondInput.fill('167.17751863');
  await expect(status).toHaveAttribute('data-first', '20.17751863');
  await expect(status).toHaveAttribute('data-second', '167.17751863');
  await expect(decision).toHaveAttribute('data-outcome', 'ambiguous');
  await expect(source.getByTestId('senoo-first-count')).toHaveText('20.17751863 counts');
  await expect(source.getByTestId('senoo-second-count')).toHaveText('167.17751863 counts');

  // Equality on both thresholds places the selected point at the quadrant intersection.
  const point = plot.getByTestId('senoo-selected-point');
  const cx = Number(await point.getAttribute('cx'));
  const cy = Number(await point.getAttribute('cy'));
  expect(Number(await firstLine.getAttribute('x1'))).toBeCloseTo(cx, 8);
  expect(Number(await firstLine.getAttribute('x2'))).toBeCloseTo(cx, 8);
  expect(Number(await secondLine.getAttribute('y1'))).toBeCloseTo(cy, 8);
  expect(Number(await secondLine.getAttribute('y2'))).toBeCloseTo(cy, 8);

  const shiftedCounts = { loss: [0, 212, 43, 0], spin0: [0, 219, 35, 1], spin1: [0, 255, 0, 0] };
  await expectCounts(shiftedCounts);
  await firstInput.fill('201');
  await expect(firstInput).toHaveAttribute('aria-invalid', 'true');
  await expect(status).toHaveAttribute('data-first', '20.17751863');
  await expect(decision).toHaveAttribute('data-outcome', 'ambiguous');
  await expectCounts(shiftedCounts);

  await firstInput.fill('20.17751863');
  const exportButton = source.getByRole('button', { name: '导出判决 JSON', exact: true });
  const downloadDecisions = async () => {
    const pending = page.waitForEvent('download');
    await exportButton.click();
    return readFile((await (await pending).path())!, 'utf8');
  };
  const exportedText = await downloadDecisions();
  const exported = JSON.parse(exportedText);
  expect(exported).toMatchObject({
    schemaVersion: 1,
    kind: 'senoo-dual-exposure-decisions',
    source: {
      doi: SENOO_READOUT_SOURCE.source.doi,
      figure: '2b',
      workbook: SENOO_READOUT_SOURCE.source.workbook,
    },
    rule: {
      id: 'dual-exposure-threshold',
      version: 1,
      mode: 'exploratory',
      thresholds: { first: 20.17751863, second: 167.17751863 },
      highComparison: 'greater-than-or-equal',
      outcomes: { lowLow: 'no-atom', lowHigh: 'm0', highLow: 'm1', highHigh: 'ambiguous' },
    },
  });
  expect(exported.samples).toHaveLength(765);
  expect(exported.rows).toHaveLength(3);
  for (const { groupId, counts, total } of exported.rows) {
    const [m0, m1, noAtom, ambiguous] = shiftedCounts[groupId as keyof typeof shiftedCounts];
    expect(counts).toEqual({ m0, m1, 'no-atom': noAtom, ambiguous });
    expect(total).toBe(255);
  }
  expect(exported.samples).toContainEqual({
    observation: {
      id: 'Fig2b_spin0:DZ',
      preparedGroup: 'spin0',
      counts: { first: 20.17751863, second: 167.17751863 },
      source: { sheet: 'Fig2b_spin0', index: 128, column: 'DZ', cells: { first: 'DZ2', second: 'DZ3' } },
    },
    decision: { firstHigh: true, secondHigh: true, outcome: 'ambiguous' },
  });
  await source.getByLabel('显示制备组', { exact: true }).selectOption('loss');
  expect(await downloadDecisions()).toBe(exportedText);

  await source.getByRole('button', { name: '恢复初始阈值', exact: true }).click();
  await expect(firstInput).toHaveValue('40');
  await expect(secondInput).toHaveValue('40');
  await expect(decision).toHaveAttribute('data-outcome', 'no-atom');
  await expectCounts(initialCounts);
});
