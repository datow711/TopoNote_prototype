const { pathToFileURL } = require('url');
const path = require('path');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
test('recording respondent key is optional and not presented as a two-person requirement', async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator('label[for="respondent-key-input"]')).toHaveText('受訪者代號（可留空）');
  await expect(page.locator('.respondent-key-panel small')).not.toContainText('兩位不同受訪者');
});

test('admin can save an audio assessment with a blank respondent key', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__workflowCalls = [];
    window.__alerts = [];
    window.prompt = () => { throw new Error('音檔判定不應再呼叫 prompt'); };
    window.alert = message => window.__alerts.push(String(message));
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.reviewWorkbenchMode = 'audio';
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userName = 'Admin';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 11,
      task_id: 11,
      language: '\u53f0\u8a9e',
      place_name: 'panel-case',
      class_name: 'test',
      state: 'pending',
      version_kind: 'draft',
      annotation_fields: { TaiHan1: '測試漢字' },
      audio_record_count: 1,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_evidence: [
        { audio_record_id: 22, audio_file_id: 'drive-22', recorder_name: 'Recorder', assessment_decision: '\u672a\u5be9\u807d' }
      ],
      audio_sources_loaded: true,
      audio_sources: []
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  const panel = page.locator('.review-workflow-assessment-panel');
  await expect(panel).toBeHidden();
  await page.locator('.review-workflow-assess-btn').click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-field="unusable-reason"]')).toBeHidden();
  await panel.locator('[data-decision="可用"]').click();
  await expect(panel.locator('[data-action="save"]')).toBeEnabled();
  await panel.locator('[data-action="save"]').click();
  await page.waitForFunction(() => window.__workflowCalls.length === 1);

  const result = await page.evaluate(() => ({
    assessmentCall: window.__workflowCalls[0]
  }));
  expect(result.assessmentCall.rpcName).toBe('submit_audio_assessment');
  expect(result.assessmentCall.body.p_respondent_key).toBe('');
  expect(result.assessmentCall.body.p_decision).toBe('\u53ef\u7528');
  expect(result.assessmentCall.body.p_metadata.needs_followup).toBe(false);
});

