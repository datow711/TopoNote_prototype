alter table public.audio_records
  add column if not exists unlinked_at timestamptz,
  add column if not exists unlinked_by text,
  add column if not exists unlink_reason text;

create index if not exists audio_records_active_task_language_idx
on public.audio_records (task_id, language)
where unlinked_at is null;

create or replace function public.soft_unlink_audio_record(
  p_audio_record_id integer,
  p_actor_account text,
  p_reason text default null
)
returns table (
  record_id integer,
  task_id integer,
  language text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task_id integer;
  v_language text;
  v_has_active_records boolean;
begin
  if nullif(trim(coalesce(p_actor_account, '')), '') is null then
    raise exception 'actor account is required';
  end if;

  if not exists (
    select 1
    from public.investigators i
    where lower(trim(coalesce(i.account, ''))) = lower(trim(p_actor_account))
      and i.role = 'admin'
      and i.is_active = true
  ) then
    raise exception 'admin permission required';
  end if;

  update public.audio_records ar
  set unlinked_at = now(),
      unlinked_by = p_actor_account,
      unlink_reason = nullif(trim(coalesce(p_reason, '')), '')
  where ar.id = p_audio_record_id
    and ar.unlinked_at is null
  returning ar.task_id, ar.language
  into v_task_id, v_language;

  if not found then
    raise exception 'active audio record not found';
  end if;

  select exists (
    select 1
    from public.audio_records ar
    where ar.task_id = v_task_id
      and ar.language = v_language
      and ar.unlinked_at is null
  )
  into v_has_active_records;

  if not v_has_active_records then
    update public.task_language_reviews tlr
    set app_state = case
          when nullif(trim(coalesce(tlr.assigned_to, '')), '') is null then '待指派'
          else '尚未標注'
        end,
        reviewed_by = null,
        reviewed_at = null,
        updated_at = now()
    where tlr.task_id = v_task_id
      and tlr.language = v_language
      and tlr.app_state = '待審查';
  end if;

  return query
  select p_audio_record_id, v_task_id, v_language;
end;
$function$;

revoke all on function public.soft_unlink_audio_record(integer, text, text) from public;
revoke all on function public.soft_unlink_audio_record(integer, text, text) from anon;
revoke all on function public.soft_unlink_audio_record(integer, text, text) from authenticated;
grant execute on function public.soft_unlink_audio_record(integer, text, text) to service_role;

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
  p.hak_class
from public.final_tasks ft
join source_places p on ft.source_table = p.source_table and ft.source_id = p.source_id
left join language_assignment_summary la on ft.id = la.task_id
left join legacy_assignment_summary las on ft.id = las.task_id
left join audio_counts ac on ft.id = ac.task_id
where ft.is_active = true;

grant select on public.app_tasks_view to anon, authenticated, service_role;

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

grant select on public.app_review_queue_view to anon, authenticated, service_role;

create or replace view public.app_sheet_sync_queue as
with latest_records as (
  select
    ar.*,
    row_number() over (
      partition by ar.task_id, ar.language
      order by ar.created_at desc nulls last, ar.id desc
    ) as rn
  from public.audio_records ar
  where ar.unlinked_at is null
), source_rows as (
  select
    uuid,
    'third_phase_places'::text as source_table,
    place_name,
    type,
    county,
    town,
    village,
    info,
    taihan,
    tl1,
    tl2,
    tl3,
    tai_note,
    tai_class,
    t_state,
    t_annotator,
    t_updated_at,
    honzii,
    hp1,
    hp2,
    hp3,
    h_dialect,
    hak_note,
    hak_class,
    h_state,
    h_annotator,
    h_updated_at,
    sync_warning
  from public.third_phase_places
  union all
  select
    uuid,
    'test_places'::text as source_table,
    place_name,
    type,
    county,
    town,
    village,
    info,
    taihan,
    tl1,
    tl2,
    tl3,
    tai_note,
    tai_class,
    t_state,
    t_annotator,
    t_updated_at,
    honzii,
    hp1,
    hp2,
    hp3,
    h_dialect,
    hak_note,
    hak_class,
    h_state,
    h_annotator,
    h_updated_at,
    sync_warning
  from public.test_places
)
select
  tlr.id as review_id,
  tlr.task_id,
  ft.source_id,
  ft.source_table,
  src.place_name,
  src.type,
  src.county,
  src.town,
  src.village,
  src.info,
  tlr.language,
  tlr.app_state,
  tlr.final_fields,
  tlr.reviewed_by,
  tlr.reviewed_at,
  lr.id as audio_record_id,
  coalesce(nullif(trim(rec_user.name), ''), lr.recorder_name) as recorder_name,
  lr.audio_file_id,
  lr.phonetic_reading,
  lr.note as audio_note,
  src.taihan,
  src.tl1,
  src.tl2,
  src.tl3,
  src.tai_note,
  src.tai_class,
  src.t_state,
  src.t_annotator,
  src.honzii,
  src.hp1,
  src.hp2,
  src.hp3,
  src.h_dialect,
  src.hak_note,
  src.hak_class,
  src.h_state,
  src.h_annotator,
  src.t_updated_at,
  src.h_updated_at,
  src.sync_warning
from public.task_language_reviews tlr
join public.final_tasks ft on ft.id = tlr.task_id
left join source_rows src on src.uuid = ft.source_id and src.source_table = ft.source_table
left join latest_records lr on lr.task_id = tlr.task_id and lr.language = tlr.language and lr.rn = 1
left join public.investigators rec_user
  on lower(trim(coalesce(lr.recorder_name, ''))) in (
    lower(trim(coalesce(rec_user.account, ''))),
    lower(trim(coalesce(rec_user.email, ''))),
    lower(trim(coalesce(rec_user.user_name, ''))),
    lower(trim(coalesce(rec_user.name, '')))
  )
where tlr.needs_sheet_sync = true;

grant select on public.app_sheet_sync_queue to service_role;
