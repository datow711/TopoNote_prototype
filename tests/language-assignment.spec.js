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

test('admin can select all filtered places without rendering every row', async ({ page }) => {
  const rpcCalls = [];

  await page.route('**/*', route => {
    const request = route.request();
    if (request.url().includes('/rest/v1/rpc/')) {
      rpcCalls.push({
        url: request.url(),
        body: JSON.parse(request.postData() || '{}')
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '3' });
    }

    return route.continue();
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;
    refreshAfterAssignmentChange = async () => {};

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.currentTab = 'assigned';
    state.placeRenderBatchSize = 1;
    state.allUsers = [
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com', phone: '0912' }
    ];
    state.assignedPlaces = [1, 2, 3].map(id => ({
      id,
      sourceId: `uuid-${id}`,
      placeName: `Place ${id}`,
      county: 'County',
      town: 'Town',
      type: 'Type',
      taiClass: '',
      hakClass: '',
      assignedUsers: [],
      taiAudioCount: 0,
      hakAudioCount: 0,
      recordingStatus: 'No records'
    }));

    document.getElementById('app-section').classList.remove('hidden');
    renderPlaceList(state.assignedPlaces);
    renderAdminBatchAssignUI();
  });

  await expect(page.locator('.assign-checkbox')).toHaveCount(1);
  await expect(page.locator('#assign-count')).toHaveText('篩選結果3筆，0筆已選');

  await page.locator('#select-filtered-places').check();
  await expect(page.locator('#assign-count')).toHaveText('篩選結果3筆，3筆已選');

  await page.selectOption('#assignee-input', 'Lin Investigator');
  await page.locator('#assign-submit-btn').click();
  expect(rpcCalls).toEqual([
    {
      url: expect.stringContaining('/rest/v1/rpc/assign_task_language'),
      body: {
        p_task_ids: [1, 2, 3],
        p_language: '台語',
        p_user_name: 'Lin Investigator',
        p_assigned_by: 'admin@example.com'
      }
    }
  ]);
});

test('admin filter state survives assignment refresh and chip filters default all selected with all or none toggle', async ({ page }) => {
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
    applyFilters();
  });

  await expect(page.locator('#type-container .filter-chip.selected')).toHaveCount(2);
  await page.locator('#type-container .filter-chip').first().click();
  await expect(page.locator('#type-container .filter-chip.selected')).toHaveCount(0);
  await expect(page.locator('.place-item')).toHaveCount(2);
  await page.locator('#type-container .filter-chip').first().click();
  await expect(page.locator('#type-container .filter-chip.selected')).toHaveCount(2);

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