test('audio assessment shows last assessor and append-only history inline', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__workflowCalls = [];
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      if (rpcName === 'get_audio_assessment_history') {
        return [
          {
            id: 2,
            task_id: 13,
            language: '\u53f0\u8a9e',
            audio_record_id: 31,
            assessor_account: 'assessor@example.com',
            respondent_key: 'R02',
            decision: '\u4e0d\u53ef\u7528',
            reason: '\u9700\u8981\u91cd\u65b0\u6aa2\u67e5',
            created_at: '2026-08-28T02:03:04Z'
          },
          {
            id: 1,
            task_id: 13,
            language: '\u53f0\u8a9e',
            audio_record_id: 31,
            assessor_account: 'other@example.com',
            respondent_key: 'R01',
            decision: '\u53ef\u7528',
            reason: '',
            created_at: '2026-08-27T02:03:04Z'
          }
        ];
      }
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.reviewWorkbenchMode = 'audio';
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userName = 'Admin';
    state.allUserRecords = [
      { account: 'assessor@example.com', name: '\u5be9\u807d\u54e1\u7532', email: 'assessor@example.com' },
      { account: 'other@example.com', name: '\u5be9\u807d\u54e1\u4e59', email: 'other@example.com' }
    ];
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 13,
      task_id: 13,
      language: '\u53f0\u8a9e',
      place_name: '\u6b77\u53f2\u6aa2\u8996\u6e2c\u8a66',
      county: '\u81fa\u5317\u5e02',
      town: '\u5317\u6295\u5340',
      class_name: 'test',
      state: 'pending',
      audio_record_count: 1,
      assessed_audio_count: 1,
      usable_audio_count: 1,
      audio_review_state: '\u5df2\u5224\u5b9a',
      audio_evidence: [{
        audio_record_id: 31,
        audio_file_id: 'drive-31',
        recorder_name: '\u9304\u97f3\u54e1',
        respondent_key: 'R01',
        assessment_decision: '\u53ef\u7528',
        assessor_account: 'assessor@example.com',
        assessed_at: '2026-08-28T01:02:03Z'
      }],
      audio_sources_loaded: true,
      audio_sources: []
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await expect(page.locator('.review-workflow-assessment-meta')).toContainText('\u5be9\u807d\u54e1\u7532');
  await expect(page.locator('.review-workflow-assessment-meta')).toContainText('\u6700\u5f8c\u5224\u5b9a\u6642\u9593');
  await expect(page.locator('.review-workflow-assess-btn')).toHaveText('\u91cd\u65b0\u5224\u5b9a');
  const history = page.locator('.review-workflow-assessment-history');
  await expect(history).toBeHidden();

  await page.locator('.review-workflow-history-btn').first().click();
  await expect(history).toBeVisible();
  await expect(history).toContainText('\u5171 2 \u7b46\u5be9\u67e5\u4e8b\u4ef6');
  await expect(history.locator('li').first()).toContainText('\u4e0d\u53ef\u7528');
  await expect(history.locator('li').nth(1)).toContainText('\u53ef\u7528');

  await page.locator('.review-workflow-assess-btn').click();
  const panel = page.locator('.review-workflow-assessment-panel');
  await expect(panel).toContainText('\u91cd\u65b0\u5224\u5b9a');
  await expect(panel).toContainText('\u820a\u7d00\u9304\u4e0d\u6703\u88ab\u8986\u84cb');
  await panel.locator('[data-action="save"]').click();
  await page.waitForFunction(() => window.__workflowCalls.some(call => call.rpcName === 'submit_audio_assessment'));
  await expect(panel).toContainText('\u65b0\u589e\u4e00\u7b46\u5be9\u67e5\u4e8b\u4ef6');

  const assessmentCall = await page.evaluate(() =>
    window.__workflowCalls.find(call => call.rpcName === 'submit_audio_assessment')
  );
  expect(assessmentCall.body.p_audio_record_id).toBe(31);
  expect(assessmentCall.body.p_decision).toBe('\u53ef\u7528');
});
test('audio assessment shows conditional fields inline', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.reviewWorkbenchMode = 'audio';
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userName = 'Admin';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 12,
      task_id: 12,
      language: '\u53f0\u8a9e',
      place_name: 'conditional-panel-case',
      class_name: 'test',
      state: 'pending',
      version_kind: 'draft',
      annotation_fields: { TaiHan1: '測試漢字' },
      audio_record_count: 1,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_evidence: [
        { audio_record_id: 23, audio_file_id: 'drive-23', recorder_name: 'Recorder', assessment_decision: '\u672a\u5be9\u807d' }
      ],
      audio_sources_loaded: true,
      audio_sources: []
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  const panel = page.locator('.review-workflow-assessment-panel');
  await page.locator('.review-workflow-assess-btn').click();
  const assessmentWidth = await panel.evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(assessmentWidth.scrollWidth).toBeLessThanOrEqual(assessmentWidth.clientWidth);
  await panel.locator('[data-decision="不可用"]').click();
  await expect(panel.locator('[data-field="unusable-reason"]')).toBeVisible();
  await expect(panel.locator('[data-action="save"]')).toBeDisabled();
  await panel.locator('[data-role="unusable-reason-code"]').selectOption('其他');
  await expect(panel.locator('[data-field="unusable-other"]')).toBeVisible();
  await panel.locator('[data-role="needs-followup"]').check();
  await expect(panel.locator('[data-field="followup-reason"]')).toBeVisible();
  await panel.locator('[data-role="unusable-reason-text"]').fill('背景雜訊過大');
  await expect(panel.locator('[data-action="save"]')).toBeDisabled();
  await panel.locator('[data-role="followup-reason"]').fill('請請調查員確認是否有較清楚版本');
  await expect(panel.locator('[data-action="save"]')).toBeEnabled();
  await panel.locator('[data-action="cancel"]').click();
  await expect(panel).toBeHidden();
});
test('audio workbench filters cases by progress, claim, and keyword', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'audio_assessor';
    state.userId = 'audio@example.com';
    state.userName = 'Audio Assessor';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowAudioStatusFilter = 'all';
    state.reviewWorkflowAudioFlagFilter = 'all';
    state.reviewWorkflowAudioClaimFilter = 'all';
    state.reviewWorkflowAudioKeyword = '';
    state.reviewWorkflowQueue = [
      {
        case_id: 101,
        task_id: 101,
        language: '台語',
        place_name: '石崁頭',
        source_id: 'TEST0001',
        county: '臺北市',
        town: '北投區',
        class_name: 'test',
        state: 'pending',
        audio_record_count: 1,
        assessed_audio_count: 0,
        usable_audio_count: 0,
        unusable_audio_count: 0,
        follow_up_audio_count: 0,
        audio_review_state: '未審聽',
        audio_claim_by: 'audio@example.com',
        audio_claim_token: '00000000-0000-0000-0000-000000000101',
        audio_claim_until: '2999-01-01T00:00:00Z',
        audio_evidence: [
          { audio_record_id: 1001, audio_file_id: 'drive-1001', recorder_name: 'Recorder 1', assessment_decision: '未審聽' }
        ],
        audio_sources_loaded: true,
        audio_sources: []
      },
      {
        case_id: 102,
        task_id: 102,
        language: '台語',
        place_name: '完成案件',
        source_id: 'TEST0002',
        county: '臺北市',
        town: '士林區',
        class_name: 'test',
        state: 'pending',
        audio_record_count: 1,
        assessed_audio_count: 1,
        usable_audio_count: 1,
        unusable_audio_count: 0,
        follow_up_audio_count: 0,
        audio_review_state: '已判定',
        audio_claim_by: null,
        audio_claim_token: null,
        audio_claim_until: null,
        audio_evidence: [
          { audio_record_id: 1002, audio_file_id: 'drive-1002', recorder_name: 'Recorder 2', assessment_decision: '可用' }
        ],
        audio_sources_loaded: true,
        audio_sources: []
      },
      {
        case_id: 103,
        task_id: 103,
        language: '客語',
        place_name: '待追問案件',
        source_id: 'TEST0003',
        county: '新北市',
        town: '淡水區',
        class_name: 'test',
        state: 'pending',
        audio_record_count: 1,
        assessed_audio_count: 1,
        usable_audio_count: 0,
        unusable_audio_count: 1,
        follow_up_audio_count: 1,
        audio_review_state: '待追問',
        audio_claim_by: 'another@example.com',
        audio_claim_token: null,
        audio_claim_until: '2999-01-01T00:00:00Z',
        audio_evidence: [
          {
            audio_record_id: 1003,
            audio_file_id: 'drive-1003',
            recorder_name: 'Recorder 3',
            assessment_decision: '不可用',
            unusable_reason_code: '其他',
            needs_followup: true,
            followup_reason_text: '確認版本'
          }
        ],
        audio_sources_loaded: true,
        audio_sources: []
      }
    ];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await expect(page.locator('#review-workflow-audio-county-filter')).toBeVisible();
  await expect(page.locator('#review-workflow-audio-language-filter')).toBeVisible();
  await expect(page.locator('.review-workflow-audio-filter-group')).toHaveCount(2);
  await expect(page.locator('.review-workflow-audio-filter-group').first()).toContainText('行政區');
  await expect(page.locator('.review-workflow-audio-filter-group').nth(1)).toContainText('語種');
  await expect(page.locator('#review-workflow-audio-flag-filter')).toBeAttached();
  await expect(page.locator('#review-workflow-audio-town-filter .town-filter-button')).toBeDisabled();
  await expect(page.locator('.review-workflow-audio-secondary')).not.toHaveAttribute('open', '');

  const filterWidth = await page.locator('.review-workflow-audio-filter-bar').evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(filterWidth.scrollWidth).toBeLessThanOrEqual(filterWidth.clientWidth);

  await expect(page.locator('.review-workflow-audio-filter-count')).toContainText('顯示 3 / 3');
  await expect(page.locator('.review-workflow-item')).toHaveCount(3);

  await page.locator('#review-workflow-audio-county-filter').selectOption({ label: '臺北市' });
  await expect(page.locator('.review-workflow-item')).toHaveCount(2);
  await expect(page.locator('#review-workflow-audio-town-filter .town-filter-button')).toBeEnabled();
  await expect(page.locator('#review-workflow-audio-town-filter .town-filter-button')).toContainText('所有鄉鎮');

  await page.locator('#review-workflow-audio-town-filter .town-filter-button').click();
  await expect(page.locator('#review-workflow-audio-town-filter .town-filter-menu')).toBeVisible();
  await page.locator('#review-workflow-audio-town-filter .town-filter-option').filter({ hasText: '士林區' }).locator('input').uncheck();
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('石崁頭');

  await page.locator('#review-workflow-audio-county-filter').selectOption({ label: '新北市' });
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('待追問案件');
  await page.locator('#review-workflow-audio-language-filter .review-workflow-audio-language-option[data-language="客語"]').click();
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);

  const openSecondaryFilters = async () => {
    const details = page.locator('.review-workflow-audio-secondary');
    if (!(await details.getAttribute('open'))) {
      await details.locator('summary').click();
    }
  };
  await openSecondaryFilters();
  await page.locator('.review-workflow-audio-filter-clear').click();
  await expect(page.locator('.review-workflow-item')).toHaveCount(3);

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-status-filter').selectOption('unreviewed');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('石崁頭');

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-status-filter').selectOption('completed');
  await expect(page.locator('.review-workflow-item')).toHaveCount(2);
  await expect(page.locator('.review-workflow-item').filter({ hasText: '完成案件' })).toBeVisible();
  await expect(page.locator('.review-workflow-item').filter({ hasText: '待追問案件' })).toBeVisible();

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-flag-filter').selectOption('followup');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('待追問案件');

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-status-filter').selectOption('all');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-flag-filter').selectOption('unusable');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('待追問案件');

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-flag-filter').selectOption('all');
  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-claim-filter').selectOption('other');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('待追問案件');

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-claim-filter').selectOption('mine');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-keyword').fill('TEST0001');
  await page.locator('.review-workflow-audio-filter-apply').click();
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('石崁頭');

  await openSecondaryFilters();
  await page.locator('.review-workflow-audio-filter-clear').click();
  await expect(page.locator('.review-workflow-item')).toHaveCount(3);
  await expect(page.locator('.review-workflow-audio-filter-count')).toContainText('顯示 3 / 3');
});

