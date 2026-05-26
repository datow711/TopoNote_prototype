begin;

create table if not exists public.test_places (
  uuid text primary key,
  source text,
  type text,
  county text,
  town text,
  village text,
  hak_area boolean default false,
  longitude numeric,
  latitude numeric,
  place_name text not null,
  info text,
  taihan text,
  tl1 text,
  tl2 text,
  tl3 text,
  tai_note text,
  tai_class text,
  hak_class text,
  t_state text default '待指派',
  t_annotator text,
  t_created_at text,
  t_updated_at text,
  honzii text,
  hp1 text,
  hp2 text,
  hp3 text,
  h_dialect text,
  hak_note text,
  h_state text default '待指派',
  h_annotator text,
  h_created_at text,
  h_updated_at text,
  batch_id text,
  sync_warning text,
  synced_at timestamp with time zone not null default now()
);

alter table public.test_places enable row level security;

insert into public.test_places (
  uuid, source, type, county, town, village, place_name, info, t_state, h_state, batch_id, synced_at
)
values
  ('TEST0001', 'test_places', '測試', '測試', '測試', '測試', '石崁頭', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0002', 'test_places', '測試', '測試', '測試', '測試', '牛寮坑', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0003', 'test_places', '測試', '測試', '測試', '測試', '刺竹坪', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0004', 'test_places', '測試', '測試', '測試', '測試', '後茄苳', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0005', 'test_places', '測試', '測試', '測試', '測試', '七甲寮', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0006', 'test_places', '測試', '測試', '測試', '測試', '水流崙', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0007', 'test_places', '測試', '測試', '測試', '測試', '大潭底', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0008', 'test_places', '測試', '測試', '測試', '測試', '楓樹崎', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0009', 'test_places', '測試', '測試', '測試', '測試', '瓦厝埕', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now()),
  ('TEST0010', 'test_places', '測試', '測試', '測試', '測試', '砂崙尾', '測試指派與審查用虛構地名', '待指派', '待指派', 'manual-test-2026-05-26', now())
on conflict (uuid) do update set
  source = excluded.source,
  type = excluded.type,
  county = excluded.county,
  town = excluded.town,
  village = excluded.village,
  place_name = excluded.place_name,
  info = excluded.info,
  t_state = excluded.t_state,
  h_state = excluded.h_state,
  batch_id = excluded.batch_id,
  synced_at = now();

insert into public.final_tasks (source_id, source_table, assigned_to, priority, status, is_active)
select uuid, 'test_places', null, 0, 'pending', true
from public.test_places
where uuid like 'TEST%'
on conflict (source_id, source_table) do update set
  is_active = true,
  status = 'pending',
  priority = 0;

create or replace view public.app_tasks_view as
with assignment_summary as (
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
), source_places as (
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
    p.h_state
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
    p.h_state
  from public.test_places p
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
  end as recording_status
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
  recording_status
from public.app_tasks_view
where coalesce(t_review_state, t_state, '待指派') <> '已完成標注'
   or coalesce(h_review_state, h_state, '待指派') <> '已完成標注';

commit;
