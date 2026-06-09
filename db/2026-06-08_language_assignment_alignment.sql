alter table public.task_language_reviews
  add column if not exists assigned_to text,
  add column if not exists assigned_by text,
  add column if not exists assigned_at timestamptz;

update public.task_language_reviews tlr
set assigned_to = nullif(trim(src.annotator), ''),
    assigned_at = coalesce(tlr.assigned_at, now())
from public.final_tasks ft
join (
  select uuid, 'third_phase_places'::text as source_table, t_annotator as annotator, '台語'::text as language
  from public.third_phase_places
  union all
  select uuid, 'third_phase_places'::text as source_table, h_annotator as annotator, '客語'::text as language
  from public.third_phase_places
  union all
  select uuid, 'test_places'::text as source_table, t_annotator as annotator, '台語'::text as language
  from public.test_places
  union all
  select uuid, 'test_places'::text as source_table, h_annotator as annotator, '客語'::text as language
  from public.test_places
) src on src.uuid = ft.source_id
     and src.source_table = ft.source_table
where tlr.task_id = ft.id
  and src.language = tlr.language
  and tlr.assigned_to is null
  and nullif(trim(src.annotator), '') is not null;

create or replace function public.ensure_task_language_reviews(p_task_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.task_language_reviews (task_id, language, sheet_state, app_state, assigned_to, assigned_at)
  select ft.id, '台語', s.t_state, coalesce(s.t_state, '待指派'), nullif(trim(s.t_annotator), ''), now()
  from public.final_tasks ft
  left join (
    select uuid, 'third_phase_places'::text as source_table, t_state, h_state, t_annotator, h_annotator from public.third_phase_places
    union all
    select uuid, 'test_places'::text as source_table, t_state, h_state, t_annotator, h_annotator from public.test_places
  ) s on s.uuid = ft.source_id and s.source_table = ft.source_table
  where ft.id = p_task_id
  on conflict (task_id, language) do nothing;

  insert into public.task_language_reviews (task_id, language, sheet_state, app_state, assigned_to, assigned_at)
  select ft.id, '客語', s.h_state, coalesce(s.h_state, '待指派'), nullif(trim(s.h_annotator), ''), now()
  from public.final_tasks ft
  left join (
    select uuid, 'third_phase_places'::text as source_table, t_state, h_state, t_annotator, h_annotator from public.third_phase_places
    union all
    select uuid, 'test_places'::text as source_table, t_state, h_state, t_annotator, h_annotator from public.test_places
  ) s on s.uuid = ft.source_id and s.source_table = ft.source_table
  where ft.id = p_task_id
  on conflict (task_id, language) do nothing;
end;
$function$;

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

  foreach v_task_id in array p_task_ids loop
    perform public.ensure_task_language_reviews(v_task_id);

    select assigned_to
    into v_old_assignee
    from public.task_language_reviews
    where task_id = v_task_id
      and language = v_language;

    update public.task_language_reviews
    set assigned_to = p_user_name,
        assigned_by = p_assigned_by,
        assigned_at = now(),
        app_state = case
          when app_state in ('待指派', '') then '尚未標注'
          else app_state
        end,
        needs_sheet_sync = true,
        updated_at = now()
    where task_id = v_task_id
      and language = v_language;

    insert into public.task_assignments (task_id, investigator, assigned_by, is_active)
    values (v_task_id, p_user_name, p_assigned_by, true)
    on conflict (task_id, investigator) do update
      set is_active = true,
          assigned_by = coalesce(excluded.assigned_by, public.task_assignments.assigned_by),
          assigned_at = now();

    if v_old_assignee is not null and v_old_assignee <> p_user_name then
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
    set assigned_to = p_user_name
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
        needs_sheet_sync = true,
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

revoke all on function public.assign_task_language(integer[], text, text, text) from public;
revoke all on function public.unassign_task_language(integer[], text, text) from public;
grant execute on function public.assign_task_language(integer[], text, text, text) to anon, authenticated, service_role;
grant execute on function public.unassign_task_language(integer[], text, text) to anon, authenticated, service_role;

drop view if exists public.app_language_assignment_sheet_view;
drop view if exists public.app_review_queue_view;
drop view if exists public.app_tasks_view;

create or replace view public.app_tasks_view as
with source_places as (
  select
    p.uuid as source_id,
    'third_phase_places'::text as source_table,
    p.county,
    p.town,
    p.village,
    p.place_name,
    p.type,
    null::text as source_tag,
    p.hak_area,
    p.longitude,
    p.latitude,
    p.info,
    p.t_state,
    p.h_state,
    p.tai_class,
    p.hak_class
  from public.third_phase_places p
  union all
  select
    p.uuid as source_id,
    'test_places'::text as source_table,
    p.county,
    p.town,
    p.village,
    p.place_name,
    p.type,
    '測試'::text as source_tag,
    p.hak_area,
    p.longitude,
    p.latitude,
    p.info,
    p.t_state,
    p.h_state,
    p.tai_class,
    p.hak_class
  from public.test_places p
), legacy_assignment_summary as (
  select
    ta.task_id,
    array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active) as assigned_users,
    (array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active))[1] as primary_assignee
  from public.task_assignments ta
  group by ta.task_id
), language_assignment_summary as (
  select
    tlr.task_id,
    max(tlr.assigned_to) filter (where tlr.language = '台語') as t_assignee,
    max(tlr.assigned_to) filter (where tlr.language = '客語') as h_assignee,
    max(tlr.app_state) filter (where tlr.language = '台語') as t_review_state,
    max(tlr.app_state) filter (where tlr.language = '客語') as h_review_state,
    array_remove(array_agg(distinct tlr.assigned_to), null) as language_assigned_users
  from public.task_language_reviews tlr
  group by tlr.task_id
), audio_counts as (
  select
    ar.task_id,
    count(*) as record_count,
    count(*) filter (where ar.language like '%台%') as tai_audio_count,
    count(*) filter (where ar.language like '%客%') as hak_audio_count
  from public.audio_records ar
  group by ar.task_id
)
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  coalesce(la.t_assignee, la.h_assignee, las.primary_assignee, ft.assigned_to) as assigned_to,
  case
    when coalesce(array_length(la.language_assigned_users, 1), 0) > 0 then la.language_assigned_users
    else coalesce(las.assigned_users, case when ft.assigned_to is null then array[]::text[] else array[ft.assigned_to] end)
  end as assigned_users,
  la.t_assignee,
  la.h_assignee,
  ft.priority,
  ft.status,
  p.county,
  p.town,
  p.village,
  p.place_name,
  p.type,
  p.source_tag,
  p.hak_area,
  p.longitude,
  p.latitude,
  p.info,
  p.t_state,
  p.h_state,
  la.t_review_state,
  la.h_review_state,
  coalesce(ac.record_count, 0) as record_count,
  coalesce(ac.tai_audio_count, 0) as tai_audio_count,
  coalesce(ac.hak_audio_count, 0) as hak_audio_count,
  case
    when coalesce(ac.tai_audio_count, 0) >= 2 and coalesce(ac.hak_audio_count, 0) >= 2 then '全部完成'
    when coalesce(ac.tai_audio_count, 0) >= 2 then '台語完成'
    when coalesce(ac.hak_audio_count, 0) >= 2 then '客語完成'
    else '未錄音'
  end as recording_status,
  p.tai_class,
  p.hak_class