test('audio assessor sees claimed audio workbench and sends audio claim token', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__prompts = ['', '\u53ef\u7528', '', undefined];
    window.__workflowCalls = [];
    window.__alerts = [];
    window.prompt = () => window.__prompts.shift();
    window.alert = message => window.__alerts.push(String(message));
    window.confirm = () => true;
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.userRole = 'audio_assessor';
    state.userId = 'audio@example.com';
    state.userName = 'Audio Assessor';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 88,
      task_id: 88,
      language: '\u53f0\u8a9e',
      place_name: 'audio-claim-case',
      class_name: 'test',
      state: 'pending',
      audio_claim_by: 'audio@example.com',
      audio_claim_token: '00000000-0000-0000-0000-000000000088',
      audio_claim_until: '2999-01-01T00:00:00Z',
      version_kind: null,
      annotation_fields: {},
      audio_record_count: 1,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_review_state: '\u672a\u5be9\u807d',
      audio_evidence: [
        { audio_record_id: 881, audio_file_id: 'drive-881', recorder_name: 'Recorder', assessment_decision: '\u672a\u5be9\u807d' }
      ],
      audio_sources_loaded: true,
      audio_sources: [],
      legacy_unreviewed: true
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await expect(page.locator('.review-workbench-mode-btn[aria-label="目前工作台：音檔檢驗"]')).toBeVisible();
  await expect(page.locator('.review-workflow-item')).toContainText('audio-claim-case');
  await expect(page.locator('.review-workflow-item')).not.toContainText('legacy \u672a\u5be9\u67e5/\u672a\u5be9\u807d');
  await expect(page.locator('.review-workflow-release-btn')).toContainText('\u91cb\u653e\u97f3\u6a94\u6848\u4ef6');
  await expect(page.locator('.review-workflow-assess-btn')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item input:visible, .review-workflow-item textarea:visible')).toHaveCount(0);

  await page.locator('.review-workflow-assess-btn').click();
  await expect(page.locator('.review-workflow-assessment-panel')).toBeVisible();
  await page.locator('.review-workflow-assessment-panel [data-decision="可用"]').click();
  await page.locator('.review-workflow-assessment-panel [data-action="save"]').click();
  await page.waitForFunction(() => window.__workflowCalls.length === 1);

  const call = await page.evaluate(() => window.__workflowCalls[0]);
  expect(call.rpcName).toBe('submit_audio_assessment');
  expect(call.body.p_claim_token).toBe('00000000-0000-0000-0000-000000000088');
  expect(call.body.p_metadata.needs_followup).toBe(false);
});
test('audio assessor can save a case-level annotation draft from a usable audio source', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__workflowCalls = [];
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      if (rpcName === 'save_audio_annotation_draft') {
        return [{
          id: 900,
          case_id: 89,
          version_no: 5,
          version_kind: 'draft',
          source_type: 'audio_assessor',
          source_actor: 'test2@test.com',
          fields: {
            TaiHan1: '來源漢字',
            TL1: '來源音讀',
            TL2: '來源副音',
            TL3: '又念',
            TaiNote: '既有備註'
          }
        }];
      }
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.reviewWorkbenchMode = 'audio';
    state.userRole = 'audio_assessor';
    state.userId = 'test2@test.com';
    state.userName = '林聽聽';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 89,
      task_id: 89,
      language: '台語',
      place_name: '草稿保存測試',
      county: '臺北市',
      town: '北投區',
      class_name: '錄音標注',
      state: '錄音標注中',
      current_version_no: 4,
      version_kind: 'draft',
      annotation_fields: { TaiNote: '既有備註' },
      audio_claim_by: 'test2@test.com',
      audio_claim_token: '00000000-0000-0000-0000-000000000089',
      audio_claim_until: '2999-01-01T00:00:00Z',
      claim_by: null,
      claim_until: null,
      audio_record_count: 2,
      assessed_audio_count: 2,
      usable_audio_count: 2,
      audio_review_state: '已判定',
      audio_evidence: [
        {
          audio_record_id: 891,
          audio_file_id: 'drive-891',
          recorder_name: '錄音人甲',
          assessment_decision: '可用',
          needs_followup: false,
          assessed_at: '2026-08-30T01:02:03Z'
        },
        {
          audio_record_id: 892,
          audio_file_id: 'drive-892',
          recorder_name: '錄音人乙',
          assessment_decision: '可用',
          needs_followup: false,
          assessed_at: '2026-08-30T02:02:03Z'
        }
      ],
      audio_sources_loaded: true,
      audio_sources: [
        {
          audio_record_id: 891,
          annotations: { taihan: '來源漢字', tl1: '來源音讀', tl2: '來源副音' }
        },
        {
          audio_record_id: 892,
          annotations: { taihan: '另一筆漢字', tl1: '另一筆音讀' }
        }
      ]
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  const panel = page.locator('[data-review-audio-draft-panel="89"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.review-workflow-audio-draft-field')).toHaveCount(5);
  await expect(page.locator('.review-workflow-audio-source-fill-btn')).toHaveCount(2);
  await expect(page.locator('.review-workflow-approve-btn, .review-workflow-return-btn, .review-workflow-draft-btn')).toHaveCount(0);

  await page.locator('.review-workflow-audio-source-fill-btn').first().click();
  await expect(page.locator('#review-audio-draft-89-tai-TaiHan1')).toHaveValue('來源漢字');
  await expect(page.locator('#review-audio-draft-89-tai-TaiNote')).toHaveValue('既有備註');
  await panel.locator('#review-audio-draft-89-tai-TL3').fill('又念');
  await panel.locator('[data-role="audio-draft-confirm"]').check();
  await expect(panel.locator('[data-action="save-audio-draft"]')).toBeEnabled();
  await panel.locator('[data-action="save-audio-draft"]').click();
  await page.waitForFunction(() => window.__workflowCalls.some(call => call.rpcName === 'save_audio_annotation_draft'));

  const result = await page.evaluate(() => window.__workflowCalls.find(call => call.rpcName === 'save_audio_annotation_draft'));
  expect(result.body.p_case_id).toBe(89);
  expect(result.body.p_actor_account).toBeUndefined();
  expect(result.body.p_source_audio_record_id).toBe(891);
  expect(result.body.p_audio_claim_token).toBe('00000000-0000-0000-0000-000000000089');
  expect(result.body.p_base_version_no).toBe(4);
  expect(result.body.p_confirmed_unambiguous).toBe(true);
  expect(result.body.p_fields).toEqual({
    TaiHan1: '來源漢字',
    TL1: '來源音讀',
    TL2: '來源副音',
    TL3: '又念',
    TaiNote: '既有備註'
  });
  expect(result.body.p_client_request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await expect(panel.locator('[data-role="audio-draft-current-version"]')).toHaveText('目前版本：v5');
  await expect(panel.locator('[data-role="audio-draft-message"]')).toHaveText('已保存為校對草稿，尚未回寫正式資料。');

  const panelWidth = await panel.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(panelWidth.scrollWidth).toBeLessThanOrEqual(panelWidth.clientWidth);
});

