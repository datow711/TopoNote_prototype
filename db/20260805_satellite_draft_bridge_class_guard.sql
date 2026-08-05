-- Accept both the current Sheet value and the planned workflow name for written annotation.
begin;

create or replace function public.submit_satellite_annotation_draft(
  p_source_id text,
  p_source_table text,
  p_language text,
  p_fields jsonb,
  p_source_actor text default '',
  p_source_stamp text default ''
)
returns public.annotation_versions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_id text := nullif(trim(coalesce(p_source_id, '')), '');
  v_source_table text := nullif(trim(coalesce(p_source_table, '')), '');
  v_language text := nullif(trim(coalesce(p_language, '')), '');
  v_source_actor text := nullif(trim(coalesce(p_source_actor, '')), '');
  v_source_stamp text := nullif(trim(coalesce(p_source_stamp, '')), '');
  v_sheet_stamp text := '';
  v_source_class text := '';
  v_task_id integer;
  v_case_id bigint;
  v_current_version integer;
  v_fields jsonb;
  v_existing public.annotation_versions;
  v_version public.annotation_versions;
begin
  if v_source_id is null then raise exception 'source id is required'; end if;
  if v_source_table not in ('third_phase_places', 'test_places') then
    raise exception 'unsupported satellite source table';
  end if;
  if v_language not in ('台語', '客語') then
    raise exception 'unsupported satellite language';
  end if;
  if v_source_stamp is null then
    raise exception 'source stamp is required for idempotent satellite pull';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'satellite fields must be a JSON object';
  end if;

  if v_source_table = 'third_phase_places' then
    if v_language = '台語' then
      select coalesce(t_updated_at, ''), coalesce(tai_class, '') into v_sheet_stamp, v_source_class
      from public.third_phase_places where uuid = v_source_id;
    else
      select coalesce(h_updated_at, ''), coalesce(hak_class, '') into v_sheet_stamp, v_source_class
      from public.third_phase_places where uuid = v_source_id;
    end if;
  else
    if v_language = '台語' then
      select coalesce(t_updated_at, ''), coalesce(tai_class, '') into v_sheet_stamp, v_source_class
      from public.test_places where uuid = v_source_id;
    else
      select coalesce(h_updated_at, ''), coalesce(hak_class, '') into v_sheet_stamp, v_source_class
      from public.test_places where uuid = v_source_id;
    end if;
  end if;
  if not found then raise exception 'satellite source row not found'; end if;
  if trim(coalesce(v_source_class, '')) not in ('書面標注', '直接標注') then
    raise exception 'satellite source row is not a written annotation class';
  end if;

  if v_language = '台語' then
    v_fields := jsonb_strip_nulls(jsonb_build_object(
      'TaiHan1', nullif(trim(coalesce(p_fields->>'TaiHan1', '')), ''),
      'TL1', nullif(trim(coalesce(p_fields->>'TL1', '')), ''),
      'TL2', nullif(trim(coalesce(p_fields->>'TL2', '')), ''),
      'TL3', nullif(trim(coalesce(p_fields->>'TL3', '')), ''),
      'TaiNote', nullif(trim(coalesce(p_fields->>'TaiNote', '')), '')
    ));
    if not (v_fields ? 'TaiHan1' or v_fields ? 'TL1') then
      raise exception 'satellite Taiwanese draft needs TaiHan1 or TL1';
    end if;
  else
    v_fields := jsonb_strip_nulls(jsonb_build_object(
      'Honzii', nullif(trim(coalesce(p_fields->>'Honzii', '')), ''),
      'HP1', nullif(trim(coalesce(p_fields->>'HP1', '')), ''),
      'HP2', nullif(trim(coalesce(p_fields->>'HP2', '')), ''),
      'HP3', nullif(trim(coalesce(p_fields->>'HP3', '')), ''),
      'HDialect', nullif(trim(coalesce(p_fields->>'HDialect', '')), ''),
      'HakNote', nullif(trim(coalesce(p_fields->>'HakNote', '')), '')
    ));
    if not (v_fields ? 'Honzii' or v_fields ? 'HP1') then
      raise exception 'satellite Hakka draft needs Honzii or HP1';
    end if;
  end if;

  select id into v_task_id
  from public.final_tasks
  where source_id = v_source_id and source_table = v_source_table
  order by id
  limit 1;
  if v_task_id is null then raise exception 'satellite source task is not synced'; end if;

  select id, current_version_no into v_case_id, v_current_version
  from public.annotation_cases
  where task_id = v_task_id and language = v_language
  for update;

  if v_case_id is null then
    insert into public.annotation_cases (
      task_id, language, state, source_stamp, legacy_unreviewed
    ) values (
      v_task_id, v_language, '待校對', v_sheet_stamp, false
    ) returning id, current_version_no into v_case_id, v_current_version;
  end if;

  select * into v_existing
  from public.annotation_versions
  where case_id = v_case_id
    and source_type = 'satellite'
    and source_stamp = v_source_stamp
  order by version_no desc
  limit 1;
  if found then return v_existing; end if;

  insert into public.annotation_versions (
    case_id, version_no, version_kind, fields, created_by,
    source_type, source_actor, source_stamp
  ) values (
    v_case_id, coalesce(v_current_version, 0) + 1, 'draft', v_fields,
    coalesce(v_source_actor, 'satellite'), 'satellite', v_source_actor, v_source_stamp
  ) returning * into v_version;

  update public.annotation_cases
  set current_version_no = v_version.version_no,
      state = '待校對',
      legacy_unreviewed = false,
      claim_by = null,
      claim_token = null,
      claim_until = null,
      updated_at = now()
  where id = v_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    v_case_id,
    'satellite_draft_submitted',
    coalesce(v_source_actor, 'satellite'),
    jsonb_build_object(
      'source_id', v_source_id,
      'source_table', v_source_table,
      'language', v_language,
      'source_stamp', v_source_stamp,
      'sheet_stamp', v_sheet_stamp,
      'version_id', v_version.id
    )
  );

  return v_version;
end;
$function$;


revoke execute on function public.submit_satellite_annotation_draft(text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_satellite_annotation_draft(text, text, text, jsonb, text, text)
  to service_role;

commit;