from public.final_tasks ft
join source_places p on ft.source_table = p.source_table and ft.source_id = p.source_id
left join language_assignment_summary la on ft.id = la.task_id
left join legacy_assignment_summary las on ft.id = las.task_id
left join audio_counts ac on ft.id = ac.task_id
where ft.is_active = true;

create or replace view public.app_review_queue_view as
select
  task_id,
  source_id,
  source_table,
  assigned_to,
  assigned_users,
  t_assignee,
  h_assignee,
  priority,
  status,
  county,
  town,
  village,
  place_name,
  type,
  source_tag,
  hak_area,
  longitude,
  latitude,
  info,
  t_state,
  h_state,
  t_review_state,
  h_review_state,
  record_count,
  tai_audio_count,
  hak_audio_count,
  recording_status,
  tai_class,
  hak_class
from public.app_tasks_view
where coalesce(t_review_state, t_state, '待指派') <> '已完成標注'
   or coalesce(h_review_state, h_state, '待指派') <> '已完成標注';

create or replace view public.app_language_assignment_sheet_view as
select
  task_id,
  source_id,
  source_table,
  coalesce(t_review_state, t_state, '待指派') as t_state,
  t_assignee as t_annotator,
  coalesce(h_review_state, h_state, '待指派') as h_state,
  h_assignee as h_annotator
from public.app_tasks_view
where source_table in ('third_phase_places', 'test_places');

grant select on public.app_tasks_view to anon, authenticated;
grant select on public.app_review_queue_view to anon, authenticated;
grant select on public.app_language_assignment_sheet_view to anon, authenticated, service_role;