test('audio assessor can inspect current draft and all versions without an audio claim', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__workflowCalls = [];
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      if (rpcName === 'get_audio_annotation_draft_history') {
        return [
          {
            id: 201, case_id: 90, version_no: 3, version_kind: 'draft',
            fields: { TaiHan1: '目前漢字', TL1: 'tse2', TaiNote: '目前備註' },
            created_by: 'una.cheng113@gmail.com', source_type: 'audio_assessor',
            source_actor: 'una.cheng113@gmail.com', created_at: '2026-09-01T01:02:03Z',
            source_audio_record_id: 902, changed_fields: ['TaiHan1', 'TL1'], is_current: true
          },
          {
            id: 200, case_id: 90, version_no: 2, version_kind: 'draft',
            fields: { TaiHan1: '共同漢字', TL1: 'tse1' },
            created_by: 'other@example.com', source_type: 'audio_assessor',
            source_actor: 'other@example.com', created_at: '2026-08-31T01:02:03Z',
            source_audio_record_id: 901, changed_fields: ['TaiHan1', 'TL1'], is_current: false
          },
          {
            id: 199, case_id: 90, version_no: 1, version_kind: 'draft',
            fields: { TaiHan1: '我的漢字', TL1: 'tse0' },
            created_by: 'test2@test.com', source_type: 'audio_assessor',
            source_actor: 'test2@test.com', created_at: '2026-08-30T01:02:03Z',
            source_audio_record_id: 900, changed_fields: ['TaiHan1'], is_current: false
          }
        ];
      }
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.reviewWorkbenchMode = 'audio';
    state.reviewWorkflowAudioStatusFilter = 'all';
    state.reviewWorkflowAudioFlagFilter = 'all';
    state.reviewWorkflowAudioClaimFilter = 'all';
    state.reviewWorkflowAudioKeyword = '';
    state.userRole = 'audio_assessor';
    state.userId = 'test2@test.com';
    state.userName = '林聽聽';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 90, task_id: 90, language: '台語', place_name: '草稿歷史檢視',
      county: '臺北市', town: '北投區', class_name: '錄音標注', state: '錄音標注中',
      current_version_no: 3, version_kind: 'draft',
      annotation_fields: { TaiHan1: '目前漢字', TL1: 'tse2', TaiNote: '目前備註' },
      annotation_created_by: 'una.cheng113@gmail.com',
      annotation_source_actor: 'una.cheng113@gmail.com',
      annotation_source_type: 'audio_assessor',
      annotation_created_at: '2026-09-01T01:02:03Z',
      audio_claim_by: null, audio_claim_token: null, audio_claim_until: null,
      audio_record_count: 1, assessed_audio_count: 1, usable_audio_count: 1,
      audio_review_state: '已判定',
      audio_evidence: [{
        audio_record_id: 902, audio_file_id: 'drive-902', recorder_name: '錄音人甲',
        assessment_decision: '可用', needs_followup: false, assessed_at: '2026-09-01T01:00:00Z'
      }],
      audio_sources_loaded: true,
      audio_sources: [{ audio_record_id: 902, annotations: { taihan: '來源漢字', tl1: '來源音讀' } }]
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  const panel = page.locator('.review-workflow-audio-draft-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('目前草稿內容');
  await expect(panel.locator('.review-workflow-audio-draft-snapshot.is-current')).toContainText('目前漢字');
  await expect(panel.locator('[data-role="audio-draft-current-meta"]')).toContainText('una.cheng113@gmail.com');
  await expect(panel.locator('[data-role="audio-draft-current-meta"]')).toContainText('2026');
  await expect(panel.locator('input, textarea, select')).toHaveCount(0);
  await expect(panel.locator('[data-action="save-audio-draft"]')).toHaveCount(0);

  const historyToggle = panel.locator('[data-role="audio-draft-history-toggle"]');
  await historyToggle.click();
  await expect(panel.locator('[data-role="audio-draft-history"]')).toBeVisible();
  await expect(panel.locator('.review-workflow-audio-draft-history-entry')).toHaveCount(3);
  await expect(panel.locator('.review-workflow-audio-draft-history-entry.is-current')).toHaveCount(1);
  await expect(panel.locator('.review-workflow-audio-draft-history-entry.is-own')).toHaveCount(1);
  await expect(panel.locator('.review-workflow-audio-draft-history-tag.is-own')).toHaveCount(1);
  await expect(panel.locator('.review-workflow-audio-draft-history-tag.is-current')).toHaveCount(1);
  await expect(panel.locator('.review-workflow-audio-draft-history-entry').first()).toContainText('v3');
  await expect(panel.locator('.review-workflow-audio-draft-history-entry.is-own')).toContainText('我的漢字');
  await page.waitForFunction(() => window.__workflowCalls.length === 1);
  const call = await page.evaluate(() => window.__workflowCalls[0]);
  expect(call.rpcName).toBe('get_audio_annotation_draft_history');
  expect(call.body.p_case_id).toBe(90);
  expect(call.body.p_actor_account).toBeUndefined();

  await historyToggle.click();
  await historyToggle.click();
  await expect(panel.locator('.review-workflow-audio-draft-history-entry')).toHaveCount(3);
  expect(await page.evaluate(() => window.__workflowCalls.length)).toBe(1);
  const panelWidth = await panel.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(panelWidth.scrollWidth).toBeLessThanOrEqual(panelWidth.clientWidth);
});

