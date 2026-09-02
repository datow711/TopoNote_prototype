-- Tighten privileges on Auth-bound private helper functions.
begin;

revoke all on function private.get_review_workflow_queue_authenticated()
  from public, anon, authenticated;
grant execute on function private.get_review_workflow_queue_authenticated()
  to authenticated;
revoke all on function private.get_audio_review_claims_authenticated()
  from public, anon, authenticated;
grant execute on function private.get_audio_review_claims_authenticated()
  to authenticated;
revoke all on function private.get_audio_assessment_history_authenticated(bigint, integer)
  from public, anon, authenticated;
grant execute on function private.get_audio_assessment_history_authenticated(bigint, integer)
  to authenticated;
revoke all on function private.claim_review_case_authenticated(bigint)
  from public, anon, authenticated;
grant execute on function private.claim_review_case_authenticated(bigint)
  to authenticated;
revoke all on function private.release_review_case_authenticated(bigint, uuid)
  from public, anon, authenticated;
grant execute on function private.release_review_case_authenticated(bigint, uuid)
  to authenticated;
revoke all on function private.assign_review_case_authenticated(bigint, text)
  from public, anon, authenticated;
grant execute on function private.assign_review_case_authenticated(bigint, text)
  to authenticated;
revoke all on function private.save_annotation_version_authenticated(bigint, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function private.save_annotation_version_authenticated(bigint, jsonb, uuid)
  to authenticated;
revoke all on function private.save_proofing_draft_authenticated(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function private.save_proofing_draft_authenticated(bigint, jsonb)
  to authenticated;
revoke all on function private.claim_audio_review_case_authenticated(bigint)
  from public, anon, authenticated;
grant execute on function private.claim_audio_review_case_authenticated(bigint)
  to authenticated;
revoke all on function private.release_audio_review_case_authenticated(bigint, uuid)
  from public, anon, authenticated;
grant execute on function private.release_audio_review_case_authenticated(bigint, uuid)
  to authenticated;
revoke all on function private.submit_audio_assessment_authenticated(integer, text, integer, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function private.submit_audio_assessment_authenticated(integer, text, integer, text, text, jsonb, uuid)
  to authenticated;
revoke all on function private.return_review_case_authenticated(bigint, uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
grant execute on function private.return_review_case_authenticated(bigint, uuid, boolean, boolean, text, text)
  to authenticated;
revoke all on function private.approve_review_case_authenticated(bigint, uuid)
  from public, anon, authenticated;
grant execute on function private.approve_review_case_authenticated(bigint, uuid)
  to authenticated;

commit;

