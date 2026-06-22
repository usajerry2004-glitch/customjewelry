import { test, expect } from '@playwright/test';

const ADMIN = { email: 'admin@kirajewels.one', password: 'KiRa@Admin#2025!' };

async function login(page: any, creds = ADMIN) {
  await page.goto('/login');
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|customer\/orders/, { timeout: 10000 });
}

test.describe('Auth', () => {
  test('admin login redirects to dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN.email);
    await page.fill('input[type="password"]', 'wrong-password');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Orders', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('orders page loads', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.locator('text=Orders')).toBeVisible();
    // Wait for skeleton to resolve (orders grid or empty state)
    await page.waitForSelector('.orders-grid, text=No orders found', { timeout: 10000 });
  });

  test('order detail page loads for first order', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForSelector('.orders-grid', { timeout: 10000 });
    const firstCard = page.locator('.orders-grid > div').first();
    await firstCard.click();
    await page.waitForURL(/orders\/[a-f0-9-]+/, { timeout: 5000 });
    await expect(page.locator('h1, h2')).toBeVisible();
  });
});

test.describe('Customers', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('customers page loads', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.locator('text=Customers')).toBeVisible();
  });
});