test('proofreader can compare and load a previous annotation version', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__workflowCalls = [];
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      if (rpcName === 'get_audio_annotation_draft_history') {
        return [
          {
            id: 303,
            case_id: 93,
            version_no: 3,
            version_kind: 'draft',
            fields: { TaiHan1: '目前漢字', TL1: 'tse3' },
            created_by: 'proof@example.com',
            source_type: 'app',
            source_actor: 'proof@example.com',
            created_at: '2026-09-01T03:00:00Z',
            changed_fields: ['TaiHan1', 'TL1'],
            is_current: true
          },
          {
            id: 302,
            case_id: 93,
            version_no: 2,
            version_kind: 'draft',
            fields: { TaiHan1: '前一版漢字', TL1: 'tse2' },
            created_by: 'test2@test.com',
            source_type: 'audio_assessor',
            source_actor: 'test2@test.com',
            created_at: '2026-08-31T03:00:00Z',
            source_audio_record_id: 902,
            changed_fields: ['TaiHan1', 'TL1'],
            is_current: false
          },
          {
            id: 301,
            case_id: 93,
            version_no: 1,
            version_kind: 'legacy',
            fields: { TaiHan1: '既有資料' },
            created_by: 'legacy',
            source_type: 'app',
            source_actor: 'legacy',
            created_at: '2026-08-30T03:00:00Z',
            changed_fields: [],
            is_current: false
          }
        ];
      }
      return [];
    };
    state.userRole = 'proofreader';
    state.userId = 'proof@example.com';
    state.userName = 'Proofreader';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 93,
      task_id: 93,
      language: '台語',
      place_name: '校對版本比較',
      class_name: '錄音標注',
      state: '待校對',
      assigned_to: 'proof@example.com',
      claim_by: 'proof@example.com',
      claim_until: '2999-01-01T00:00:00Z',
      current_version_no: 3,
      version_kind: 'draft',
      annotation_fields: { TaiHan1: '目前漢字', TL1: 'tse3' },
      annotation_created_by: 'proof@example.com',
      annotation_source_type: 'app',
      annotation_created_at: '2026-09-01T03:00:00Z',
      audio_record_count: 0,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_evidence: [],
      audio_sources_loaded: true,
      audio_sources: []
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  const item = page.locator('.review-workflow-item');
  const historyToggle = item.locator('[data-role="annotation-history-toggle"]');
  await historyToggle.click();
  const historyPanel = item.locator('[data-role="annotation-version-history"]');
  await expect(historyPanel).toBeVisible();
  await expect(historyPanel.locator('.review-workflow-audio-draft-history-entry')).toHaveCount(3);
  await expect(historyPanel.locator('.review-workflow-audio-draft-history-entry').first()).toContainText('v3');
  await expect(historyPanel.locator('.review-workflow-audio-draft-history-entry').nth(1)).toContainText('前一版漢字');
  await expect(historyPanel.locator('.review-workflow-history-apply-btn')).toHaveCount(3);

  await historyPanel.locator('.review-workflow-history-apply-btn').nth(1).click();
  await expect(item.locator('#review-workflow-93-tai-TaiHan1')).toHaveValue('前一版漢字');
  await expect(item.locator('#review-workflow-93-tai-TL1')).toHaveValue('tse2');
  await expect(historyPanel.locator('[data-role="annotation-history-message"]')).toContainText('載入 v2');
  const calls = await page.evaluate(() => window.__workflowCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].rpcName).toBe('get_audio_annotation_draft_history');
  expect(calls[0].body.p_case_id).toBe(93);
  expect(calls[0].body.p_actor_account).toBeUndefined();
});

