import { expect, test, type Locator, type Page } from '@playwright/test';

const modules = {
  table: ['surface', 'frame', 'feet'], source: ['body', 'nozzle', 'mount'],
  slm: ['modulator', 'ports', 'relay'], aod: ['deflector', 'port', 'mount'],
  vacuum: ['chamber', 'pump', 'objective'], array: ['plane', 'sites', 'atoms'],
  gate: ['clock', 'rydberg', 'probe', 'mount'], imaging: ['objective', 'camera', 'mount'],
};

// Sample actual Chromium pixels. Hide labels and control overlays to measure geometry alone.
async function renderedPixels(page: Page, canvas: Locator) {
  const png = await canvas.screenshot({ animations: 'disabled', style: 'body * {visibility:hidden !important} body canvas {visibility:visible !important}' });
  return page.evaluate(async data => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const buffer = document.createElement('canvas');
    buffer.width = 96;
    buffer.height = 64;
    const ctx = buffer.getContext('2d')!;
    ctx.drawImage(img, 0, 0, buffer.width, buffer.height);
    return Array.from(ctx.getImageData(0, 0, buffer.width, buffer.height).data);
  }, png.toString('base64'));
}

function changedPixels(before: number[], after: number[]) {
  let count = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (Math.max(...[0, 1, 2].map(channel => Math.abs(before[i + channel] - after[i + channel]))) > 12) count++;
  }
  return count;
}

test('从首页功能图放大设备，片段、光路和整机共用同一时刻', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '功能图', exact: true }).click();
  const map = page.getByRole('group', { name: '整机功能连接图' });
  await expect(map.getByRole('button')).toHaveCount(8);
  await map.getByRole('button', { name: '放大AOD 搬运光镊' }).click();
  const panel = page.getByTestId('equipment-panel');
  const time = panel.getByRole('slider', { name: '设备阶段时间轴' });
  const operation = panel.getByRole('region', { name: '设备运行回放' });
  await expect(operation).toHaveAttribute('data-stage', 'cooling');
  await expect(panel.getByLabel('回放阶段')).toHaveValue('rearrangement');
  await panel.getByRole('button', { name: '播放片段' }).click();
  await expect(operation).toHaveAttribute('data-stage', 'rearrangement');
  await expect(time).toHaveValue('4349');
  await expect(panel.getByRole('button', { name: '播放片段' })).toBeVisible();
  await panel.getByLabel('切换设备').selectOption('gate');
  await time.fill('7730');
  await expect(operation).toContainText('Rydberg 条件相位');
  await expect(panel.getByText('当前光路 · 里德堡通道')).toBeVisible();
  await panel.getByLabel('切换设备').selectOption('imaging');
  await time.fill('12000');
  await expect(operation).toContainText('荧光位串');
  await panel.getByRole('button', { name: '返回整机' }).click();
  await expect(map).toBeVisible();
  await expect(map.getByRole('button', { name: '放大AOD 搬运光镊' })).toBeFocused();
  await expect(page.getByRole('slider', { name: '演示时间轴' })).toHaveValue('12000');
});

