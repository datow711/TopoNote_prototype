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
  expect(audioDraftHistoryMigration).not.toMatch(/insert into public\.(annotation_versions|proofing_events)/i);
  expect(audioDraftHistoryMigration).not.toMatch(/update public\.(annotation_versions|proofing_events)/i);
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
