-- Add an independent, case-level claim for the audio inspection workbench.
-- Proofreader claims remain on annotation_cases.claim_* and are not reused.

begin;

alter table public.annotation_cases
  add column if not exists audio_claim_by text,
  add column if not exists audio_claim_token uuid,
  add column if not exists audio_claim_until timestamptz;

alter table public.audio_assessments
  add column if not exists unusable_reason_code text,
  add column if not exists unusable_reason_text text not null default '',
  add column if not exists needs_followup boolean not null default false,
  add column if not exists followup_reason_text text not null default '';

alter table public.audio_assessments
  drop constraint if exists audio_assessments_unusable_reason_code_check;

alter table public.audio_assessments
  add constraint audio_assessments_unusable_reason_code_check
  check (unusable_reason_code is null or unusable_reason_code in (
    U&'\7121\8072', U&'\807d\4e0d\6e05\695a', U&'\5176\4ed6'
  ));

update public.audio_assessments
set needs_followup = true,
    followup_reason_text = case
      when nullif(trim(coalesce(followup_reason_text, '')), '') is not null then followup_reason_text
      else coalesce(reason, '')
    end
where decision = U&'\5f85\8ffd\554f';

create index if not exists annotation_cases_audio_claim_idx
  on public.annotation_cases (audio_claim_until, audio_claim_by);

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
         audio_record_id, assessor_account, respondent_key, decision, reason, needs_followup, followup_reason_text, unusable_reason_code, unusable_reason_text, created_at
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
  lv.source_stamp as annotation_source_stamp
from public.annotation_cases c
join public.final_tasks ft on ft.id = c.task_id
left join source_rows src on src.uuid = ft.source_id and src.source_table = ft.source_table
left join latest_versions lv on lv.case_id = c.id
left join audio_summary a on a.task_id = c.task_id and a.language = c.language
left join audio_evidence e on e.task_id = c.task_id and e.language = c.language;

-- Audio assessors see audio-bearing cases and can self-claim them. Proofreaders
-- retain the assigned-case queue and never enter this branch.
create or replace function public.get_review_workflow_queue(p_actor_account text)
returns setof public.app_review_workflow_queue
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
begin
  if v_role not in ('admin', 'proofreader', 'audio_assessor') then
    raise exception 'review workflow permission required';
  end if;

  return query
  select q.*
  from public.app_review_workflow_queue q
  where v_role = 'admin'
     or (v_role = 'proofreader' and (q.assigned_to = p_actor_account or q.claim_by = p_actor_account))
     or (v_role = 'audio_assessor' and q.audio_record_count > 0)
  order by q.case_updated_at desc nulls last, q.case_id;
end;
$function$;

