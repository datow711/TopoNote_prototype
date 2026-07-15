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
