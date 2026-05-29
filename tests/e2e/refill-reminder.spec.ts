import { test, expect } from '@playwright/test';

test.describe('refill-reminder flow', () => {
  test('placeholder happy path', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Med-Tracker/);
  });
});
