import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const workbook = fileURLToPath(new URL('./fixtures/senoo-readout-synthetic.xlsx', import.meta.url));

test('冻结 SYN-CAL 阈值后才运行 SYN-VAL，并导出合成验收证据', async ({ page }, run) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const input = page.getByLabel('导入实测 XLSX', { exact: true });
  await input.setInputFiles(workbook);
  const workflow = page.getByTestId('senoo-synthetic-workflow');
  const freeze = workflow.getByRole('button', { name: '冻结合成阈值' });
  const verify = workflow.getByRole('button', { name: '运行合成验证' });
  const frozen = workflow.getByTestId('senoo-frozen-thresholds');
  const holdout = workflow.getByTestId('senoo-holdout-results');
  await expect(verify).toBeDisabled();
  await expect(holdout).toHaveCount(0);
  await expect(workflow.getByLabel('合成标定批次')).toHaveValue('SYN-CAL');
  await expect(workflow.getByLabel('合成验证批次')).toHaveValue('SYN-VAL');
  await freeze.click();
  await expect(freeze).toBeDisabled();
  await expect(frozen).toContainText('37 / 47 counts');
  await expect(verify).toBeEnabled();
  await expect(holdout).toHaveCount(0);

  await verify.click();
  await expect(frozen).toContainText('37 / 47 counts');
  await expect(holdout).toContainText('SYN-VAL');
  await expect(holdout).toContainText('自旋判丢失1/2');
  await expect(holdout).toContainText('全组歧义0/3');
  await expect(holdout.getByRole('row').filter({ hasText: '判丢失' })).toContainText('36');
  await expect(holdout.getByRole('row').filter({ hasText: '判空位' })).toContainText('9');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const downloaded = page.waitForEvent('download');
  await workflow.getByRole('button', { name: '导出合成验收 JSON' }).click();
  const saved = run.outputPath('senoo-synthetic-acceptance.json');
  await (await downloaded).saveAs(saved);
  const result = JSON.parse(await readFile(saved, 'utf-8'));
  expect(result).toMatchObject({
    evidence: 'synthetic-acceptance',
    filename: 'senoo-readout-synthetic.xlsx',
    frozen: {
      calibrationBatchId: 'SYN-CAL',
      denominators: { attemptedSites: 5, prepPassed: 4, validPairs: 3, included: 3, evaluated: 3 },
      rule: { thresholds: { first: 37, second: 47 }, highComparison: 'greater-than-or-equal' },
    },
    verification: {
      validationBatchId: 'SYN-VAL',
      denominators: { attemptedSites: 3, prepPassed: 3, validPairs: 3, included: 3, evaluated: 3 },
      totals: { evaluated: 3, wrongSpin: 0, falseLoss: 1, spinEvaluated: 2, ambiguous: 0, emptyFalsePositive: 0, emptyEvaluated: 1 },
      samples: [
        { preparedGroup: 'm1', counts: { first: 36, second: 11 }, outcome: 'no-atom', originalDecision: 'm1' },
        { preparedGroup: 'm0', outcome: 'm0' },
        { preparedGroup: 'empty_control', outcome: 'no-atom' },
      ],
    },
  });

  await input.setInputFiles(workbook);
  await expect(frozen).toHaveCount(0);
  await expect(holdout).toHaveCount(0);
  await expect(verify).toBeDisabled();
});
