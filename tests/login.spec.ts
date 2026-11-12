import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login-page';

const USERNAME = process.env.TEST_USERNAME ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

test.describe('login', () => {
  test('valid credentials open the dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(USERNAME, PASSWORD);

    await expect(page).toHaveURL(/dashboard\.html$/);
    await expect(page.getByRole('heading', { name: `Welcome, ${USERNAME}` })).toBeVisible();
  });

  // This test fails when APP_VARIANT=defect. That is the controlled product defect for the lab.
  test('invalid credentials show the specified error message', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(USERNAME, 'definitely-wrong-password');

    await expect(login.error).toHaveText('Invalid username or password.');
  });
});
