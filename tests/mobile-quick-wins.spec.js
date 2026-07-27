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
      hak_area: true,
      tai_audio_count: 0,
      hak_audio_count: 0
    })];
    places.push(normalizeTask({
      task_id: 903,
      source_id: 'MOBILE-903',
      place_name: '第二個手機測試地名',
      county: '南投縣',
      town: '國姓鄉',
      village: '北港村',
      type: '自然地理實體',
      longitude: 120.86,
      latitude: 24.05,
      hak_area: false,
      tai_audio_count: 1,
      hak_audio_count: 0
    }));
    state.assignedPlaces = places;
    state.allPlaces = [];
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    renderUserInfo();
    initFilters();
    applyFilters();
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
  await expectTouchTargets(page, '.btn-announcements, .btn-user-more, .tab-btn, #search-box, #mobile-filter-toggle, #place-map-toggle');

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
    await expectTouchTargets(page, '.btn-announcements, .btn-user-more, .tab-btn, #search-box, #mobile-filter-toggle, #place-map-toggle');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}

test('mobile filter sheet keeps every option within the viewport without horizontal swiping', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await showInvestigatorApp(page);

  await expect(page.locator('#filter-panel')).toBeHidden();
  await expect(page.locator('#mobile-filter-summary')).toHaveText('目前使用全部條件');
  await page.locator('#mobile-filter-toggle').click();

  await expect(page.locator('#filter-panel')).toBeVisible();
  await expect(page.locator('#filter-panel')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#mobile-filter-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expectTouchTargets(page, '#filter-panel button, #filter-panel select');

  const layout = await page.locator('#filter-panel').evaluate(panel => {
    const viewportWidth = document.documentElement.clientWidth;
    const optionContainers = Array.from(panel.querySelectorAll('.type-chips, .hak-area-chips, .status-chips'));
    const optionButtons = Array.from(panel.querySelectorAll('.filter-chip, .hak-area-chip, .status-chip'));
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      containersFit: optionContainers.every(container => container.scrollWidth <= container.clientWidth),
      buttonsFit: optionButtons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= viewportWidth;
      }),
      typeColumns: getComputedStyle(panel.querySelector('.type-chips')).gridTemplateColumns.split(' ').length,
      optionRadius: parseFloat(getComputedStyle(panel.querySelector('.status-chip')).borderRadius)
    };
  });

  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.containersFit).toBe(true);
  expect(layout.buttonsFit).toBe(true);
  expect(layout.typeColumns).toBe(2);
  expect(layout.optionRadius).toBeLessThanOrEqual(8);

  await page.locator('[data-hak-area-filter="hak"]').click();
  await expect(page.locator('#mobile-filter-count')).toHaveText('1');
  await expect(page.locator('#mobile-filter-summary')).toHaveText('客語區');
  await expect(page.locator('#mobile-filter-results')).toHaveText('查看 1 筆結果');
  await page.locator('#mobile-filter-results').click();

  await expect(page.locator('#filter-panel')).toBeHidden();
  await expect(page.locator('#mobile-filter-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#mobile-filter-summary')).toHaveText('客語區');

  await page.locator('#mobile-filter-toggle').click();
  await page.locator('.mobile-filter-clear').click();
  await expect(page.locator('#mobile-filter-count')).toBeHidden();
  await expect(page.locator('#mobile-filter-summary')).toHaveText('目前使用全部條件');
  await expect(page.locator('#mobile-filter-results')).toHaveText('查看 2 筆結果');
  await page.keyboard.press('Escape');
  await expect(page.locator('#filter-panel')).toBeHidden();
});

test('mobile admin filter sheet keeps role-only controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.org';
    state.userName = '系統管理者';
    state.currentTab = 'assigned';
    state.typeFiltersInitialized = false;
    state.classFiltersInitialized = false;
    state.allUsers = [
      { account: 'worker-a@example.org', email: 'worker-a@example.org', name: '調查員甲' },
      { account: 'worker-b@example.org', email: 'worker-b@example.org', name: '調查員乙' }
    ];
    state.assignedPlaces = [
      normalizeTask({
        task_id: 910,
        source_id: 'MOBILE-910',
        place_name: '管理員篩選測試甲',
        county: '南投縣',
        town: '埔里鎮',
        type: '聚落',
        tai_class: '一級',
        hak_class: '四縣',
        tai_audio_count: 0,
        hak_audio_count: 0
      }),
      normalizeTask({
        task_id: 911,
        source_id: 'MOBILE-911',
        place_name: '管理員篩選測試乙',
        county: '南投縣',
        town: '國姓鄉',
        type: '自然地理實體',
        tai_class: '二級',
        hak_class: '海陸',
        tai_audio_count: 0,
        hak_audio_count: 0
      })
    ];
    state.allPlaces = [];
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    renderUserInfo();
    initFilters();
    applyFilters();
  });

  await page.locator('#mobile-filter-toggle').click();
  await expect(page.locator('#assignee-filter-search')).toBeVisible();
  await expect(page.locator('#assignee-filter')).toBeVisible();
  await expect(page.locator('#tai-class-container')).toBeVisible();
  await expect(page.locator('#hak-class-container')).toBeVisible();
  await expectTouchTargets(page, '#admin-filter-controls input, #admin-filter-controls select, #admin-class-filter-slot button');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const panelWidths = await page.locator('#filter-panel').evaluate(panel => ({
    scrollWidth: panel.scrollWidth,
    clientWidth: panel.clientWidth
  }));
  expect(panelWidths.scrollWidth).toBeLessThanOrEqual(panelWidths.clientWidth);
});

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