test('written annotation places are hidden from normal users but visible to admins', async ({ page }) => {
  await page.goto(appUrl);
  const result = await page.evaluate(async () => {
    const taskRows = [
      {
        task_id: 201,
        source_id: 'uuid-201',
        source_table: 'third_phase_places',
        place_name: '一般調查地名',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        tai_class: '直接標注',
        hak_class: '電話調查',
        assigned_users: 'lin@example.com',
        assigned_to: '',
        t_assignee: 'lin@example.com',
        h_assignee: '',
        recording_status: '尚未錄音',
        tai_audio_count: 0,
        hak_audio_count: 0
      },
      {
        task_id: 202,
        source_id: 'uuid-202',
        source_table: 'third_phase_places',
        place_name: '書面標注地名',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        tai_class: '書面標注',
        hak_class: '電話調查',
        assigned_users: 'lin@example.com',
        assigned_to: '',
        t_assignee: 'lin@example.com',
        h_assignee: '',
        recording_status: '尚未錄音',
        tai_audio_count: 0,
        hak_audio_count: 0
      },
      {
        task_id: 203,
        source_id: 'uuid-203',
        source_table: 'third_phase_places',
        place_name: '客語書面地名',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        tai_class: '電話調查',
        hak_class: '書面標注',
        assigned_users: '',
        assigned_to: '',
        t_assignee: '',
        h_assignee: '',
        recording_status: '尚未錄音',
        tai_audio_count: 0,
        hak_audio_count: 0
      }
    ];

    const originalFetch = window.fetch;
    window.fetch = async url => {
      const urlText = String(url);
      if (urlText.includes('/rest/v1/app_tasks_view')) {
        return new Response(JSON.stringify(taskRows), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlText.includes('/rest/v1/audio_records')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlText.includes('/rest/v1/app_users_view')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlText.includes('/rest/v1/app_review_queue_view')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url);
    };

    state.userRole = 'user';
    state.userId = 'lin@example.com';
    state.userName = 'Lin Investigator';
    state.userEmail = 'lin@example.com';
    await loadDataFromSupabase();
    const userAssignedIds = state.assignedPlaces.map(place => place.id);
    const userOtherIds = state.allPlaces.map(place => place.id);

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    await loadDataFromSupabase();
    const adminAssignedIds = state.assignedPlaces.map(place => place.id);

    return { userAssignedIds, userOtherIds, adminAssignedIds };
  });

  expect(result.userAssignedIds).toEqual([201]);
  expect(result.userOtherIds).toEqual([]);
  expect(result.adminAssignedIds).toEqual([201, 202, 203]);
});

test('admin assignee filter supports assigned and per-language unassigned choices', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.currentTab = 'assigned';
    state.typeFiltersInitialized = false;
    state.classFiltersInitialized = false;
    state.selectedTypes = [];
    state.selectedTaiClasses = [];
    state.selectedHakClasses = [];
    state.allUsers = [
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com' },
      { account: 'chen@example.com', name: 'Chen Investigator', email: 'chen@example.com' }
    ];
    state.allUserRecords = state.allUsers;
    state.assignedPlaces = [
      {
        id: 1,
        sourceId: 'uuid-1',
        placeName: '完全未指派',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: [],
        tAssignee: '',
        hAssignee: '',
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      },
      {
        id: 2,
        sourceId: 'uuid-2',
        placeName: '台語已指派',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: ['Lin Investigator'],
        tAssignee: 'Lin Investigator',
        hAssignee: '',
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      },
      {
        id: 3,
        sourceId: 'uuid-3',
        placeName: '客語已指派',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: ['Chen Investigator'],
        tAssignee: '',
        hAssignee: 'Chen Investigator',
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      },
      {
        id: 4,
        sourceId: 'uuid-4',
        placeName: '兩語已指派',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: ['Lin Investigator', 'Chen Investigator'],
        tAssignee: 'Lin Investigator',
        hAssignee: 'Chen Investigator',
        taiAudioCount: 0,
        hakAudioCount: 0,
        recordingStatus: '未錄音'
      }
    ];
    state.allPlaces = [];
    state.reviewQueue = [];

    document.getElementById('app-section').classList.remove('hidden');
    initFilters();
    applyFilters();
  });

  await expect(page.locator('#assignee-filter option[value="ASSIGNED"]')).toHaveText('✅ 只看有指派');
  await expect(page.locator('#assignee-filter option[value="TAI_UNASSIGNED"]')).toHaveText('台語未指派');
  await expect(page.locator('#assignee-filter option[value="HAK_UNASSIGNED"]')).toHaveText('客語未指派');

  await page.selectOption('#assignee-filter', 'UNASSIGNED');
  await expect(page.locator('.place-item')).toHaveCount(1);
  await expect(page.locator('#place-list-container')).toContainText('完全未指派');

  await page.selectOption('#assignee-filter', 'ASSIGNED');
  await expect(page.locator('.place-item')).toHaveCount(3);
  await expect(page.locator('#place-list-container')).not.toContainText('完全未指派');

  await page.selectOption('#assignee-filter', 'TAI_UNASSIGNED');
  await expect(page.locator('.place-item')).toHaveCount(2);
  await expect(page.locator('#place-list-container')).toContainText('完全未指派');
  await expect(page.locator('#place-list-container')).toContainText('客語已指派');
  await expect(page.locator('#place-list-container')).not.toContainText('台語已指派');

  await page.selectOption('#assignee-filter', 'HAK_UNASSIGNED');
  await expect(page.locator('.place-item')).toHaveCount(2);
  await expect(page.locator('#place-list-container')).toContainText('完全未指派');
  await expect(page.locator('#place-list-container')).toContainText('台語已指派');
  await expect(page.locator('#place-list-container')).not.toContainText('客語已指派');
});

