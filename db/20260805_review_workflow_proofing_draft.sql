create or replace function public.save_annotation_version(
  p_case_id bigint, p_actor_account text, p_fields jsonb
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
  if not exists (
    select 1
    from jsonb_each_text(coalesce(p_fields, '{}'::jsonb))
    where nullif(trim(value), '') is not null
  ) then
    raise exception 'annotation draft is required';
  end if;

  select * into v_case
  from public.annotation_cases
  where id = p_case_id;
  if not found then raise exception 'review case not found'; end if;

  if v_role = 'proofreader' then
    if v_case.claim_by <> p_actor_account or v_case.claim_until is null or v_case.claim_until <= now() then
      raise exception 'active proofreader claim required';
    end if;
  elsif v_role <> 'admin' and v_case.assigned_to <> p_actor_account then
    raise exception 'case assignment required';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next
  from public.annotation_versions
  where case_id = p_case_id;

  insert into public.annotation_versions(case_id, version_no, version_kind, fields, created_by)
  values (p_case_id, v_next, 'draft', coalesce(p_fields, '{}'::jsonb), p_actor_account)
  returning * into v_version;

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

create or replace function public.get_review_workflow_audio_sources(
  p_case_id bigint, p_actor_account text
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
  if v_role not in ('admin', 'proofreader') then
    raise exception 'proofreader permission required';
  end if;

  select * into v_case
  from public.annotation_cases
  where id = p_case_id;
  if not found then raise exception 'review case not found'; end if;

  if v_role <> 'admin' and (
    v_case.assigned_to <> p_actor_account
    and v_case.claim_by <> p_actor_account
  ) then
    raise exception 'case assignment required';
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

create or replace function public.approve_review_case(
  p_case_id bigint, p_actor_account text
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

  select * into q
  from public.app_review_workflow_queue
  where case_id = p_case_id;
  if not found then raise exception 'review case not found'; end if;

  if v_role <> 'admin' and (
    q.claim_by <> p_actor_account
    or q.claim_until is null
    or q.claim_until <= now()
  ) then
    raise exception 'active proofreader claim required';
  end if;

  if q.version_id is null
    or q.version_kind = 'legacy'
    or coalesce(q.annotation_fields, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'proofing draft is required';
  end if;
  if not q.audio_gate_passed then
    raise exception 'two different respondents with usable audio are required';
  end if;

  v_stamp := coalesce(q.current_sheet_stamp, '');
  v_key := q.case_id::text || ':' || q.current_version_no::text || ':' ||
    coalesce(v_stamp, 'no-source-stamp');

  update public.annotation_cases
  set state = U&'\5df2\5b8c\6210',
      updated_at = now()
  where id = p_case_id;

  insert into public.proofing_events(case_id, action, actor_account, payload)
  values (
    p_case_id,
    'approve',
    p_actor_account,
    jsonb_build_object(
      'version_id', q.version_id,
      'version_no', q.current_version_no,
      'audio_gate_passed', q.audio_gate_passed
    )
  );

  insert into public.writeback_jobs(
    case_id, version_id, task_id, source_id, source_table, language,
    version_no, source_stamp, payload, idempotency_key
  ) values (
    q.case_id, q.version_id, q.task_id, q.source_id, q.source_table, q.language,
    q.current_version_no, v_stamp, q.annotation_fields, v_key
  )
  on conflict (idempotency_key) do update set updated_at = now()
  returning * into v_job;

  return v_job;
end;
$function$;

grant execute on function public.get_review_workflow_audio_sources(bigint, text)
  to anon, authenticated;
