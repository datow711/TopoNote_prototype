-- Read-only history for case-level annotation drafts.
-- Audio assessors may verify visible audio cases without holding a claim;
-- proofreaders keep assigned/claimed-case visibility and admins see all cases.

begin;

create or replace function public.get_audio_annotation_draft_history(
  p_case_id bigint,
  p_actor_account text
)
returns table(
  id bigint,
  case_id bigint,
  version_no integer,
  version_kind text,
  fields jsonb,
  created_by text,
  source_type text,
  source_actor text,
  source_stamp text,
  created_at timestamptz,
  source_audio_record_id integer,
  changed_fields text[],
  is_current boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  v_case public.annotation_cases;
  v_actor text := lower(trim(coalesce(p_actor_account, '')));
begin
  if v_role not in ('admin', 'proofreader', 'audio_assessor') then
    raise exception 'annotation draft history permission required';
  end if;
  if p_case_id is null then
    raise exception 'case id is required';
  end if;

  select ac.*
  into v_case
  from public.annotation_cases ac
  where ac.id = p_case_id;
  if not found then
    raise exception 'review case not found';
  end if;

  if v_role = 'audio_assessor' then
    if not exists (
      select 1
      from public.audio_records ar
      where ar.task_id = v_case.task_id
        and ar.language = v_case.language
        and ar.audio_file_id is not null
        and ar.unlinked_at is null
    ) then
      raise exception 'audio case visibility required';
    end if;
  elsif v_role = 'proofreader' then
    if not (
      lower(trim(coalesce(v_case.assigned_to, ''))) = v_actor
      or (
        lower(trim(coalesce(v_case.claim_by, ''))) = v_actor
        and v_case.claim_until is not null
        and v_case.claim_until > now()
      )
    ) then
      raise exception 'assigned or claimed proofing case required';
    end if;
  end if;

  return query
  select
    av.id,
    av.case_id,
    av.version_no,
    av.version_kind,
    av.fields,
    av.created_by,
    av.source_type,
    av.source_actor,
    av.source_stamp,
    av.created_at,
    case
      when draft_event.payload->>'source_audio_record_id' ~ '^[0-9]+$'
        then (draft_event.payload->>'source_audio_record_id')::integer
      else null
    end,
    case
      when jsonb_typeof(coalesce(draft_event.payload->'changed_fields', 'null'::jsonb)) = 'array'
        then array(
          select jsonb_array_elements_text(draft_event.payload->'changed_fields')
        )::text[]
      else array[]::text[]
    end,
    av.version_no = coalesce(v_case.current_version_no, 0)
  from public.annotation_versions av
  left join lateral (
    select pe.payload
    from public.proofing_events pe
    where pe.case_id = av.case_id
      and pe.action = 'audio_annotation_draft'
      and pe.payload->>'version_id' ~ '^[0-9]+$'
      and (pe.payload->>'version_id')::bigint = av.id
    order by pe.created_at desc, pe.id desc
    limit 1
  ) draft_event on true
  where av.case_id = v_case.id
  order by av.version_no desc, av.id desc;
end;
$function$;

revoke all on function public.get_audio_annotation_draft_history(bigint, text)
  from public, anon, authenticated;
grant execute on function public.get_audio_annotation_draft_history(bigint, text)
  to anon, authenticated;

commit;
