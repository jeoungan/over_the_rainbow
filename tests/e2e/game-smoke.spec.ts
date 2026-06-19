import { expect, test, type Page } from '@playwright/test';

async function openForE2e(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await waitForTestControls(page);
}

async function waitForTestControls(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.overTheRainbowTest?.goToStage));
}

async function goToStage(page: Page, stageIndex: number): Promise<void> {
  await page.evaluate((targetStageIndex) => {
    window.overTheRainbowTest?.goToStage(targetStageIndex);
  }, stageIndex);
}

async function setGlyphSize(page: Page, targetSize: number): Promise<void> {
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  while (state.caret.glyphSize < targetSize) {
    await page.mouse.wheel(0, -120);
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  }
}

test('renders the game canvas and exposes text state', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const textState = await page.evaluate(() => window.render_game_to_text());
  const state = JSON.parse(textState);
  expect(state.stageId).toBe('stage-1');
  expect(state.vehicleType).toBe('racingCar');
  expect(state.goalState).toBe('editing');
});

test('does not expose test stage controls in the default page', async ({ page }) => {
  await page.goto('/');

  const hasTestControls = await page.evaluate(() => Boolean(window.overTheRainbowTest));
  expect(hasTestControls).toBe(false);
});

test('creates a glyph, starts the vehicle, and moves right', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(360, 360);
  await page.keyboard.press('A');

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(1);

  await page.keyboard.press('Control+R');
  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(600));
  await page.keyboard.up('d');

  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');
  expect(state.player.x).toBeGreaterThan(130);
});

test('keeps the vehicle still before Start even when A or D are pressed', async ({ page }) => {
  await page.goto('/');
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(600));
  await page.keyboard.up('d');
  await page.keyboard.down('a');
  await page.evaluate(() => window.advanceTime(600));
  await page.keyboard.up('a');

  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(after.goalState).toBe('editing');
  expect(Math.abs(after.player.x - before.player.x)).toBeLessThan(2);
});

test('does not apply horizontal drive while the vehicle is airborne', async ({ page }) => {
  await openForE2e(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => {
    window.overTheRainbowTest?.placePlayer({ x: 220, y: 350, vx: 0, vy: 0 });
  });

  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(300));
  await page.keyboard.up('d');

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');
  expect(Math.abs(state.player.vx)).toBeLessThan(0.02);
});

test('supports caret click, wheel sizing, Ctrl+Space, and Korean composition in the scene', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(420, 340);
  await page.mouse.wheel(0, -120);
  await page.keyboard.press('Control+Space');
  await page.evaluate(() => {
    window.dispatchEvent(new CompositionEvent('compositionstart'));
    window.dispatchEvent(new CompositionEvent('compositionend', { data: '한' }));
  });

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.caret.x).toBeGreaterThan(470);
  expect(state.caret.y).toBeCloseTo(340, 0);
  expect(state.caret.glyphSize).toBe(64);
  expect(state.glyphCount).toBe(1);
});

test('drops sky glyphs while typing across a line', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(300, 240);
  await page.keyboard.press('A');

  const afterFirstGlyph = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.keyboard.press('B');
  const afterSecondGlyph = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  expect(afterSecondGlyph.glyphCount).toBe(2);
  expect(afterSecondGlyph.glyphs[1].x).toBeGreaterThan(afterSecondGlyph.glyphs[0].x + 30);
  expect(afterSecondGlyph.caret.x).toBeGreaterThan(afterFirstGlyph.caret.x);

  await page.keyboard.press('Enter');
  const afterLineBreak = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterLineBreak.caret.x).toBeCloseTo(300, 0);
  expect(afterLineBreak.caret.y).toBeGreaterThan(afterSecondGlyph.caret.y + 40);

  await page.evaluate(() => window.advanceTime(900));
  const afterFall = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterFall.glyphs[0].y).toBeGreaterThan(afterSecondGlyph.glyphs[0].y + 80);
  expect(afterFall.glyphs[1].y).toBeGreaterThan(afterSecondGlyph.glyphs[1].y + 80);
  expect(afterFall.glyphs[0].isStatic).toBe(true);
  expect(afterFall.glyphs[1].isStatic).toBe(true);
});

test('supports visible Start, Undo, and Reset controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('button', { hasText: 'Next Stage' })).toBeHidden();

  await page.mouse.click(360, 360);
  await page.keyboard.press('H');
  await page.getByRole('button', { name: 'Undo' }).click();

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(0);

  await page.mouse.click(360, 360);
  await page.keyboard.press('H');
  await page.getByRole('button', { name: 'Start' }).click();
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');

  await page.getByRole('button', { name: 'Reset' }).click();
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('editing');
  expect(state.glyphCount).toBe(0);
});

