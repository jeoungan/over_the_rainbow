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
  await page.keyboard.press('O');

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(1);

  await page.keyboard.press('Control+R');
  await page.evaluate(() => window.advanceTime(100));

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

test('types D as text while the launched vehicle continues forward', async ({ page }) => {
  await openForE2e(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => {
    window.overTheRainbowTest?.placePlayer({ x: 220, y: 350, vx: 0, vy: 0 });
  });
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  await page.keyboard.press('d');
  await page.evaluate(() => window.advanceTime(300));

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');
  expect(state.glyphCount).toBe(before.glyphCount + 1);
  expect(state.glyphs[state.glyphs.length - 1].char).toBe('d');
  expect(state.player.vx).toBeGreaterThan(0);
});

test('types WASD as letters and uses only arrows for caret movement', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(260, 300);
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  await page.keyboard.type('wasd');
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(4);
  expect(state.glyphs.map((glyph: { char: string }) => glyph.char).join('')).toBe('wasd');
  expect(state.caret.y).toBeCloseTo(before.caret.y, 0);

  await page.keyboard.press('ArrowUp');
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.caret.y).toBeLessThan(before.caret.y);
  expect(state.glyphCount).toBe(4);
});

test('supports caret click, wheel sizing, Ctrl+Space, and Korean composition in the scene', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(420, 340);
  await page.mouse.wheel(0, -120);
  await page.keyboard.press('Control+Space');
  await page.evaluate(() => {
    const capture = document.querySelector<HTMLTextAreaElement>('.text-capture');
    if (!capture) return;

    capture.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    capture.value = '\uD55C';
    capture.dispatchEvent(new CompositionEvent('compositionend', { data: '\uD55C', bubbles: true }));
  });

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.caret.x).toBeGreaterThan(470);
  expect(state.caret.y).toBeCloseTo(340, 0);
  expect(state.caret.glyphSize).toBe(60);
  expect(state.glyphCount).toBe(1);
});

test('ignores IME language-toggle composition noise', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(360, 300);

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'HangulMode', bubbles: true }));
    window.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.dispatchEvent(new CompositionEvent('compositionend', { data: '\u314D', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', bubbles: true }));
  });

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(0);
});

test('does not refocus the text capture on every typed key', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(260, 300);
  await page.evaluate(() => {
    const capture = document.querySelector<HTMLTextAreaElement>('.text-capture');
    if (!capture) return;

    capture.focus();
    (window as Window & { __focusCount?: number }).__focusCount = 0;
    const originalFocus = capture.focus.bind(capture);
    capture.focus = (options?: FocusOptions) => {
      const testWindow = window as Window & { __focusCount?: number };
      testWindow.__focusCount = (testWindow.__focusCount ?? 0) + 1;
      originalFocus(options);
    };
  });

  await page.keyboard.press('H');
  await page.keyboard.press('I');

  const focusCount = await page.evaluate(() => (window as Window & { __focusCount?: number }).__focusCount);
  expect(focusCount).toBe(0);
});

test('keeps up with a fast burst of typed text', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(260, 300);

  await page.evaluate(() => {
    const capture = document.querySelector<HTMLTextAreaElement>('.text-capture');
    capture?.dispatchEvent(new InputEvent('beforeinput', {
      data: 'rainbowtyping',
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    }));
  });

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe('rainbowtyping'.length);
  expect(state.glyphs.map((glyph: { char: string }) => glyph.char).join('')).toBe('rainbowtyping');
});

test('backspace returns the caret to the deleted glyph start', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(300, 300);

  await page.keyboard.press('L');
  const afterFirstGlyph = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.keyboard.press('O');
  const afterSecondGlyph = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterSecondGlyph.caret.x).toBeGreaterThan(afterFirstGlyph.caret.x);

  await page.keyboard.press('Backspace');
  const afterDelete = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterDelete.glyphCount).toBe(1);
  expect(afterDelete.glyphs.map((glyph: { char: string }) => glyph.char).join('')).toBe('L');
  expect(afterDelete.caret.x).toBeCloseTo(afterFirstGlyph.caret.x, 0);
  expect(afterDelete.caret.y).toBeCloseTo(afterFirstGlyph.caret.y, 0);
});

test('can double-click to move the active typing cursor before spacing and release', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(260, 300);
  await page.keyboard.press('A');
  const first = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  await page.mouse.dblclick(540, 250);
  await page.keyboard.press('B');
  const moved = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(moved.glyphCount).toBe(2);
  expect(moved.glyphs[0].x).toBeCloseTo(first.glyphs[0].x, 0);
  expect(moved.glyphs[1].x).toBeGreaterThan(530);
  expect(moved.caret.y).toBeCloseTo(250, 0);

  await page.keyboard.press('Space');
  const afterSpace = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterSpace.caret.x).toBeGreaterThan(moved.caret.x);
  expect(afterSpace.caret.y).toBeCloseTo(moved.caret.y, 0);

  await page.keyboard.press('Enter');
  await page.evaluate(() => window.advanceTime(900));
  const afterRelease = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterRelease.glyphs.every((glyph: { hasPhysics: boolean }) => glyph.hasPhysics)).toBe(true);
  expect(afterRelease.glyphs[1].y).toBeGreaterThan(moved.glyphs[1].y + 60);
});

