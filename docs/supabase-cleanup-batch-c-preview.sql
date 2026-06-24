-- TopoNote Supabase cleanup Batch C preview
-- Status: review only. Do not run until the user explicitly approves:
--   同意執行 Batch C quarantine
--
-- Purpose:
-- Quarantine old generic assignment objects after Batch B is complete.
-- Current app code uses assign_task_language/unassign_task_language and
-- app_language_assignment_sheet_view. The objects below belong to the older
-- generic assignment sync path.

-- ============================================================
-- 0. Preflight: confirm current code path assumptions
-- ============================================================

-- Confirm the old view exists and inspect its grants.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_assignment_sheet_view'
order by grantee, privilege_type;

-- Confirm the current language assignment view exists and remains available.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_language_assignment_sheet_view'
order by grantee, privilege_type;

-- Inspect execute grants for old generic assignment functions.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  r.rolname as grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname in ('assign_tasks_to_user', 'unassign_tasks_from_user')
  and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
order by function_name, grantee;

-- Confirm current app-facing assignment RPCs are present.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('assign_task_language', 'unassign_task_language')
order by function_name, args;

-- ============================================================
-- 1. Intended Batch C quarantine
-- ============================================================

-- Revoke direct frontend/API access to old generic assignment writeback view.
revoke all on table public.app_assignment_sheet_view
  from public, anon, authenticated;

-- Revoke direct API execute on old generic assignment RPCs.
revoke execute on function public.assign_tasks_to_user(integer[], text, text)
  from public, anon, authenticated;

revoke execute on function public.unassign_tasks_from_user(integer[], text, text)
  from public, anon, authenticated;

-- Keep service_role access only if a hidden admin/integration path is confirmed.
-- Otherwise leave service_role unchanged for the quarantine observation period.

-- ============================================================
-- 2. Post-change verification
-- ============================================================

-- Old view should no longer be directly selectable by public/anon/authenticated.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_assignment_sheet_view'
order by grantee, privilege_type;

-- Old functions should no longer be executable by public/anon/authenticated.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  r.rolname as grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join pg_roles r
where n.nspname = 'public'
  and p.proname in ('assign_tasks_to_user', 'unassign_tasks_from_user')
  and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
order by function_name, grantee;

-- Current language assignment view must remain available to the roles it needs.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_language_assignment_sheet_view'
order by grantee, privilege_type;

-- ============================================================
-- 3. Rollback, only if an old hidden client is proven to need access
-- ============================================================

-- grant select on table public.app_assignment_sheet_view
--   to anon, authenticated, service_role;
--
-- grant execute on function public.assign_tasks_to_user(integer[], text, text)
--   to anon, authenticated, service_role;
--
-- grant execute on function public.unassign_tasks_from_user(integer[], text, text)
--   to anon, authenticated, service_role;

-- ============================================================
-- 4. Follow-up drop workflow, only after one operating cycle
-- ============================================================

-- If no old integration depends on these objects after the quarantine period:
--
-- drop view if exists public.app_assignment_sheet_view;
-- drop function if exists public.assign_tasks_to_user(integer[], text, text);
-- drop function if exists public.unassign_tasks_from_user(integer[], text, text);
