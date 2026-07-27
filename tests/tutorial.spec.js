const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('investigator tutorial walks through demo recording flow without saving data', async ({ page }) => {
  const networkCalls = [];
  await page.route('**/rest/v1/**', route => {
    networkCalls.push(route.request().url());
    return route.fulfill({ status: 500, body: 'tutorial should not call Supabase' });
  });
  await page.route('**/script.google.com/**', route => {
    networkCalls.push(route.request().url());
    return route.fulfill({ status: 500, body: 'tutorial should not call GAS' });
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;
    window.scrollTo = () => {};

    state.userRole = 'user';
    state.userId = 'lin@example.com';
    state.userName = 'Lin Investigator';
    state.userEmail = 'lin@example.com';
    state.assignedPlaces = [{
      id: 10,
      sourceId: 'uuid-10',
      placeName: 'Original Place',
      county: 'Original County',
      town: 'Original Town',
      type: 'Original Type',
      tAssignee: 'lin@example.com',
      hAssignee: '',
      assignedUsers: ['lin@example.com'],
      taiAudioCount: 0,
      hakAudioCount: 0,
      recordingStatus: '未錄音'
    }];
    state.allPlaces = [];
    state.uploadedRecords = [];
    state.allUserRecords = [
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com', role: 'user', is_active: true }
    ];
    document.getElementById('app-section').classList.remove('hidden');
    renderUserInfo();
    initFilters();
    applyFilters();
  });

  await page.getByRole('button', { name: '使用教學' }).click();
  await expect(page.locator('#tutorial-overlay')).toBeVisible();
  await expect(page.locator('.tutorial-popover')).toContainText('任務清單');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('篩選地名');
  await expect(page.locator('#search-box')).toHaveValue('教學');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('選擇地名');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('輸入文字');
  await expect(page.locator('#taihan-input')).toHaveValue('教學示範地名');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('新增錄音');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('確認並重播錄音');
  await expect(page.locator('#audio-confirm-panel')).toBeVisible();
  await expect(page.locator('#audio-playback')).toBeVisible();

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('新增上傳錄音檔');
  await expect(page.locator('#file-btn')).toHaveClass(/tutorial-pulse/);

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('確認上傳');
  await expect(page.locator('#upload-btn')).toHaveClass(/tutorial-pulse/);

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.tutorial-popover')).toContainText('教學結束');

  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('#tutorial-overlay')).toHaveCount(0);
  await expect(page.locator('#place-list-container')).toContainText('Original Place');
  await expect(page.locator('#place-list-container')).not.toContainText('教學示範地名');
  expect(networkCalls).toEqual([]);
});
