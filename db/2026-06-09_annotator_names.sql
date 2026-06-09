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
        needs_sheet_sync = true,
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

revoke all on function public.assign_task_language(integer[], text, text, text) from public;
grant execute on function public.assign_task_language(integer[], text, text, text) to anon, authenticated, service_role;

with mapped_reviews as (
  select distinct on (tlr.id)
    tlr.id,
    trim(i.name) as assignee_name
  from public.task_language_reviews tlr
  join public.investigators i
    on lower(trim(tlr.assigned_to)) in (
      lower(trim(coalesce(i.account, ''))),
      lower(trim(coalesce(i.email, ''))),
      lower(trim(coalesce(i.user_name, ''))),
      lower(trim(coalesce(i.name, '')))
    )
  where nullif(trim(coalesce(tlr.assigned_to, '')), '') is not null
    and nullif(trim(coalesce(i.name, '')), '') is not null
    and lower(trim(tlr.assigned_to)) <> lower(trim(i.name))
  order by tlr.id,
    case
      when lower(trim(tlr.assigned_to)) = lower(trim(coalesce(i.account, ''))) then 1
      when lower(trim(tlr.assigned_to)) = lower(trim(coalesce(i.email, ''))) then 2
      when lower(trim(tlr.assigned_to)) = lower(trim(coalesce(i.user_name, ''))) then 3
      when lower(trim(tlr.assigned_to)) = lower(trim(coalesce(i.name, ''))) then 4
      else 5
    end
)
update public.task_language_reviews tlr
set assigned_to = mr.assignee_name,
    needs_sheet_sync = true,
    updated_at = now()
from mapped_reviews mr
where tlr.id = mr.id;

with mapped_final_tasks as (
  select distinct on (ft.id)
    ft.id,
    trim(i.name) as assignee_name
  from public.final_tasks ft
  join public.investigators i
    on lower(trim(ft.assigned_to)) in (
      lower(trim(coalesce(i.account, ''))),
      lower(trim(coalesce(i.email, ''))),
      lower(trim(coalesce(i.user_name, ''))),
      lower(trim(coalesce(i.name, '')))
    )
  where nullif(trim(coalesce(ft.assigned_to, '')), '') is not null
    and nullif(trim(coalesce(i.name, '')), '') is not null
    and lower(trim(ft.assigned_to)) <> lower(trim(i.name))
  order by ft.id,
    case
      when lower(trim(ft.assigned_to)) = lower(trim(coalesce(i.account, ''))) then 1
      when lower(trim(ft.assigned_to)) = lower(trim(coalesce(i.email, ''))) then 2
      when lower(trim(ft.assigned_to)) = lower(trim(coalesce(i.user_name, ''))) then 3
      when lower(trim(ft.assigned_to)) = lower(trim(coalesce(i.name, ''))) then 4
      else 5
    end
)
update public.final_tasks ft
set assigned_to = mft.assignee_name
from mapped_final_tasks mft
where ft.id = mft.id;

with mapped_assignments as (
  select distinct on (ta.task_id, ta.investigator)
    ta.task_id,
    ta.investigator as old_investigator,
    trim(i.name) as investigator_name,
    ta.assigned_by,
    ta.assigned_at,
    ta.is_active
  from public.task_assignments ta
  join public.investigators i
    on lower(trim(ta.investigator)) in (
      lower(trim(coalesce(i.account, ''))),
      lower(trim(coalesce(i.email, ''))),
      lower(trim(coalesce(i.user_name, ''))),
      lower(trim(coalesce(i.name, '')))
    )
  where nullif(trim(coalesce(ta.investigator, '')), '') is not null
    and nullif(trim(coalesce(i.name, '')), '') is not null
    and lower(trim(ta.investigator)) <> lower(trim(i.name))
  order by ta.task_id, ta.investigator,
    case
      when lower(trim(ta.investigator)) = lower(trim(coalesce(i.account, ''))) then 1
      when lower(trim(ta.investigator)) = lower(trim(coalesce(i.email, ''))) then 2
      when lower(trim(ta.investigator)) = lower(trim(coalesce(i.user_name, ''))) then 3
      when lower(trim(ta.investigator)) = lower(trim(coalesce(i.name, ''))) then 4
      else 5
    end
), upserted_assignments as (
  insert into public.task_assignments (task_id, investigator, assigned_by, assigned_at, is_active)
  select task_id, investigator_name, assigned_by, assigned_at, is_active
  from mapped_assignments
  on conflict (task_id, investigator) do update
    set is_active = public.task_assignments.is_active or excluded.is_active,
        assigned_by = coalesce(excluded.assigned_by, public.task_assignments.assigned_by),
        assigned_at = coalesce(public.task_assignments.assigned_at, excluded.assigned_at)
  returning task_id, investigator
)
update public.task_assignments ta
set is_active = false
from mapped_assignments ma
where ta.task_id = ma.task_id
  and ta.investigator = ma.old_investigator;

create or replace view public.app_language_assignment_sheet_view as
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  case when t_review.needs_sheet_sync then coalesce(t_review.app_state, t_review.sheet_state, '待指派') end as t_state,
  case when t_review.needs_sheet_sync then coalesce(nullif(trim(t_user.name), ''), t_review.assigned_to) end as t_annotator,
  case when h_review.needs_sheet_sync then coalesce(h_review.app_state, h_review.sheet_state, '待指派') end as h_state,
  case when h_review.needs_sheet_sync then coalesce(nullif(trim(h_user.name), ''), h_review.assigned_to) end as h_annotator
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
    coalesce(t_review.needs_sheet_sync, false)
    or coalesce(h_review.needs_sheet_sync, false)
  );

grant select on public.app_language_assignment_sheet_view to anon, authenticated, service_role;

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
         taihan, tl1, tl2, tl3, tai_note, tai_class, t_state, t_annotator, t_updated_at,
         honzii, hp1, hp2, hp3, h_dialect, hak_note, hak_class, h_state, h_annotator, h_updated_at,
         sync_warning
  from public.third_phase_places
  union all
  select uuid, 'test_places'::text as source_table, place_name, type, county, town, village, info,
         taihan, tl1, tl2, tl3, tai_note, tai_class, t_state, t_annotator, t_updated_at,
         honzii, hp1, hp2, hp3, h_dialect, hak_note, hak_class, h_state, h_annotator, h_updated_at,
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
