import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bellObservationFixture, interleavedAttempt } from './helpers/senooBellFixture';

test('整机 Bell 合成观测使用独立的布居与相位分母，保留来源和原始双帧', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const panel = page.getByTestId('senoo-circuit-batch');
  await panel.getByText('Bell 布居与相干核对', { exact: true }).click();
  const input = panel.getByLabel('导入 Bell 观测 JSON', { exact: true });
  const result = panel.getByTestId('senoo-bell-observation-result');
  const overlap = result.getByTestId('senoo-bell-overlap').locator('div').filter({ hasText: '条件态原始重叠' }).locator('dd');
  await expect(result).toHaveCount(0);

  const pendingTemplate = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载 Bell 观测模板 JSON', exact: true }).click();
  const template = JSON.parse(await readFile((await (await pendingTemplate).path())!, 'utf8'));
  expect(template).toMatchObject({
    kind: 'senoo-bell-observations', schemaVersion: 1,
    settings: {
      population: { analysisPhaseRad: null },
      plus: { analysisPhaseRad: Math.PI / 4 },
      minus: { analysisPhaseRad: -Math.PI / 4 },
    },
  });

  const target = bellObservationFixture();
  const bytes = Buffer.from(JSON.stringify(target));
  await input.setInputFiles({ name: 'synthetic-bell-observations.json', mimeType: 'application/json', buffer: bytes });
  await expect(result).toContainText('合成观测');
  await expect(overlap).toHaveText('100.00%');
  await expect(result.locator('[data-setting="population"]')).toContainText(/4\s*\/\s*4/);
  await expect(result.locator('[data-setting="plus"]')).toContainText(/[-−]6\s*\/\s*6/);
  await expect(result.locator('[data-setting="minus"]')).toContainText(/8\s*\/\s*8/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await result.getByRole('region', { name: 'Bell 测量设置及分母' })
    .evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);

  const pendingReport = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出 Bell 观测核对 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await pendingReport).path())!, 'utf8'));
  expect(report).toMatchObject({
    kind: 'senoo-bell-observation-comparison', schemaVersion: 1,
    inputs: { bellObservations: { sha256: createHash('sha256').update(bytes).digest('hex') } },
    observations: target,
    statistics: {
      sourceKind: 'synthetic',
      settings: [
        { setting: 'population', counts: { attempted: 6, selectedValidReadout: 4 }, metric: { numerator: 4, denominator: 4 } },
        { setting: 'plus', counts: { attempted: 8, selectedValidReadout: 6 }, metric: { numerator: -6, denominator: 6 } },
        { setting: 'minus', counts: { attempted: 10, selectedValidReadout: 8 }, metric: { numerator: 8, denominator: 8 } },
      ],
      estimate: { population: 1, coherenceImag: 0.5, overlap: 1 },
    },
  });
  const mixture = bellObservationFixture('mixture');
  await input.setInputFiles({
    name: 'synthetic-bell-mixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mixture)),
  });
  await expect(overlap).toHaveText('50.00%');
  await expect(result.locator('[data-setting="population"]')).toContainText(/4\s*\/\s*4/);

  await input.setInputFiles({
    name: 'overlapping-bell-observations.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      ...target,
      settings: {
        ...target.settings,
        plus: { ...target.settings.plus, batch: {
          ...target.settings.plus.batch, acquisitionRunId: target.settings.population.batch.acquisitionRunId,
        } },
      },
    })),
  });
  await expect(panel.getByRole('alert')).toContainText(/采集运行|独立/);
  await expect(overlap).toHaveText('50.00%');
});

