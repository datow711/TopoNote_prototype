const { pathToFileURL } = require('url');
const path = require('path');
const { test, expect } = require('@playwright/test');

const appUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

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
