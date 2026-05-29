import { test, expect } from '@playwright/test';

test.describe('caregiver-share flow', () => {
  test('placeholder happy path', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Med-Tracker/);
  });
});
