const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const showcaseUrl = pathToFileURL(path.join(__dirname, '..', 'ui-showcase.html')).href;

test('investigator UI showcase reuses the recording interface without login or writes', async ({ page }) => {
    const nonGetRequests = [];
    page.on('request', request => {
        if (request.method() !== 'GET') nonGetRequests.push(request.method() + ' ' + request.url());
    });

    await page.goto(showcaseUrl);
    await expect(page.locator('#login-section')).toBeHidden();
    await expect(page.locator('#app-section')).toBeVisible();
    await expect(page.locator('#user-info-badge')).toContainText('示範調查員');
    await expect(page.locator('.place-item')).toHaveCount(4);
    await expect(page.locator('#selected-place-title')).toContainText('水流崙');
    await expect(page.locator('#selected-place-info')).toBeVisible();
    await expect(page.locator('.place-item.active')).toHaveAttribute('data-task-id', 'showcase-001');
    await expect(page.locator('#recording-section')).toBeVisible();
    await expect(page.locator('#history-list .history-item')).toHaveCount(3);
    await expect(page.locator('.audio-source-panel')).toBeVisible();

    await page.locator('#file-btn').click();
    await expect(page.locator('#audio-confirm-panel')).toBeVisible();
    await expect(page.locator('#status')).toContainText('已選擇音檔');
    await page.locator('#upload-btn').click();
    await expect(page.locator('#status')).toContainText('不會真的上傳');
    expect(nonGetRequests).toEqual([]);
});
