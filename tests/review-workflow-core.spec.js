const { test, expect } = require('@playwright/test');
const core = require('../review-workflow-core');

test.describe('review workflow core rules', () => {
  test('keeps respondent labels as audit data without blocking usable recordings', () => {
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
      audioReady: true
    });
  });

  test('legacy recordings remain unheard until an assessment event exists', () => {
    const summary = core.summarizeAudioEvidence([{ id: 1, audio_file_id: 'legacy' }], []);
    expect(summary).toMatchObject({ recordCount: 1, assessedCount: 0, state: '未審聽', audioReady: false });
  });

  test('claim and approval rules keep proofreader read-only to evidence', () => {
    expect(core.canClaimCase({ assigned_to: 'proof@example.com', state: '待校對' }, 'proof@example.com')).toBe(true);
    expect(core.canApproveCase({
      role: 'proofreader',
      claimBy: 'proof@example.com',
      actorAccount: 'proof@example.com',
      annotationReady: true
    })).toBe(true);
    expect(core.canApproveCase({
      role: 'user',
      claimBy: 'proof@example.com',
      actorAccount: 'proof@example.com',
      annotationReady: true
    })).toBe(false);
  });

  test('recording case advances to 錄音標注中 once every audio record is assessed', () => {
    const base = { assignedTo: 'worker@example.com', className: '電話調查' };
    expect(core.deriveCaseState({ ...base, audioRecordCount: 3, assessedAudioCount: 2 }))
      .toBe(core.CASE_STATES.RECORDING);
    expect(core.deriveCaseState({ ...base, audioRecordCount: 3, assessedAudioCount: 3 }))
      .toBe(core.CASE_STATES.RECORDING_ANNOTATION);
    // No audio yet means there is nothing to have finished assessing.
    expect(core.deriveCaseState({ ...base, audioRecordCount: 0, assessedAudioCount: 0 }))
      .toBe(core.CASE_STATES.RECORDING);
    // Written cases never enter the recording branch.
    expect(core.deriveCaseState({ ...base, className: '書面標注', audioRecordCount: 3, assessedAudioCount: 3 }))
      .toBe(core.CASE_STATES.WRITTEN);
    // A saved draft still outranks the audio-assessment stage.
    expect(core.deriveCaseState({ ...base, hasDraft: true, audioRecordCount: 3, assessedAudioCount: 3 }))
      .toBe(core.CASE_STATES.PENDING_PROOFING);
  });

  test('state constants carry no value the database never writes', () => {
    // 待審聽 and 退回助理處理 are out of scope by decision D-004; 需追問 was a
    // front-end-only value that the RPCs never produced.
    const values = Object.values(core.CASE_STATES);
    expect(values).toContain('錄音標注中');
    expect(values).not.toContain('需追問');
    expect(values).not.toContain('待審聽');
    expect(values).not.toContain('退回助理處理');
  });

  test('writeback key is stable for retries and changes with source version', () => {
    expect(core.buildIdempotencyKey(10, 2, 'stamp')).toBe('10:2:stamp');
    expect(core.buildIdempotencyKey(10, 3, 'stamp')).not.toBe(core.buildIdempotencyKey(10, 2, 'stamp'));
  });
});
