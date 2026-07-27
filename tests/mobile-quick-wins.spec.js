const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function expectTouchTargets(page, selector, minimum = 44) {
  const sizes = await page.locator(selector).evaluateAll(elements => elements
    .filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })
    .map(element => ({
      label: element.textContent.trim() || element.getAttribute('aria-label') || element.id,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height
    })));

  expect(sizes.length).toBeGreaterThan(0);
  sizes.forEach(size => expect(size.height, `${size.label} touch height`).toBeGreaterThanOrEqual(minimum));
}

async function showInvestigatorApp(page) {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.userId = 'field.worker@example.org';
    state.userName = '田野調查員';
    state.userEmail = 'field.worker@example.org';
    state.uploadedRecords = [];
    const places = [normalizeTask({
      task_id: 901,
      source_id: 'MOBILE-901',
      place_name: '手機測試地名',
      county: '南投縣',
      town: '埔里鎮',
      village: '桃米里',
      type: '聚落',
      longitude: 120.93,
      latitude: 23.94,
      tai_audio_count: 0,
      hak_audio_count: 0
    })];
    state.assignedPlaces = places;
    state.allPlaces = [];
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    renderUserInfo();
    renderPlaceList(places);
  });
}

test('mobile login controls meet the minimum touch target', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(appUrl);
  await expectTouchTargets(page, '#email, #login-btn, #admin-toggle-btn');
  await page.locator('#admin-toggle-btn').click();
  await expect(page.locator('#admin-login-fields')).toBeVisible();
  await expectTouchTargets(page, '#password, #admin-login-btn');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test('mobile investigator header stays compact and exposes secondary actions through More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showInvestigatorApp(page);

  await expect(page.locator('.user-primary-actions')).toBeVisible();
  await expect(page.locator('.btn-announcements')).toBeVisible();
  await expect(page.locator('.btn-user-more')).toBeVisible();
  await expect(page.locator('#user-secondary-actions')).toBeHidden();

  const headerBox = await page.locator('#user-info-badge').boundingBox();
  expect(headerBox.height).toBeLessThan(160);
  await expectTouchTargets(page, '.btn-announcements, .btn-user-more, .tab-btn, #county-filter, #town-filter-button, .hak-area-chip, .status-chip, #search-box, #place-map-toggle');

  await page.locator('.btn-user-more').click();
  await expect(page.locator('.btn-user-more')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#user-secondary-actions')).toBeVisible();
  await expectTouchTargets(page, '#user-secondary-actions button');

  await page.locator('h1').click();
  await expect(page.locator('#user-secondary-actions')).toBeHidden();
  await expect(page.locator('.btn-user-more')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

for (const viewport of [{ width: 360, height: 800 }, { width: 375, height: 667 }]) {
  test(`mobile touch targets and width remain safe at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await showInvestigatorApp(page);
    await expectTouchTargets(page, '.btn-announcements, .btn-user-more, .tab-btn, #county-filter, #town-filter-button, .hak-area-chip, .status-chip, #search-box, #place-map-toggle');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}

test('mobile admin batch tools appear after selection and expand as a bounded sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.org';
    state.userName = '系統管理者';
    state.currentTab = 'assigned';
    state.allUsers = [
      { account: 'worker-a@example.org', email: 'worker-a@example.org', name: '調查員甲' },
      { account: 'worker-b@example.org', email: 'worker-b@example.org', name: '調查員乙' }
    ];
    state.assignedPlaces = [normalizeTask({
      task_id: 902,
      source_id: 'MOBILE-902',
      place_name: '管理者手機測試地名',
      county: '南投縣',
      town: '埔里鎮',
      type: '聚落',
      tai_audio_count: 0,
      hak_audio_count: 0
    })];
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    renderUserInfo();
    renderPlaceList(state.assignedPlaces);
    renderAdminBatchAssignUI();
  });

  await expect(page.locator('#admin-assign-bar')).toBeHidden();
  const hitbox = await page.locator('.assign-checkbox-hitbox').boundingBox();
  expect(hitbox.width).toBeGreaterThanOrEqual(44);
  expect(hitbox.height).toBeGreaterThanOrEqual(44);

  await page.locator('.assign-checkbox-hitbox').click();
  await expect(page.locator('.assign-checkbox')).toBeChecked();
  await expect(page.locator('#admin-assign-bar')).toBeVisible();
  await expect(page.locator('#admin-assign-toggle-count')).toHaveText('1 筆已選');
  await expect(page.locator('#admin-assign-panel')).toBeHidden();

  const collapsedBar = await page.locator('#admin-assign-bar').boundingBox();
  expect(collapsedBar.height).toBeLessThanOrEqual(72);
  await expectTouchTargets(page, '#admin-assign-toggle');

  await page.locator('#admin-assign-toggle').click();
  await expect(page.locator('#admin-assign-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#admin-assign-panel')).toBeVisible();
  const searchBox = await page.locator('#assignee-input-search').boundingBox();
  const expandedBar = await page.locator('#admin-assign-bar').boundingBox();
  expect(searchBox.width).toBeGreaterThan(340);
  expect(searchBox.height).toBeGreaterThanOrEqual(44);
  expect(expandedBar.height).toBeLessThan(700);
  await expectTouchTargets(page, '#admin-assign-panel input, #admin-assign-panel select, #admin-assign-panel button');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.locator('.assign-checkbox-hitbox').click();
  await expect(page.locator('#admin-assign-bar')).toBeHidden();
  await expect(page.locator('#admin-assign-toggle')).toHaveAttribute('aria-expanded', 'false');
});
