-- Audio review card save: keep assessment, draft, note and follow-up flag atomic.
-- This migration is intentionally not applied to the live project in this task.

begin;

-- The compact card only records one of the three decisions. Keep legacy
-- metadata when callers provide it, but do not make the removed per-audio
-- reason fields mandatory anymore.
create or replace function public.submit_audio_assessment(
  p_task_id integer,
  p_language text,
  p_audio_record_id integer,
  p_assessor_account text,
  p_respondent_key text,
  p_decision text,
  p_metadata jsonb,
  p_claim_token uuid
)
returns public.audio_assessments
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_assessor_account);
  v_case public.annotation_cases;
  v_assessment public.audio_assessments;
  v_reason text;
  v_unusable_reason_code text;
  v_unusable_reason_text text;
  v_needs_followup boolean;
  v_followup_reason_text text;
begin
  if v_role not in ('admin', 'audio_assessor') then
    raise exception 'audio assessment permission required';
  end if;
  if p_language not in (U&'\53f0\8a9e', U&'\5ba2\8a9e') then
    raise exception 'unsupported language';
  end if;
  if p_decision not in (U&'\53ef\7528', U&'\4e0d\53ef\7528', U&'\5f85\8ffd\554f') then
    raise exception 'unsupported audio decision';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'audio assessment metadata must be a JSON object';
  end if;

  select * into v_case
  from public.annotation_cases
  where task_id = p_task_id and language = p_language
  for update;
  if not found then raise exception 'review case not found'; end if;

  if v_role <> 'admin' and (
    p_claim_token is null
    or v_case.audio_claim_by <> p_assessor_account
    or v_case.audio_claim_token <> p_claim_token
    or v_case.audio_claim_until is null
    or v_case.audio_claim_until <= now()
  ) then
    raise exception 'active audio claim token required';
  end if;

  if not exists (
    select 1
    from public.audio_records ar
    where ar.id = p_audio_record_id
      and ar.task_id = p_task_id
      and ar.language = p_language
      and ar.audio_file_id is not null
      and ar.unlinked_at is null
  ) then
    raise exception 'audio record not found or unlinked';
  end if;

  v_reason := coalesce(p_metadata ->> 'reason', '');
  v_unusable_reason_code := nullif(trim(coalesce(p_metadata ->> 'unusable_reason_code', '')), '');
  v_unusable_reason_text := coalesce(p_metadata ->> 'unusable_reason_text', '');
  v_needs_followup := p_decision = U&'\5f85\8ffd\554f';
  v_followup_reason_text := coalesce(nullif(trim(coalesce(p_metadata ->> 'followup_reason_text', '')), ''), coalesce(p_metadata ->> 'reason', ''));

  if p_decision = U&'\4e0d\53ef\7528' then
    if v_unusable_reason_code not in (U&'\7121\8072', U&'\807d\4e0d\6e05\695a', U&'\5176\4ed6') then
      v_unusable_reason_code := null;
      v_unusable_reason_text := '';
    elsif v_unusable_reason_code <> U&'\5176\4ed6' then
      v_unusable_reason_text := '';
    end if;
  else
    v_unusable_reason_code := null;
    v_unusable_reason_text := '';
  end if;

  if not v_needs_followup then
    v_followup_reason_text := '';
  end if;

  insert into public.audio_assessments(
    task_id, language, audio_record_id, assessor_account, respondent_key,
    decision, reason, unusable_reason_code, unusable_reason_text,
    needs_followup, followup_reason_text
  ) values (
    p_task_id, p_language, p_audio_record_id, p_assessor_account,
    nullif(trim(coalesce(p_respondent_key, '')), ''), p_decision, v_reason,
    v_unusable_reason_code, v_unusable_reason_text,
    v_needs_followup, v_followup_reason_text
  ) returning * into v_assessment;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    v_case.id,
    'audio_assessment',
    p_assessor_account,
    jsonb_build_object(
      'audio_record_id', p_audio_record_id,
      'decision', p_decision,
      'needs_followup', v_needs_followup
    )
  );

  perform public.sync_recording_annotation_state_(v_case.id);
  return v_assessment;