test('Bell 交错排程核对同一次运行的三种设置及实际双帧分母', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#senoo');
  const panel = page.getByTestId('senoo-bell-observations');
  await panel.getByText('Bell 布居与相干核对', { exact: true }).click();

  const pendingSchedule = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载 Bell 交错排程 CSV', exact: true }).click();
  const csv = await readFile((await (await pendingSchedule).path())!, 'utf8');
  const [header, ...lines] = csv.trimEnd().split(/\r?\n/);
  expect(header.replace(/^\uFEFF/, '').split(',')).toEqual([
    'schedule_version', 'block', 'slot_in_block', 'planned_id', 'setting', 'analysis_phase_rad',
    'actual_run_id', 'actual_attempt_id', 'actual_setting', 'actual_log_ref',
  ]);
  const rows = lines.map(line => line.split(','));
  const settings = ['population', 'plus', 'minus'] as const;
  expect(rows).toHaveLength(9000);
  expect(new Set(rows.map(row => row[3])).size).toBe(rows.length);
  expect(settings.map(setting => rows.filter(row => row[4] === setting).length)).toEqual([3000, 3000, 3000]);
  expect(rows.every(row => row.length === 10 && row.slice(6).every(field => field === ''))).toBe(true);
  const planned = rows.slice(0, 18);
  const settingPhases = { population: null, plus: Math.PI / 4, minus: -Math.PI / 4 };
  for (const setting of settings) {
    const fields = planned.filter(row => row[4] === setting).map(row => row[5] === '' ? null : Number(row[5]));
    expect(fields).toEqual(Array(6).fill(settingPhases[setting]));
  }
  for (let index = 0; index < planned.length; index += 3) {
    expect(planned.slice(index, index + 3).map(row => row[4]).sort()).toEqual([...settings].sort());
  }

  const observations = bellObservationFixture();
  const acquisitionRunId = 'SYN-BELL-INTERLEAVED-ONLY';
  const timeOriginRef = 'synthetic://interleaved-bell/run/t0';
  for (const setting of settings) {
    const batch = observations.settings[setting].batch;
    const attempts = [...batch.attempts.slice(0, 4), ...batch.attempts.slice(-2)];
    const slots = planned.filter(row => row[4] === setting);
    observations.settings[setting].batch = {
      ...batch, acquisitionRunId, timeOriginRef,
      expectedAttempts: slots.length,
      attempts: slots.map((slot, index) => {
        const attempt = interleavedAttempt(attempts[index], `ACT-${slot[3]}`, Number(slot[2]));
        slot.splice(6, 4, acquisitionRunId, attempt.attemptId, setting, attempt.sourceRef);
        return attempt;
      }),
    };
  }
  const scheduleBytes = Buffer.from([header, ...planned.map(row => row.join(','))].join('\n') + '\n');
  const schedule = panel.getByLabel('导入 Bell 排程 CSV', { exact: true });
  await schedule.setInputFiles({ name: 'synthetic-interleaved-first-block.csv', mimeType: 'text/csv', buffer: scheduleBytes });
  const input = panel.getByLabel('导入 Bell 观测 JSON', { exact: true });
  await input.setInputFiles({
    name: 'synthetic-interleaved-observations.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(observations)),
  });
  const audit = panel.getByTestId('senoo-bell-schedule-audit');
  for (const setting of settings) {
    const row = audit.locator(`[data-schedule-setting="${setting}"]`);
    await expect(row).toContainText(/6\s*\/\s*6/);
    await expect(row).toContainText(/6\s*\/\s*5/);
    await expect(row).toContainText(/5\s*\/\s*4/);
  }
  const result = panel.getByTestId('senoo-bell-observation-result');
  await expect(result).toContainText('合成观测');
  await expect(result.getByTestId('senoo-bell-overlap').locator('div').filter({ hasText: '条件态原始重叠' })
    .locator('dd')).toHaveText('100.00%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const pendingReport = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出 Bell 观测核对 JSON', exact: true }).click();
  const report = JSON.parse(await readFile((await (await pendingReport).path())!, 'utf8'));
  expect(report.inputs.bellSchedule).toMatchObject({
    filename: 'synthetic-interleaved-first-block.csv', sha256: createHash('sha256').update(scheduleBytes).digest('hex'),
  });
  expect(report.scheduleAudit).toMatchObject({
    settings: settings.map(setting => ({ setting, planned: 6, matched: 6, executed: 6, included: 5, complete: 5, effective: 4 })),
    issues: [],
  });

  const wrongSetting = [...planned[0]];
  wrongSetting[8] = settings.find(setting => setting !== wrongSetting[4])!;
  const wrongCsv = Buffer.from([header, wrongSetting.join(','), ...planned.slice(1).map(row => row.join(','))].join('\n'));
  await schedule.setInputFiles({ name: 'synthetic-misassigned-setting.csv', mimeType: 'text/csv', buffer: wrongCsv });
  await expect(audit).toContainText(wrongSetting[3]);
  await expect(audit).toContainText(/设置不一致|设置不符|设置与排程/);
});
