-- Keep the main language state blank while assignment is pending.
-- AssignmentStatus is an independent compatibility-sync field.

begin;

create or replace view public.app_language_assignment_sheet_view as
with source_rows as (
  select uuid, 'third_phase_places'::text as source_table, tai_class, hak_class
  from public.third_phase_places
  union all
  select uuid, 'test_places'::text as source_table, tai_class, hak_class
  from public.test_places
)
select
  ft.id as task_id,
  ft.source_id,
  ft.source_table,
  case
    when coalesce(t_review.assignment_sheet_sync_pending, false)
      and nullif(trim(coalesce(t_review.assigned_to, '')), '') is not null
    then case
      when trim(coalesce(src.tai_class, '')) = U&'\66f8\9762\6a19\6ce8'
        then U&'\66f8\9762\6a19\6ce8\4e2d'
      else U&'\9304\97f3\4e2d'
    end
    else ''
  end as t_state,
  case
    when coalesce(t_review.assignment_sheet_sync_pending, false)
      and nullif(trim(coalesce(t_review.assigned_to, '')), '') is not null
    then coalesce(nullif(trim(t_user.name), ''), t_review.assigned_to)
    else ''
  end as t_annotator,
  case
    when coalesce(h_review.assignment_sheet_sync_pending, false)
      and nullif(trim(coalesce(h_review.assigned_to, '')), '') is not null
    then case
      when trim(coalesce(src.hak_class, '')) = U&'\66f8\9762\6a19\6ce8'
        then U&'\66f8\9762\6a19\6ce8\4e2d'
      else U&'\9304\97f3\4e2d'
    end
    else ''
  end as h_state,
  case
    when coalesce(h_review.assignment_sheet_sync_pending, false)
      and nullif(trim(coalesce(h_review.assigned_to, '')), '') is not null
    then coalesce(nullif(trim(h_user.name), ''), h_review.assigned_to)
    else ''
  end as h_annotator,
  t_review.id as t_review_id,
  h_review.id as h_review_id,
  case
    when coalesce(t_review.assignment_sheet_sync_pending, false)
    then case
      when nullif(trim(coalesce(t_review.assigned_to, '')), '') is null then U&'\672a\6307\6d3e'
      else U&'\5df2\6307\6d3e'
    end
    else ''
  end as t_assignment_status,
  case
    when coalesce(h_review.assignment_sheet_sync_pending, false)
    then case
      when nullif(trim(coalesce(h_review.assigned_to, '')), '') is null then U&'\672a\6307\6d3e'
      else U&'\5df2\6307\6d3e'
    end
    else ''
  end as h_assignment_status
from public.final_tasks ft
left join source_rows src
  on src.uuid = ft.source_id
 and src.source_table = ft.source_table
left join public.task_language_reviews t_review
  on t_review.task_id = ft.id
 and t_review.language = U&'\53f0\8a9e'
left join public.investigators t_user
  on lower(trim(coalesce(t_review.assigned_to, ''))) in (
    lower(trim(coalesce(t_user.account, ''))),
    lower(trim(coalesce(t_user.email, ''))),
    lower(trim(coalesce(t_user.user_name, ''))),
    lower(trim(coalesce(t_user.name, '')))
  )
left join public.task_language_reviews h_review
  on h_review.task_id = ft.id
 and h_review.language = U&'\5ba2\8a9e'
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
    coalesce(t_review.assignment_sheet_sync_pending, false)
    or coalesce(h_review.assignment_sheet_sync_pending, false)
  );

alter view public.app_language_assignment_sheet_view set (security_invoker = true);
grant select on public.app_language_assignment_sheet_view to anon, authenticated, service_role;

commit;