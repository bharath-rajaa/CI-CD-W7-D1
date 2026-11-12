import { test, expect } from '@playwright/test';

test('@smoke login page renders', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page).toHaveTitle(/Sign in/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
});

test('@smoke health endpoint responds', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
});
