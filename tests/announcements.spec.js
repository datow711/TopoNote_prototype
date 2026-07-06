const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('investigator sees unread announcement badge and marks it read', async ({ page }) => {
  const gasCalls = [];
  let announcementRead = false;

  await page.route('**/*', route => {
    const request = route.request();
    if (request.url().includes('script.google.com/macros/s/')) {
      const body = JSON.parse(request.postData() || '{}');
      gasCalls.push(body);
      if (body.action === 'markAnnouncementRead') {
        announcementRead = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
      if (body.action === 'getAnnouncements') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            announcements: [{
              id: '11111111-1111-4111-8111-111111111111',
              title: 'Field reminder',
              body: 'Please read before recording.',
              target_account: null,
              created_by: 'admin@example.com',
              created_at: '2026-07-06T02:00:00Z',
              read_at: announcementRead ? '2026-07-06T02:05:00Z' : null,
              is_read: announcementRead
            }]
          })
        });
      }
    }
    return route.continue();
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.userId = 'investigator@example.com';
    state.userName = 'Investigator';
    state.userEmail = 'investigator@example.com';
    state.announcements = [{
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Field reminder',
      body: 'Please read before recording.',
      targetAccount: '',
      createdBy: 'admin@example.com',
      createdAt: '2026-07-06T02:00:00Z',
      readAt: '',
      isRead: false,
      readCount: 0
    }];
    state.unreadAnnouncementCount = 1;
    document.getElementById('app-section').classList.remove('hidden');
    renderUserInfo();
  });

  await expect(page.locator('.btn-announcements')).toContainText('公告');
  await expect(page.locator('.announcement-unread-badge')).toHaveText('1');

  await page.locator('.btn-announcements').click();
  await expect(page.getByRole('heading', { name: 'Field reminder' })).toBeVisible();
  await page.getByRole('button', { name: '已讀' }).click();

  await expect(page.locator('.announcement-unread-badge')).toHaveCount(0);
  await expect(page.locator('.announcement-read-state')).toContainText('已讀');
  expect(gasCalls.some(call => call.action === 'markAnnouncementRead')).toBe(true);
});

test('admin creates targeted announcement through Apps Script', async ({ page }) => {
  const gasCalls = [];

  await page.route('**/*', route => {
    const request = route.request();
    if (request.url().includes('script.google.com/macros/s/')) {
      const body = JSON.parse(request.postData() || '{}');
      gasCalls.push(body);
      if (body.action === 'getAnnouncements') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            announcements: [{
              id: '22222222-2222-4222-8222-222222222222',
              title: 'Private note',
              body: 'Only one investigator.',
              target_account: 'target@example.com',
              created_by: 'admin@example.com',
              created_at: '2026-07-06T02:00:00Z',
              read_count: 0
            }]
          })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          announcement: { id: '22222222-2222-4222-8222-222222222222' }
        })
      });
    }
    return route.continue();
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userEmail = 'admin@example.com';
    state.allUserRecords = [
      {
        id: 'user-1',
        account: 'target@example.com',
        role: 'user',
        is_active: true,
        name: 'Target User',
        email: 'target@example.com'
      }
    ];
    document.getElementById('app-section').classList.remove('hidden');
    renderUserInfo();
  });

  await page.locator('.btn-announcements').click();
  await page.locator('#announcement-target').selectOption('target@example.com');
  await page.locator('#announcement-title-input').fill('Private note');
  await page.locator('#announcement-body-input').fill('Only one investigator.');
  await page.locator('#announcement-admin-password').fill('admin-secret');
  await page.getByRole('button', { name: '發布公告' }).click();

  await expect.poll(() => gasCalls.some(call => call.action === 'createAnnouncement')).toBe(true);
  const createCall = gasCalls.find(call => call.action === 'createAnnouncement');
  expect(createCall).toEqual(expect.objectContaining({
    action: 'createAnnouncement',
    actorAccount: 'admin@example.com',
    adminPassword: 'admin-secret',
    title: 'Private note',
    body: 'Only one investigator.',
    targetAccount: 'target@example.com'
  }));
  await expect(page.getByText('專屬：target@example.com')).toBeVisible();
});
