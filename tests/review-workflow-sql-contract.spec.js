const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const assessmentMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260806_recording_annotation_state.sql'),
  'utf8'
);
const historyMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260828_audio_assessment_history.sql'),
  'utf8'
);

const audioDraftMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260831_audio_assessor_annotation_draft.sql'),
  'utf8'
);

const audioDraftHistoryMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260902_audio_annotation_draft_history.sql'),
  'utf8'
);
const authWrapperMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260902_review_workflow_auth_wrappers.sql'),
  'utf8'
);


const cardSaveMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260922_audio_review_card_save.sql'),
  'utf8'
);
const historyBackfillMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260922_audio_review_history_backfill.sql'),
  'utf8'
);

const authWrapperGrantMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260902_review_workflow_auth_wrapper_grants.sql'),
  'utf8'
);

const simplifiedAssessmentMigration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260909_simplify_audio_assessment_decision.sql'),
  'utf8'
);
test('audio assessor annotation drafts have isolated permissions and concurrency guards', async () => {
  expect(audioDraftMigration).toContain(
    'create or replace function public.save_audio_annotation_draft('
  );
  expect(audioDraftMigration).toContain('p_audio_claim_token uuid');
  expect(audioDraftMigration).toContain('p_base_version_no integer');
  expect(audioDraftMigration).toContain('p_client_request_id uuid');
  expect(audioDraftMigration).toContain("v_role not in ('admin', 'audio_assessor')");
  expect(audioDraftMigration).toContain('active audio claim token required');
  expect(audioDraftMigration).toContain("v_latest_assessment.decision <> '可用'");
  expect(audioDraftMigration).toContain('coalesce(v_latest_assessment.needs_followup, false)');
  expect(audioDraftMigration).toContain('unknown annotation field');
  expect(audioDraftMigration).toContain('at least one annotation field is required');
  expect(audioDraftMigration).toContain("array['TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote']");
  expect(audioDraftMigration).toContain("array['Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote']");
  expect(audioDraftMigration).toContain('jsonb_set');
  expect(audioDraftMigration).toContain('client_request_id');
  expect(audioDraftMigration).toContain('stale annotation draft version');
  expect(audioDraftMigration).toContain("'audio_annotation_draft'");
  expect(audioDraftMigration).toContain('set current_version_no = v_next_version_no');
  expect(audioDraftMigration).not.toMatch(/set\s+state\s*=/i);
  expect(audioDraftMigration).not.toMatch(/update public\.(audio_records|writeback_jobs)/i);
  expect(audioDraftMigration).toContain("'audio_assessor'");
  expect(audioDraftMigration).toContain('grant execute on function public.save_audio_annotation_draft');
  expect(audioDraftMigration).toContain('revoke all on function public.save_audio_annotation_draft');
  expect(audioDraftMigration).toContain("v_role not in ('admin', 'proofreader', 'audio_assessor')");
  expect(audioDraftMigration).toContain('active audio claim required');
});

test('audio annotation draft history is read-only and exposes ownership metadata', async () => {
  expect(audioDraftHistoryMigration).toContain(
    'create or replace function public.get_audio_annotation_draft_history('
  );
  expect(audioDraftHistoryMigration).toContain('create or replace function private.get_authenticated_investigator()');
  expect(audioDraftHistoryMigration).toContain('auth.uid()');
  expect(audioDraftHistoryMigration).toContain('confirmed Auth email required');
  expect(audioDraftHistoryMigration).toContain('security invoker');
  expect(audioDraftHistoryMigration).toContain('source_audio_record_id integer');
  expect(audioDraftHistoryMigration).toContain('changed_fields text[]');
  expect(audioDraftHistoryMigration).toContain('is_current boolean');
  expect(audioDraftHistoryMigration).toContain("v_role not in ('admin', 'proofreader', 'audio_assessor')");
  expect(audioDraftHistoryMigration).toContain('audio case visibility required');
  expect(audioDraftHistoryMigration).toContain('assigned or claimed proofing case required');
  expect(audioDraftHistoryMigration).toContain('left join lateral');
  expect(audioDraftHistoryMigration).toContain("pe.action = 'audio_annotation_draft'");
  expect(audioDraftHistoryMigration).toContain('revoke all on function public.get_audio_annotation_draft_history');
  expect(audioDraftHistoryMigration).toContain('grant execute on function public.get_audio_annotation_draft_history');
  expect(audioDraftHistoryMigration).toContain('security definer');
  expect(audioDraftHistoryMigration).toContain('to authenticated;');
  expect(audioDraftHistoryMigration).not.toContain('grant execute on function public.get_audio_annotation_draft_history(bigint, text)');
  expect(audioDraftHistoryMigration).not.toContain('p_actor_account');
  expect(audioDraftHistoryMigration).not.toMatch(/insert into public\.(annotation_versions|proofing_events)/i);
  expect(audioDraftHistoryMigration).not.toMatch(/update public\.(annotation_versions|proofing_events)/i);
});