test('recording status filter supports language recorded choices and union selection', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;

    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.currentTab = 'assigned';
    state.typeFiltersInitialized = false;
    state.classFiltersInitialized = false;
    state.selectedTypes = [];
    state.selectedTaiClasses = [];
    state.selectedHakClasses = [];
    state.selectedStatuses = ['台語已有錄音'];
    state.allUsers = [];
    state.allUserRecords = [];
    state.assignedPlaces = [
      {
        id: 1,
        sourceId: 'uuid-1',
        placeName: '無錄音',
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
        placeName: '只有台語錄音',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: [],
        taiAudioCount: 1,
        hakAudioCount: 0,
        recordingStatus: '台語完成'
      },
      {
        id: 3,
        sourceId: 'uuid-3',
        placeName: '只有客語錄音',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: [],
        taiAudioCount: 0,
        hakAudioCount: 1,
        recordingStatus: '客語完成'
      },
      {
        id: 4,
        sourceId: 'uuid-4',
        placeName: '雙語錄音',
        county: '苗栗縣',
        town: '頭份市',
        type: '聚落',
        taiClass: '直接標注',
        hakClass: '電話調查',
        assignedUsers: [],
        taiAudioCount: 2,
        hakAudioCount: 2,
        recordingStatus: '全部完成'
      }
    ];
    state.allPlaces = [];
    state.reviewQueue = [];

    document.getElementById('app-section').classList.remove('hidden');
    initFilters();
    applyFilters();
  });

  await expect(page.locator('[data-status-filter="台語已有錄音"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-status-filter="客語已有錄音"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.place-item')).toHaveCount(2);
  await expect(page.locator('#place-list-container')).toContainText('只有台語錄音');
  await expect(page.locator('#place-list-container')).toContainText('雙語錄音');
  await expect(page.locator('#place-list-container')).not.toContainText('只有客語錄音');

  await page.locator('[data-status-filter="客語已有錄音"]').click();
  await expect(page.locator('.place-item')).toHaveCount(3);
  await expect(page.locator('#place-list-container')).toContainText('只有台語錄音');
  await expect(page.locator('#place-list-container')).toContainText('只有客語錄音');
  await expect(page.locator('#place-list-container')).toContainText('雙語錄音');
  await expect(page.locator('#place-list-container')).not.toContainText('無錄音');

  await page.locator('[data-status-filter="all"]').click();
  await expect(page.locator('[data-status-filter="all"]')).toHaveClass(/selected/);
  await expect(page.locator('.place-item')).toHaveCount(4);
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

test('original uploader can edit record text fields without reuploading audio', async ({ page }) => {
  const patchCalls = [];

  await page.route('**/rest/v1/audio_records?id=eq.*', route => {
    const request = route.request();
    patchCalls.push({
      method: request.method(),
      url: request.url(),
      body: JSON.parse(request.postData() || '{}')
    });
    return route.fulfill({ status: 204, body: '' });
  });

  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));

    state.userRole = 'user';
    state.userId = 'lin@example.com';
    state.userName = 'Lin Investigator';
    state.userEmail = 'lin@example.com';
    state.allUserRecords = [
      { account: 'lin@example.com', name: 'Lin Investigator', email: 'lin@example.com', role: 'user', is_active: true },
      { account: 'chen@example.com', name: 'Chen Investigator', email: 'chen@example.com', role: 'user', is_active: true }
    ];
    state.selectedPlace = {
      id: 10,
      placeName: '測試地名'
    };
    document.getElementById('app-section').classList.remove('hidden');
    document.getElementById('recording-section').style.display = 'block';
    state.uploadedRecords = [
      {
        recordId: 501,
        placeId: 10,
        language: '台語',
        uploaderId: 'Lin Investigator',
        phonetic: 'tsu7',
        url: 'drive-url',
        annotations: {
          taihan: '舊漢字',
          tl1: 'tsu7',
          tainote: '舊備註'
        }
      },
      {
        recordId: 502,
        placeId: 10,
        language: '客語',
        uploaderId: 'Chen Investigator',
        phonetic: 'gu',
        url: 'drive-url-2',
        annotations: {
          honzii: '舊客字',
          hp1: 'gu'
        }
      }
    ];
    renderHistoryList(10);
  });

  await expect(page.getByRole('button', { name: '編輯文字' })).toHaveCount(1);
  await page.getByRole('button', { name: '編輯文字' }).click();
  await page.locator('#record-edit-501-TaiHan1').fill('新漢字');
  await page.locator('#record-edit-501-TL1').fill('sin1');
  await page.locator('#record-edit-501-TaiNote').fill('新備註');
  await page.getByRole('button', { name: '儲存文字' }).click();

  expect(patchCalls).toHaveLength(1);
  expect(patchCalls[0].method).toBe('PATCH');
  expect(patchCalls[0].url).toContain('/rest/v1/audio_records?id=eq.501');
  expect(patchCalls[0].url).toContain('recorder_name=eq.Lin%20Investigator');
  expect(patchCalls[0].body.phonetic_reading).toBe('sin1');
  expect(JSON.parse(patchCalls[0].body.note)).toEqual({
    annotations: {
      taihan: '新漢字',
      tl1: 'sin1',
      tainote: '新備註',
      tl2: '',
      tl3: ''
    }
  });

  const updatedSummary = page.locator('.annotation-summary').filter({ hasText: '新漢字' });
  await expect(updatedSummary).toContainText('新漢字');
  await expect(updatedSummary).toContainText('sin1');
  await expect(updatedSummary).toContainText('新備註');
});
