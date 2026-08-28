-- Read-only audit history for inline audio review.
-- Assessment writes remain append-only in submit_audio_assessment().
-- This migration is intentionally separate so deployment can be reviewed
-- independently from the UI change.

begin;

create or replace function public.get_audio_assessment_history(
  p_case_id bigint,
  p_audio_record_id integer,
  p_actor_account text
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
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  v_case public.annotation_cases;
begin
  if coalesce(v_role, '') not in ('admin', 'audio_assessor', 'proofreader') then
    raise exception 'review history permission required';
  end if;

  select * into v_case
  from public.annotation_cases
  where id = p_case_id;
  if not found then
    raise exception 'review case not found';
  end if;

  if v_role = 'proofreader'
     and coalesce(v_case.assigned_to, '') <> p_actor_account
     and coalesce(v_case.claim_by, '') <> p_actor_account then
    raise exception 'assigned review case required';
  end if;

  if not exists (
    select 1
    from public.audio_records ar
    where ar.id = p_audio_record_id
      and ar.task_id = v_case.task_id
      and ar.language = v_case.language
      and ar.audio_file_id is not null
      and ar.unlinked_at is null
  ) then
    raise exception 'audio record not found or unlinked';
  end if;

  return query
  select aa.id,
    aa.task_id,
    aa.language,
    aa.audio_record_id,
    aa.assessor_account,
    aa.respondent_key,
    aa.decision,
    aa.reason,
    aa.unusable_reason_code,
    aa.unusable_reason_text,
    aa.needs_followup,
    aa.followup_reason_text,
    aa.created_at
  from public.audio_assessments aa
  where aa.task_id = v_case.task_id
    and aa.language = v_case.language
    and aa.audio_record_id = p_audio_record_id
  order by aa.created_at desc, aa.id desc;
end;
$function$;

revoke all on function public.get_audio_assessment_history(bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.get_audio_assessment_history(bigint, integer, text)
  to anon, authenticated;

commit;
