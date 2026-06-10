create or replace view public.app_language_assignment_sheet_view as
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  case when t_review.needs_sheet_sync then coalesce(t_review.app_state, t_review.sheet_state, '待指派') end as t_state,
  case when t_review.needs_sheet_sync then coalesce(nullif(trim(t_user.name), ''), t_review.assigned_to) end as t_annotator,
  case when h_review.needs_sheet_sync then coalesce(h_review.app_state, h_review.sheet_state, '待指派') end as h_state,
  case when h_review.needs_sheet_sync then coalesce(nullif(trim(h_user.name), ''), h_review.assigned_to) end as h_annotator,
  t_review.id as t_review_id,
  h_review.id as h_review_id
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
