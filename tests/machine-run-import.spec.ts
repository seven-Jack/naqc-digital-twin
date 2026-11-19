import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { MachineRun } from '../src/physics/quantumComputer';

test('导出后可导入相同 Bell 批次，切换装配成功和失败轮并回退', async ({ page }) => {
  await page.goto('/#machine');
  const protocol = page.getByLabel('实验协议', { exact: true });
  await protocol.selectOption('bell-replenishment');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('64');
  await page.getByRole('slider', { name: '单阱装载概率' }).fill('0.02');
  await page.getByRole('slider', { name: '单比特读出翻转' }).fill('0');

  const timeline = page.getByRole('slider', { name: '演示时间轴' });
  const canvas = page.getByTestId('quantum-scene-canvas');
  const validShots = page.getByTestId('machine-shots');
  const rejected = page.getByTestId('machine-rejected');
  await timeline.fill('15200');
  await expect(rejected).toHaveAttribute('data-count', '51');
  await expect(validShots).toHaveAttribute('data-completed-shots', '13');
  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出运行数据' }).click();
  const downloaded = await downloadStarted;
  const content = await readFile((await downloaded.path())!);
  const saved = JSON.parse(content.toString()) as MachineRun;
  const successful = saved.attempts.findIndex(attempt => attempt.status === 'measured');
  expect(successful).toBeGreaterThan(0);
  expect(saved.records[successful].loadedAtoms?.length).toBeGreaterThan(0);
  expect(saved.records[successful].initialMoves).toBeDefined();

  await protocol.selectOption('standard');
  const file = page.getByLabel('导入运行 JSON', { exact: true });
  await file.setInputFiles({ name: 'saved-bell.json', mimeType: 'application/json', buffer: content });
  await expect(page.getByTestId('machine-record-source')).toContainText('saved-bell.json');
  await expect(timeline).toHaveValue('0');
  await expect(protocol).toHaveValue('bell-replenishment');

  const attempt = page.getByRole('spinbutton', { name: '回放尝试编号' });
  await timeline.fill('10930');
  await expect(canvas).toHaveAttribute('data-stage-skipped', 'true');
  await attempt.fill(String(successful + 1));
  await expect(timeline).toHaveValue('10930');
  await expect(page.getByTestId('machine-occupancy')).toHaveAttribute('data-decision', 'continue');
  await expect(canvas).toHaveAttribute('data-active-path', 'rydberg');
  await expect(canvas).not.toHaveAttribute('data-stage-skipped');

  await timeline.fill('9100');
  await expect(canvas).toHaveAttribute('data-stage', 'transfer');
  await expect(page.getByText('483 nm 与 460 nm 光路并行', { exact: true })).toBeVisible();
  await timeline.fill('3400');
  await expect(canvas).toHaveAttribute('data-stage', 'rearrangement');
  await expect(canvas).toHaveAttribute('data-atom-layout', /.+/);
  const beforeReadout = await canvas.getAttribute('data-atom-layout');
  await expect(validShots).toHaveAttribute('data-completed-shots', '0');
  await timeline.fill('15200');
  await expect(canvas).toHaveAttribute('data-fluorescence', saved.attempts[successful].bitstring!);
  await expect(rejected).toHaveAttribute('data-count', '51');
  await expect(validShots).toHaveAttribute('data-completed-shots', '13');
  await timeline.fill('3400');
  await expect(canvas).toHaveAttribute('data-atom-layout', beforeReadout!);
  await expect(canvas).not.toHaveAttribute('data-fluorescence');
  await expect(validShots).toHaveAttribute('data-completed-shots', '0');

  await file.setInputFiles({
    name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saved, completedShots: 0 })),
  });
  await expect(page.getByRole('alert')).toContainText('completedShots');
  await expect(page.getByTestId('machine-record-source')).toContainText('saved-bell.json');
  await expect(attempt).toHaveValue(String(successful + 1));
  await expect(timeline).toHaveValue('3400');
});
