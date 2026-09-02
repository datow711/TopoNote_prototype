const { pathToFileURL } = require('url');
const path = require('path');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('investigator login uses Supabase Auth and resolves the database profile', async ({ page }) => {
  let authRequest = null;
  let profileRequest = null;
  await page.route('**/auth/v1/token*', async route => {
    authRequest = {
      url: route.request().url(),
      body: JSON.parse(route.request().postData() || '{}')
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'bearer'
      })
    });
  });
  await page.route('**/rest/v1/rpc/get_authenticated_investigator', async route => {
    profileRequest = {
      headers: route.request().headers(),
      body: JSON.parse(route.request().postData() || '{}')
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        user_id: '00000000-0000-0000-0000-000000000002',
        account: 'test2@test.com',
        role: 'audio_assessor',
        name: '林聽聽',
        email: 'test2@test.com',
        phone: ''
      }])
    });
  });
  await page.goto(appUrl);
  await page.evaluate(async () => {
    window.enterApp = async user => { window.__enteredUser = user; };
    document.getElementById('email').value = 'test2@test.com';
    document.getElementById('auth-password').value = 'test-password';
    await window.login();
  });

  expect(authRequest.url).toContain('grant_type=password');
  expect(authRequest.body).toEqual({ email: 'test2@test.com', password: 'test-password' });
  expect(profileRequest.body).toEqual({});
  expect(profileRequest.headers.authorization).toBe('Bearer test-access-token');
  await expect.poll(() => page.evaluate(() => window.__enteredUser)).toMatchObject({
    account: 'test2@test.com',
    role: 'audio_assessor',
    name: '林聽聽'
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('toponote_supabase_auth_session')
  ))).toMatchObject({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token'
  });
});