test('在本轮路线和固定阱位间切换，交接功率随同一时间轴正反变化', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('slider', { name: '单阱装载概率' }).fill('0.09');
  await page.getByTestId('equipment-open-aod').click();
  const panel = page.getByTestId('equipment-panel');
  const cursor = panel.getByRole('slider', { name: '设备阶段时间轴' });
  await cursor.fill('3000');
  await expect(panel.getByText('F4 → E4 → D4', { exact: true })).toBeVisible();
  await cursor.fill('3900');
  await expect(panel.getByText('B3 → C3 → C4 → C5 → D5', { exact: true })).toBeVisible();
  await panel.getByText('相关文章与视频').click();
  await expect(panel.getByRole('link', { name: /精准重排/ })).toHaveAttribute('href', /qbitai\.com/);
  await panel.getByLabel('切换设备').selectOption('slm');
  await panel.getByLabel('回放阶段').selectOption('transfer');
  const canvas = panel.getByTestId('quantum-scene-canvas');
  await expect(canvas).toHaveAttribute('data-stage', 'transfer');
  const positions = await canvas.getAttribute('data-atom-layout');
  const reservoirLight = await renderedPixels(page, canvas);
  await cursor.fill('5675');
  const handoff = panel.getByRole('figure', { name: '同址换阱' });
  await expect(handoff.getByRole('meter', { name: '科学阱' })).toHaveAttribute('value', '25');
  await cursor.fill('5850');
  await expect(handoff.getByRole('meter', { name: '储备阱' })).toHaveAttribute('value', '50');
  await expect(handoff.getByRole('meter', { name: '科学阱' })).toHaveAttribute('value', '50');
  await cursor.fill('6199');
  await expect.poll(async () => changedPixels(reservoirLight, await renderedPixels(page, canvas))).toBeGreaterThan(2);
  await expect(canvas).toHaveAttribute('data-atom-layout', positions!);
  await panel.getByLabel('回放阶段').selectOption('return');
  await cursor.fill('9425');
  await expect(handoff.getByRole('meter', { name: '科学阱' })).toHaveAttribute('value', '75');
  await panel.getByRole('button', { name: '返回整机' }).click();
  await page.getByRole('button', { name: '功能图', exact: true }).click();
  await expect(page.getByRole('group', { name: '整机功能连接图' })).toContainText('固定光镊 → 共用物镜 → 阵列阱位');
});

test('成像逐位点区分占位和量子态，回拨、复查及丢失不提前显示结果', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('实验协议', { exact: true }).selectOption('bell-replenishment');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('64');
  await page.getByRole('slider', { name: '单比特读出翻转' }).fill('0');
  await page.getByTestId('equipment-open-imaging').click();
  const panel = page.getByTestId('equipment-panel');
  const camera = panel.getByRole('figure', { name: '相机位点判读' });
  const clip = panel.getByLabel('回放阶段');
  const cursor = panel.getByRole('slider', { name: '设备阶段时间轴' });
  await clip.selectOption('occupancy-check');
  await cursor.fill('4700');
  await expect(camera.getByText('曝光中')).toHaveCount(2);
  await cursor.fill('5000');
  await expect(camera.getByText('有原子')).toHaveCount(1);
  await expect(camera.getByText('空位', { exact: true })).toHaveCount(1);
  await clip.selectOption('occupancy-recheck');
  await expect(camera.getByText('曝光中')).toHaveCount(2);
  await cursor.fill('7350');
  await expect(camera.getByText('有原子')).toHaveCount(2);
  await clip.selectOption('readout');
  await expect(camera.getByText('待判读')).toHaveCount(2);
  await cursor.fill('15200');
  await expect(camera.getByText('暗 · 1')).toHaveCount(2);
  await expect(camera).toContainText('q1 · D5');
  await cursor.fill('13150');
  await expect(camera.getByText('待判读')).toHaveCount(2);
  await panel.getByRole('button', { name: '返回整机' }).click();
  await page.getByRole('slider', { name: '单原子丢失概率' }).fill('1');
  await page.getByTestId('equipment-open-imaging').click();
  await cursor.fill('15200');
  await expect(panel).toContainText('无有效位串');
  await expect(camera.getByText('无有效观测')).toHaveCount(2);
});