test('proofreader sees editable draft and workflow actions', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));
    window.confirm = () => true;
    state.userRole = 'proofreader';
    state.userId = 'proof@example.com';
    state.userName = 'Proofreader';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 77,
      task_id: 12,
      language: '台語',
      place_name: '測試地名',
      class_name: '錄音標注',
      state: '待校對',
      assigned_to: 'proof@example.com',
      claim_by: 'proof@example.com',
      current_version_no: 2,
      version_kind: 'draft',
      annotation_fields: { TaiHan1: '測試漢字', TL1: 'tse3', TaiNote: '保留' },
      audio_record_count: 2,
      assessed_audio_count: 2,
      usable_audio_count: 2,
      distinct_respondent_count: 2,
      audio_gate_passed: true,
      audio_review_state: '已判定',
      audio_evidence: [
        { audio_record_id: 1, audio_file_id: 'drive-1', recorder_name: 'Recorder 1', assessment_decision: '可用' },
        { audio_record_id: 2, audio_file_id: 'drive-2', recorder_name: 'Recorder 2', assessment_decision: '可用' }
      ],
      audio_sources_loaded: true,
      audio_sources: [
        { audio_record_id: 1, phonetic_reading: 'fallback1', annotations: { taihan: 'copied-han', tl1: 'copied-tl1', tainote: 'copied-note' } },
        { audio_record_id: 2, annotations: { taihan: 'second-han', tainote: 'second-note' } }
      ],
      legacy_unreviewed: false
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await expect(page.locator('.review-workflow-item')).toContainText('測試地名');
  await expect(page.locator('.review-workflow-item')).not.toContainText('兩位不同受訪者');
  await expect(page.locator('.review-workflow-item')).toContainText('校對草稿');
  await expect(page.locator('.review-workflow-item')).toContainText('調查員內容（僅供校對帶入）');
  await expect(page.locator('.review-workflow-source-card')).toHaveCount(2);
  await expect(page.locator('.review-workflow-source-field')).toHaveCount(6);
  const sourceWidth = await page.locator('.review-workflow-source-list').evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(sourceWidth.scrollWidth).toBeLessThanOrEqual(sourceWidth.clientWidth);
  await expect(page.locator('.review-workflow-assess-btn')).toHaveCount(0);
  await expect(page.locator('.review-workflow-approve-btn')).toBeVisible();
  await expect(page.locator('.review-workflow-approve-btn')).toBeEnabled();
  await expect(page.locator('.review-workflow-draft-btn')).toBeVisible();
  await expect(page.locator('.review-workflow-item input, .review-workflow-item textarea')).toHaveCount(5);
  await expect(page.locator('.review-workflow-fill-existing-btn')).toBeVisible();
  await expect(page.locator('.review-workflow-fill-field-btn')).toHaveCount(5);
  await expect(page.locator('.review-workflow-draft-btn')).toBeVisible();
  await page.evaluate(async () => {
    clearReviewWorkflowDraft(77);
    const buttons = document.querySelectorAll('.review-workflow-fill-field-btn');
    await fillReviewWorkflowDraftFieldFromAudio(77, 1, 'TaiHan1', buttons[0]);
    await fillReviewWorkflowDraftFieldFromAudio(77, 1, 'TL1', buttons[1]);
  });
  await expect(page.locator('#review-workflow-77-tai-TaiHan1')).toHaveValue('copied-han');
  await expect(page.locator('#review-workflow-77-tai-TL1')).toHaveValue('copied-tl1');
  await expect(page.locator('#review-workflow-77-tai-TaiNote')).toHaveValue('');
  await expect(page.locator('#review-workflow-77-tai-TL2')).toHaveValue('');
});

