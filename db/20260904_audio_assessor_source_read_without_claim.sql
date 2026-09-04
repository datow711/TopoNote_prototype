-- Allow audio assessors to read original annotation sources without claiming a case.
-- Claims remain required for audio assessment and annotation-draft writes.

begin;

create or replace function public.get_review_workflow_audio_sources(
  p_case_id bigint,
  p_actor_account text
)
returns table(
  audio_record_id integer,
  phonetic_reading text,
  annotations jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  v_case public.annotation_cases;
begin
  if v_role not in ('admin', 'proofreader', 'audio_assessor') then
    raise exception 'review source permission required';
  end if;

  select *
  into v_case
  from public.annotation_cases
  where id = p_case_id;
  if not found then
    raise exception 'review case not found';
  end if;

  if v_role = 'proofreader' and (
    lower(trim(coalesce(v_case.assigned_to, ''))) <> lower(trim(coalesce(p_actor_account, '')))
    and lower(trim(coalesce(v_case.claim_by, ''))) <> lower(trim(coalesce(p_actor_account, '')))
  ) then
    raise exception 'case assignment required';
  end if;

  if v_role = 'audio_assessor' and not exists (
    select 1
    from public.audio_records ar
    where ar.task_id = v_case.task_id
      and ar.language = v_case.language
      and ar.audio_file_id is not null
      and ar.unlinked_at is null
  ) then
    raise exception 'audio review case required';
  end if;

  return query
  select
    ar.id,
    ar.phonetic_reading,
    case
      when ar.note ~ '^\s*\{' then coalesce(ar.note::jsonb->'annotations', '{}'::jsonb)
      else '{}'::jsonb
    end
  from public.audio_records ar
  where ar.task_id = v_case.task_id
    and ar.language = v_case.language
    and ar.audio_file_id is not null
    and ar.unlinked_at is null
  order by ar.id;
end;
$function$;

revoke all on function public.get_review_workflow_audio_sources(bigint, text)
  from public, anon, authenticated;
grant execute on function public.get_review_workflow_audio_sources(bigint)
  to authenticated;

commit;
