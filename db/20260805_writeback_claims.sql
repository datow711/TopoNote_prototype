-- Make Places GAS writeback consumption atomic across concurrent workers.

begin;

create or replace function public.claim_review_writeback_job(p_job_id bigint)
returns public.writeback_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.writeback_jobs;
begin
  update public.writeback_jobs
  set status = 'processing',
      updated_at = now()
  where id = p_job_id
    and (
      status in ('queued', 'retry')
      or (status = 'processing' and updated_at < now() - interval '30 minutes')
    )
  returning * into v_job;

  if not found then return null; end if;
  return v_job;
end;
$function$;

create or replace function public.complete_review_writeback(
  p_job_id bigint,
  p_source_stamp text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.writeback_jobs
  set status = 'succeeded',
      completed_at = now(),
      updated_at = now(),
      last_error = ''
  where id = p_job_id
    and source_stamp = coalesce(p_source_stamp, '')
    and status = 'processing';
  return found;
end;
$function$;

create or replace function public.fail_review_writeback(
  p_job_id bigint,
  p_error_code text,
  p_error_message text,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_case_id bigint;
  v_attempts integer;
  v_status text;
begin
  select case_id, attempt_count, status
  into v_case_id, v_attempts, v_status
  from public.writeback_jobs
  where id = p_job_id
  for update;

  if not found or v_status <> 'processing' then return false; end if;

  update public.writeback_jobs
  set attempt_count = attempt_count + 1,
      status = case when attempt_count + 1 >= 5 then 'failed' else 'retry' end,
      last_error = coalesce(p_error_message, ''),
      updated_at = now()
  where id = p_job_id;

  insert into public.writeback_errors(job_id, case_id, error_code, error_message, details)
  values (
    p_job_id,
    v_case_id,
    coalesce(p_error_code, 'unknown'),
    coalesce(p_error_message, ''),
    coalesce(p_details, '{}'::jsonb)
  );
  return true;
end;
$function$;

revoke all on function public.claim_review_writeback_job(bigint) from public, anon, authenticated;
revoke all on function public.complete_review_writeback(bigint, text) from public, anon, authenticated;
revoke all on function public.fail_review_writeback(bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_review_writeback_job(bigint) to service_role;
grant execute on function public.complete_review_writeback(bigint, text) to service_role;
grant execute on function public.fail_review_writeback(bigint, text, text, jsonb) to service_role;

commit;