test('proofing writes carry current claim token', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__workflowCalls = [];
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));
    window.confirm = () => true;
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.userRole = 'proofreader';
    state.userId = 'proof@example.com';
    state.userName = 'Proofreader';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 78,
      task_id: 13,
      language: '\u53f0\u8a9e',
      place_name: 'token-case',
      class_name: 'test',
      state: 'pending',
      assigned_to: 'proof@example.com',
      claim_by: 'proof@example.com',
      claim_token: '00000000-0000-0000-0000-000000000078',
      claim_until: '2999-01-01T00:00:00Z',
      version_kind: 'draft',
      annotation_fields: { TaiHan1: 'before-han', TL1: 'before-tl1' },
      audio_record_count: 0,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_evidence: [],
      audio_sources_loaded: true,
      audio_sources: [],
      legacy_unreviewed: false
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await page.evaluate(async () => {
    await saveReviewWorkflowDraft(78, null);
    await approveReviewWorkflowCase(78, null);
  });

  const calls = await page.evaluate(() => window.__workflowCalls);
  expect(calls).toHaveLength(2);
  expect(calls[0].rpcName).toBe('save_annotation_version');
  expect(calls[0].body.p_claim_token).toBe('00000000-0000-0000-0000-000000000078');
  expect(calls[1].rpcName).toBe('approve_review_case');
  expect(calls[1].body.p_claim_token).toBe('00000000-0000-0000-0000-000000000078');
});
test('proofreader can return annotation and audio separately', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__prompts = ['\u5169\u8005', '\u6a19\u97f3\u6b04\u4f4d\u9700\u4fee\u6b63', '\u8acb\u91cd\u65b0\u5224\u5b9a'];
    window.__workflowCalls = [];
    window.prompt = () => window.__prompts.shift();
    window.confirm = () => true;
    window.reviewWorkflowRpc = async (rpcName, body) => {
      window.__workflowCalls.push({ rpcName, body });
      return [];
    };
    window.loadReviewWorkflowQueue = async () => {};
    state.userRole = 'proofreader';
    state.userId = 'proof@example.com';
    state.reviewWorkflowQueue = [{
      case_id: 779,
      task_id: 779,
      language: '\u53f0\u8a9e',
      place_name: 'return-case',
      class_name: 'test',
      state: '\u6821\u5c0d\u4e2d',
      claim_by: 'proof@example.com',
      claim_token: '00000000-0000-0000-0000-000000000779',
      claim_until: '2999-01-01T00:00:00Z',
      version_kind: 'draft',
      annotation_fields: { TaiHan1: 'han', TL1: 'tl1' },
      audio_record_count: 1,
      assessed_audio_count: 1,
      usable_audio_count: 1,
      audio_evidence: [],
      legacy_unreviewed: false
    }];
  });

  await page.evaluate(async () => {
    await returnReviewWorkflowCase(779, null);
  });

  const call = await page.evaluate(() => window.__workflowCalls[0]);
  expect(call.rpcName).toBe('return_review_case');
  expect(call.body.p_claim_token).toBe('00000000-0000-0000-0000-000000000779');
  expect(call.body.p_return_annotation).toBe(true);
  expect(call.body.p_return_audio).toBe(true);
  expect(call.body.p_annotation_reason).toBe('\u6a19\u97f3\u6b04\u4f4d\u9700\u4fee\u6b63');
  expect(call.body.p_audio_reason).toBe('\u8acb\u91cd\u65b0\u5224\u5b9a');
});
test('admin filters workflow cases by draft status', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userName = 'Admin';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [
      {
        case_id: 1,
        task_id: 1,
        language: '\u53f0\u8a9e',
        place_name: 'draft-case',
        class_name: 'test',
        state: 'pending',
        version_kind: 'draft',
        annotation_fields: { TaiHan1: 'draft-value' },
        audio_record_count: 1,
        assessed_audio_count: 0,
        usable_audio_count: 0,
        distinct_respondent_count: 0,
        audio_gate_passed: false,
        audio_evidence: [],
        audio_sources_loaded: true,
        legacy_unreviewed: false
      },
      {
        case_id: 2,
        task_id: 2,
        language: '\u53f0\u8a9e',
        place_name: 'no-draft-case',
        class_name: 'test',
        state: 'pending',
        version_kind: null,
        annotation_fields: {},
        audio_record_count: 1,
        assessed_audio_count: 0,
        usable_audio_count: 0,
        distinct_respondent_count: 0,
        audio_gate_passed: false,
        audio_evidence: [],
        audio_sources_loaded: true,
        legacy_unreviewed: false
      }
    ];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  const filter = page.locator('#review-workflow-draft-filter');
  const items = page.locator('.review-workflow-item');
  await expect(filter).toHaveValue('draft');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('draft-case');
  await expect(page.locator('.review-workflow-approve-btn')).toBeEnabled();
  await expect(page.locator('.review-workflow-approve-hint')).toHaveCount(0);

  await filter.selectOption('all');
  await expect(items).toHaveCount(2);

  await filter.selectOption('draft');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('draft-case');

  await filter.selectOption('no-draft');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('no-draft-case');
});