test('八种设备均可放大、逐件选择和拆合，三维像素与当前轮的数据独立核对', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/#machine');
  const time = page.getByRole('slider', { name: '演示时间轴' });
  const canvas = page.getByTestId('quantum-scene-canvas');
  const panel = page.getByTestId('equipment-panel');
  const shots = page.getByTestId('machine-shots');
  await page.getByLabel('实验协议', { exact: true }).selectOption('bell-replenishment');
  await page.getByLabel('尝试次数', { exact: true }).selectOption('64');
  await page.getByLabel('单比特读出翻转', { exact: true }).fill('0');
  await time.fill('13279');
  await page.getByLabel('回放尝试编号', { exact: true }).fill('3');
  await expect(shots).toHaveAttribute('data-completed-shots', '4');
  await expect(canvas).toHaveAttribute('data-stage', 'readout');
  await expect(canvas).toHaveAttribute('data-attempt', '3');
  const atomLayout = await canvas.getAttribute('data-atom-layout');
  expect(atomLayout).toBeTruthy();
  const overview = await renderedPixels(page, canvas);

  for (const [id, parts] of Object.entries(modules)) {
    await test.step(id, async () => {
      await page.getByTestId(`equipment-open-${id}`).click();
      await expect(panel).toHaveAttribute('data-module', id);
      await expect(page).toHaveURL(new RegExp(`#machine/equipment/${id}$`));
      await expect(panel.getByTestId('quantum-scene-canvas')).toBeVisible();
      await expect(canvas).toHaveAttribute('data-inspection-module', id);
      await expect(panel.locator('button[data-part]')).toHaveCount(parts.length);
      for (const part of parts) {
        const button = panel.locator(`button[data-part="${part}"]`);
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(canvas).toHaveAttribute('data-inspection-part', part);
      }
      const spread = panel.getByRole('slider', { name: '拆解程度' });
      await panel.getByRole('button', { name: '合拢', exact: true }).click();
      await expect(spread).toHaveValue('0');
      const together = await renderedPixels(page, canvas);
      expect(changedPixels(overview, together), `${id} focus`).toBeGreaterThan(80);
      await panel.getByRole('button', { name: '拆解', exact: true }).click();
      await expect(spread).toHaveValue('100');
      await expect.poll(async () => changedPixels(together, await renderedPixels(page, canvas)), { message: `${id} explosion` }).toBeGreaterThan(20);
      await panel.getByRole('button', { name: '返回整机', exact: true }).click();
      await expect(panel).toHaveCount(0);
      await expect(time).toHaveValue('13279');
      await expect(shots).toHaveAttribute('data-completed-shots', '4');
      await expect(page.getByLabel('回放尝试编号', { exact: true })).toHaveValue('3');
      await expect(canvas).toHaveAttribute('data-atom-layout', atomLayout!);
    });
  }
  const returned = await renderedPixels(page, canvas);
  expect(changedPixels(overview, returned)).toBeLessThan(20);
});

test('原始画布点选命中设备，拖动只旋转视角，检查结束后还原自定视角', async ({ page }) => {
  await page.goto('/#machine');
  const canvas = page.getByTestId('quantum-scene-canvas');
  const panel = page.getByTestId('equipment-panel');
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const target = { x: rect.x + rect.width * 0.192, y: rect.y + rect.height * 0.51 };
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, target)).toBe('CANVAS');
  await page.mouse.click(target.x, target.y);
  await expect(panel).toHaveAttribute('data-module', 'slm');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await canvas.scrollIntoViewIfNeeded();
  const start = await renderedPixels(page, canvas);
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width * 0.192;
  const y = bounds.y + bounds.height * 0.51;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(panel).toHaveCount(0);
  await expect.poll(async () => changedPixels(start, await renderedPixels(page, canvas))).toBeGreaterThan(80);
  // Check integer screen positions exactly. Three.js can round-trip one floating-point ULP
  // differently when it restores the camera and recomputes the leader-line geometry.
  const labels = page.getByTestId(/^equipment-label-/);
  await expect(labels).toHaveCount(Object.keys(modules).length);
  const readPose = () => labels.evaluateAll(elements => elements.map(element => {
    const { style } = element as HTMLElement;
    return { label: element.getAttribute('data-testid'), visibility: style.visibility, position: style.transform,
      length: parseFloat(style.getPropertyValue('--leader-length') || '0'),
      angle: parseFloat(style.getPropertyValue('--leader-angle') || '0') };
  }));
  type Pose = Awaited<ReturnType<typeof readPose>>;
  const samePose = (a: Pose, b: Pose) => a.length === b.length && a.every((point, i) =>
    point.label === b[i].label && point.visibility === b[i].visibility && point.position === b[i].position
      && Math.abs(point.length - b[i].length) < 1e-8 && Math.abs(point.angle - b[i].angle) < 1e-8);
  await expect.poll(async () => {
    const before = await readPose();
    await page.evaluate(async () => {
      for (let frame = 0; frame < 6; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });
    return samePose(before, await readPose());
  }).toBe(true);
  const pose = await readPose();
  expect(pose.filter(label => label.visibility === 'visible').length).toBeGreaterThan(1);
  await page.getByTestId('equipment-open-array').click();
  await expect(panel).toHaveAttribute('data-module', 'array');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect.poll(async () => samePose(pose, await readPose())).toBe(true);
});