test('releases typed glyphs into physics when Enter is pressed', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(300, 240);
  await page.keyboard.press('L');

  const afterFirstGlyph = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.keyboard.press('O');
  const afterSecondGlyph = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  expect(afterSecondGlyph.glyphCount).toBe(2);
  expect(afterSecondGlyph.glyphs[1].x).toBeGreaterThan(afterSecondGlyph.glyphs[0].x + 18);
  expect(afterSecondGlyph.caret.x).toBeGreaterThan(afterFirstGlyph.caret.x);

  await page.evaluate(() => window.advanceTime(900));
  const beforeRelease = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(beforeRelease.glyphs[0].y).toBeCloseTo(afterSecondGlyph.glyphs[0].y, 0);
  expect(beforeRelease.glyphs[1].y).toBeCloseTo(afterSecondGlyph.glyphs[1].y, 0);
  expect(beforeRelease.glyphs[0].hasPhysics).toBe(false);
  expect(beforeRelease.glyphs[1].hasPhysics).toBe(false);

  await page.keyboard.press('Enter');
  await page.evaluate(() => window.advanceTime(900));
  const afterFall = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(afterFall.caret.x).toBe(afterSecondGlyph.caret.x);
  expect(afterFall.caret.y).toBe(afterSecondGlyph.caret.y);
  expect(afterFall.glyphs[0].hasPhysics).toBe(true);
  expect(afterFall.glyphs[1].hasPhysics).toBe(true);
  expect(afterFall.glyphs[0].y).toBeGreaterThan(beforeRelease.glyphs[0].y + 80);
  expect(afterFall.glyphs[1].y).toBeGreaterThan(beforeRelease.glyphs[1].y + 80);
  expect(afterFall.glyphs[0].isStatic).toBe(false);
  expect(afterFall.glyphs[1].isStatic).toBe(false);
});

test('moves the typing cursor with keys, supports mixed sizes, and selects all text', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(420, 300);
  const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  const moved = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(moved.caret.x).toBeGreaterThan(initial.caret.x);
  expect(moved.caret.y).toBeLessThan(initial.caret.y);

  for (let i = 0; i < 7; i += 1) await page.mouse.wheel(0, 120);
  await page.evaluate(() => {
    const capture = document.querySelector<HTMLTextAreaElement>('.text-capture');
    if (!capture) return;

    capture.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    capture.value = '\u3147';
    capture.dispatchEvent(new CompositionEvent('compositionend', { data: '\u3147', bubbles: true }));
  });
  for (let i = 0; i < 5; i += 1) await page.mouse.wheel(0, 120);
  await page.evaluate(() => {
    const capture = document.querySelector<HTMLTextAreaElement>('.text-capture');
    if (!capture) return;

    capture.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    capture.value = '\u314F';
    capture.dispatchEvent(new CompositionEvent('compositionend', { data: '\u314F', bubbles: true }));
  });

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.glyphCount).toBe(2);
  expect(state.glyphs[0].hasPhysics).toBe(false);
  expect(state.glyphs[1].hasPhysics).toBe(false);
  expect(state.glyphs[0].size).toBeGreaterThan(state.glyphs[1].size);
  expect(state.glyphs[1].x - state.glyphs[0].x).toBeLessThan(70);

  await page.keyboard.press('Control+A');
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.selectedGlyphCount).toBe(2);
  expect(state.glyphs.every((glyph: { isSelected: boolean }) => glyph.isSelected)).toBe(true);
});

test('lets falling glyphs physically disturb earlier glyphs', async ({ page }) => {
  await page.goto('/');
  await setGlyphSize(page, 100);
  await page.mouse.click(560, 610);
  await page.keyboard.press('O');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.advanceTime(1100));

  const settled = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const bottomBefore = settled.glyphs[0];

  await page.mouse.click(bottomBefore.x - 26, 250);
  await page.keyboard.press('O');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.advanceTime(1200));

  const afterHit = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const bottomAfter = afterHit.glyphs[0];
  const displacement = Math.abs(bottomAfter.x - bottomBefore.x) + Math.abs(bottomAfter.rotation - bottomBefore.rotation) * 20;
  expect(bottomAfter.isStatic).toBe(false);
  expect(displacement).toBeGreaterThan(1);
});

test('can summon and release letters after the vehicle has started', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => window.advanceTime(80));
  await page.mouse.click(520, 250);
  await page.keyboard.press('O');

  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');
  expect(state.glyphCount).toBe(1);
  expect(state.glyphs[0].hasPhysics).toBe(false);

  await page.keyboard.press('Enter');
  await page.evaluate(() => window.advanceTime(300));
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).toBe('playing');
  expect(state.glyphs[0].hasPhysics).toBe(true);
  expect(state.glyphs[0].y).toBeGreaterThan(260);
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

test('can launch stage 5 across a gentle typed letter terrace', async ({ page }) => {
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
    await page.keyboard.press('Enter');
  }

  await page.evaluate(() => window.advanceTime(900));
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => window.advanceTime(30000));

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.goalState).not.toBe('failed');
  expect(state.player.x).toBeGreaterThan(350);

  const screenshot = await page.screenshot({ path: 'test-results/stage-5-clear.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});

test('can launch stage 6 onto linked bridge letters', async ({ page }) => {
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
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.advanceTime(160));
  }

  await page.evaluate(() => window.advanceTime(900));
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => window.advanceTime(26000));

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const screenshot = await page.screenshot({ path: 'test-results/stage-6-clear.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
  expect(state.goalState).not.toBe('failed');
  expect(state.player.x).toBeGreaterThan(450);
});

test('fails when the vehicle falls into a canyon drop', async ({ page }) => {
  await openForE2e(page);
  await goToStage(page, 3);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.evaluate(() => {
    window.overTheRainbowTest?.placePlayer({ x: 640, y: 690, vx: 0, vy: 8 });
    window.advanceTime(120);
  });

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
