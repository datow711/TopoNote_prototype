begin;

-- State vocabulary used by T_State/H_State and the APP projection.
-- The old annotation_cases values remain an internal compatibility layer for
-- existing RPCs; workflow_state_normalize_ is the only public vocabulary.
create or replace function public.workflow_state_normalize_(p_state text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when nullif(trim(coalesce(p_state, '')), '') is null then '待發稿'
    else case nullif(trim(coalesce(p_state, '')), '')
      when '待指派' then '待發稿'
      when '尚未標注' then '待發稿'
      when '書面標注中' then '標注中'
      when '錄音中' then '調查中'
      when '錄音標注中' then '待判讀'
      when '待校對' then '草稿待檢查'
      when '校對中' then '草稿'
      when '已完成標注' then '待審查'
      when '已完成' then '待審查'
      when 'legacy_unreviewed' then '草稿待檢查'
      else nullif(trim(coalesce(p_state, '')), '')
    end
  end;
$function$;

create or replace function public.workflow_is_written_class_(p_class text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select trim(coalesce(p_class, '')) in ('書面標注', '直接標注');
$function$;

create or replace function public.workflow_state_for_assignment_(
  p_task_id integer,
  p_language text,
  p_assigned_to text,
  p_proposed_state text
)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_state text := public.workflow_state_normalize_(p_proposed_state);
  v_class text;
begin
  if nullif(trim(coalesce(p_assigned_to, '')), '') is null then
    if v_state in ('待發稿', '標注中', '調查中') then
      return '待發稿';
    end if;
    return v_state;
  end if;

  if v_state not in ('待發稿', '標注中', '調查中') then
    return v_state;
  end if;

  select case when p_language = '台語' then src.tai_class else src.hak_class end
    into v_class
  from public.final_tasks ft
  left join lateral (
    select p.tai_class, p.hak_class
    from public.third_phase_places p
    where ft.source_table = 'third_phase_places' and p.uuid = ft.source_id
    union all
    select p.tai_class, p.hak_class
    from public.test_places p
    where ft.source_table = 'test_places' and p.uuid = ft.source_id
    limit 1
  ) src on true
  where ft.id = p_task_id;

  return case
    when public.workflow_is_written_class_(v_class) then '標注中'
    else '調查中'
  end;
end;
$function$;

create table if not exists public.language_state_sync_queue (
  id bigint generated always as identity primary key,
  task_id integer not null,
  language text not null check (language in ('台語', '客語')),
  source_id text not null,
  source_table text not null check (source_table in ('third_phase_places', 'test_places')),
  target_state text not null,
  expected_state text,
  expected_stamp text,
  reason text not null,
  actor_account text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retry', 'succeeded', 'conflict', 'superseded')),
  attempt_count integer not null default 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists language_state_sync_queue_one_active
  on public.language_state_sync_queue (task_id, language)
  where status in ('queued', 'processing', 'retry');

create index if not exists language_state_sync_queue_pending_idx
  on public.language_state_sync_queue (status, created_at, id);

alter table public.language_state_sync_queue enable row level security;
revoke all on table public.language_state_sync_queue from public, anon, authenticated;
grant select on table public.language_state_sync_queue to service_role;

create or replace function public.queue_language_state_sync_(
  p_task_id integer,
  p_language text,
  p_target_state text,
  p_reason text,
  p_actor_account text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target text := public.workflow_state_normalize_(p_target_state);
  v_source_id text;
  v_source_table text;
  v_expected_state text;
  v_expected_stamp text;
  v_id bigint;
begin
  if p_task_id is null or p_language not in ('台語', '客語') then
    return null;
  end if;
  if v_target is null then
    raise exception 'unsupported workflow state: %', p_target_state;
  end if;

  select source_id, source_table
    into v_source_id, v_source_table
  from public.final_tasks
  where id = p_task_id;
  if not found then return null; end if;

  if v_source_table = 'third_phase_places' then
    if p_language = '台語' then
      select t_state, t_updated_at into v_expected_state, v_expected_stamp
      from public.third_phase_places where uuid = v_source_id;
    else
      select h_state, h_updated_at into v_expected_state, v_expected_stamp
      from public.third_phase_places where uuid = v_source_id;
    end if;
  elsif v_source_table = 'test_places' then
    if p_language = '台語' then
      select t_state, t_updated_at into v_expected_state, v_expected_stamp
      from public.test_places where uuid = v_source_id;
    else
      select h_state, h_updated_at into v_expected_state, v_expected_stamp
      from public.test_places where uuid = v_source_id;
    end if;
  else
    return null;
  end if;

  update public.language_state_sync_queue
  set status = 'superseded', updated_at = now()
  where task_id = p_task_id
    and language = p_language
    and status in ('queued', 'processing', 'retry');

  insert into public.language_state_sync_queue(
    task_id, language, source_id, source_table, target_state,
    expected_state, expected_stamp, reason, actor_account
  ) values (
    p_task_id, p_language, v_source_id, v_source_table, v_target,
    nullif(trim(coalesce(v_expected_state, '')), ''),
    nullif(trim(coalesce(v_expected_stamp, '')), ''),
    coalesce(nullif(trim(p_reason), ''), 'workflow_state_transition'),
    nullif(trim(coalesce(p_actor_account, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.normalize_task_language_review_state_()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_state text := public.workflow_state_normalize_(new.app_state);
begin
  if tg_op = 'UPDATE'
     and old.assigned_to is not null
     and nullif(trim(coalesce(new.assigned_to, '')), '') is null
     and v_state in ('待發稿', '標注中', '調查中') then
    v_state := '待發稿';
  elsif nullif(trim(coalesce(new.assigned_to, '')), '') is not null
        and v_state in ('待發稿', '標注中', '調查中') then
    v_state := public.workflow_state_for_assignment_(
      new.task_id, new.language, new.assigned_to, v_state
    );
  end if;

  new.app_state := coalesce(v_state, '待發稿');
  return new;
end;
$function$;

create or replace function public.queue_task_language_review_state_()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    perform public.queue_language_state_sync_(
      new.task_id,
      new.language,
      new.app_state,
      'task_language_review_created',
      coalesce(new.assigned_by, 'system')
    );
  elsif new.app_state is distinct from old.app_state
        or new.assigned_to is distinct from old.assigned_to then
    perform public.queue_language_state_sync_(
      new.task_id,
      new.language,
      new.app_state,
      case when new.assigned_to is distinct from old.assigned_to
        then 'assignment_state_changed'
        else 'task_language_review_state_changed'
      end,
      coalesce(new.assigned_by, 'system')
    );
  end if;
  return new;
end;
$function$;

create or replace function public.project_annotation_case_state_()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target text;
begin
  if tg_op = 'INSERT' then
    v_target := public.workflow_state_normalize_(new.state);
  elsif new.state is distinct from old.state then
    v_target := public.workflow_state_normalize_(new.state);
  else
    return new;
  end if;
  perform public.ensure_task_language_reviews(new.task_id);
  update public.task_language_reviews
  set app_state = v_target,
      updated_at = now()
  where task_id = new.task_id and language = new.language;
  perform public.queue_language_state_sync_(
    new.task_id,
    new.language,
    v_target,
    'annotation_case_state_changed',
    'annotation_case'
  );
  return new;
end;
$function$;

drop trigger if exists trg_task_language_reviews_normalize_state on public.task_language_reviews;
create trigger trg_task_language_reviews_normalize_state
before insert or update of app_state, assigned_to on public.task_language_reviews
for each row execute function public.normalize_task_language_review_state_();

drop trigger if exists trg_task_language_reviews_state_queue on public.task_language_reviews;
create trigger trg_task_language_reviews_state_queue
after insert or update of app_state, assigned_to on public.task_language_reviews
for each row execute function public.queue_task_language_review_state_();

drop trigger if exists trg_annotation_cases_state_projection on public.annotation_cases;
create trigger trg_annotation_cases_state_projection
after insert or update of state on public.annotation_cases
for each row execute function public.project_annotation_case_state_();

-- Existing audio-record insert trigger was intentionally a no-op. From this
-- point on, a newly uploaded active recording moves only the APP projection
-- to 待判讀; formal Sheet writing still goes through the queue above.
create or replace function public.mark_audio_record_pending_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.task_id is not null and new.language in ('台語', '客語') then
    update public.task_language_reviews
    set app_state = '待判讀', updated_at = now()
    where task_id = new.task_id
      and language = new.language
      and app_state in ('調查中', '錄音中');
  end if;
  return new;
end;
$function$;

create or replace function public.claim_language_state_sync_job(p_job_id bigint)
returns public.language_state_sync_queue
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.language_state_sync_queue;
begin
  update public.language_state_sync_queue
  set status = 'processing', locked_at = now(),
      attempt_count = attempt_count + 1, updated_at = now()
  where id = p_job_id
    and (
      status in ('queued', 'retry')
      or (status = 'processing' and locked_at < now() - interval '20 minutes')
    )
  returning * into v_job;
  return v_job;
end;
$function$;

create or replace function public.complete_language_state_sync_job(
  p_job_id bigint,
  p_sheet_stamp text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.language_state_sync_queue;
begin
  update public.language_state_sync_queue
  set status = 'succeeded', completed_at = now(), updated_at = now(),
      locked_at = null, last_error = null
  where id = p_job_id and status = 'processing'
  returning * into v_job;
  if not found then return false; end if;

  update public.task_language_reviews
  set sheet_state = v_job.target_state,
      needs_sheet_sync = false,
      last_synced_at = now(),
      updated_at = now()
  where task_id = v_job.task_id and language = v_job.language;
  return true;
end;
$function$;

create or replace function public.fail_language_state_sync_job(
  p_job_id bigint,
  p_error text,
  p_conflict boolean default false
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.language_state_sync_queue
  set status = case when coalesce(p_conflict, false) then 'conflict' else 'retry' end,
      last_error = left(coalesce(p_error, 'state sync failed'), 2000),
      locked_at = null, updated_at = now()
  where id = p_job_id and status = 'processing';
  return found;
end;
$function$;

create or replace view public.app_language_state_sync_queue as
select *
from public.language_state_sync_queue
where status in ('queued', 'retry')
   or (status = 'processing' and locked_at < now() - interval '20 minutes');

revoke all on function public.workflow_state_normalize_(text) from public, anon, authenticated;
revoke all on function public.workflow_is_written_class_(text) from public, anon, authenticated;
revoke all on function public.workflow_state_for_assignment_(integer, text, text, text) from public, anon, authenticated;
revoke all on function public.queue_language_state_sync_(integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.normalize_task_language_review_state_() from public, anon, authenticated;
revoke all on function public.queue_task_language_review_state_() from public, anon, authenticated;
revoke all on function public.project_annotation_case_state_() from public, anon, authenticated;
revoke all on function public.mark_audio_record_pending_review() from public, anon, authenticated;
revoke all on function public.claim_language_state_sync_job(bigint) from public, anon, authenticated;
revoke all on function public.complete_language_state_sync_job(bigint, text) from public, anon, authenticated;
revoke all on function public.fail_language_state_sync_job(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_language_state_sync_job(bigint) to service_role;
grant execute on function public.complete_language_state_sync_job(bigint, text) to service_role;
grant execute on function public.fail_language_state_sync_job(bigint, text, boolean) to service_role;
revoke all on public.app_language_state_sync_queue from public, anon, authenticated;
grant select on public.app_language_state_sync_queue to service_role;

commit;
