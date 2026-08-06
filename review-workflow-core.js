(function exposeReviewWorkflowCore(global) {
  const LANGUAGES = ['台語', '客語'];
  // Must stay in sync with the values written by the Supabase RPCs.
  // See docs/review-workflow-implementation-gap.md and decision D-004:
  // 待審聽 and 退回助理處理 are deliberately not part of the state machine.
  const CASE_STATES = Object.freeze({
    UNASSIGNED: '待指派',
    WRITTEN: '書面標注中',
    RECORDING: '錄音中',
    RECORDING_ANNOTATION: '錄音標注中',
    PENDING_PROOFING: '待校對',
    PROOFING: '校對中',
    DONE: '已完成',
    LEGACY: 'legacy_unreviewed'
  });
  const AUDIO_DECISIONS = Object.freeze({
    USABLE: '可用',
    UNUSABLE: '不可用',
    FOLLOW_UP: '待追問'
  });

  function normalizeLanguage(language) {
    if (language === '台語' || language === 'tai' || language === 'T') return '台語';
    if (language === '客語' || language === 'hak' || language === 'H') return '客語';
    return '';
  }

  function normalizeRespondentKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isClaimActive(claimUntil, now = Date.now()) {
    if (!claimUntil) return false;
    const timestamp = new Date(claimUntil).getTime();
    return Number.isFinite(timestamp) && timestamp > now;
  }

  function canClaimCase(caseRow, actorAccount, now = Date.now()) {
    if (!caseRow || !actorAccount) return false;
    if (caseRow.state === CASE_STATES.DONE) return false;
    if (isClaimActive(caseRow.claim_until, now) && caseRow.claim_by !== actorAccount) return false;
    return !caseRow.assigned_to || caseRow.assigned_to === actorAccount || caseRow.claim_by === actorAccount;
  }

  function buildIdempotencyKey(caseId, versionNo, sourceStamp) {
    return [caseId, versionNo, sourceStamp || 'no-source-stamp'].join(':');
  }

  function latestRows(rows, keyBuilder) {
    const latest = new Map();
    (rows || []).forEach(row => {
      const key = keyBuilder(row);
      const previous = latest.get(key);
      if (!previous || String(row.created_at || row.id || '') > String(previous.created_at || previous.id || '')) {
        latest.set(key, row);
      }
    });
    return [...latest.values()];
  }

  function summarizeAudioEvidence(records, assessments) {
    const activeRecords = (records || []).filter(record => !record.unlinked_at && record.audio_file_id);
    const recordIds = new Set(activeRecords.map(record => String(record.id || record.record_id)));
    const latestAssessments = latestRows(
      (assessments || []).filter(row => recordIds.has(String(row.audio_record_id))),
      row => `${row.audio_record_id}:${row.assessor_account || ''}`
    );
    const usable = latestAssessments.filter(row => row.decision === AUDIO_DECISIONS.USABLE);
    const respondentKeys = new Set(
      latestAssessments
        .filter(row => row.decision === AUDIO_DECISIONS.USABLE)
        .map(row => normalizeRespondentKey(row.respondent_key))
        .filter(Boolean)
    );
    const followUpCount = latestAssessments.filter(
      row => row.needs_followup === true || row.decision === AUDIO_DECISIONS.FOLLOW_UP
    ).length;
    const unusableCount = latestAssessments.filter(row => row.decision === AUDIO_DECISIONS.UNUSABLE).length;
    return {
      recordCount: activeRecords.length,
      assessedCount: latestAssessments.length,
      usableCount: usable.length,
      distinctRespondentCount: respondentKeys.size,
      followUpCount,
      unusableCount,
      state: latestAssessments.length === 0 ? '未審聽' : followUpCount > 0 ? '待追問' : '已判定',
      // Respondent labels are optional audit data. They must not block
      // assessment, proofing, or approval.
      audioReady: latestAssessments.length >= activeRecords.length && activeRecords.length > 0
    };
  }

  // Mirrors the server-side transitions in
  // db/20260806_recording_annotation_state.sql. Audio follow-up and unusable
  // counts are reported separately by summarizeAudioEvidence() and must not
  // widen the main state.
  function deriveCaseState({
    assignedTo,
    className,
    hasDraft,
    claimBy,
    claimUntil,
    proofed,
    audioRecordCount,
    assessedAudioCount,
    now
  } = {}) {
    if (proofed) return CASE_STATES.DONE;
    if (claimBy && isClaimActive(claimUntil, now)) return CASE_STATES.PROOFING;
    if (!assignedTo) return CASE_STATES.UNASSIGNED;
    if (hasDraft) return CASE_STATES.PENDING_PROOFING;
    if (className === '書面標注') return CASE_STATES.WRITTEN;
    const total = Number(audioRecordCount) || 0;
    const assessed = Number(assessedAudioCount) || 0;
    return total > 0 && assessed >= total
      ? CASE_STATES.RECORDING_ANNOTATION
      : CASE_STATES.RECORDING;
  }

  function canApproveCase({ role, claimBy, actorAccount, annotationReady } = {}) {
    const reviewer = role === 'admin' || role === 'proofreader';
    const ownsClaim = role === 'admin' || (claimBy && claimBy === actorAccount);
    return reviewer && ownsClaim && Boolean(annotationReady);
  }

  const api = {
    LANGUAGES,
    CASE_STATES,
    AUDIO_DECISIONS,
    normalizeLanguage,
    normalizeRespondentKey,
    isClaimActive,
    canClaimCase,
    buildIdempotencyKey,
    latestRows,
    summarizeAudioEvidence,
    deriveCaseState,
    canApproveCase
  };

  global.reviewWorkflowCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
