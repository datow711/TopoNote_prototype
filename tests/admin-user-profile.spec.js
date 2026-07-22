const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('admin edits investigator profile through Apps Script writeback', async ({ page }) => {
  const calls = [];

  await page.route('**/*', route => {
    const request = route.request();

    if (request.url().includes('/rest/v1/rpc/update_investigator_profile')) {
      calls.push({
        type: 'unexpected-supabase',
        body: JSON.parse(request.postData() || '{}')
      });
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'frontend must not call service RPC directly' })
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
        body: JSON.stringify({ success: true, row: 2, email: 'new@example.com' })
      });
    }

    return route.continue();
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));
    loadDataFromSupabase = async () => {};
    initFilters = () => {};
    applyFilters = () => {};

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.allUserRecords = [
      {
        id: 'user-1',
        account: 'old@example.com',
        role: 'user',
        is_active: true,
        name: 'Old Investigator',
        email: 'old@example.com',
        phone: '0912',
        languages: 'Taiwanese',
        hakka_dialect: '',
        life_area_1: '',
        survey_area_1: '',
        life_area_2: '',
        survey_area_2: '',
        life_area_3: '',
        survey_area_3: ''
      },
      {
        id: 'user-2',
        account: 'zero@example.com',
        role: 'user',
        is_active: false,
        name: 'Zero Investigator',
        email: 'zero@example.com',
        phone: '0900',
        languages: '',
        hakka_dialect: '',
        life_area_1: '',
        survey_area_1: '',
        life_area_2: '',
        survey_area_2: '',
        life_area_3: '',
        survey_area_3: ''
      }
    ];
    state.assignedPlaces = [
      {
        id: 101,
        assignedUsers: ['Old Investigator'],
        assignedTo: '',
        tAssignee: 'Old Investigator',
        hAssignee: ''
      },
      {
        id: 102,
        assignedUsers: [],
        assignedTo: '',
        tAssignee: '',
        hAssignee: 'old@example.com'
      }
    ];
    state.uploadedRecords = [
      { recordId: 1, placeId: 101, uploaderId: 'old@example.com' },
      { recordId: 2, placeId: 102, uploaderId: 'Old Investigator' }
    ];
    state.reviewQueue = [
      {
        id: 101,
        tAssignee: 'Old Investigator',
        hAssignee: '',
        tReviewState: '已完成標注',
        hReviewState: '尚未標注'
      },
      {
        id: 102,
        tAssignee: '',
        hAssignee: 'old@example.com',
        tReviewState: '尚未標注',
        hReviewState: '已完成標注'
      }
    ];
    document.getElementById('app-section').classList.remove('hidden');
    renderAdminUserManager();
  });

  await expect(page.getByText('指派 2 筆')).toBeVisible();
  await expect(page.getByText('錄音 2 筆')).toBeVisible();
  await expect(page.locator('.user-detail-panel[hidden]')).toHaveCount(2);

  const userNames = page.locator('.user-status-row .user-name');
  await page.getByRole('button', { name: '錄音' }).click();
  await expect(userNames.first()).toHaveText('Old Investigator');
  await page.getByRole('button', { name: '錄音' }).click();
  await expect(userNames.first()).toHaveText('Zero Investigator');

  await page.locator('.user-status-row').filter({ hasText: 'Old Investigator' }).getByRole('button', { name: '編輯' }).click();

  await page.locator('#user-edit-email').fill('new@example.com');
  await page.locator('#user-edit-name').fill('New Investigator');
  await page.locator('#user-edit-phone').fill('0988');
  await page.locator('#user-edit-admin-password').fill('secret-admin-password');
  await page.getByRole('button', { name: '儲存' }).click();

  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({
    type: 'gas',
    body: expect.objectContaining({
      action: 'updateUserProfile',
      actorAccount: 'admin@example.com',
      adminPassword: 'secret-admin-password',
      userId: 'user-1',
      previousEmail: 'old@example.com',
      previousAccount: 'old@example.com',
      profile: expect.objectContaining({
        email: 'new@example.com',
        name: 'New Investigator',
        phone: '0988'
      })
    })
  });
});