test('audio source and draft write entry points require Auth-bound wrappers', async () => {
  expect(audioDraftHistoryMigration).toContain('create or replace function public.get_review_workflow_audio_sources(');
  expect(audioDraftHistoryMigration).toContain('create or replace function public.save_audio_annotation_draft(');
  expect(audioDraftHistoryMigration).toContain('private.get_review_workflow_audio_sources_authenticated');
  expect(audioDraftHistoryMigration).toContain('private.save_audio_annotation_draft_authenticated');
  expect(audioDraftHistoryMigration).toContain('revoke all on function public.save_audio_annotation_draft(');
  expect(audioDraftHistoryMigration).toContain('grant execute on function public.save_audio_annotation_draft(');
  expect(audioDraftHistoryMigration).toContain('grant execute on function public.get_review_workflow_audio_sources(bigint)');
  expect(audioDraftHistoryMigration).not.toMatch(/grant execute on function public\.(save_audio_annotation_draft|get_review_workflow_audio_sources)\([^)]*text[^)]*\)\s+to\s+(anon|authenticated)/i);
});
test('audio assessment history is read-only and assessment writes are append-only', async () => {
  expect(assessmentMigration).toContain('insert into public.audio_assessments(');
  expect(assessmentMigration).not.toMatch(/update public\.audio_assessments\s+set/i);
  expect(assessmentMigration).toContain('insert into public.proofing_events');

  expect(historyMigration).toContain(
    'create or replace function public.get_audio_assessment_history('
  );
  expect(historyMigration).toContain('order by aa.created_at desc, aa.id desc;');
  expect(historyMigration).toContain(
    'revoke all on function public.get_audio_assessment_history'
  );
  expect(historyMigration).toContain(
    'grant execute on function public.get_audio_assessment_history'
  );
  expect(historyMigration).toContain('security definer');
  expect(historyMigration).toContain('and coalesce(v_case.assigned_to, \'\') <> p_actor_account');
  expect(historyMigration).toContain('and coalesce(v_case.claim_by, \'\') <> p_actor_account');
});
test('all review workflow API entry points are Auth-bound', async () => {
  const authenticatedRpcNames = [
    'get_review_workflow_queue_authenticated',
    'get_audio_review_claims_authenticated',
    'get_audio_assessment_history_authenticated',
    'claim_review_case_authenticated',
    'release_review_case_authenticated',
    'assign_review_case_authenticated',
    'save_annotation_version_authenticated',
    'save_proofing_draft_authenticated',
    'claim_audio_review_case_authenticated',
    'release_audio_review_case_authenticated',
    'submit_audio_assessment_authenticated',
    'return_review_case_authenticated',
    'approve_review_case_authenticated'
  ];
  authenticatedRpcNames.forEach(rpcName => {
    expect(authWrapperMigration).toContain(`create or replace function public.${rpcName}(`);
    expect(authWrapperMigration).toContain(`grant execute on function public.${rpcName}`);
  });
  expect(authWrapperMigration).toContain('private.get_authenticated_investigator()');
  expect(authWrapperMigration).toContain('security invoker');
  expect(authWrapperMigration).toContain('revoke all on function public.get_review_workflow_queue(text)');
  expect(authWrapperMigration).toContain('revoke all on function public.submit_audio_assessment(integer, text, integer, text, text, text, jsonb, uuid)');
  expect(authWrapperMigration).not.toMatch(/grant execute on function public\.(get_review_workflow_queue|claim_review_case|submit_audio_assessment)\([^)]*(actor_account|assessor_account)/);
});
test('private Auth helpers have explicit least-privilege grants', async () => {
  const privateHelperNames = [
    'get_review_workflow_queue_authenticated',
    'get_audio_review_claims_authenticated',
    'get_audio_assessment_history_authenticated',
    'claim_review_case_authenticated',
    'release_review_case_authenticated',
    'assign_review_case_authenticated',
    'save_annotation_version_authenticated',
    'save_proofing_draft_authenticated',
    'claim_audio_review_case_authenticated',
    'release_audio_review_case_authenticated',
    'submit_audio_assessment_authenticated',
    'return_review_case_authenticated',
    'approve_review_case_authenticated'
  ];
  privateHelperNames.forEach(name => {
    expect(authWrapperGrantMigration).toContain(`revoke all on function private.${name}`);
    expect(authWrapperGrantMigration).toContain(`grant execute on function private.${name}`);
  });
});

