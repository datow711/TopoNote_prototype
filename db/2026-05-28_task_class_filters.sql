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
), assignment_summary as (
  select
    ta.task_id,
    array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active) as assigned_users,
    (array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active))[1] as primary_assignee
  from public.task_assignments ta
  group by ta.task_id
), audio_counts as (
  select
    ar.task_id,
    count(*) as record_count,
    count(*) filter (where ar.language like '%台%') as tai_audio_count,
    count(*) filter (where ar.language like '%客%') as hak_audio_count
  from public.audio_records ar
  group by ar.task_id
), review_summary as (
  select
    task_language_reviews.task_id,
    max(task_language_reviews.app_state) filter (where task_language_reviews.language = '台語') as t_review_state,
    max(task_language_reviews.app_state) filter (where task_language_reviews.language = '客語') as h_review_state
  from public.task_language_reviews
  group by task_language_reviews.task_id
)
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  coalesce(asg.primary_assignee, ft.assigned_to) as assigned_to,
  coalesce(
    asg.assigned_users,
    case when ft.assigned_to is null then array[]::text[] else array[ft.assigned_to] end
  ) as assigned_users,
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
  rs.t_review_state,
  rs.h_review_state,
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
  p.hak_class
from public.final_tasks ft
join source_places p on ft.source_table = p.source_table and ft.source_id = p.source_id
left join assignment_summary asg on ft.id = asg.task_id
left join audio_counts ac on ft.id = ac.task_id
left join review_summary rs on ft.id = rs.task_id
where ft.is_active = true;

create or replace view public.app_review_queue_view as
select
  task_id,
  source_id,
  source_table,
  assigned_to,
  assigned_users,
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
