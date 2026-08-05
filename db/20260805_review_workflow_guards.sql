-- Strengthen MVP server-side validation and bind proofing writes to the
-- current temporary claim. This migration does not alter legacy tables.

begin;

create or replace function public.validate_annotation_draft_(
  p_language text,
  p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if jsonb_typeof(coalesce(p_fields, '{}'::jsonb)) <> 'object' then
    raise exception 'annotation draft must be a JSON object';
  end if;
  if p_language = U&'\53f0\8a9e' then
    if nullif(trim(coalesce(p_fields ->> 'TaiHan1', '')), '') is null
       or nullif(trim(coalesce(p_fields ->> 'TL1', '')), '') is null then
      raise exception 'Taiwanese draft requires TaiHan1 and TL1';
    end if;
  elsif p_language = U&'\5ba2\8a9e' then
    if nullif(trim(coalesce(p_fields ->> 'Honzii', '')), '') is null
       or nullif(trim(coalesce(p_fields ->> 'HP1', '')), '') is null then
      raise exception 'Hakka draft requires Honzii and HP1';
    end if;
  else
    raise exception 'unsupported language';
  end if;
end;
$function$;

create or replace function public.save_annotation_version(
  p_case_id bigint,
  p_actor_account text,
  p_fields jsonb
)
returns public.annotation_versions
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(trim(coalesce(public.workflow_actor_role_(p_actor_account), ''))) = 'proofreader' then
    raise exception 'proofreader claim token required';
  end if;
  return public.save_annotation_version(p_case_id, p_actor_account, p_fields, null::uuid);
end;
$function$;

create or replace function public.save_annotation_version(
  p_case_id bigint,
  p_actor_account text,
  p_fields jsonb,
  p_claim_token uuid
)
returns public.annotation_versions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  v_case public.annotation_cases;
  v_version public.annotation_versions;
  v_next integer;
begin
  if v_role not in ('admin', 'proofreader', 'user', 'annotator') then
    raise exception 'annotation permission required';
  end if;
  select * into v_case from public.annotation_cases where id = p_case_id;
  if not found then raise exception 'review case not found'; end if;
  perform public.validate_annotation_draft_(
    p_language := v_case.language,
    p_fields := coalesce(p_fields, '{}'::jsonb)
  );

  if v_role = 'proofreader' then
    if p_claim_token is null
       or v_case.claim_by <> p_actor_account
       or v_case.claim_token <> p_claim_token
       or v_case.claim_until is null
       or v_case.claim_until <= now() then
      raise exception 'active proofreader claim token required';
    end if;
  elsif v_role <> 'admin' and v_case.assigned_to <> p_actor_account then
    raise exception 'case assignment required';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next
  from public.annotation_versions where case_id = p_case_id;

  insert into public.annotation_versions(
    case_id, version_no, version_kind, fields, created_by,
    source_type, source_actor, source_stamp
  ) values (
    p_case_id, v_next, 'draft', coalesce(p_fields, '{}'::jsonb), p_actor_account,
    'app', p_actor_account, coalesce(v_case.source_stamp, '')
  ) returning * into v_version;

  update public.annotation_cases
  set current_version_no = v_next,
      state = case
        when v_role = 'proofreader' then U&'\6821\5c0d\4e2d'
        when state in (U&'\9304\97f3\4e2d', U&'\66f8\9762\6a19\6ce8\4e2d', 'legacy_unreviewed') then U&'\5f85\6821\5c0d'
        else state
      end,
      updated_at = now()
  where id = p_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id,
    'draft',
    p_actor_account,
    jsonb_build_object('version_id', v_version.id, 'version_no', v_version.version_no)
  );
  return v_version;
end;
$function$;

