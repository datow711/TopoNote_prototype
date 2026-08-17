-- Backfill only the missing Taiwanese language-review rows for active formal tasks.
-- Source values are copied from third_phase_places; existing review rows are never overwritten.
-- This migration intentionally leaves both Sheet-sync flags false. Sheet writeback is a separate, reviewed step.

insert into public.task_language_reviews (
  task_id,
  language,
  sheet_state,
  app_state,
  assigned_to,
  assigned_at,
  needs_sheet_sync,
  assignment_sheet_sync_pending,
  updated_at
)
select
  ft.id,
  '台語',
  nullif(trim(tp.t_state), ''),
  coalesce(nullif(trim(tp.t_state), ''), '待指派'),
  nullif(trim(tp.t_annotator), ''),
  case
    when nullif(trim(tp.t_annotator), '') is not null then now()
    else null
  end,
  false,
  false,
  now()
from public.final_tasks ft
join public.third_phase_places tp on tp.uuid = ft.source_id
where ft.is_active = true
  and ft.source_table = 'third_phase_places'
  and not exists (
    select 1
    from public.task_language_reviews existing
    where existing.task_id = ft.id
      and existing.language = '台語'
  )
on conflict (task_id, language) do nothing;
