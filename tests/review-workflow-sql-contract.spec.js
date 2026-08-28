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