create or replace function public.release_review_case(
  p_case_id bigint,
  p_actor_account text
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(trim(coalesce(public.workflow_actor_role_(p_actor_account), ''))) <> 'admin' then
    raise exception 'claim token required for proofreader release';
  end if;
  return public.release_review_case(p_case_id, p_actor_account, null::uuid);
end;
$function$;

create or replace function public.release_review_case(
  p_case_id bigint,
  p_actor_account text,
  p_claim_token uuid
)
returns public.annotation_cases
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  v_case public.annotation_cases;
begin
  if v_role not in ('admin', 'proofreader') then
    raise exception 'proofreader permission required';
  end if;
  update public.annotation_cases
  set claim_by = null, claim_token = null, claim_until = null,
      state = case when current_version_no > 0 then U&'\5f85\6821\5c0d' else state end,
      updated_at = now()
  where id = p_case_id
    and (
      v_role = 'admin'
      or (claim_by = p_actor_account and claim_token = p_claim_token and claim_until > now())
    )
  returning * into v_case;
  if not found then raise exception 'case is not claimed by actor or token is stale'; end if;

  insert into public.proofing_events(case_id, action, actor_account)
  values (p_case_id, 'release', p_actor_account);
  return v_case;
end;
$function$;

create or replace function public.approve_review_case_core_(
  p_case_id bigint,
  p_actor_account text,
  p_claim_token uuid
)
returns public.writeback_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
  q record;
  v_job public.writeback_jobs;
  v_key text;
  v_stamp text;
begin
  if v_role not in ('admin', 'proofreader') then
    raise exception 'proofreader permission required';
  end if;
  select * into q from public.app_review_workflow_queue where case_id = p_case_id;
  if not found then raise exception 'review case not found'; end if;
  if v_role <> 'admin' and (
    q.claim_by <> p_actor_account
    or q.claim_token <> p_claim_token
    or q.claim_until is null
    or q.claim_until <= now()
  ) then
    raise exception 'active proofreader claim token required';
  end if;
  if q.version_id is null or q.version_kind = 'legacy' then
    raise exception 'proofing draft is required';
  end if;
  perform public.validate_annotation_draft_(q.language, q.annotation_fields);

  v_stamp := coalesce(q.current_sheet_stamp, '');
  v_key := q.case_id::text || ':' || q.current_version_no::text || ':' || coalesce(v_stamp, 'no-source-stamp');

  update public.annotation_cases
  set state = U&'\5df2\5b8c\6210', updated_at = now()
  where id = p_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (p_case_id, 'approve', p_actor_account, jsonb_build_object(
    'version_id', q.version_id, 'version_no', q.current_version_no
  ));

  insert into public.writeback_jobs(
    case_id, version_id, task_id, source_id, source_table, language,
    version_no, source_stamp, payload, idempotency_key
  ) values (
    q.case_id, q.version_id, q.task_id, q.source_id, q.source_table, q.language,
    q.current_version_no, v_stamp, q.annotation_fields, v_key
  ) on conflict (idempotency_key) do update set updated_at = now()
  returning * into v_job;
  return v_job;
end;
$function$;

create or replace function public.approve_review_case(
  p_case_id bigint,
  p_actor_account text
)
returns public.writeback_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(trim(coalesce(public.workflow_actor_role_(p_actor_account), ''))) <> 'admin' then
    raise exception 'claim token required for proofreader approval';
  end if;
  return public.approve_review_case_core_(p_case_id, p_actor_account, null::uuid);
end;
$function$;

create or replace function public.approve_review_case(
  p_case_id bigint,
  p_actor_account text,
  p_claim_token uuid
)
returns public.writeback_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.approve_review_case_core_(p_case_id, p_actor_account, p_claim_token);
end;
$function$;

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
  order by audio_record_id, created_at desc, id desc
), audio_summary as (
  select ar.task_id, ar.language,
    count(*) filter (where ar.unlinked_at is null) as audio_record_count,
    count(la.audio_record_id) as assessed_audio_count,
    count(*) filter (where la.decision = U&'\53ef\7528') as usable_audio_count,
    count(*) filter (where la.decision = U&'\4e0d\53ef\7528') as unusable_audio_count,
    count(*) filter (where la.decision = U&'\5f85\8ffd\554f') as follow_up_audio_count,
    count(distinct lower(trim(la.respondent_key))) filter (
      where la.decision = U&'\53ef\7528' and nullif(trim(la.respondent_key), '') is not null
    ) as distinct_respondent_count
  from public.audio_records ar
  left join latest_audio_assessments la on la.audio_record_id = ar.id
  where ar.audio_file_id is not null and ar.unlinked_at is null
  group by ar.task_id, ar.language
), audio_evidence as (
  select ar.task_id, ar.language,
    jsonb_agg(jsonb_build_object(
      'audio_record_id', ar.id, 'audio_file_id', ar.audio_file_id,
      'recorder_name', ar.recorder_name,
      'respondent_key', coalesce(nullif(ar.respondent_key, ''), case when ar.note ~ '^\s*\{' then ar.note::jsonb->>'respondentKey' else '' end, ''),
      'assessment_decision', coalesce(la.decision, U&'\672a\5be9\807d'),
      'assessment_reason', coalesce(la.reason, ''),
      'assessor_account', coalesce(la.assessor_account, ''), 'assessed_at', la.created_at
    ) order by ar.id) as evidence
  from public.audio_records ar
  left join latest_audio_assessments la on la.audio_record_id = ar.id
  where ar.audio_file_id is not null and ar.unlinked_at is null
  group by ar.task_id, ar.language
)
select c.id as case_id, c.task_id, ft.source_id, ft.source_table, c.language,
  src.place_name, src.type, src.county, src.town, src.village, src.info,
  case when c.language = U&'\53f0\8a9e' then src.tai_class else src.hak_class end as class_name,
  c.state, c.assigned_to, c.assigned_by, c.assigned_at, c.claim_by, c.claim_token, c.claim_until,
  c.current_version_no, lv.version_id, lv.version_kind, lv.fields as annotation_fields,
  lv.created_by as annotation_created_by, lv.created_at as annotation_created_at,
  c.source_stamp, c.legacy_unreviewed, c.updated_at as case_updated_at,
  coalesce(a.audio_record_count, 0)::integer as audio_record_count,
  coalesce(a.assessed_audio_count, 0)::integer as assessed_audio_count,
  coalesce(a.usable_audio_count, 0)::integer as usable_audio_count,
  coalesce(a.unusable_audio_count, 0)::integer as unusable_audio_count,
  coalesce(a.follow_up_audio_count, 0)::integer as follow_up_audio_count,
  coalesce(a.distinct_respondent_count, 0)::integer as distinct_respondent_count,
  (coalesce(a.distinct_respondent_count, 0) >= 2) as audio_gate_passed,
  case when coalesce(a.assessed_audio_count, 0) = 0 then U&'\672a\5be9\807d'
       when coalesce(a.follow_up_audio_count, 0) > 0 then U&'\5f85\8ffd\554f'
       else U&'\5df2\5224\5b9a' end as audio_review_state,
  coalesce(e.evidence, '[]'::jsonb) as audio_evidence,
  case when c.language = U&'\53f0\8a9e' then src.t_updated_at else src.h_updated_at end as current_sheet_stamp,
  lv.source_type as annotation_source_type, lv.source_actor as annotation_source_actor,
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
    if not (v_fields ? 'TaiHan1' and v_fields ? 'TL1') then
      raise exception 'satellite Taiwanese draft needs TaiHan1 and TL1';
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
    if not (v_fields ? 'Honzii' and v_fields ? 'HP1') then
      raise exception 'satellite Hakka draft needs Honzii and HP1';
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

revoke all on function public.validate_annotation_draft_(text, jsonb) from public, anon, authenticated;
revoke all on function public.approve_review_case_core_(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.save_annotation_version(bigint, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.release_review_case(bigint, text, uuid) to anon, authenticated;
grant execute on function public.approve_review_case(bigint, text, uuid) to anon, authenticated;

commit;
