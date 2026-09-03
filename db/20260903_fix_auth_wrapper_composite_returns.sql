-- Fix authenticated wrappers receiving composite function results.
-- A composite-returning function must be selected with FROM so each
-- attribute is assigned to the matching row variable field.

begin;

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
  );
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
  );
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
  );
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
  );
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
  );
  return v_result;
end;
$function$;

commit;
