import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const synthetic = fileURLToPath(new URL('./fixtures/senoo-readout-synthetic.xlsx', import.meta.url));
const blankTemplate = fileURLToPath(new URL('../references/templates/Senoo_双曝光逐轮实测模板.xlsx', import.meta.url));
const calSchedule = fileURLToPath(new URL('../references/templates/Senoo_双曝光逐轮实测模板_CAL.xlsx', import.meta.url));

test('Senoo XLSX 按位点配对并保留合成来源、缺帧、时标与各级分母', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const panel = page.getByTestId('senoo-measurement-import');
  const input = panel.getByLabel('导入实测 XLSX', { exact: true });
  await input.setInputFiles(synthetic);
  await expect(panel.getByTestId('senoo-measurement-filename')).toContainText('senoo-readout-synthetic.xlsx');
  const calibration = panel.getByTestId('senoo-measurement-batch').filter({ hasText: 'SYN-CAL' });
  const validation = panel.getByTestId('senoo-measurement-batch').filter({ hasText: 'SYN-VAL' });
  await expect(calibration).toHaveAttribute('data-source-kind', 'synthetic');
  await expect(validation).toHaveAttribute('data-source-kind', 'synthetic');
  await expect(calibration.getByRole('cell')).toHaveText(['标定批次', '合成数据', '3', '5', '4', '3', '3', '1', '2', '0', '0']);
  await expect(validation.getByRole('cell')).toHaveText(['独立验证批次', '合成数据', '1', '3', '3', '3', '3', '0', '0', '0', '0']);

  const pair = panel.getByTestId('senoo-measurement-pair');
  const first = pair.getByTestId('senoo-measurement-frame-1');
  const second = pair.getByTestId('senoo-measurement-frame-2');
  await expect(pair).toHaveAttribute('data-attempt-id', '0001');
  await expect(pair).toHaveAttribute('data-site-id', '01');
  await expect(first).toContainText('SYN-CAL-0001-I1');
  await expect(first).toContainText('1130 µs');
  await expect(first).toContainText('1180 µs');
  await expect(second).toContainText('1260 µs');
  await expect(first).toContainText('36 counts');
  await expect(second).toContainText('41 counts');

  const selector = panel.getByRole('spinbutton', { name: '实测记录序号', exact: true });
  await selector.fill('2');
  await expect(pair).toHaveAttribute('data-site-id', '02');
  await expect(first).toContainText('SYN-CAL-0001-I1');
  await expect(first.getByTestId('senoo-measurement-count')).toHaveText('0 counts');
  await selector.fill('4');
  await expect(pair).toHaveAttribute('data-attempt-id', '0002');
  await expect(second).toHaveAttribute('data-status', 'missing');
  await expect(second.getByTestId('senoo-measurement-count')).toHaveText('缺测');
  await selector.fill('5');
  await expect(pair).toHaveAttribute('data-attempt-id', '0003');
  await expect(first).toHaveAttribute('data-status', 'skipped');
  await expect(second).toHaveAttribute('data-status', 'skipped');

  await panel.getByLabel('实测批次', { exact: true }).selectOption('SYN-VAL');
  await expect(pair).toHaveAttribute('data-attempt-id', '0001');
  await expect(first).toContainText('SYN-VAL-0001-I1');
  await expect(first.getByTestId('senoo-measurement-count')).toHaveText('36 counts');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await input.setInputFiles(blankTemplate);
  await expect(panel.getByRole('alert')).toContainText('工作簿校验未通过');
  await expect(panel.getByTestId('senoo-measurement-issues')).toContainText('批次配置 · 第 2 行 · batch_id');
  await expect(panel.getByTestId('senoo-measurement-filename')).toContainText('senoo-readout-synthetic.xlsx');
  await expect(pair).toHaveAttribute('data-batch-id', 'SYN-VAL');
});

test('CAL 排程与工作簿独立导入，显式对应轮号后保留组别和位点分母', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const panel = page.getByTestId('senoo-measurement-import');
  const audit = panel.getByTestId('senoo-cal-pilot-audit');
  await audit.getByText('CAL 先导排程核对', { exact: true }).click();
  await audit.getByLabel('导入已发排程 XLSX', { exact: true }).setInputFiles(calSchedule);
  await expect(audit).toContainText('300 轮');
  await expect(audit).toContainText('等待含标定批次的实测工作簿');

  const input = panel.getByLabel('导入实测 XLSX', { exact: true });
  await input.setInputFiles(synthetic);
  const summary = audit.getByTestId('senoo-cal-pilot-summary');
  await expect(summary).toContainText('组别匹配 0 轮 · 核查项 303 条');
  const batch = audit.getByLabel('先导核对批次', { exact: true });
  await expect(batch.locator('option')).toHaveText(['SYN-CAL']);
  await expect(audit).toContainText('合成数据');

  await audit.getByLabel('导入轮号对应 JSON', { exact: true }).setInputFiles({
    name: 'pilot-rounds.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([
      { plannedAttemptId: 'CAL-P-0001', attemptId: '0001' },
      { plannedAttemptId: 'CAL-P-0002', attemptId: '0002' },
      { plannedAttemptId: 'CAL-P-0003', attemptId: '0003' },
    ])),
  });
  await expect(summary).toContainText('批次记录 3 轮 · 组别匹配 2 轮 · 核查项 298 条');
  const groups = audit.getByTestId('senoo-cal-pilot-group');
  await expect(groups.nth(0).getByRole('cell')).toHaveText(['100', '1', '1', '1', '0', '0', '0', '0', '0', '2', '0', '0']);
  await expect(groups.nth(1).getByRole('cell')).toHaveText(['100', '1', '1', '1', '1', '0', '0', '0', '1', '0', '0', '0']);
  await audit.getByText('查看轮号核查项（298）', { exact: true }).click();
  await expect(audit.getByRole('row').filter({ hasText: '同轮登记了多个制备组' })).toContainText('CAL-P-0001');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await input.setInputFiles(blankTemplate);
  await expect(panel.getByTestId('senoo-measurement-status')).toContainText('工作簿校验未通过');
  await expect(audit).toContainText('等待含标定批次的实测工作簿');
  await expect(summary).toHaveCount(0);
  await expect(panel.getByTestId('senoo-measurement-filename')).toContainText('senoo-readout-synthetic.xlsx');
});
