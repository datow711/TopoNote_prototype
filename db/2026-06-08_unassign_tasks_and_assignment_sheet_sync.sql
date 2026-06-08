create or replace function public.unassign_tasks_from_user(
  p_task_ids integer[],
  p_user_name text,
  p_unassigned_by text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task_id integer;
  v_updated integer;
  v_count integer := 0;
  v_remaining text[];
begin
  if p_task_ids is null or array_length(p_task_ids, 1) is null then
    return 0;
  end if;

  if nullif(trim(coalesce(p_user_name, '')), '') is null then
    raise exception 'p_user_name is required';
  end if;

  foreach v_task_id in array p_task_ids loop
    update public.task_assignments
    set is_active = false
    where task_id = v_task_id
      and investigator = p_user_name
      and is_active = true;

    get diagnostics v_updated = row_count;
    v_count := v_count + v_updated;

    select array_agg(ta.investigator order by ta.assigned_at)
    into v_remaining
    from public.task_assignments ta
    where ta.task_id = v_task_id
      and ta.is_active = true;

    update public.final_tasks
    set assigned_to = v_remaining[1]
    where id = v_task_id;

    if coalesce(array_length(v_remaining, 1), 0) = 0 then
      update public.task_language_reviews
      set app_state = '待指派',
          needs_sheet_sync = true,
          updated_at = now()
      where task_id = v_task_id
        and app_state in ('尚未標注', '待指派', '');
    end if;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.unassign_tasks_from_user(integer[], text, text) from public;
grant execute on function public.unassign_tasks_from_user(integer[], text, text) to anon, authenticated, service_role;

create or replace view public.app_assignment_sheet_view as
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  coalesce(
    array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active),
    array[]::text[]
  ) as assigned_users,
  coalesce(
    array_to_string(
      array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active),
      ', '
    ),
    ''
  ) as assigned_users_text
from public.final_tasks ft
left join public.task_assignments ta on ta.task_id = ft.id
where ft.is_active = true
  and ft.source_table in ('third_phase_places', 'test_places')
group by ft.id, ft.source_id, ft.source_table;

grant select on public.app_assignment_sheet_view to anon, authenticated, service_role;
