-- Auth-bound entry points for the review workflow.
-- Public wrappers do not accept caller-supplied actor accounts.

begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.get_review_workflow_queue_authenticated()
returns setof public.app_review_workflow_queue
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
begin
  select * into v_user from private.get_authenticated_investigator();
  return query select * from public.get_review_workflow_queue(v_user.account);
end;
$function$;

create or replace function private.get_audio_review_claims_authenticated()
returns table(
  case_id bigint,
  audio_claim_by text,
  audio_claim_token uuid,
  audio_claim_until timestamptz
)
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
begin
  select * into v_user from private.get_authenticated_investigator();
  return query select * from public.get_audio_review_claims(v_user.account);
end;
$function$;

create or replace function private.get_audio_assessment_history_authenticated(
  p_case_id bigint,
  p_audio_record_id integer
)
returns table(
  id bigint,
  task_id integer,
  language text,
  audio_record_id integer,
  assessor_account text,
  respondent_key text,
  decision text,
  reason text,
  unusable_reason_code text,
  unusable_reason_text text,
  needs_followup boolean,
  followup_reason_text text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
begin
  select * into v_user from private.get_authenticated_investigator();
  return query
  select * from public.get_audio_assessment_history(
    p_case_id, p_audio_record_id, v_user.account
  );
end;
$function$;

create or replace function private.claim_review_case_authenticated(
  p_case_id bigint
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.claim_review_case(p_case_id, v_user.account);
  return v_result;
end;
$function$;

create or replace function private.release_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.release_review_case(p_case_id, v_user.account, p_claim_token);
  return v_result;
end;
$function$;

create or replace function private.assign_review_case_authenticated(
  p_case_id bigint,
  p_assignee text
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.assign_review_case(p_case_id, p_assignee, v_user.account);
  return v_result;
end;
$function$;

create or replace function private.save_annotation_version_authenticated(
  p_case_id bigint,
  p_fields jsonb,
  p_claim_token uuid
)
returns public.annotation_versions
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_versions;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.save_annotation_version(
    p_case_id, v_user.account, p_fields, p_claim_token
  );
  return v_result;
end;
$function$;

create or replace function private.save_proofing_draft_authenticated(
  p_case_id bigint,
  p_payload jsonb
)
returns public.proofing_events
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.proofing_events;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.save_proofing_draft(
    p_case_id, v_user.account, coalesce(p_payload, '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function private.claim_audio_review_case_authenticated(
  p_case_id bigint
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.claim_audio_review_case(p_case_id, v_user.account);
  return v_result;
end;
$function$;

create or replace function private.release_audio_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.release_audio_review_case(
    p_case_id, v_user.account, p_claim_token
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function private.submit_audio_assessment_authenticated(
  p_task_id integer,
  p_language text,
  p_audio_record_id integer,
  p_respondent_key text,
  p_decision text,
  p_metadata jsonb,
  p_claim_token uuid
)
returns public.audio_assessments
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.audio_assessments;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.submit_audio_assessment(
    p_task_id, p_language, p_audio_record_id, v_user.account,
    p_respondent_key, p_decision, p_metadata, p_claim_token
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function private.return_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid,
  p_return_annotation boolean,
  p_return_audio boolean,
  p_annotation_reason text,
  p_audio_reason text
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.annotation_cases;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.return_review_case(
    p_case_id, v_user.account, p_claim_token, p_return_annotation,
    p_return_audio, coalesce(p_annotation_reason, ''),
    coalesce(p_audio_reason, '')
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function private.approve_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid
)
returns public.writeback_jobs
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_result public.writeback_jobs;
begin
  select * into v_user from private.get_authenticated_investigator();
  select * into v_result from public.approve_review_case(
    p_case_id, v_user.account, p_claim_token
  ) into v_result;
  return v_result;
end;
$function$;

-- Remove caller-controlled public entry points from API roles.
revoke all on function public.get_review_workflow_queue(text)
  from public, anon, authenticated;
revoke all on function public.get_audio_review_claims(text)
  from public, anon, authenticated;
revoke all on function public.get_audio_assessment_history(bigint, integer, text)
  from public, anon, authenticated;
revoke all on function public.claim_review_case(bigint, text)
  from public, anon, authenticated;
revoke all on function public.release_review_case(bigint, text)
  from public, anon, authenticated;
revoke all on function public.release_review_case(bigint, text, uuid)
  from public, anon, authenticated;
revoke all on function public.assign_review_case(bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.save_annotation_version(bigint, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_annotation_version(bigint, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.save_proofing_draft(bigint, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_audio_review_case(bigint, text)
  from public, anon, authenticated;
revoke all on function public.release_audio_review_case(bigint, text)
  from public, anon, authenticated;
revoke all on function public.release_audio_review_case(bigint, text, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_audio_assessment(integer, text, integer, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_audio_assessment(integer, text, integer, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.return_review_case(bigint, text, uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.approve_review_case(bigint, text)
  from public, anon, authenticated;
revoke all on function public.approve_review_case(bigint, text, uuid)
  from public, anon, authenticated;

create or replace function public.get_review_workflow_queue_authenticated()
returns setof public.app_review_workflow_queue
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_review_workflow_queue_authenticated();
$function$;

create or replace function public.get_audio_review_claims_authenticated()
returns table(
  case_id bigint,
  audio_claim_by text,
  audio_claim_token uuid,
  audio_claim_until timestamptz
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_audio_review_claims_authenticated();
$function$;

create or replace function public.get_audio_assessment_history_authenticated(
  p_case_id bigint,
  p_audio_record_id integer
)
returns table(
  id bigint,
  task_id integer,
  language text,
  audio_record_id integer,
  assessor_account text,
  respondent_key text,
  decision text,
  reason text,
  unusable_reason_code text,
  unusable_reason_text text,
  needs_followup boolean,
  followup_reason_text text,
  created_at timestamptz
)
language sql
security invoker
set search_path to 'public, private'
as $function$
  select * from private.get_audio_assessment_history_authenticated(
    p_case_id, p_audio_record_id
  );
$function$;

create or replace function public.claim_review_case_authenticated(
  p_case_id bigint
)
returns public.annotation_cases
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.claim_review_case_authenticated(p_case_id);
$function$;

create or replace function public.release_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid
)
returns public.annotation_cases
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.release_review_case_authenticated(p_case_id, p_claim_token);
$function$;

create or replace function public.assign_review_case_authenticated(
  p_case_id bigint,
  p_assignee text
)
returns public.annotation_cases
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.assign_review_case_authenticated(p_case_id, p_assignee);
$function$;

create or replace function public.save_annotation_version_authenticated(
  p_case_id bigint,
  p_fields jsonb,
  p_claim_token uuid
)
returns public.annotation_versions
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.save_annotation_version_authenticated(
    p_case_id, p_fields, p_claim_token
  );
$function$;

create or replace function public.save_proofing_draft_authenticated(
  p_case_id bigint,
  p_payload jsonb
)
returns public.proofing_events
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.save_proofing_draft_authenticated(p_case_id, p_payload);
$function$;

create or replace function public.claim_audio_review_case_authenticated(
  p_case_id bigint
)
returns public.annotation_cases
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.claim_audio_review_case_authenticated(p_case_id);
$function$;

create or replace function public.release_audio_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid
)
returns public.annotation_cases
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.release_audio_review_case_authenticated(
    p_case_id, p_claim_token
  );
$function$;

create or replace function public.submit_audio_assessment_authenticated(
  p_task_id integer,
  p_language text,
  p_audio_record_id integer,
  p_respondent_key text,
  p_decision text,
  p_metadata jsonb,
  p_claim_token uuid
)
returns public.audio_assessments
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.submit_audio_assessment_authenticated(
    p_task_id, p_language, p_audio_record_id, p_respondent_key,
    p_decision, p_metadata, p_claim_token
  );
$function$;

create or replace function public.return_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid,
  p_return_annotation boolean,
  p_return_audio boolean,
  p_annotation_reason text,
  p_audio_reason text
)
returns public.annotation_cases
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.return_review_case_authenticated(
    p_case_id, p_claim_token, p_return_annotation, p_return_audio,
    p_annotation_reason, p_audio_reason
  );
$function$;

create or replace function public.approve_review_case_authenticated(
  p_case_id bigint,
  p_claim_token uuid
)
returns public.writeback_jobs
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.approve_review_case_authenticated(p_case_id, p_claim_token);
$function$;

revoke all on function public.get_review_workflow_queue_authenticated()
  from public, anon, authenticated;
grant execute on function public.get_review_workflow_queue_authenticated()
  to authenticated;
revoke all on function public.get_audio_review_claims_authenticated()
  from public, anon, authenticated;
grant execute on function public.get_audio_review_claims_authenticated()
  to authenticated;
revoke all on function public.get_audio_assessment_history_authenticated(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_audio_assessment_history_authenticated(bigint, integer)
  to authenticated;
revoke all on function public.claim_review_case_authenticated(bigint)
  from public, anon, authenticated;
grant execute on function public.claim_review_case_authenticated(bigint)
  to authenticated;
revoke all on function public.release_review_case_authenticated(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.release_review_case_authenticated(bigint, uuid)
  to authenticated;
revoke all on function public.assign_review_case_authenticated(bigint, text)
  from public, anon, authenticated;
grant execute on function public.assign_review_case_authenticated(bigint, text)
  to authenticated;
revoke all on function public.save_annotation_version_authenticated(bigint, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_annotation_version_authenticated(bigint, jsonb, uuid)
  to authenticated;
revoke all on function public.save_proofing_draft_authenticated(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_proofing_draft_authenticated(bigint, jsonb)
  to authenticated;
revoke all on function public.claim_audio_review_case_authenticated(bigint)
  from public, anon, authenticated;
grant execute on function public.claim_audio_review_case_authenticated(bigint)
  to authenticated;
revoke all on function public.release_audio_review_case_authenticated(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.release_audio_review_case_authenticated(bigint, uuid)
  to authenticated;
revoke all on function public.submit_audio_assessment_authenticated(integer, text, integer, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_audio_assessment_authenticated(integer, text, integer, text, text, jsonb, uuid)
  to authenticated;
revoke all on function public.return_review_case_authenticated(bigint, uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.return_review_case_authenticated(bigint, uuid, boolean, boolean, text, text)
  to authenticated;
revoke all on function public.approve_review_case_authenticated(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_review_case_authenticated(bigint, uuid)
  to authenticated;

commit;

