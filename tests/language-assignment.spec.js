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
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com', phone: '0912' },
      { account: 'chen@example.com', name: 'Chen Investigator', email: 'chen@example.com', phone: '0922' }
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
        assignedUsers: ['Chen Investigator'],
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

  await page.selectOption('#language-assignee-123-tai', 'Lin Investigator');
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
        p_user_name: 'Lin Investigator',
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

test('admin filter state survives assignment refresh and class chips default all selected with all or none toggle', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.currentTab = 'assigned';
    state.allUsers = [
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com', phone: '0912' }
    ];
    state.allUserRecords = state.allUsers;
    state.assignedPlaces = [
      {
        id: 1,
        sourceId: 'uuid-1',
        placeName: '苗栗地名',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: [],
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      },
      {
        id: 2,
        sourceId: 'uuid-2',
        placeName: '新竹地名',
        county: '新竹縣',
        town: '竹北市',
        type: '聚落',
        taiClass: '現場調查',
        hakClass: '現場調查',
        assignedUsers: [],
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      }
    ];
    state.allPlaces = [];
    state.reviewQueue = [];

    document.getElementById('app-section').classList.remove('hidden');
    initFilters();
  });

  await expect(page.locator('#tai-class-container .filter-chip.selected')).toHaveCount(3);
  await page.locator('#tai-class-container .filter-chip').first().click();
  await expect(page.locator('#tai-class-container .filter-chip.selected')).toHaveCount(0);
  await page.locator('#tai-class-container .filter-chip').first().click();
  await expect(page.locator('#tai-class-container .filter-chip.selected')).toHaveCount(3);

  await page.selectOption('#county-filter', '苗栗縣');
  await page.evaluate(() => updateTowns('頭份市'));
  await page.selectOption('#town-filter', '頭份市');

  await page.evaluate(async () => {
    loadDataFromSupabase = async () => {
      state.assignedPlaces = state.assignedPlaces.map(place => (
        place.id === 1 ? { ...place, tAssignee: 'Lin Investigator' } : place
      ));
    };
    await refreshAfterAssignmentChange();
  });

  await expect(page.locator('#county-filter')).toHaveValue('苗栗縣');
  await expect(page.locator('#town-filter')).toHaveValue('頭份市');
});

test('investigator recording language defaults to assigned language and warns out of scope uploads', async ({ page }) => {
  await page.goto(appUrl);
  const result = await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;

    state.userRole = 'user';
    state.userId = 'lin@example.com';
    state.userName = 'Lin Investigator';
    state.userEmail = 'lin@example.com';
    state.allUserRecords = [
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com', role: 'user', is_active: true }
    ];

    const hakOnlyPlace = {
      id: 10,
      sourceId: 'uuid-10',
      placeName: '客語任務',
      county: '苗栗縣',
      town: '頭份市',
      type: '聚落',
      tAssignee: 'other@example.com',
      hAssignee: 'Lin Investigator',
      assignedUsers: ['Lin Investigator'],
      taiAudioCount: 0,
      hakAudioCount: 0,
      recordingStatus: '未錄音'
    };
    const bothLanguagePlace = {
      ...hakOnlyPlace,
      id: 11,
      placeName: '雙語任務',
      tAssignee: 'lin@example.com',
      hAssignee: 'Lin Investigator'
    };
    const otherPlace = {
      ...hakOnlyPlace,
      id: 12,
      placeName: '非任務地名',
      tAssignee: '',
      hAssignee: '',
      assignedUsers: []
    };

    state.assignedPlaces = [hakOnlyPlace, bothLanguagePlace];
    state.allPlaces = [otherPlace];
    document.getElementById('app-section').classList.remove('hidden');

    openRecordingUI(hakOnlyPlace, null);
    const hakDefault = document.querySelector('input[name="lang"]:checked')?.value;

    openRecordingUI(bothLanguagePlace, null);
    const bothDefault = document.querySelector('input[name="lang"]:checked')?.value;

    return {
      hakDefault,
      bothDefault,
      languageWarning: getUploadScopeWarning(hakOnlyPlace, '台語'),
      placeWarning: getUploadScopeWarning(otherPlace, '台語')
    };
  });

  expect(result.hakDefault).toBe('客語');
  expect(result.bothDefault).toBe('台語');
  expect(result.languageWarning).toContain('語種不符合');
  expect(result.placeWarning).toContain('地名不在你的任務清單');
});
