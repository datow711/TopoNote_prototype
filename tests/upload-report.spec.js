const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('admin upload report groups recordings by Taipei date and uploader with newest first', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.allUserRecords = [
      { id: 'user-lin', account: 'lin@example.com', email: 'lin@example.com', name: 'Lin Investigator', role: 'user', is_active: true },
      { id: 'user-chen', account: 'chen@example.com', email: 'chen@example.com', name: 'Chen Investigator', role: 'user', is_active: true }
    ];
    state.assignedPlaces = [
      { id: 10, sourceId: 'PLACE010', placeName: '最新地名', county: '苗栗縣', town: '頭份市' },
      { id: 11, sourceId: 'PLACE011', placeName: '同日較早地名', county: '苗栗縣', town: '三灣鄉' },
      { id: 12, sourceId: 'PLACE012', placeName: '前一日地名', county: '新竹縣', town: '竹東鎮' }
    ];
    state.uploadReportRecords = [
      { recordId: 1, placeId: 11, uploaderId: 'Lin Investigator', language: '客語', createdAt: '2026-07-15T01:00:00.000Z' },
      { recordId: 2, placeId: 12, uploaderId: 'chen@example.com', language: '台語', createdAt: '2026-07-14T05:00:00.000Z', unlinkedAt: '2026-07-14T06:00:00.000Z' },
      { recordId: 3, placeId: 10, uploaderId: 'lin@example.com', language: '台語', createdAt: '2026-07-15T02:00:00.000Z' }
    ];

    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('uploads');
  });

  await expect(page.locator('#tab-uploads')).toBeVisible();
  await expect(page.locator('#tab-uploads')).toHaveClass(/active/);
  await expect(page.locator('.upload-report-day')).toHaveCount(2);
  await expect(page.locator('.upload-report-day').nth(0)).toHaveAttribute('data-upload-date', '2026-07-15');
  await expect(page.locator('.upload-report-day').nth(1)).toHaveAttribute('data-upload-date', '2026-07-14');

  const lin = page.locator('.upload-report-user[data-uploader-id="lin@example.com"]');
  await expect(lin.locator('summary')).toContainText('2 筆');
  await expect(lin.locator('.upload-report-user-copy strong')).toHaveText('Lin Investigator');
  await expect(lin.locator('.upload-report-user-copy small')).toHaveText('lin@example.com');
  await lin.locator('summary').click();
  await expect(lin.locator('tbody tr')).toHaveCount(2);
  await expect(lin.locator('tbody tr').nth(0)).toContainText('最新地名');
  await expect(lin.locator('tbody tr').nth(1)).toContainText('同日較早地名');

  await page.getByRole('button', { name: '依上傳者' }).click();
  await expect(page.getByRole('button', { name: '依上傳者' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.upload-report-uploader-group')).toHaveCount(2);
  await expect(page.locator('.upload-report-uploader-group').nth(0)).toHaveAttribute('data-uploader-id', 'lin@example.com');
  const linGroup = page.locator('.upload-report-uploader-group[data-uploader-id="lin@example.com"]');
  await expect(linGroup.locator(':scope > summary strong')).toHaveText('Lin Investigator');
  await expect(linGroup.locator(':scope > summary small')).toHaveText('lin@example.com');
  await linGroup.locator(':scope > summary').click();
  await expect(linGroup.locator('.upload-report-uploader-date')).toHaveCount(1);
  await expect(linGroup.locator('tbody tr').nth(0)).toContainText('最新地名');
});

test('upload report tab stays hidden for investigators', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'user';
    configureRoleUI();
  });

  await expect(page.locator('#tab-uploads')).toBeHidden();
});