test('窄屏八种设备均可从目录打开，键盘返回原入口并暂停当前演示', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/#machine');
  const panel = page.getByTestId('equipment-panel');
  const time = page.getByRole('slider', { name: '演示时间轴' });
  await page.getByRole('button', { name: '启动演示', exact: true }).click();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(0);
  for (const id of Object.keys(modules)) {
    const opener = page.getByTestId(`equipment-open-${id}`);
    await opener.focus();
    await opener.press('Enter');
    await expect(panel).toHaveAttribute('data-module', id);
    const paused = await time.inputValue();
    const spread = panel.getByRole('slider', { name: '拆解程度' });
    await spread.focus();
    await spread.press('End');
    await expect(spread).toHaveValue('100');
    await panel.locator('button[data-part]').first().click();
    await expect(panel.locator('button[data-part]').first()).toHaveAttribute('aria-pressed', 'true');
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(time).toHaveValue(paused);
  }
  await expect(page.getByRole('button', { name: '继续演示', exact: true })).toBeVisible();
});

test('关闭 WebGL 后八种设备仍显示可拆合的二维部件及当前阵列占位', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
      apply(target, receiver, args) {
        if (String(args[0]).includes('webgl')) return null;
        return Reflect.apply(target, receiver, args);
      },
    });
  });
  await page.goto('/#machine/equipment/array');
  const panel = page.getByTestId('equipment-panel');
  const diagram = panel.getByTestId('equipment-diagram');
  await expect(diagram).toBeVisible();
  await expect(diagram.locator('[data-atom-id]')).toHaveCount(0);
  await panel.getByRole('button', { name: '返回整机', exact: true }).click();
  await expect(page.getByTestId('quantum-scene-fallback')).toBeVisible();
  await page.getByRole('slider', { name: '演示时间轴' }).fill('7730');
  await page.getByTestId('equipment-open-array').click();
  await expect.poll(() => diagram.locator('[data-atom-id]').count()).toBeGreaterThan(0);
  for (const [id, parts] of Object.entries(modules)) {
    await panel.getByLabel('切换设备', { exact: true }).selectOption(id);
    await expect(panel).toHaveAttribute('data-module', id);
    if (id === 'source') {
      const time = panel.getByRole('slider', { name: '设备阶段时间轴' });
      await time.fill('200');
      const sample = diagram.getByTestId('cold-sample');
      const y = Number(await sample.getAttribute('cy'));
      await time.fill('900');
      await expect.poll(async () => Number(await sample.getAttribute('cy'))).toBeLessThan(y);
    }
    const layers = diagram.locator('[data-diagram-part]');
    await expect(layers).toHaveCount(parts.length);
    // Browser-calculated transforms include transforms inherited from parent SVG groups.
    const coordinates = () => layers.evaluateAll(groups => groups.map(group => {
      const matrix = (group as SVGGraphicsElement).getCTM()!;
      return [matrix.e, matrix.f];
    }));
    await panel.getByRole('button', { name: '合拢', exact: true }).click();
    const assembled = await coordinates();
    await panel.getByRole('button', { name: '拆解', exact: true }).click();
    const separated = await coordinates();
    const relativeOffsets = separated.map(([x, y], index) =>
      `${Math.round(x - assembled[index][0])},${Math.round(y - assembled[index][1])}`);
    expect(new Set(relativeOffsets).size, `${id} diagram part displacement`).toBeGreaterThan(1);
    const part = diagram.locator(`[data-diagram-part="${parts[0]}"]`);
    await expect(part).toBeVisible();
    const hit = await part.evaluate(group => {
      const rect = group.getBoundingClientRect();
      for (let row = 1; row < 12; row++) {
        for (let column = 1; column < 12; column++) {
          const x = rect.left + rect.width * column / 12, y = rect.top + rect.height * row / 12;
          if (group.contains(document.elementFromPoint(x, y))) return { x, y };
        }
      }
      return null;
    });
    expect(hit, `${id} diagram has a touchable part`).not.toBeNull();
    await page.mouse.click(hit!.x, hit!.y);
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator(`button[data-part="${parts[0]}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await panel.getByRole('button', { name: '返回整机', exact: true }).click();
  await expect(page.getByTestId('quantum-scene-fallback')).toBeVisible();
});

test.describe('触屏设备检查', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('手指点按打开模块和部件，单指拖动旋转三维且不误选', async ({ page, context }) => {
    await page.goto('/#machine');
    await page.getByTestId('equipment-open-gate').tap();
    const panel = page.getByTestId('equipment-panel');
    const canvas = panel.getByTestId('quantum-scene-canvas');
    await expect(panel).toHaveAttribute('data-module', 'gate');
    const selected = panel.locator('button[data-part="probe"]');
    await selected.tap();
    await expect(canvas).toHaveAttribute('data-inspection-part', 'probe');
    await canvas.scrollIntoViewIfNeeded();
    const start = await renderedPixels(page, canvas);
    const rect = (await canvas.boundingBox())!;
    const x = rect.x + rect.width * 0.47;
    const y = rect.y + rect.height * 0.52;
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 10 * step, y: y + 2 * step }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
    await expect.poll(async () => changedPixels(start, await renderedPixels(page, canvas))).toBeGreaterThan(80);
    await expect(canvas).toHaveAttribute('data-inspection-part', 'probe');
    await panel.getByRole('button', { name: '返回整机', exact: true }).tap();
    await expect(panel).toHaveCount(0);
  });
});

test('直接分享的设备链接支持换件并返回整机，浏览器历史可前进和后退', async ({ page }) => {
  await page.goto('/#machine/config');
  await expect(page).toHaveURL(/#machine\/config$/);
  await page.goto('/#machine/equipment/aod');
  const panel = page.getByTestId('equipment-panel');
  await expect(panel).toHaveAttribute('data-module', 'aod');
  await panel.getByLabel('切换设备', { exact: true }).selectOption('vacuum');
  await expect(page).toHaveURL(/#machine\/equipment\/vacuum$/);
  await panel.getByRole('button', { name: '返回整机', exact: true }).click();
  await expect(page).toHaveURL(/#machine\/scene$/);
  await page.goBack();
  await expect(page).toHaveURL(/#machine\/config$/);
  await page.goForward();
  await page.getByTestId('equipment-open-vacuum').click();
  await expect(panel).toHaveAttribute('data-module', 'vacuum');
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await page.goForward();
  await expect(panel).toHaveAttribute('data-module', 'vacuum');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#machine\/scene$/);
});

test('门光方向随回放、回拨及减少动效设置更新，暂停时光路稳定', async ({ page }) => {
  await page.goto('/#machine/equipment/gate');
  const panel = page.getByTestId('equipment-panel');
  const cursor = panel.getByRole('slider', { name: '设备阶段时间轴' });
  const canvas = panel.getByTestId('quantum-scene-canvas');
  const frames = () => canvas.screenshot({ animations: 'disabled' });
  await cursor.fill('7730');
  await expect(canvas).toHaveAttribute('data-active-path', 'rydberg');
  await expect(panel.getByRole('region', { name: '设备运行回放' })).toContainText('沿 +x 入射');
  const uv = await frames();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await frames()).equals(uv)).toBe(false);
  const staticDirection = await frames();
  expect((await frames()).equals(staticDirection)).toBe(true);
  await panel.getByLabel('回放阶段').selectOption('readout');
  await cursor.fill('10079');
  await expect(canvas).toHaveAttribute('data-active-path', 'readout');
  await expect(panel.getByRole('region', { name: '设备运行回放' })).toContainText('沿 −x 入射');
  await panel.getByLabel('回放阶段').selectOption('gates');
  await cursor.fill('7730');
  await expect.poll(async () => (await frames()).equals(staticDirection)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await frames()).equals(uv)).toBe(true);
});

test('公开尺寸区分前序装置的两腔输运与门实验的交互行', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '阵列视图' }).click();
  await expect(page.getByTestId('quantum-scene')).toHaveAttribute('data-view', 'published');
  await expect(page.getByRole('img', { name: /12 行 7 列阱位索引/ }).locator('circle')).toHaveCount(84);
  await page.getByRole('button', { name: '本轮占位' }).click();
  await expect(page.getByTestId('quantum-scene')).toHaveAttribute('data-view', 'array');
  await page.getByRole('button', { name: '尺寸图' }).click();
  const dimensions = page.getByRole('region', { name: '装置公开尺寸' });
  await expect(dimensions.getByRole('img', { name: /300 毫米/ })).toBeVisible();
  await expect(dimensions.getByRole('link')).toHaveAttribute('href', /2401\.16177/);
  await dimensions.getByRole('button', { name: '交互行' }).click();
  await expect(dimensions.getByRole('img', { name: /7 个阱位.*3 微米.*18 微米.*6 微米/ })).toBeVisible();
  await expect(dimensions.locator('circle.metric-site')).toHaveCount(7);
  await expect(dimensions).toContainText('12 行 × 7 列');
  await page.getByTestId('equipment-open-array').click();
  const panel = page.getByTestId('equipment-panel');
  await panel.getByText('实验阵列尺寸', { exact: true }).click();
  await expect(panel.getByRole('img', { name: /18 微米/ })).toBeVisible();
});

test('整机与片段共享十分之一速度，调速从当前时间继续', async ({ page }) => {
  await page.goto('/');
  const globalSpeed = page.getByRole('combobox', { name: '播放速度', exact: true });
  await globalSpeed.selectOption('0.1');
  const homeTime = page.getByRole('slider', { name: '演示时间轴' });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
  await page.getByRole('button', { name: '启动演示', exact: true }).dispatchEvent('click');
  await page.clock.fastForward(1000);
  expect(Number(await homeTime.inputValue())).toBeCloseTo(100, 0);
  await page.getByTestId('equipment-open-source').click();
  const panel = page.getByTestId('equipment-panel');
  const localSpeed = panel.getByRole('combobox', { name: '片段播放速度' });
  await expect(localSpeed).toHaveValue('0.1');
  const localTime = panel.getByRole('slider', { name: '设备阶段时间轴' });
  await panel.getByRole('button', { name: '播放片段', exact: true }).dispatchEvent('click');
  const start = Number(await localTime.inputValue());
  await page.clock.fastForward(1000);
  expect(Number(await localTime.inputValue()) - start).toBeCloseTo(100, 0);
  await localSpeed.selectOption('0.2');
  const changed = Number(await localTime.inputValue());
  await page.clock.fastForward(1000);
  expect(Number(await localTime.inputValue()) - changed).toBeCloseTo(200, 0);
  await panel.getByRole('button', { name: '暂停片段', exact: true }).dispatchEvent('click');
  const paused = await localTime.inputValue();
  await page.clock.fastForward(1000);
  await expect(localTime).toHaveValue(paused);
  await panel.getByRole('button', { name: '返回整机' }).click();
  await expect(globalSpeed).toHaveValue('0.2');
  await expect(homeTime).toHaveValue(paused);
});
