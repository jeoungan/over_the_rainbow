import { expect, test } from '@playwright/test';

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

test('supports visible Start, Undo, and Reset controls', async ({ page }) => {
  await page.goto('/');
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

test('moves to stage 2 with the small car', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(360, 360);
  await page.keyboard.press('R');
  await page.getByRole('button', { name: 'Next' }).click();

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-2');
  expect(state.vehicleType).toBe('smallCar');
  expect(state.goalState).toBe('editing');
  expect(state.glyphCount).toBe(0);
});

test('moves to stage 3 with the bicycle', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-3');
  expect(state.vehicleType).toBe('bicycle');
  expect(state.goalState).toBe('editing');
});

test('moves to stage 4 with a canyon challenge', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.stageId).toBe('stage-4');
  expect(state.vehicleType).toBe('smallCar');
  expect(state.goalState).toBe('editing');

  const screenshot = await page.screenshot({ path: 'test-results/stage-4-canyon.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});

test('gameplay screenshot is nonblank after glyph creation', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(420, 340);
  await page.keyboard.press('O');
  await page.evaluate(() => window.advanceTime(500));

  const screenshot = await page.screenshot({ path: 'test-results/gameplay-polish.png' });
  expect(screenshot.length).toBeGreaterThan(20_000);
});
