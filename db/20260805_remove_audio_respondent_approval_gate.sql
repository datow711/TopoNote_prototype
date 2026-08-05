-- Keep respondent statistics for audit, but do not make two respondents an approval gate.
begin;

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

commit;
