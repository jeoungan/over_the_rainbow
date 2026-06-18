import { expect, test } from '@playwright/test';

test('renders the game canvas and exposes text state', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const textState = await page.evaluate(() => window.render_game_to_text());
  const state = JSON.parse(textState);
  expect(state.stageId).toBe('tutorial');
  expect(state.vehicleType).toBe('walking');
  expect(state.goalState).toBe('editing');
});