test('audio assessment follow-up state is derived from decision', async () => {
  expect(simplifiedAssessmentMigration).toContain("v_needs_followup := p_decision = U&'\\5f85\\8ffd\\554f';");
  expect(simplifiedAssessmentMigration).toContain("v_followup_reason_text := coalesce(nullif(trim(coalesce(p_metadata ->> 'followup_reason_text', '')), ''), coalesce(p_metadata ->> 'reason', ''));");
  expect(simplifiedAssessmentMigration).toContain("raise exception 'selected audio must be usable';");
  expect(simplifiedAssessmentMigration).not.toContain('coalesce(v_latest_assessment.needs_followup, false)');
});
test('audio review card save is atomic and persists case-level review state', async () => {
  expect(cardSaveMigration).toContain('add column if not exists audio_review_note text not null default');
  expect(cardSaveMigration).toContain('add column if not exists needs_followup_review boolean not null default false');
  expect(cardSaveMigration).toContain('create table if not exists public.audio_review_card_requests');
  expect(cardSaveMigration).toContain('create or replace function private.save_audio_review_card_authenticated(');
  expect(cardSaveMigration).toContain('create or replace function public.save_audio_review_card_authenticated(');
  expect(cardSaveMigration).toContain('p_audio_review_note text');
  expect(cardSaveMigration).toContain('p_needs_followup_review boolean');
  expect(cardSaveMigration).toContain("state = U&'\\5f85\\6aa2\\67e5'");
  expect(cardSaveMigration).toContain("'audio_review_card_save'");
  expect(cardSaveMigration).toContain('select count(*) < 2 into v_needs_followup');
  expect(cardSaveMigration).toContain('grant execute on function public.save_audio_review_card_authenticated');
  expect(cardSaveMigration).toContain('to authenticated;');
  expect(cardSaveMigration).toContain('client_request_id');
  expect(cardSaveMigration).toContain('for update');
  expect(cardSaveMigration).not.toContain('selected audio must be usable');
  expect(cardSaveMigration).not.toContain('unusable reason code is required');
  expect(cardSaveMigration).not.toContain('follow-up reason is required');
  expect(cardSaveMigration).toContain("if new.state = U&'\\5f85\\6821\\5c0d' then");
  expect(cardSaveMigration).toContain("new.state := U&'\\5f85\\6aa2\\67e5'");
});

test('historical audio review data backfills case follow-up and appends notes', async () => {
  expect(historyBackfillMigration).toContain('join public.audio_assessments aa');
  expect(historyBackfillMigration).toContain("aa.decision = U&'\\5f85\\8ffd\\554f'");
  expect(historyBackfillMigration).toContain('coalesce(aa.needs_followup, false)');
  expect(historyBackfillMigration).toContain('aa.reason');
  expect(historyBackfillMigration).toContain('aa.followup_reason_text');
  expect(historyBackfillMigration).toContain('aa.unusable_reason_text');
  expect(historyBackfillMigration).toContain('audio_review_note = case');
  expect(historyBackfillMigration).toContain('needs_followup_review = coalesce(c.needs_followup_review, false)');
  expect(historyBackfillMigration).toContain("when e.has_followup then U&'\\5f85\\6aa2\\67e5'");
  expect(historyBackfillMigration).toContain("'audio_review_history_backfill'");
  expect(historyBackfillMigration).toContain("'system_migration'");
  expect(historyBackfillMigration).toContain("pe.payload ->> 'migration'");
});
