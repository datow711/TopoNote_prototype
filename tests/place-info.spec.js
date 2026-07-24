const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('selected place shows multiline info and hides blank info', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.uploadedRecords = [];
    const place = normalizeTask({
      task_id: 101,
      place_name: '補充資訊測試地名',
      info: '第一行補充說明\n第二行補充說明'
    });
    document.getElementById('app-section').classList.remove('hidden');
    openRecordingUI(place, null);
  });

  const panel = page.locator('#selected-place-info');
  await expect(panel).toBeVisible();
  await expect(panel.locator('strong')).toHaveText('地名補充資訊：');
  await expect(page.locator('#selected-place-info-content')).toHaveText('第一行補充說明\n第二行補充說明');
  await expect(page.locator('#selected-place-info-content')).toHaveCSS('white-space', 'pre-wrap');

  await page.evaluate(() => {
    openRecordingUI(normalizeTask({
      task_id: 102,
      place_name: '無補充資訊地名',
      info: '  \n  '
    }), null);
  });
  await expect(panel).toBeHidden();
});

test('place list location badge includes village when available', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    document.getElementById('app-section').classList.remove('hidden');
    renderPlaceList([
      {
        id: 201,
        sourceId: 'PLACE-201',
        placeName: 'Place with village',
        county: 'County',
        town: 'Town',
        village: 'Village',
        type: 'Type'
      },
      {
        id: 202,
        sourceId: 'PLACE-202',
        placeName: 'Place without village',
        county: 'County',
        town: 'Town',
        village: '',
        type: 'Type'
      }
    ]);
  });

  const locationBadges = page.locator('.place-item .place-meta .meta-badge:nth-child(2)');
  await expect(locationBadges.nth(0)).toHaveText('County Town Village');
  await expect(locationBadges.nth(1)).toHaveText('County Town');
});

test('selected place history expands name history and keeps location as placeholder action', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    state.uploadedRecords = [];
    const place = normalizeTask({
      task_id: 103,
      place_name: '歷史沿革測試地名',
      info: '補充資訊',
      name_history: '舊名一\n舊名二',
      location: '位置資料'
    });
    document.getElementById('app-section').classList.remove('hidden');
    openRecordingUI(place, null);
  });

  const historyButton = page.locator('#selected-place-history-btn');
  const locationButton = page.locator('#selected-place-location-btn');
  const historyPanel = page.locator('#selected-place-name-history');

  await expect(historyButton).toBeVisible();
  await expect(historyButton).toHaveAttribute('aria-expanded', 'false');
  await expect(locationButton).toBeVisible();
  await expect(historyPanel).toBeHidden();

  const buttonsShareRow = await page.evaluate(() => {
    const historyRect = document.getElementById('selected-place-history-btn').getBoundingClientRect();
    const locationRect = document.getElementById('selected-place-location-btn').getBoundingClientRect();
    return Math.abs(historyRect.top - locationRect.top) < 4;
  });
  expect(buttonsShareRow).toBe(true);

  await historyButton.click();
  await expect(historyButton).toHaveText('收合歷史沿革');
  await expect(historyButton).toHaveAttribute('aria-expanded', 'true');
  await expect(historyPanel).toBeVisible();
  await expect(historyPanel).toHaveText('舊名一\n舊名二');

  const locationBelowHistory = await page.evaluate(() => {
    const panelRect = document.getElementById('selected-place-name-history').getBoundingClientRect();
    const locationRect = document.getElementById('selected-place-location-btn').getBoundingClientRect();
    return locationRect.top >= panelRect.bottom - 1;
  });
  expect(locationBelowHistory).toBe(true);

  await page.evaluate(() => {
    openRecordingUI(normalizeTask({
      task_id: 104,
      place_name: '無歷史沿革地名',
      info: '仍有補充資訊',
      name_history: '  \n  '
    }), null);
  });
  await expect(historyButton).toBeHidden();
  await expect(locationButton).toBeVisible();
  await expect(historyPanel).toBeHidden();
});
