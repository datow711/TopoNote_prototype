const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('admin changes own password through Apps Script wrapper', async ({ page }) => {
  const calls = [];

  await page.route('**/*', route => {
    const request = route.request();

    if (request.url().includes('/rest/v1/rpc/change_admin_password')) {
      calls.push({
        type: 'unexpected-supabase',
        body: JSON.parse(request.postData() || '{}')
      });
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'frontend must not call password RPC directly' })
      });
    }

    if (request.url().includes('script.google.com/macros/s/')) {
      calls.push({
        type: 'gas',
        body: JSON.parse(request.postData() || '{}')
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    }

    return route.continue();
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));

    state.userRole = 'admin';
    state.userId = 'admin-account';
    state.userEmail = 'admin@example.com';
    state.userName = 'Admin User';
    document.getElementById('app-section').classList.remove('hidden');
    renderUserInfo();
  });

  await page.getByRole('button', { name: '變更密碼' }).click();
  await page.locator('#admin-current-password').fill('old-password');
  await page.locator('#admin-new-password').fill('new-password-123');
  await page.locator('#admin-confirm-password').fill('new-password-123');
  await page.getByRole('button', { name: '儲存' }).click();

  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({
    type: 'gas',
    body: {
      action: 'changeAdminPassword',
      actorAccount: 'admin@example.com',
      currentPassword: 'old-password',
      newPassword: 'new-password-123'
    }
  });

  const alerts = await page.evaluate(() => window.__alerts);
  expect(alerts).toContain('管理員密碼已更新。下次登入請使用新密碼。');
});