create or replace function public.get_audio_review_claims(p_actor_account text)
returns table(
  case_id bigint,
  audio_claim_by text,
  audio_claim_token uuid,
  audio_claim_until timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.workflow_actor_role_(p_actor_account);
begin
  if v_role not in ('admin', 'audio_assessor') then
    raise exception 'audio inspection permission required';
  end if;

  return query
  select c.id,
    c.audio_claim_by,
    case when v_role = 'admin' or c.audio_claim_by = p_actor_account
      then c.audio_claim_token else null::uuid end,
    c.audio_claim_until
  from public.annotation_cases c
  where exists (
    select 1
    from public.audio_records ar
    where ar.task_id = c.task_id
      and ar.language = c.language
      and ar.audio_file_id is not null
      and ar.unlinked_at is null
  );
end;
$function$;

create or replace function public.claim_audio_review_case(
  p_case_id bigint,
  p_actor_account text
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
  if v_role not in ('admin', 'audio_assessor') then
    raise exception 'audio inspection permission required';
  end if;

  update public.annotation_cases c
  set audio_claim_by = p_actor_account,
      audio_claim_token = case
        when c.audio_claim_by = p_actor_account and c.audio_claim_token is not null
          then c.audio_claim_token
        else gen_random_uuid()
      end,
      audio_claim_until = now() + interval '30 minutes',
      updated_at = now()
  where c.id = p_case_id
    and exists (
      select 1
      from public.audio_records ar
      where ar.task_id = c.task_id
        and ar.language = c.language
        and ar.audio_file_id is not null
        and ar.unlinked_at is null
    )
    and (
      v_role = 'admin'
      or c.audio_claim_by = p_actor_account
      or c.audio_claim_until is null
      or c.audio_claim_until <= now()
    )
  returning c.* into v_case;

  if not found then
    raise exception 'audio case unavailable or already claimed';
  end if;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id,
    'audio_claim',
    p_actor_account,
    jsonb_build_object('claim_until', v_case.audio_claim_until)
  );
  return v_case;
end;
$function$;

create or replace function public.release_audio_review_case(
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
    raise exception 'audio claim token required for non-admin release';
  end if;
  return public.release_audio_review_case(p_case_id, p_actor_account, null::uuid);
end;
$function$;

create or replace function public.release_audio_review_case(
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
  if v_role not in ('admin', 'audio_assessor') then
    raise exception 'audio inspection permission required';
  end if;

  update public.annotation_cases c
  set audio_claim_by = null,
      audio_claim_token = null,
      audio_claim_until = null,
      updated_at = now()
  where c.id = p_case_id
    and (
      v_role = 'admin'
      or (
        c.audio_claim_by = p_actor_account
        and c.audio_claim_token = p_claim_token
        and c.audio_claim_until > now()
      )
    )
  returning c.* into v_case;

  if not found then
    raise exception 'audio case is not claimed by actor or token is stale';
  end if;

  insert into public.proofing_events(case_id, action, actor_account)
  values (p_case_id, 'audio_release', p_actor_account);
  return v_case;
end;
$function$;

-- Keep the old seven-argument endpoint for admin compatibility. Non-admin
-- callers must use the token-bound endpoint below.
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
begin
  if lower(trim(coalesce(public.workflow_actor_role_(p_assessor_account), ''))) <> 'admin' then
    raise exception 'active audio claim token required';
  end if;
  return public.submit_audio_assessment(
    p_task_id, p_language, p_audio_record_id, p_assessor_account,
    p_respondent_key, p_decision,
    jsonb_build_object('reason', coalesce(p_reason, '')),
    null::uuid
  );
end;
$function$;

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
  v_needs_followup := lower(coalesce(p_metadata ->> 'needs_followup', 'false')) in ('true', '1', 'yes');
  v_followup_reason_text := coalesce(p_metadata ->> 'followup_reason_text', '');

  if p_decision = U&'\4e0d\53ef\7528' then
    if v_unusable_reason_code not in (U&'\7121\8072', U&'\807d\4e0d\6e05\695a', U&'\5176\4ed6') then
      raise exception 'unusable reason code is required';
    end if;
    if v_unusable_reason_code = U&'\5176\4ed6'
       and nullif(trim(v_unusable_reason_text), '') is null then
      raise exception 'other unusable reason text is required';
    end if;
  else
    v_unusable_reason_code := null;
    v_unusable_reason_text := '';
  end if;

  if v_needs_followup and nullif(trim(v_followup_reason_text), '') is null then
    raise exception 'follow-up reason is required';
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
  return v_assessment;
end;
$function$;

revoke all on function public.get_audio_review_claims(text) from public, anon, authenticated;
revoke all on function public.claim_audio_review_case(bigint, text) from public, anon, authenticated;
revoke all on function public.release_audio_review_case(bigint, text) from public, anon, authenticated;
revoke all on function public.release_audio_review_case(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.get_audio_review_claims(text) to anon, authenticated;
grant execute on function public.claim_audio_review_case(bigint, text) to anon, authenticated;
grant execute on function public.release_audio_review_case(bigint, text, uuid) to anon, authenticated;
grant execute on function public.submit_audio_assessment(integer, text, integer, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_audio_assessment(integer, text, integer, text, text, text, jsonb, uuid) to anon, authenticated;

commit;
