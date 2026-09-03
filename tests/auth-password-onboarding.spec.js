const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260902_auth_password_onboarding.sql'),
  'utf8'
);
const edgeFunction = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'auth-email-bootstrap', 'index.ts'),
  'utf8'
);

test('email bootstrap contract is server-gated and uses a real Auth email flow', async () => {
  expect(migration).toContain('password_onboarding_acknowledged_at timestamptz');
  expect(migration).toContain('get_password_onboarding_status');
  expect(migration).toContain('acknowledge_password_onboarding');
  expect(migration).toContain('grant execute on function public.get_password_onboarding_status()');
  expect(migration).toContain('grant execute on function public.acknowledge_password_onboarding()');
  expect(edgeFunction).toContain('password_onboarding_acknowledged_at');
  expect(edgeFunction).toContain('investigator.auth_user_id');
  expect(edgeFunction).toContain('shouldCreateUser: false');
  expect(edgeFunction).toContain('publicClient.auth.signInWithOtp');
  expect(edgeFunction).toContain('return jsonResponse({ ok: true })');
});

test("missing password shows guidance dialog and can start email bootstrap", async ({ page }) => {
  let requestBody = null;
  await page.route("**/functions/v1/auth-email-bootstrap", async route => {
    requestBody = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto(appUrl);
  await page.evaluate(async () => {
    document.getElementById("email").value = "liz462";
    await window.login();
  });

  await expect(page.locator("#missing-password-dialog")).toBeVisible();
  await expect(page.locator("#missing-password-dialog")).toContainText("系統已轉換為需要密碼登入，若尚未設定，請點選下方「取得密碼信」按鈕。");
  await expect(page.locator("#missing-password-dialog [data-action=get-email]")).toHaveText("取得密碼信");
  await page.locator("#missing-password-dialog [data-action=get-email]").click();

  expect(requestBody).toEqual({ identifier: "liz462" });
});
test('email bootstrap request sends only the identifier and does not create a session locally', async ({ page }) => {
  let requestBody = null;
  await page.route('**/functions/v1/auth-email-bootstrap', async route => {
    requestBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto(appUrl);
  await page.evaluate(async () => {
    document.getElementById('email').value = 'liz462';
    await window.startEmailBootstrapLogin();
  });

  expect(requestBody).toEqual({ identifier: 'liz462' });
  expect(await page.evaluate(() => localStorage.getItem('toponote_supabase_auth_session'))).toBeNull();
  await expect(page.locator('#login-status')).toContainText('登入連結已寄出');
});

test('magic link callback shows mandatory password onboarding dialog and acknowledgement is persisted', async ({ page }) => {
  let acknowledgementBody = null;
  await page.route('**/rest/v1/rpc/get_authenticated_investigator', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        user_id: '00000000-0000-0000-0000-000000000002',
        account: 'liz462',
        role: 'audio_assessor',
        name: 'Test Investigator',
        email: 'liz462@mail.naer.edu.tw',
        phone: ''
      }])
    });
  });
  await page.route('**/rest/v1/rpc/get_password_onboarding_status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ password_login_required: false, acknowledged_at: null }])
    });
  });
  await page.route('**/rest/v1/rpc/acknowledge_password_onboarding', async route => {
    acknowledgementBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ password_login_required: true, acknowledged_at: '2026-09-02T00:00:00Z' }])
    });
  });

  await page.goto(appUrl);
  await page.evaluate(async () => {
    window.enterApp = async user => { window.__enteredUser = user; };
    window.location.hash = '#access_token=access-token&refresh_token=refresh-token&expires_in=3600&type=magiclink';
    await window.restoreSession();
  });

  const callbackState = await page.evaluate(async () => {
    window.location.hash = '#access_token=access-token&refresh_token=refresh-token&expires_in=3600&type=magiclink';
    const callback = window.consumeSupabaseAuthCallback();
    await window.maybeShowPasswordOnboardingDialog();
    return callback;
  });
  expect(callbackState).toMatchObject({ isEmailBootstrap: true });
  await expect(page.locator('#password-onboarding-dialog')).toBeVisible();
  await expect(page.locator('#password-onboarding-dialog')).toContainText('請記下共用登入密碼');
  await page.locator('#password-onboarding-confirm-btn').click();
  await expect(page.locator('#password-onboarding-dialog')).toHaveCount(0);
  expect(acknowledgementBody).toEqual({});
});

test('stale magic link is rejected before app entry after acknowledgement', async ({ page }) => {
  let authenticatedRpcCalled = false;
  await page.route('**/rest/v1/rpc/get_password_onboarding_status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ password_login_required: true, acknowledged_at: '2026-09-02T00:00:00Z' }])
    });
  });
  await page.route('**/rest/v1/rpc/get_authenticated_investigator', async route => {
    authenticatedRpcCalled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto(appUrl);
  await page.evaluate(async () => {
    window.enterApp = async () => { window.__enteredApp = true; };
    window.location.hash = '#access_token=access-token&refresh_token=refresh-token&expires_in=3600&type=magiclink';
    await window.restoreSession();
  });

  expect(authenticatedRpcCalled).toBe(false);
  expect(await page.evaluate(() => Boolean(window.__enteredApp))).toBe(false);
  await expect(page.locator('#login-status')).toContainText('登入狀態已失效');
});
