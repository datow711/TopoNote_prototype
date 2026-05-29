begin;

create or replace function public.delete_investigator_user(
  p_user_id uuid,
  p_actor_account text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account text;
  v_name text;
begin
  if not exists (
    select 1
    from public.investigators
    where account = p_actor_account
      and role = 'admin'
      and is_active = true
  ) then
    raise exception 'admin permission required';
  end if;

  select account, name
    into v_account, v_name
  from public.investigators
  where id = p_user_id
    and role <> 'admin';

  if v_account is null then
    raise exception 'target investigator not found';
  end if;

  update public.task_assignments
  set is_active = false
  where is_active = true
    and investigator in (v_account, v_name);

  delete from public.investigators
  where id = p_user_id
    and role <> 'admin';
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
  if not exists (
    select 1
    from public.investigators
    where account = p_reviewed_by
      and role = 'admin'
      and is_active = true
  ) then
    raise exception 'admin permission required';
  end if;

  perform public.ensure_task_language_reviews(p_task_id);

  update public.task_language_reviews
  set app_state = '待審查',
      final_fields = '{}'::jsonb,
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      needs_sheet_sync = true,
      updated_at = now()
  where task_id = p_task_id
    and language = p_language;

  if not found then
    raise exception 'target review not found';
  end if;
end;
$function$;

grant execute on function public.delete_investigator_user(uuid, text) to anon, authenticated;
grant execute on function public.revoke_task_language_review(integer, text, text) to anon, authenticated;

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
  tlr.final_fields,
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
where tlr.needs_sheet_sync = true;

grant select on public.app_sheet_sync_queue to service_role;

commit;
