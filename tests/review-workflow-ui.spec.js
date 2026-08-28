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
  await page.locator('#review-workflow-audio-language-filter').selectOption('客語');
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
  await page.locator('#review-workflow-audio-status-filter').selectOption('followup');
  await expect(page.locator('.review-workflow-item')).toHaveCount(1);
  await expect(page.locator('.review-workflow-item')).toContainText('待追問案件');

  await openSecondaryFilters();
  await page.locator('#review-workflow-audio-status-filter').selectOption('all');
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