end;
$function$;
alter table public.annotation_cases
  add column if not exists audio_review_note text not null default '',
  add column if not exists needs_followup_review boolean not null default false;

-- Keep legacy bridge functions that still write 待校對 compatible while the
-- persisted workflow state is renamed to 待檢查.
create or replace function public.normalize_annotation_case_state_()
returns trigger
language plpgsql
as $function$
begin
  if new.state = U&'\5f85\6821\5c0d' then
    new.state := U&'\5f85\6aa2\67e5';
  end if;
  return new;
end;
$function$;

drop trigger if exists normalize_annotation_case_state on public.annotation_cases;
create trigger normalize_annotation_case_state
before insert or update of state on public.annotation_cases
for each row execute function public.normalize_annotation_case_state_();

update public.annotation_cases
set state = U&'\5f85\6aa2\67e5', updated_at = now()
where state = U&'\5f85\6821\5c0d';

create table if not exists public.audio_review_card_requests (
  request_id uuid primary key,
  case_id bigint not null references public.annotation_cases(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

revoke all on table public.audio_review_card_requests from public, anon, authenticated;

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
         audio_record_id, assessor_account, respondent_key, decision, reason, needs_followup,
         followup_reason_text, unusable_reason_code, unusable_reason_text, created_at
  from public.audio_assessments
  order by audio_record_id, created_at desc, id desc
), audio_summary as (
  select ar.task_id, ar.language,
    count(*) filter (where ar.unlinked_at is null) as audio_record_count,
    count(la.audio_record_id) as assessed_audio_count,
    count(*) filter (where la.decision = U&'\53ef\7528') as usable_audio_count,
    count(*) filter (where la.decision = U&'\4e0d\53ef\7528') as unusable_audio_count,
    count(*) filter (where coalesce(la.needs_followup, la.decision = U&'\5f85\8ffd\554f', false)) as follow_up_audio_count,
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
      'unusable_reason_code', coalesce(la.unusable_reason_code, ''),
      'unusable_reason_text', coalesce(la.unusable_reason_text, ''),
      'needs_followup', coalesce(la.needs_followup, la.decision = U&'\5f85\8ffd\554f', false),
      'followup_reason_text', coalesce(la.followup_reason_text, ''),
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
  lv.source_stamp as annotation_source_stamp,
  c.audio_review_note, c.needs_followup_review
from public.annotation_cases c
join public.final_tasks ft on ft.id = c.task_id
left join source_rows src on src.uuid = ft.source_id and src.source_table = ft.source_table
left join latest_versions lv on lv.case_id = c.id
left join audio_summary a on a.task_id = c.task_id and a.language = c.language
left join audio_evidence e on e.task_id = c.task_id and e.language = c.language;

-- Keep proofing writes aligned with the renamed persisted state.
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
        when state in (
          U&'\9304\97f3\4e2d', U&'\9304\97f3\6a19\6ce8\4e2d',
          U&'\66f8\9762\6a19\6ce8\4e2d', 'legacy_unreviewed'
        ) then U&'\5f85\6aa2\67e5'
        else state
      end,
      updated_at = now()
  where id = p_case_id;
  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id, 'draft', p_actor_account,
    jsonb_build_object('version_id', v_version.id, 'version_no', v_version.version_no)
  );
  return v_version;
end;
$function$;

-- Relax the old source gate: source text is a convenience for less typing, not
-- proof that the audio was judged usable. The caller still needs an active
-- audio claim and the source must belong to this case.
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
  v_allowed text[];
  v_key text;
  v_json_value jsonb;
  v_value text;
  v_merged jsonb;
  v_changed_fields text[] := array[]::text[];
  v_nonempty_count integer := 0;
  v_next_version_no integer;
begin
  if v_role not in ('admin', 'audio_assessor') then raise exception 'audio annotation draft permission required'; end if;
  if p_case_id is null then raise exception 'case id is required'; end if;
  if p_source_audio_record_id is null then raise exception 'source audio record is required'; end if;
  if p_client_request_id is null then raise exception 'client request id is required'; end if;
  if p_base_version_no is null or p_base_version_no < 0 then raise exception 'base version number is required'; end if;
  if p_confirmed_unambiguous is not true then raise exception 'unambiguous audio confirmation is required'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'audio annotation fields must be a JSON object'; end if;
  select * into v_case from public.annotation_cases where id = p_case_id for update;
  if not found then raise exception 'review case not found'; end if;
  if v_role = 'audio_assessor' and (
    p_audio_claim_token is null
    or lower(trim(coalesce(v_case.audio_claim_by, ''))) <> lower(trim(coalesce(p_actor_account, '')))
    or v_case.audio_claim_token <> p_audio_claim_token
    or v_case.audio_claim_until is null
    or v_case.audio_claim_until <= now()
  ) then raise exception 'active audio claim token required'; end if;
  if v_case.state = U&'\5df2\5b8c\6210'
     or (v_case.claim_by is not null and v_case.claim_until is not null and v_case.claim_until > now()) then
    raise exception 'case is locked by proofing or already completed';
  end if;
  select * into v_existing from public.annotation_versions
  where case_id = p_case_id and client_request_id = p_client_request_id limit 1;
  if found then return v_existing; end if;
  if p_base_version_no <> coalesce(v_case.current_version_no, 0) then raise exception 'stale annotation draft version'; end if;
  if not exists (
    select 1 from public.audio_records ar
    where ar.id = p_source_audio_record_id and ar.task_id = v_case.task_id
      and ar.language = v_case.language and ar.audio_file_id is not null and ar.unlinked_at is null
  ) then raise exception 'audio record not found or unlinked'; end if;
  v_allowed := case when v_case.language = U&'\53f0\8a9e'
    then array['TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote']
    when v_case.language = U&'\5ba2\8a9e'
    then array['Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote']
    else null end;
  if v_allowed is null then raise exception 'unsupported annotation language'; end if;
  for v_key, v_json_value in select key, value from jsonb_each(p_fields) loop
    if not (v_key = any(v_allowed)) then raise exception 'unknown annotation field: %', v_key; end if;
    if jsonb_typeof(v_json_value) not in ('string', 'null') then raise exception 'annotation field must be text: %', v_key; end if;
    v_value := case when jsonb_typeof(v_json_value) = 'string' then trim(v_json_value #>> '{}') else '' end;
    if v_value <> '' then
      v_nonempty_count := v_nonempty_count + 1;
      v_changed_fields := array_append(v_changed_fields, v_key);
    end if;
  end loop;
  if v_nonempty_count = 0 then raise exception 'at least one annotation field is required'; end if;
  select * into v_current from public.annotation_versions
  where case_id = p_case_id and version_no = coalesce(v_case.current_version_no, 0) limit 1;
  v_merged := coalesce(v_current.fields, '{}'::jsonb);
  for v_key, v_json_value in select key, value from jsonb_each(p_fields) loop
    v_value := case when jsonb_typeof(v_json_value) = 'string' then trim(v_json_value #>> '{}') else '' end;
    if v_value <> '' then v_merged := jsonb_set(v_merged, array[v_key], to_jsonb(v_value), true); end if;
  end loop;
  select coalesce(max(version_no), 0) + 1 into v_next_version_no
  from public.annotation_versions where case_id = p_case_id;
  insert into public.annotation_versions(
    case_id, version_no, version_kind, fields, created_by, source_type,
    source_actor, source_stamp, client_request_id
  ) values (
    p_case_id, v_next_version_no, 'draft', v_merged, p_actor_account,
    'audio_assessor', p_actor_account, coalesce(v_case.source_stamp, ''), p_client_request_id
  ) returning * into v_version;
  update public.annotation_cases
  set current_version_no = v_next_version_no,
      state = U&'\5f85\6aa2\67e5',
      updated_at = now()
  where id = p_case_id;
  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id, 'audio_annotation_draft', p_actor_account,
    jsonb_build_object(
      'source_audio_record_id', p_source_audio_record_id,
      'version_id', v_version.id, 'version_no', v_version.version_no,
      'base_version_no', p_base_version_no, 'client_request_id', p_client_request_id,
      'changed_fields', to_jsonb(v_changed_fields), 'confirmed_unambiguous', true
    )
  );
  return v_version;
end;
$function$;

create or replace function private.save_audio_review_card_authenticated(
  p_case_id bigint,
  p_audio_assessments jsonb,
  p_fields jsonb,
  p_source_audio_record_id integer,
  p_confirmed_unambiguous boolean,
  p_base_version_no integer,
  p_client_request_id uuid,
  p_audio_review_note text,
  p_needs_followup_review boolean,
  p_audio_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public, private'
as $function$
declare
  v_user record;
  v_case public.annotation_cases;
  v_existing_case_id bigint;
  v_existing_result jsonb;
  v_version public.annotation_versions;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_assessments jsonb := coalesce(p_audio_assessments, '[]'::jsonb);
  v_assessment jsonb;
  v_decision text;
  v_audio_record_id integer;
  v_metadata jsonb;
  v_saved_assessments integer := 0;
  v_has_fields boolean := false;
  v_needs_followup boolean;
  v_result jsonb;
begin
  select * into v_user from private.get_authenticated_investigator();
  if not found then raise exception 'authenticated investigator required'; end if;
  if v_user.role not in ('admin', 'audio_assessor') then raise exception 'audio review permission required'; end if;
  if p_case_id is null or p_client_request_id is null then raise exception 'case id and client request id are required'; end if;
  if jsonb_typeof(v_assessments) <> 'array' then raise exception 'audio assessments must be a JSON array'; end if;
  if jsonb_typeof(v_fields) <> 'object' then raise exception 'annotation fields must be a JSON object'; end if;
  select result, case_id into v_existing_result, v_existing_case_id
  from public.audio_review_card_requests where request_id = p_client_request_id;
  if found then
    if v_existing_case_id <> p_case_id then raise exception 'client request id belongs to another case'; end if;
    return v_existing_result;
  end if;
  select * into v_case from public.annotation_cases where id = p_case_id for update;
  if not found then raise exception 'review case not found'; end if;
  if v_case.state = U&'\5df2\5b8c\6210'
     or (v_case.claim_by is not null and v_case.claim_until is not null and v_case.claim_until > now()) then
    raise exception 'case is locked by proofing or already completed';
  end if;
  if v_user.role = 'audio_assessor' and (
    p_audio_claim_token is null
    or lower(trim(coalesce(v_case.audio_claim_by, ''))) <> lower(trim(coalesce(v_user.account, '')))
    or v_case.audio_claim_token <> p_audio_claim_token
    or v_case.audio_claim_until is null
    or v_case.audio_claim_until <= now()
  ) then raise exception 'active audio claim token required'; end if;

  select exists(
    select 1 from jsonb_each_text(v_fields) where trim(value) <> ''
  ) into v_has_fields;
  if v_has_fields then
    if p_source_audio_record_id is null then raise exception 'source audio record is required'; end if;
    if p_confirmed_unambiguous is not true then raise exception 'unambiguous audio confirmation is required'; end if;
    select * into v_version from public.save_audio_annotation_draft(
      p_case_id, v_user.account, v_fields, p_source_audio_record_id,
      p_audio_claim_token, p_confirmed_unambiguous,
      coalesce(p_base_version_no, v_case.current_version_no, 0), p_client_request_id
    );
  end if;

  for v_assessment in select value from jsonb_array_elements(v_assessments) loop
    v_audio_record_id := nullif(trim(coalesce(v_assessment->>'audio_record_id', '')), '')::integer;
    v_decision := nullif(trim(coalesce(v_assessment->>'decision', '')), '');
    if v_audio_record_id is null or v_decision is null then raise exception 'audio assessment needs record id and decision'; end if;
    v_metadata := coalesce(v_assessment->'metadata', '{}'::jsonb);
    if jsonb_typeof(v_metadata) <> 'object' then raise exception 'audio assessment metadata must be a JSON object'; end if;
    perform public.submit_audio_assessment(
      v_case.task_id, v_case.language, v_audio_record_id, v_user.account, '',
      v_decision, v_metadata, p_audio_claim_token
    );
    v_saved_assessments := v_saved_assessments + 1;
  end loop;

  select count(*) < 2 into v_needs_followup
  from (
    select distinct on (aa.audio_record_id) aa.audio_record_id, aa.decision
    from public.audio_assessments aa
    join public.audio_records ar on ar.id = aa.audio_record_id
    where aa.task_id = v_case.task_id and aa.language = v_case.language
      and ar.audio_file_id is not null and ar.unlinked_at is null
    order by aa.audio_record_id, aa.created_at desc, aa.id desc
  ) latest
  where latest.decision = U&'\53ef\7528';
  v_needs_followup := coalesce(p_needs_followup_review, false) or coalesce(v_needs_followup, true);

  update public.annotation_cases
  set audio_review_note = trim(coalesce(p_audio_review_note, '')),
      needs_followup_review = v_needs_followup,
      state = U&'\5f85\6aa2\67e5',
      updated_at = now()
  where id = p_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id, 'audio_review_card_save', v_user.account,
    jsonb_build_object(
      'client_request_id', p_client_request_id,
      'saved_assessment_count', v_saved_assessments,
      'source_audio_record_id', p_source_audio_record_id,
      'needs_followup_review', v_needs_followup,
      'audio_review_note', trim(coalesce(p_audio_review_note, ''))
    )
  );

  select jsonb_build_object(
    'case_id', c.id,
    'state', c.state,
    'current_version_no', c.current_version_no,
    'version_no', coalesce(v_version.version_no, c.current_version_no),
    'fields', coalesce((select av.fields from public.annotation_versions av where av.case_id = c.id and av.version_no = c.current_version_no), '{}'::jsonb),
    'audio_review_note', c.audio_review_note,
    'needs_followup_review', c.needs_followup_review,
    'saved_assessment_count', v_saved_assessments
  ) into v_result
  from public.annotation_cases c where c.id = p_case_id;
  insert into public.audio_review_card_requests(request_id, case_id, result)
  values (p_client_request_id, p_case_id, v_result);
  return v_result;
end;
$function$;

revoke all on function private.save_audio_review_card_authenticated(
  bigint, jsonb, jsonb, integer, boolean, integer, uuid, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function private.save_audio_review_card_authenticated(
  bigint, jsonb, jsonb, integer, boolean, integer, uuid, text, boolean, uuid
) to authenticated;

create or replace function public.save_audio_review_card_authenticated(
  p_case_id bigint,
  p_audio_assessments jsonb,
  p_fields jsonb,
  p_source_audio_record_id integer,
  p_confirmed_unambiguous boolean,
  p_base_version_no integer,
  p_client_request_id uuid,
  p_audio_review_note text,
  p_needs_followup_review boolean,
  p_audio_claim_token uuid
)
returns jsonb
language sql
security invoker
set search_path to 'public, private'
as $function$
  select private.save_audio_review_card_authenticated(
    p_case_id, p_audio_assessments, p_fields, p_source_audio_record_id,
    p_confirmed_unambiguous, p_base_version_no, p_client_request_id,
    p_audio_review_note, p_needs_followup_review, p_audio_claim_token
  );
$function$;

revoke all on function public.save_audio_review_card_authenticated(
  bigint, jsonb, jsonb, integer, boolean, integer, uuid, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.save_audio_review_card_authenticated(
  bigint, jsonb, jsonb, integer, boolean, integer, uuid, text, boolean, uuid
) to authenticated;

commit;
