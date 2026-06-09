const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('admin place cards assign and unassign by language', async ({ page }) => {
  const rpcCalls = [];

  await page.route('**/*', route => {
    const request = route.request();
    if (request.url().includes('/rest/v1/rpc/')) {
      rpcCalls.push({
        url: request.url(),
        body: JSON.parse(request.postData() || '{}')
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '1' });
    }

    return route.continue();
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));
    window.confirm = () => true;
    loadDataFromSupabase = async () => {};
    initFilters = () => {};
    applyFilters = () => {};
    refreshAfterAssignmentChange = async () => {};

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.currentTab = 'assigned';
    state.allUsers = [
      { account: 'lin@example.com', name: '林調查員', email: 'lin@example.com', phone: '0912' },
      { account: 'chen@example.com', name: '陳調查員', email: 'chen@example.com', phone: '0922' }
    ];
    state.allUserRecords = state.allUsers;
    state.assignedPlaces = [
      {
        id: 123,
        sourceId: 'uuid-123',
        placeName: '測試地名',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '',
        hakClass: '',
        tAssignee: '',
        hAssignee: 'chen@example.com',
        assignedUsers: ['chen@example.com'],
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      }
    ];

    document.getElementById('app-section').classList.remove('hidden');
    renderPlaceList(state.assignedPlaces);
    renderAdminBatchAssignUI();
  });

  await expect(page.locator('.language-assignment-row')).toHaveCount(2);
  await expect(page.locator('#assignment-language-input')).toHaveValue('台語');
  await expect(page.locator('#unassign-submit-btn')).toBeVisible();

  await page.selectOption('#language-assignee-123-tai', 'lin@example.com');
  await page.locator('.language-assignment-row').filter({ hasText: '台語' }).getByRole('button', { name: '設定' }).click();

  await page.locator('.assign-checkbox').check();
  await page.selectOption('#assignment-language-input', '客語');
  await page.locator('#unassign-submit-btn').click();

  expect(rpcCalls).toEqual([
    {
      url: expect.stringContaining('/rest/v1/rpc/assign_task_language'),
      body: {
        p_task_ids: [123],
        p_language: '台語',
        p_user_name: 'lin@example.com',
        p_assigned_by: 'admin@example.com'
      }
    },
    {
      url: expect.stringContaining('/rest/v1/rpc/unassign_task_language'),
      body: {
        p_task_ids: [123],
        p_language: '客語',
        p_unassigned_by: 'admin@example.com'
      }
    }
  ]);
});
