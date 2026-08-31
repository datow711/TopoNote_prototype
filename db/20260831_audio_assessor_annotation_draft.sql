-- Allow audio assessors to create a restricted, case-level annotation draft.
-- This migration does not change formal annotation fields, audio records,
-- writeback jobs, or the existing save_annotation_version() contract.

begin;

alter table public.annotation_versions
  add column if not exists client_request_id uuid;

create unique index if not exists annotation_versions_case_request_uidx
  on public.annotation_versions (case_id, client_request_id)
  where client_request_id is not null;

alter table public.annotation_versions
  drop constraint if exists annotation_versions_source_type_check;

alter table public.annotation_versions
  add constraint annotation_versions_source_type_check
  check (source_type in ('app', 'satellite', 'admin', 'audio_assessor'));

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

  if v_role = 'audio_assessor' and (
    lower(trim(coalesce(v_case.audio_claim_by, ''))) <> lower(trim(coalesce(p_actor_account, '')))
    or v_case.audio_claim_until is null
    or v_case.audio_claim_until <= now()
  ) then
    raise exception 'active audio claim required';
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

create or replace function public.save_audio_annotation_draft(
  p_case_id bigint,
  p_actor_account text,
  p_fields jsonb,
  p_source_audio_record_id integer,
  p_audio_claim_token uuid,
  p_confirmed_unambiguous boolean,
  p_base_version_no integer,
  p_client_request_id uuid
)
returns public.annotation_versions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  v_case public.annotation_cases;
  v_current public.annotation_versions;
  v_existing public.annotation_versions;
  v_version public.annotation_versions;
  v_latest_assessment public.audio_assessments;
  v_allowed text[];
  v_key text;
  v_json_value jsonb;
  v_value text;
  v_merged jsonb;
  v_changed_fields text[] := array[]::text[];
  v_nonempty_count integer := 0;
  v_next_version_no integer;
