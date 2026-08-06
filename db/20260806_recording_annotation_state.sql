-- Make 錄音標注中 reachable in the forward flow, and fix the returned-case dead end.
--
-- Background (docs/review-workflow-implementation-gap.md, decision D-004):
--   * 錄音標注中 previously existed only as a target of return_review_case().
--     Nothing in the forward flow ever wrote it, so a recording case stayed in
--     錄音中 from assignment all the way to 待校對.
--   * save_annotation_version() only advanced to 待校對 from
--     (錄音中, 書面標注中, legacy_unreviewed). A recording case returned by a
--     proofreader landed in 錄音標注中 and could never re-enter the proofing
--     queue, because saving a new draft left the state untouched.
--
-- This migration does not add 待審聽 or 退回助理處理; per D-004 those stay out
-- of the state machine and their detail is surfaced in the APP instead.

begin;

-- 1. Forward transition: once every active audio record for the case has at
--    least one assessment, the case moves 錄音中 -> 錄音標注中.
--    Deliberately independent of decision values: 待追問 and 不可用 are
--    surfaced through app_review_workflow_queue.audio_review_state and must
--    not widen the main state (goal.md 6.1, data-model-detail 三).
create or replace function public.sync_recording_annotation_state_(p_case_id bigint)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_case public.annotation_cases;
  v_total integer;
  v_assessed integer;
begin
  select * into v_case from public.annotation_cases where id = p_case_id;
  if not found then return null; end if;

  -- Only the plain recording state is advanced automatically. Cases already in
  -- 待校對/校對中/已完成 must not be dragged backwards by a late re-assessment.
  if v_case.state <> U&'\9304\97f3\4e2d' then
    return v_case.state;
  end if;

  select
    count(*),
    count(*) filter (
      where exists (
        select 1 from public.audio_assessments aa
        where aa.audio_record_id = ar.id
          and aa.task_id = v_case.task_id
          and aa.language = v_case.language
      )
    )
  into v_total, v_assessed
  from public.audio_records ar
  where ar.task_id = v_case.task_id
    and ar.language = v_case.language
    and ar.audio_file_id is not null
    and ar.unlinked_at is null;

  if coalesce(v_total, 0) = 0 or coalesce(v_assessed, 0) < v_total then
    return v_case.state;
  end if;

  update public.annotation_cases
  set state = U&'\9304\97f3\6a19\6ce8\4e2d',
      updated_at = now()
  where id = p_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id,
    'state_recomputed',
    'system',
    jsonb_build_object(
      'from', U&'\9304\97f3\4e2d',
      'to', U&'\9304\97f3\6a19\6ce8\4e2d',
      'audio_record_count', v_total,
      'assessed_audio_count', v_assessed
    )
  );
  return U&'\9304\97f3\6a19\6ce8\4e2d';
end;
$function$;

revoke all on function public.sync_recording_annotation_state_(bigint) from public, anon, authenticated;

-- 2. Call it at the end of submit_audio_assessment(). Body is otherwise
--    identical to 20260805_audio_review_claims.sql.
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

  perform public.sync_recording_annotation_state_(v_case.id);
  return v_assessment;
end;
$function$;

-- 3. Let 錄音標注中 advance to 待校對. Without this a case returned by
--    return_review_case() (which writes 錄音標注中) is stranded: saving a new
--    draft leaves the state unchanged and the case never re-enters the queue.
--
--    Only the four-argument overload carries the implementation. The
--    three-argument overload is a wrapper that rejects proofreaders and
--    delegates here (20260805_review_workflow_guards.sql); it is deliberately
--    left untouched. Body is otherwise identical to that migration.
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
          U&'\9304\97f3\4e2d',
          U&'\9304\97f3\6a19\6ce8\4e2d',
          U&'\66f8\9762\6a19\6ce8\4e2d',
          'legacy_unreviewed'
        ) then U&'\5f85\6821\5c0d'
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

grant execute on function public.save_annotation_version(bigint, text, jsonb, uuid) to anon, authenticated;
revoke all on function public.submit_audio_assessment(integer, text, integer, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_audio_assessment(integer, text, integer, text, text, text, jsonb, uuid) to anon, authenticated;

commit;