test('reveals the next stage control only after clearing the rainbow', async ({ page }) => {
  await openForE2e(page);
  await expect(page.locator('button', { hasText: 'Next Stage' })).toBeHidden();

  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => {
    window.overTheRainbowTest?.placePlayer({
      x: 704,
      y: 272,
      previousX: 692,
      previousY: 272,
      vx: 0,
      vy: 0,
    });
    window.advanceTime(16);
  });

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('won');

  await expect(page.getByRole('button', { name: 'Next Stage' })).toBeVisible();
  await page.getByRole('button', { name: 'Next Stage' }).click();

  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-2');
  expect(state.goalState).toBe('editing');
});

test('keeps toolbar controls inside a compact viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');

  const toolbarBox = await page.locator('.game-ui').boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect((toolbarBox?.x ?? 0) + (toolbarBox?.width ?? 0)).toBeLessThanOrEqual(320);
});

test('moves to stage 2 with the small car', async ({ page }) => {
  await openForE2e(page);
  await page.mouse.click(360, 360);
  await page.keyboard.press('R');
  await goToStage(page, 1);

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-2');
  expect(state.vehicleType).toBe('smallCar');
  expect(state.goalState).toBe('editing');
  expect(state.glyphCount).toBe(0);
});

test('moves to stage 3 with the bicycle', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, 2);

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-3');
  expect(state.vehicleType).toBe('bicycle');
  expect(state.goalState).toBe('editing');
});

test('moves to stage 4 with a canyon challenge', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, 3);

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-4');
  expect(state.vehicleType).toBe('smallCar');
  expect(state.goalState).toBe('editing');

  const screenshot = await page.screenshot({ path: 'test-results/stage-4-canyon.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});

test('moves to stage 5 with a terraced walking challenge', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, 4);

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-5');
  expect(state.vehicleType).toBe('walking');
  expect(state.goalState).toBe('editing');

  const screenshot = await page.screenshot({ path: 'test-results/stage-5-terrace.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});

test('moves to stage 6 with a broken bridge bicycle challenge', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, 5);

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-6');
  expect(state.vehicleType).toBe('bicycle');
  expect(state.goalState).toBe('editing');

  const screenshot = await page.screenshot({ path: 'test-results/stage-6-broken-bridge.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});

test('wraps negative e2e stage indices safely', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, -7);

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-6');
  expect(state.vehicleType).toBe('bicycle');
});

test('can clear stage 5 with a gentle typed letter terrace', async ({ page }) => {
  test.setTimeout(70_000);
  await openForE2e(page);
  await goToStage(page, 4);
  await setGlyphSize(page, 144);

  for (const [x, y] of [
    [275, 648],
    [360, 614],
    [445, 580],
    [530, 546],
    [615, 512],
    [700, 478],
    [785, 444],
    [870, 410],
    [955, 376],
    [1040, 342],
    [1125, 308],
  ]) {
    await page.mouse.click(x, y);
    await page.keyboard.press('/');
  }

  await page.evaluate(() => window.advanceTime(900));
  await page.getByRole('button', { name: 'Start' }).click();
  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(30000));
  await page.keyboard.up('d');

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('won');

  const screenshot = await page.screenshot({ path: 'test-results/stage-5-clear.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});

test('can clear stage 6 with linked bridge letters', async ({ page }) => {
  test.setTimeout(70_000);
  await openForE2e(page);
  await goToStage(page, 5);
  await setGlyphSize(page, 144);

  const initialState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(initialState.stageId).toBe('stage-6');
  expect(initialState.vehicleType).toBe('bicycle');

  for (const [x, y] of [
    [300, 648],
    [360, 624],
    [420, 600],
    [480, 576],
    [540, 552],
    [600, 528],
    [660, 504],
    [720, 480],
    [780, 456],
    [840, 432],
    [900, 408],
    [960, 384],
    [1020, 360],
    [1080, 336],
    [1140, 312],
    [1200, 288],
    [1260, 264],
  ]) {
    await page.mouse.click(x, y);
    await page.keyboard.press('/');
    await page.evaluate(() => window.advanceTime(160));
  }

  await page.evaluate(() => window.advanceTime(900));
  await page.getByRole('button', { name: 'Start' }).click();
  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(26000));
  await page.keyboard.up('d');

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const screenshot = await page.screenshot({ path: 'test-results/stage-6-clear.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
  expect(state.goalState).toBe('won');
});

test('fails when the vehicle falls into the stage 4 canyon', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, 3);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.keyboard.down('d');
  await page.evaluate(() => window.advanceTime(4200));
  await page.keyboard.up('d');

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-4');
  expect(state.goalState).toBe('failed');
});

test('gameplay screenshot is nonblank after glyph creation', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(420, 340);
  await page.keyboard.press('O');
  await page.evaluate(() => window.advanceTime(500));

  const screenshot = await page.screenshot({ path: 'test-results/gameplay-polish.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});