test('admin audio inspection workbench hides proofing controls', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userName = 'Admin';
    state.reviewWorkbenchMode = 'audio';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 91,
      task_id: 91,
      language: '台語',
      place_name: '音檔檢驗測試',
      class_name: '錄音標注',
      state: '待校對',
      version_kind: 'draft',
      annotation_fields: { TaiHan1: '既有草稿' },
      audio_record_count: 1,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_review_state: '未審聽',
      audio_evidence: [
        { audio_record_id: 11, audio_file_id: 'drive-11', recorder_name: 'Recorder', assessment_decision: '未審聽' }
      ],
      audio_sources_loaded: true,
      audio_sources: []
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await expect(page.locator('.review-workbench-mode-btn[data-mode="audio"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.review-workflow-item')).toContainText('音檔檢驗工作台');
  await expect(page.locator('.review-workflow-source-card')).toHaveCount(1);
  await expect(page.locator('.review-workflow-assess-btn')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item input:visible, .review-workflow-item textarea:visible')).toHaveCount(0);
  await expect(page.locator('.review-workflow-draft-btn, .review-workflow-approve-btn')).toHaveCount(0);
});

test('satellite written draft stays in the shared proofing workbench', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
    state.userName = 'Admin';
    state.reviewWorkbenchMode = 'proofing';
    state.reviewWorkflowAvailable = true;
    state.reviewWorkflowQueue = [{
      case_id: 92,
      task_id: 92,
      language: '台語',
      place_name: '衛星書面測試',
      class_name: '書面標注',
      state: '待校對',
      version_kind: 'draft',
      annotation_source_type: 'satellite',
      annotation_fields: { TaiHan1: '衛星漢字', TL1: 'satellite-roman', TaiNote: '衛星備註' },
      current_version_no: 3,
      annotation_created_by: '標注員A',
      audio_record_count: 0,
      assessed_audio_count: 0,
      usable_audio_count: 0,
      audio_evidence: []
    }];
    document.getElementById('app-section').classList.remove('hidden');
    configureRoleUI();
    switchTab('review');
  });

  await expect(page.locator('.review-workflow-source-badge')).toHaveText('衛星草稿');
  await expect(page.locator('.review-workflow-source-note')).toContainText('共用校對草稿層');
  await expect(page.locator('.review-workflow-source-card')).toHaveCount(0);
  await expect(page.locator('.review-workflow-draft-btn')).toBeVisible();
  await expect(page.locator('#review-workflow-92-tai-TaiHan1')).toHaveValue('衛星漢字');
  await expect(page.locator('#review-workflow-92-tai-TL1')).toHaveValue('satellite-roman');
});

test('ordinary investigator cannot enter the proofing workbench', async ({ page }) => {
  await page.goto(appUrl);
  const state = await page.evaluate(() => {
    window.__alerts = [];
    window.alert = message => window.__alerts.push(String(message));
    state.userRole = 'user';
    state.currentTab = 'assigned';
    switchTab('review');
    return { currentTab: state.currentTab, alerts: window.__alerts };
  });

  expect(state.currentTab).toBe('assigned');
  expect(state.alerts[0]).toContain('沒有校對權限');
});
test('review workflow RPCs remove caller identity before using Auth-bound endpoints', async ({ page }) => {
  await page.goto(appUrl);
  const requests = await page.evaluate(() => [
    getReviewWorkflowRpcRequest('get_review_workflow_queue', {
      p_actor_account: 'spoof@example.com'
    }),
    getReviewWorkflowRpcRequest('submit_audio_assessment', {
      p_task_id: 1,
      p_assessor_account: 'spoof@example.com',
      p_claim_token: 'token'
    }),
    getReviewWorkflowRpcRequest('get_review_workflow_audio_sources', {
      p_case_id: 1
    })
  ]);
  expect(requests[0]).toEqual({
    rpcName: 'get_review_workflow_queue_authenticated',
    body: {}
  });
  expect(requests[1]).toEqual({
    rpcName: 'submit_audio_assessment_authenticated',
    body: { p_task_id: 1, p_claim_token: 'token' }
  });
  expect(requests[2]).toEqual({
    rpcName: 'get_review_workflow_audio_sources',
    body: { p_case_id: 1 }
  });
});
