const { test, expect } = require('@playwright/test');
const core = require('../review-workflow-core');

test.describe('review workflow core rules', () => {
  test('requires two usable recordings from different respondents', () => {
    const records = [
      { id: 1, audio_file_id: 'a' },
      { id: 2, audio_file_id: 'b' },
      { id: 3, audio_file_id: 'c' }
    ];
    const assessments = [
      { audio_record_id: 1, assessor_account: 'proof-1', respondent_key: 'r1', decision: '可用', created_at: '2026-08-04T01:00:00Z' },
      { audio_record_id: 2, assessor_account: 'proof-1', respondent_key: 'r1', decision: '可用', created_at: '2026-08-04T01:01:00Z' },
      { audio_record_id: 3, assessor_account: 'proof-1', respondent_key: 'r2', decision: '可用', created_at: '2026-08-04T01:02:00Z' }
    ];

    expect(core.summarizeAudioEvidence(records, assessments)).toMatchObject({
      usableCount: 3,
      distinctRespondentCount: 2,
      gatePassed: true
    });
  });

  test('legacy recordings remain unheard until an assessment event exists', () => {
    const summary = core.summarizeAudioEvidence([{ id: 1, audio_file_id: 'legacy' }], []);
    expect(summary).toMatchObject({ recordCount: 1, assessedCount: 0, state: '未審聽', gatePassed: false });
  });

  test('claim and approval rules keep proofreader read-only to evidence', () => {
    expect(core.canClaimCase({ assigned_to: 'proof@example.com', state: '待校對' }, 'proof@example.com')).toBe(true);
    expect(core.canApproveCase({
      role: 'proofreader',
      claimBy: 'proof@example.com',
      actorAccount: 'proof@example.com',
      annotationReady: true,
      audioGatePassed: true
    })).toBe(true);
    expect(core.canApproveCase({
      role: 'user',
      claimBy: 'proof@example.com',
      actorAccount: 'proof@example.com',
      annotationReady: true,
      audioGatePassed: true
    })).toBe(false);
  });

  test('writeback key is stable for retries and changes with source version', () => {
    expect(core.buildIdempotencyKey(10, 2, 'stamp')).toBe('10:2:stamp');
    expect(core.buildIdempotencyKey(10, 3, 'stamp')).not.toBe(core.buildIdempotencyKey(10, 2, 'stamp'));
  });
});
