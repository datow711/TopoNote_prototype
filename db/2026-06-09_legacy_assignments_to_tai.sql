with legacy_assignment as (
  select
    ft.id as task_id,
    coalesce(
      (array_agg(ta.investigator order by ta.assigned_at) filter (where ta.is_active))[1],
      ft.assigned_to
    ) as assignee
  from public.final_tasks ft
  left join public.task_assignments ta on ta.task_id = ft.id
  where ft.is_active = true
  group by ft.id, ft.assigned_to
)
insert into public.task_language_reviews (task_id, language, sheet_state, app_state, assigned_to, assigned_at, needs_sheet_sync)
select
  task_id,
  '台語',
  '待指派',
  '尚未標注',
  assignee,
  now(),
  true
from legacy_assignment
where assignee is not null
on conflict (task_id, language) do update
set assigned_to = excluded.assigned_to,
    assigned_by = coalesce(public.task_language_reviews.assigned_by, 'legacy-assignment-alignment'),
    assigned_at = now(),
    app_state = case
      when public.task_language_reviews.app_state in ('待指派', '') or public.task_language_reviews.app_state is null then '尚未標注'
      else public.task_language_reviews.app_state
    end,
    needs_sheet_sync = true,
    updated_at = now();

insert into public.task_language_reviews (task_id, language, sheet_state, app_state, assigned_to, assigned_at, needs_sheet_sync)
select
  la.task_id,
  '客語',
  '待指派',
  '待指派',
  null,
  null,
  true
from legacy_assignment la
where la.assignee is not null
on conflict (task_id, language) do update
set assigned_to = null,
    assigned_by = coalesce(public.task_language_reviews.assigned_by, 'legacy-assignment-alignment'),
    assigned_at = now(),
    app_state = case
      when public.task_language_reviews.app_state in ('尚未標注', '待指派', '') or public.task_language_reviews.app_state is null then '待指派'
      else public.task_language_reviews.app_state
    end,
    needs_sheet_sync = true,
    updated_at = now();

create or replace view public.app_language_assignment_sheet_view as
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  case when t_review.needs_sheet_sync then coalesce(t_review.app_state, t_review.sheet_state, '待指派') end as t_state,
  case when t_review.needs_sheet_sync then t_review.assigned_to end as t_annotator,
  case when h_review.needs_sheet_sync then coalesce(h_review.app_state, h_review.sheet_state, '待指派') end as h_state,
  case when h_review.needs_sheet_sync then h_review.assigned_to end as h_annotator
from public.final_tasks ft
left join public.task_language_reviews t_review
  on t_review.task_id = ft.id
 and t_review.language = '台語'
left join public.task_language_reviews h_review
  on h_review.task_id = ft.id
 and h_review.language = '客語'
where ft.is_active = true
  and ft.source_table in ('third_phase_places', 'test_places')
  and (
    coalesce(t_review.needs_sheet_sync, false)
    or coalesce(h_review.needs_sheet_sync, false)
  );

grant select on public.app_language_assignment_sheet_view to anon, authenticated, service_role;
