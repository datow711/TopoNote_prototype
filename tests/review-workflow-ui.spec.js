const { pathToFileURL } = require('url');
const path = require('path');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
test('admin can save an audio assessment with a blank respondent key', async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.__prompts = ['', '\u53ef\u7528', ''];
    window.__rpcCalls = [];
    window.__alerts = [];
    window.prompt = () => window.__prompts.shift();
    window.alert = message => window.__alerts.push(String(message));
    window.fetch = async (url, options = {}) => {
      window.__rpcCalls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    state.userRole = 'admin';
    state.userId = 'admin@example.com';
  });

  await page.evaluate(async () => {
    await submitReviewWorkflowAudioAssessment(11, '\u53f0\u8a9e', 22, null);
  });

  const result = await page.evaluate(() => ({
    assessmentCall: window.__rpcCalls[0]
  }));
  expect(result.assessmentCall.url).toContain('/rpc/submit_audio_assessment');
  expect(result.assessmentCall.body.p_respondent_key).toBe('');
  expect(result.assessmentCall.body.p_decision).toBe('\u53ef\u7528');
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
  await expect(page.locator('.review-workflow-item')).toContainText('兩位不同受訪者');
  await expect(page.locator('.review-workflow-item')).toContainText('標注版本（校對員唯讀）');
  await expect(page.locator('.review-workflow-item')).toContainText('音檔判定（唯讀）');
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
  await expect(page.locator('.review-workflow-approve-btn')).toBeDisabled();
  await expect(page.locator('.review-workflow-approve-hint')).toContainText('\u97f3\u6a94');

  await filter.selectOption('all');
  await expect(items).toHaveCount(2);

  await filter.selectOption('draft');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('draft-case');

  await filter.selectOption('no-draft');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('no-draft-case');
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
