import { expect, test } from '@playwright/test';

const states = ['m1', 'r0'] as const;
type RabiState = typeof states[number];

const middlePoint = {
  m1: {
    cells: 'Fig2c_right_blue!AO2:AO5',
    observed: 0.00581395348837209,
    lowerError: 0.00374320787335084,
    upperError: 0.00757955609054771,
    fitted: 0.000017339483548539647,
    residual: -0.005796614004823551,
  },
  r0: {
    cells: 'Fig2c_right_red!AO2:AO5',
    observed: 0.994186046511627,
    lowerError: 0.00757955609054772,
    upperError: 0.0037432078733508,
    fitted: 0.9999826605164515,
    residual: 0.005796614004824452,
  },
};

test('Senoo 图 2c 联动核对单原子两态布居、误差条和带符号残差', async ({ page }) => {
  await page.goto('/#senoo');
  const tab = page.getByRole('button', { name: '图 2c 单原子 Rabi', exact: true });
  await tab.click();
  const panel = page.getByTestId('senoo-rabi-characterization');
  const population = panel.getByTestId('senoo-rabi-population-plot');
  const residual = panel.getByTestId('senoo-rabi-residual-plot');
  const index = panel.getByRole('spinbutton', { name: '图 2c 时点序号', exact: true });
  const previous = panel.getByRole('button', { name: '上一时点', exact: true });
  const next = panel.getByRole('button', { name: '下一时点', exact: true });
  const populationPoint = (pointIndex: number, state: RabiState) => population
    .getByTestId('senoo-rabi-population-point').and(population.locator(`[data-index="${pointIndex}"][data-state="${state}"]`));
  const residualPoint = (pointIndex: number, state: RabiState) => residual
    .getByTestId('senoo-rabi-residual-point').and(residual.locator(`[data-index="${pointIndex}"][data-state="${state}"]`));
  const detail = (state: RabiState) => panel.getByTestId('senoo-rabi-state-detail').and(panel.locator(`[data-state="${state}"]`));

  async function expectSelection(pointIndex: number) {
    await expect(panel).toHaveAttribute('data-index', String(pointIndex));
    await expect(population).toHaveAttribute('data-index', String(pointIndex));
    await expect(residual).toHaveAttribute('data-index', String(pointIndex));
    await expect(index).toHaveValue(String(pointIndex + 1));
    for (const state of states) {
      await expect(populationPoint(pointIndex, state)).toHaveAttribute('data-selected', 'true');
      await expect(residualPoint(pointIndex, state)).toHaveAttribute('data-selected', 'true');
      await expect(detail(state)).toHaveAttribute('data-index', String(pointIndex));
    }
  }

  await expect(panel).toContainText('文献复现');
  await expect(panel).toContainText('丢失检测后');
  await expect(panel).toContainText('实际门波形待测');
  await expect(panel).toContainText('正式读出标定待同装置实测和独立验证批次');
  await expect(panel).toContainText('3.02209 MHz');
  await expect(panel).toContainText('2.1064');
  await expect(panel).toContainText('47/80');
  await expect(population).toBeVisible();
  await expect(residual).toBeVisible();
  await expect(population.getByTestId('senoo-rabi-population-point')).toHaveCount(160);
  await expect(population.locator('path.rbc-error')).toHaveCount(160);
  await expect(population.locator('path.rbc-fit')).toHaveCount(2);
  await expect(residual.getByTestId('senoo-rabi-residual-point')).toHaveCount(160);

  await expectSelection(0);
  await expect(panel).toHaveAttribute('data-time-us', '0.01');
  await expect(detail('m1')).toContainText('Fig2c_right_blue!B2:B5');
  await expect(detail('r0')).toContainText('Fig2c_right_red!B2:B5');
  await expect(previous).toBeDisabled();
  await next.click();
  await expectSelection(1);
  await previous.click();
  await expectSelection(0);

  await index.fill('40');
  await expectSelection(39);
  await expect(panel).toHaveAttribute('data-time-us', '0.498734177215189');
  for (const state of states) {
    const expected = middlePoint[state];
    const row = detail(state);
    await expect(row).toContainText(expected.cells);
    await expect(row).toHaveAttribute('data-observed', String(expected.observed));
    await expect(row).toHaveAttribute('data-error-lower', String(expected.lowerError));
    await expect(row).toHaveAttribute('data-error-upper', String(expected.upperError));
    await expect(row).toHaveAttribute('data-fitted', String(expected.fitted));
    await expect(row).toHaveAttribute('data-residual', String(expected.residual));

    const error = await populationPoint(39, state).locator('path.rbc-error').evaluate(path => {
      const bounds = (path as SVGPathElement).getBBox();
      const marker = path.parentElement?.querySelector<SVGCircleElement>('circle.rbc-hit');
      if (!marker) throw new Error('缺少该布居误差条对应的标记。');
      const center = marker.cy.baseVal.value;
      return { lower: bounds.y + bounds.height - center, upper: center - bounds.y };
    });
    expect(error.lower).toBeGreaterThan(0);
    expect(error.upper).toBeGreaterThan(0);
    expect(error.lower / error.upper).toBeCloseTo(expected.lowerError / expected.upperError, 3);
  }

  await populationPoint(65, 'r0').locator('circle.rbc-hit').click();
  await expectSelection(65);
  await expect(detail('r0')).toContainText('Fig2c_right_red!BO2:BO5');
  await expect(detail('r0')).toHaveAttribute('data-observed', '1');
  await expect(detail('r0')).toHaveAttribute('data-error-upper', '0');
  await expect(detail('m1')).toHaveAttribute('data-observed', '0');
  await expect(detail('m1')).toHaveAttribute('data-error-lower', '0');

  await page.setViewportSize({ width: 390, height: 844 });
  await index.fill('80');
  await expectSelection(79);
  await expect(detail('m1')).toContainText('Fig2c_right_blue!CC2:CC5');
  await expect(detail('r0')).toContainText('Fig2c_right_red!CC2:CC5');
  await expect(next).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: '图 3b–d CZ 表征', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await tab.click();
  await expectSelection(79);
});
