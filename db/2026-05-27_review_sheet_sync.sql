create or replace function public.ensure_task_language_reviews(p_task_id integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.task_language_reviews (task_id, language, sheet_state, app_state)
  select ft.id, '台語', s.t_state, coalesce(s.t_state, '待指派')
  from public.final_tasks ft
  left join (
    select uuid, t_state, h_state from public.third_phase_places
    union all
    select uuid, t_state, h_state from public.test_places
  ) s on s.uuid = ft.source_id
  where ft.id = p_task_id
  on conflict (task_id, language) do nothing;

  insert into public.task_language_reviews (task_id, language, sheet_state, app_state)
  select ft.id, '客語', s.h_state, coalesce(s.h_state, '待指派')
  from public.final_tasks ft
  left join (
    select uuid, t_state, h_state from public.third_phase_places
    union all
    select uuid, t_state, h_state from public.test_places
  ) s on s.uuid = ft.source_id
  where ft.id = p_task_id
  on conflict (task_id, language) do nothing;
end;
$$;

create or replace view public.app_sheet_sync_queue as
with latest_records as (
  select ar.*,
         row_number() over (
           partition by ar.task_id, ar.language
           order by ar.created_at desc nulls last, ar.id desc
         ) as rn
  from public.audio_records ar
), source_rows as (
  select uuid, 'third_phase_places'::text as source_table, place_name, type, county, town, village, info,
         taihan, tl1, tl2, tl3, tai_note, tai_class, t_state, t_annotator,
         honzii, hp1, hp2, hp3, h_dialect, hak_note, hak_class, h_state, h_annotator
  from public.third_phase_places
  union all
  select uuid, 'test_places'::text as source_table, place_name, type, county, town, village, info,
         taihan, tl1, tl2, tl3, tai_note, tai_class, t_state, t_annotator,
         honzii, hp1, hp2, hp3, h_dialect, hak_note, hak_class, h_state, h_annotator
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
  tlr.reviewed_by,
  tlr.reviewed_at,
  lr.id as audio_record_id,
  lr.recorder_name,
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
  src.h_annotator
from public.task_language_reviews tlr
join public.final_tasks ft on ft.id = tlr.task_id
left join source_rows src on src.uuid = ft.source_id and src.source_table = ft.source_table
left join latest_records lr on lr.task_id = tlr.task_id and lr.language = tlr.language and lr.rn = 1
where tlr.needs_sheet_sync = true
  and tlr.app_state = '已完成標注';

create or replace function public.mark_reviews_sheet_synced(p_review_ids bigint[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  update public.task_language_reviews
  set needs_sheet_sync = false,
      last_synced_at = now(),
      updated_at = now()
  where id = any(p_review_ids)
    and needs_sheet_sync = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_reviews_sheet_synced(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_reviews_sheet_synced(bigint[]) to service_role;
grant select on public.app_sheet_sync_queue to service_role;
