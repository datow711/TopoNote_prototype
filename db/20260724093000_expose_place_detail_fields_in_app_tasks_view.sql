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
    p.hak_class,
    p.name_history,
    p.location
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
    p.hak_class,
    null::text as name_history,
    null::text as location
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
  where ar.unlinked_at is null
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
  coalesce(ac.record_count, 0::bigint) as record_count,
  coalesce(ac.tai_audio_count, 0::bigint) as tai_audio_count,
  coalesce(ac.hak_audio_count, 0::bigint) as hak_audio_count,
  case
    when coalesce(ac.tai_audio_count, 0::bigint) >= 2 and coalesce(ac.hak_audio_count, 0::bigint) >= 2 then '全部完成'::text
    when coalesce(ac.tai_audio_count, 0::bigint) >= 2 then '台語完成'::text
    when coalesce(ac.hak_audio_count, 0::bigint) >= 2 then '客語完成'::text
    else '未錄音'::text
  end as recording_status,
  p.tai_class,
  p.hak_class,
  p.name_history,
  p.location
from public.final_tasks ft
join source_places p on ft.source_table = p.source_table and ft.source_id = p.source_id
left join language_assignment_summary la on ft.id = la.task_id
left join legacy_assignment_summary las on ft.id = las.task_id
left join audio_counts ac on ft.id = ac.task_id
where ft.is_active = true;

grant select on public.app_tasks_view to anon, authenticated, service_role;