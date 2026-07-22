-- Simplify recorder-assignment Sheet writeback and temporarily disable APP review flows.
-- Review is intentionally disabled while the next review workflow is redesigned.

alter table public.task_language_reviews
  add column if not exists assignment_sheet_sync_pending boolean not null default false;

-- Preserve any old pending assignment rows, then clear the shared review/sheet flag so
-- review-state rows such as 待審查 no longer leak into assignment writeback.
update public.task_language_reviews
set assignment_sheet_sync_pending = true,
    updated_at = now()
where needs_sheet_sync = true
  and coalesce(app_state, '') in ('待指派', '尚未標注');

update public.task_language_reviews
set needs_sheet_sync = false,
    updated_at = now()
where needs_sheet_sync = true;

create or replace function public.assign_task_language(
  p_task_ids integer[],
  p_language text,
  p_user_name text,
  p_assigned_by text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task_id integer;
  v_language text;
  v_old_assignee text;
  v_assignee text;
  v_count integer := 0;
begin
  v_language := case
    when p_language in ('台語', 'tai', 'T') then '台語'
    when p_language in ('客語', 'hak', 'H') then '客語'
    else null
  end;

  if v_language is null then
    raise exception 'unsupported language: %', p_language;
  end if;

  if p_task_ids is null or array_length(p_task_ids, 1) is null then
    return 0;
  end if;

  if nullif(trim(coalesce(p_user_name, '')), '') is null then
    raise exception 'p_user_name is required';
  end if;

  select coalesce(nullif(trim(i.name), ''), nullif(trim(i.user_name), ''), nullif(trim(i.account), ''), trim(p_user_name))
    into v_assignee
  from public.investigators i
  where lower(trim(p_user_name)) in (
    lower(trim(coalesce(i.account, ''))),
    lower(trim(coalesce(i.email, ''))),
    lower(trim(coalesce(i.user_name, ''))),
    lower(trim(coalesce(i.name, '')))
  )
  order by case
    when lower(trim(p_user_name)) = lower(trim(coalesce(i.account, ''))) then 1
    when lower(trim(p_user_name)) = lower(trim(coalesce(i.email, ''))) then 2
    when lower(trim(p_user_name)) = lower(trim(coalesce(i.user_name, ''))) then 3
    when lower(trim(p_user_name)) = lower(trim(coalesce(i.name, ''))) then 4
    else 5
  end
  limit 1;

  v_assignee := coalesce(nullif(trim(v_assignee), ''), trim(p_user_name));

  foreach v_task_id in array p_task_ids loop
    perform public.ensure_task_language_reviews(v_task_id);

    select assigned_to
    into v_old_assignee
    from public.task_language_reviews
    where task_id = v_task_id
      and language = v_language;

    update public.task_language_reviews
    set assigned_to = v_assignee,
        assigned_by = p_assigned_by,
        assigned_at = now(),
        app_state = case
          when app_state in ('待指派', '') then '尚未標注'
          else app_state
        end,
        needs_sheet_sync = false,
        assignment_sheet_sync_pending = true,
        updated_at = now()
    where task_id = v_task_id
      and language = v_language;

    insert into public.task_assignments (task_id, investigator, assigned_by, is_active)
    values (v_task_id, v_assignee, p_assigned_by, true)
    on conflict (task_id, investigator) do update
      set is_active = true,
          assigned_by = coalesce(excluded.assigned_by, public.task_assignments.assigned_by),
          assigned_at = now();

    if v_old_assignee is not null and v_old_assignee <> v_assignee then
      update public.task_assignments ta
      set is_active = false
      where ta.task_id = v_task_id
        and ta.investigator = v_old_assignee
        and not exists (
          select 1
          from public.task_language_reviews tlr
          where tlr.task_id = v_task_id
            and tlr.assigned_to = v_old_assignee
        );
    end if;

    update public.final_tasks
    set assigned_to = v_assignee
    where id = v_task_id
      and assigned_to is null;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.unassign_task_language(
  p_task_ids integer[],
  p_language text,
  p_unassigned_by text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task_id integer;
  v_language text;
  v_old_assignee text;
  v_remaining text[];
  v_count integer := 0;
begin
  v_language := case
    when p_language in ('台語', 'tai', 'T') then '台語'
    when p_language in ('客語', 'hak', 'H') then '客語'
    else null
  end;

  if v_language is null then
    raise exception 'unsupported language: %', p_language;
  end if;

  if p_task_ids is null or array_length(p_task_ids, 1) is null then
    return 0;
  end if;

  foreach v_task_id in array p_task_ids loop
    perform public.ensure_task_language_reviews(v_task_id);

    select assigned_to
    into v_old_assignee
    from public.task_language_reviews
    where task_id = v_task_id
      and language = v_language;

    update public.task_language_reviews
    set assigned_to = null,
        assigned_by = p_unassigned_by,
        assigned_at = now(),
        app_state = case
          when app_state in ('尚未標注', '待指派', '') then '待指派'
          else app_state
        end,
        needs_sheet_sync = false,
        assignment_sheet_sync_pending = true,
        updated_at = now()
    where task_id = v_task_id
      and language = v_language
      and assigned_to is not null;

    if found then
      v_count := v_count + 1;
    end if;

    if v_old_assignee is not null then
      update public.task_assignments ta
      set is_active = false
      where ta.task_id = v_task_id
        and ta.investigator = v_old_assignee
        and not exists (
          select 1
          from public.task_language_reviews tlr
          where tlr.task_id = v_task_id
            and tlr.assigned_to = v_old_assignee
        );
    end if;

    select array_agg(distinct tlr.assigned_to) filter (where tlr.assigned_to is not null)
    into v_remaining
    from public.task_language_reviews tlr
    where tlr.task_id = v_task_id;

    update public.final_tasks
    set assigned_to = v_remaining[1]
    where id = v_task_id;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.mark_assignments_sheet_synced(p_review_ids bigint[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  update public.task_language_reviews
  set assignment_sheet_sync_pending = false,
      last_synced_at = now(),
      updated_at = now()
  where id = any(p_review_ids)
    and assignment_sheet_sync_pending = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.mark_audio_record_pending_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- APP review is disabled. Recording uploads should not create Sheet review work.
  return new;
end;
$function$;

create or replace function public.approve_task_language(
  p_task_id integer,
  p_language text,
  p_reviewed_by text,
  p_fields jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'APP review is temporarily disabled';
end;
$function$;

create or replace function public.revoke_task_language_review(
  p_task_id integer,
  p_language text,
  p_reviewed_by text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'APP review is temporarily disabled';
end;
$function$;

create or replace view public.app_review_queue_view as
select *
from public.app_tasks_view
where false;

create or replace view public.app_language_assignment_sheet_view as
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  case
    when t_review.assignment_sheet_sync_pending then
      case when nullif(trim(coalesce(t_review.assigned_to, '')), '') is null then '未指派錄音人' else '已指派錄音人' end
  end as t_state,
  case
    when t_review.assignment_sheet_sync_pending and nullif(trim(coalesce(t_review.assigned_to, '')), '') is not null then
      coalesce(nullif(trim(t_user.name), ''), t_review.assigned_to)
  end as t_annotator,
  case
    when h_review.assignment_sheet_sync_pending then
      case when nullif(trim(coalesce(h_review.assigned_to, '')), '') is null then '未指派錄音人' else '已指派錄音人' end
  end as h_state,
  case
    when h_review.assignment_sheet_sync_pending and nullif(trim(coalesce(h_review.assigned_to, '')), '') is not null then
      coalesce(nullif(trim(h_user.name), ''), h_review.assigned_to)
  end as h_annotator,
  t_review.id as t_review_id,
  h_review.id as h_review_id
from public.final_tasks ft
left join public.task_language_reviews t_review
  on t_review.task_id = ft.id
 and t_review.language = '台語'
left join public.investigators t_user
  on lower(trim(coalesce(t_review.assigned_to, ''))) in (
    lower(trim(coalesce(t_user.account, ''))),
    lower(trim(coalesce(t_user.email, ''))),
    lower(trim(coalesce(t_user.user_name, ''))),
    lower(trim(coalesce(t_user.name, '')))
  )
left join public.task_language_reviews h_review
  on h_review.task_id = ft.id
 and h_review.language = '客語'
left join public.investigators h_user
  on lower(trim(coalesce(h_review.assigned_to, ''))) in (
    lower(trim(coalesce(h_user.account, ''))),
    lower(trim(coalesce(h_user.email, ''))),
    lower(trim(coalesce(h_user.user_name, ''))),
    lower(trim(coalesce(h_user.name, '')))
  )
where ft.is_active = true
  and ft.source_table in ('third_phase_places', 'test_places')
  and (
    coalesce(t_review.assignment_sheet_sync_pending, false)
    or coalesce(h_review.assignment_sheet_sync_pending, false)
  );

revoke all on function public.mark_assignments_sheet_synced(bigint[]) from public;
grant execute on function public.mark_assignments_sheet_synced(bigint[]) to service_role;
grant execute on function public.assign_task_language(integer[], text, text, text) to anon, authenticated, service_role;
grant execute on function public.unassign_task_language(integer[], text, text) to anon, authenticated, service_role;
grant execute on function public.mark_audio_record_pending_review() to service_role;
grant execute on function public.approve_task_language(integer, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.revoke_task_language_review(integer, text, text) to anon, authenticated, service_role;
grant select on public.app_review_queue_view to anon, authenticated, service_role;
grant select on public.app_language_assignment_sheet_view to anon, authenticated, service_role;