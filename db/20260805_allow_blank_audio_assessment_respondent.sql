-- Allow audio assessment respondent labels to be omitted.
-- Blank labels remain excluded from the distinct-respondent approval gate.
begin;

alter table public.audio_assessments
  alter column respondent_key drop not null;

create or replace function public.submit_audio_assessment(
  p_task_id integer,
  p_language text,
  p_audio_record_id integer,
  p_assessor_account text,
  p_respondent_key text,
  p_decision text,
  p_reason text default ''
)
returns public.audio_assessments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_assessor_account);
  v_assessment public.audio_assessments;
begin
  if v_role not in ('admin', 'user', 'annotator', 'audio_assessor') or v_role = 'proofreader' then
    raise exception 'audio assessment permission required';
  end if;
  if p_language not in (U&'\53f0\8a9e', U&'\5ba2\8a9e') then
    raise exception 'unsupported language';
  end if;
  if p_decision not in (U&'\53ef\7528', U&'\4e0d\53ef\7528', U&'\5f85\8ffd\554f') then
    raise exception 'unsupported audio decision';
  end if;
  if not exists (
    select 1
    from public.audio_records ar
    where ar.id = p_audio_record_id
      and ar.task_id = p_task_id
      and ar.language = p_language
      and ar.unlinked_at is null
  ) then
    raise exception 'audio record not found or unlinked';
  end if;
  insert into public.audio_assessments(
    task_id, language, audio_record_id, assessor_account,
    respondent_key, decision, reason
  )
  values (
    p_task_id, p_language, p_audio_record_id, p_assessor_account,
    nullif(trim(coalesce(p_respondent_key, '')), ''),
    p_decision, coalesce(p_reason, '')
  )
  returning * into v_assessment;
  return v_assessment;
end;
$function$;

commit;
