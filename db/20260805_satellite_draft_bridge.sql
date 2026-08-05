-- Send satellite written-annotation results into the shared proofing version layer.
-- Formal annotation columns remain unchanged until approve_review_case creates a
-- versioned writeback job.
begin;

alter table public.annotation_versions
  add column if not exists source_type text;

alter table public.annotation_versions
  add column if not exists source_actor text;

alter table public.annotation_versions
  add column if not exists source_stamp text;

update public.annotation_versions
set source_type = 'app'
where source_type is null or trim(source_type) = '';

update public.annotation_versions
set source_stamp = ''
where source_stamp is null;

alter table public.annotation_versions
  alter column source_type set default 'app',
  alter column source_type set not null,
  alter column source_stamp set default '',
  alter column source_stamp set not null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.annotation_versions'::regclass
      and conname = 'annotation_versions_source_type_check'
  ) then
    alter table public.annotation_versions
      add constraint annotation_versions_source_type_check
      check (source_type in ('app', 'satellite', 'admin'));
  end if;
end
$constraint$;

create index if not exists annotation_versions_satellite_stamp_idx
  on public.annotation_versions (case_id, source_type, source_stamp)
  where source_type = 'satellite';

create or replace view public.app_review_workflow_queue as
with source_rows as (
  select uuid, 'third_phase_places'::text as source_table, place_name, type, county, town, village,
         info, tai_class, hak_class, t_updated_at, h_updated_at
  from public.third_phase_places
  union all
  select uuid, 'test_places'::text as source_table, place_name, type, county, town, village,
         info, tai_class, hak_class, t_updated_at, h_updated_at
  from public.test_places
), latest_versions as (
  select distinct on (case_id) case_id, id as version_id, version_no, version_kind, fields, created_by,
         source_type, source_actor, source_stamp, created_at
  from public.annotation_versions
  order by case_id, version_no desc
), latest_audio_assessments as (
  select distinct on (audio_record_id)
         audio_record_id, assessor_account, respondent_key, decision, reason, created_at
  from public.audio_assessments
  order by audio_record_id, assessor_account, created_at desc, id desc
), audio_summary as (
  select
    ar.task_id,
    ar.language,
    count(*) filter (where ar.unlinked_at is null) as audio_record_count,
    count(la.audio_record_id) as assessed_audio_count,
    count(*) filter (where la.decision = '可用') as usable_audio_count,
    count(*) filter (where la.decision = '不可用') as unusable_audio_count,
    count(*) filter (where la.decision = '待追問') as follow_up_audio_count,
    count(distinct lower(trim(la.respondent_key))) filter (where la.decision = '可用' and nullif(trim(la.respondent_key), '') is not null) as distinct_respondent_count
  from public.audio_records ar
  left join latest_audio_assessments la on la.audio_record_id = ar.id
  where ar.audio_file_id is not null and ar.unlinked_at is null
  group by ar.task_id, ar.language
), audio_evidence as (
  select
    ar.task_id,
    ar.language,
    jsonb_agg(jsonb_build_object(
      'audio_record_id', ar.id,
      'audio_file_id', ar.audio_file_id,
      'recorder_name', ar.recorder_name,
      'respondent_key', coalesce(nullif(ar.respondent_key, ''), case when ar.note ~ '^\s*\{' then ar.note::jsonb->>'respondentKey' else '' end, ''),
      'assessment_decision', coalesce(la.decision, '未審聽'),
      'assessment_reason', coalesce(la.reason, ''),
      'assessor_account', coalesce(la.assessor_account, ''),
      'assessed_at', la.created_at
    ) order by ar.id) as evidence
  from public.audio_records ar
  left join latest_audio_assessments la on la.audio_record_id = ar.id
  where ar.audio_file_id is not null and ar.unlinked_at is null
  group by ar.task_id, ar.language
)
select
  c.id as case_id,
  c.task_id,
  ft.source_id,
  ft.source_table,
  c.language,
  src.place_name,
  src.type,
  src.county,
  src.town,
  src.village,
  src.info,
  case when c.language = '台語' then src.tai_class else src.hak_class end as class_name,
  c.state,
  c.assigned_to,
  c.assigned_by,
  c.assigned_at,
  c.claim_by,
  c.claim_token,
  c.claim_until,
  c.current_version_no,
  lv.version_id,
  lv.version_kind,
  lv.fields as annotation_fields,
  lv.created_by as annotation_created_by,
  lv.created_at as annotation_created_at,
  c.source_stamp,
  c.legacy_unreviewed,
  c.updated_at as case_updated_at,
  coalesce(a.audio_record_count, 0)::integer as audio_record_count,
  coalesce(a.assessed_audio_count, 0)::integer as assessed_audio_count,
  coalesce(a.usable_audio_count, 0)::integer as usable_audio_count,
  coalesce(a.unusable_audio_count, 0)::integer as unusable_audio_count,
  coalesce(a.follow_up_audio_count, 0)::integer as follow_up_audio_count,
  coalesce(a.distinct_respondent_count, 0)::integer as distinct_respondent_count,
  (coalesce(a.distinct_respondent_count, 0) >= 2) as audio_gate_passed,
  case when coalesce(a.assessed_audio_count, 0) = 0 then '未審聽'
       when coalesce(a.follow_up_audio_count, 0) > 0 then '待追問'
       else '已判定' end as audio_review_state,
  coalesce(e.evidence, '[]'::jsonb) as audio_evidence,
  case when c.language = '台語' then src.t_updated_at else src.h_updated_at end as current_sheet_stamp,
  lv.source_type as annotation_source_type,
  lv.source_actor as annotation_source_actor,
  lv.source_stamp as annotation_source_stamp
from public.annotation_cases c
join public.final_tasks ft on ft.id = c.task_id
left join source_rows src on src.uuid = ft.source_id and src.source_table = ft.source_table
left join latest_versions lv on lv.case_id = c.id
left join audio_summary a on a.task_id = c.task_id and a.language = c.language
left join audio_evidence e on e.task_id = c.task_id and e.language = c.language;

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