begin
  if v_role not in ('admin', 'audio_assessor') then
    raise exception 'audio annotation draft permission required';
  end if;
  if p_case_id is null then
    raise exception 'case id is required';
  end if;
  if p_source_audio_record_id is null then
    raise exception 'source audio record is required';
  end if;
  if p_client_request_id is null then
    raise exception 'client request id is required';
  end if;
  if p_base_version_no is null or p_base_version_no < 0 then
    raise exception 'base version number is required';
  end if;
  if p_confirmed_unambiguous is not true then
    raise exception 'unambiguous audio confirmation is required';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'audio annotation fields must be a JSON object';
  end if;

  select *
  into v_case
  from public.annotation_cases
  where id = p_case_id
  for update;
  if not found then
    raise exception 'review case not found';
  end if;

  if v_role = 'audio_assessor' and (
    p_audio_claim_token is null
    or lower(trim(coalesce(v_case.audio_claim_by, ''))) <> lower(trim(coalesce(p_actor_account, '')))
    or v_case.audio_claim_token <> p_audio_claim_token
    or v_case.audio_claim_until is null
    or v_case.audio_claim_until <= now()
  ) then
    raise exception 'active audio claim token required';
  end if;

  if v_role = 'audio_assessor' and (
    v_case.state = '已完成'
    or (
      v_case.claim_by is not null
      and v_case.claim_until is not null
      and v_case.claim_until > now()
    )
  ) then
    raise exception 'case is locked by proofing or already completed';
  end if;

  select *
  into v_existing
  from public.annotation_versions
  where case_id = p_case_id
    and client_request_id = p_client_request_id
  limit 1;
  if found then
    return v_existing;
  end if;

  if p_base_version_no <> coalesce(v_case.current_version_no, 0) then
    raise exception 'stale annotation draft version';
  end if;

  if not exists (
    select 1
    from public.audio_records ar
    where ar.id = p_source_audio_record_id
      and ar.task_id = v_case.task_id
      and ar.language = v_case.language
      and ar.audio_file_id is not null
      and ar.unlinked_at is null
  ) then
    raise exception 'audio record not found or unlinked';
  end if;

  select *
  into v_latest_assessment
  from public.audio_assessments aa
  where aa.task_id = v_case.task_id
    and aa.language = v_case.language
    and aa.audio_record_id = p_source_audio_record_id
  order by aa.created_at desc, aa.id desc
  limit 1;
  if not found
     or v_latest_assessment.decision <> '可用'
     or coalesce(v_latest_assessment.needs_followup, false) then
    raise exception 'selected audio must be usable without follow-up';
  end if;

  v_allowed := case
    when v_case.language = '台語'
      then array['TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote']
    when v_case.language = '客語'
      then array['Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote']
    else null
  end;
  if v_allowed is null then
    raise exception 'unsupported annotation language';
  end if;

  for v_key, v_json_value in
    select key, value
    from jsonb_each(p_fields)
  loop
    if not (v_key = any(v_allowed)) then
      raise exception 'unknown annotation field: %', v_key;
    end if;
    if jsonb_typeof(v_json_value) not in ('string', 'null') then
      raise exception 'annotation field must be text: %', v_key;
    end if;
    v_value := case
      when jsonb_typeof(v_json_value) = 'string' then trim(v_json_value #>> '{}')
      else ''
    end;
    if v_value <> '' then
      v_nonempty_count := v_nonempty_count + 1;
      v_changed_fields := array_append(v_changed_fields, v_key);
    end if;
  end loop;

  if v_nonempty_count = 0 then
    raise exception 'at least one annotation field is required';
  end if;

  select *
  into v_current
  from public.annotation_versions
  where case_id = p_case_id
    and version_no = coalesce(v_case.current_version_no, 0)
  limit 1;
  v_merged := coalesce(v_current.fields, '{}'::jsonb);

  for v_key, v_json_value in
    select key, value
    from jsonb_each(p_fields)
  loop
    v_value := case
      when jsonb_typeof(v_json_value) = 'string' then trim(v_json_value #>> '{}')
      else ''
    end;
    if v_value <> '' then
      v_merged := jsonb_set(v_merged, array[v_key], to_jsonb(v_value), true);
    end if;
  end loop;

  select coalesce(max(version_no), 0) + 1
  into v_next_version_no
  from public.annotation_versions
  where case_id = p_case_id;

  insert into public.annotation_versions(
    case_id,
    version_no,
    version_kind,
    fields,
    created_by,
    source_type,
    source_actor,
    source_stamp,
    client_request_id
  ) values (
    p_case_id,
    v_next_version_no,
    'draft',
    v_merged,
    p_actor_account,
    'audio_assessor',
    p_actor_account,
    coalesce(v_case.source_stamp, ''),
    p_client_request_id
  )
  returning *
  into v_version;

  update public.annotation_cases
  set current_version_no = v_next_version_no,
      updated_at = now()
  where id = p_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id,
    'audio_annotation_draft',
    p_actor_account,
    jsonb_build_object(
      'source_audio_record_id', p_source_audio_record_id,
      'version_id', v_version.id,
      'version_no', v_version.version_no,
      'base_version_no', p_base_version_no,
      'client_request_id', p_client_request_id,
      'changed_fields', to_jsonb(v_changed_fields),
      'confirmed_unambiguous', true
    )
  );

  return v_version;
end;
$function$;

revoke all on function public.get_review_workflow_audio_sources(bigint, text)
  from public, anon, authenticated;
grant execute on function public.get_review_workflow_audio_sources(bigint, text)
  to anon, authenticated;

revoke all on function public.save_audio_annotation_draft(
  bigint, text, jsonb, integer, uuid, boolean, integer, uuid
) from public, anon, authenticated;
grant execute on function public.save_audio_annotation_draft(
  bigint, text, jsonb, integer, uuid, boolean, integer, uuid
) to anon, authenticated;

commit;
