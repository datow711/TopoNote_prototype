begin;

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
     or v_latest_assessment.decision <> '可用' then
    raise exception 'selected audio must be usable';
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

commit;
