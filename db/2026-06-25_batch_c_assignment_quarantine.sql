-- TopoNote Supabase cleanup - Batch C assignment quarantine
-- Applied live via Supabase MCP execute_sql on 2026-06-25.
--
-- Purpose:
-- Quarantine old generic assignment objects that are superseded by the
-- language-specific assignment model. This does not drop any object.

begin;

revoke all on table public.app_assignment_sheet_view
from public, anon, authenticated;

grant select on table public.app_assignment_sheet_view
to service_role;

revoke execute on function public.assign_tasks_to_user(integer[], text, text)
from public, anon, authenticated;

grant execute on function public.assign_tasks_to_user(integer[], text, text)
to service_role;

revoke execute on function public.unassign_tasks_from_user(integer[], text, text)
from public, anon, authenticated;

grant execute on function public.unassign_tasks_from_user(integer[], text, text)
to service_role;

commit;

-- Verification performed after applying:
-- - app_assignment_sheet_view has no anon/authenticated grants.
-- - assign_tasks_to_user has anon/authenticated execute false and service_role true.
-- - unassign_tasks_from_user has anon/authenticated execute false and service_role true.
-- - app_language_assignment_sheet_view grants were left unchanged.
-- - assign_task_language and unassign_task_language grants were left unchanged.
-- - Supabase security advisor no longer reports the old generic assignment
--   view/RPCs in the relevant public-exposure findings.
