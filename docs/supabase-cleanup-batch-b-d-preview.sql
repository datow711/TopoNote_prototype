-- TopoNote Supabase cleanup preview - Batch B + Batch D interim
-- Date: 2026-06-24
--
-- Status: applied live via Supabase MCP execute_sql on 2026-06-25.
-- Applied SQL record: db/2026-06-25_batch_b_d_interim_cleanup.sql
--
-- Intended effects:
-- 1. Keep active app behavior unchanged.
-- 2. Remove direct public RPC access to functions that should not be called directly.
-- 3. Add a small performance index used by task/audio lookups.
-- 4. Quarantine the one-off Codex backup table that currently has RLS disabled.
--
-- Official Supabase docs checked:
-- - Security definer function advisors recommend revoking EXECUTE from anon,
--   authenticated, and PUBLIC unless the function is intentionally public.
-- - RLS docs recommend enabling RLS on tables in exposed schemas.
-- - API security docs distinguish grants from RLS: grants control whether a role
--   can reach an object, RLS controls which rows are visible.

-- ---------------------------------------------------------------------------
-- Preflight read-only checks
-- ---------------------------------------------------------------------------

-- Confirm target function grants before changing them.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mark_audio_record_pending_review', 'verify_login')
order by p.proname;

-- Confirm mark_audio_record_pending_review is still attached as a trigger.
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and action_statement ilike '%mark_audio_record_pending_review%';

-- Confirm backup table exposure before changing it.
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  pg_total_relation_size(c.oid) as total_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'codex_backup_phone_field_state_20260610';

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'codex_backup_phone_field_state_20260610'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
group by grantee
order by grantee;

-- ---------------------------------------------------------------------------
-- Batch B: low-risk Supabase hardening
-- ---------------------------------------------------------------------------

-- This function is used by trigger trg_audio_records_pending_review.
-- It should remain callable by the trigger, but should not be callable directly
-- through /rest/v1/rpc/mark_audio_record_pending_review.
revoke execute on function public.mark_audio_record_pending_review()
from public, anon, authenticated;

grant execute on function public.mark_audio_record_pending_review()
to service_role;

-- Old login RPC. Current frontend uses login_investigator/login_admin.
revoke execute on function public.verify_login(text, text)
from public, anon, authenticated;

grant execute on function public.verify_login(text, text)
to service_role;

-- Performance advisor finding: audio_records.task_id foreign key is unindexed.
create index if not exists audio_records_task_id_idx
on public.audio_records (task_id);

-- ---------------------------------------------------------------------------
-- Batch D interim: quarantine backup table, do not delete it yet
-- ---------------------------------------------------------------------------

-- Enable RLS so the public exposed schema is not left with an unprotected table.
alter table public.codex_backup_phone_field_state_20260610
enable row level security;

-- Remove direct browser/API reachability for anon and authenticated roles.
-- No application code should depend on this backup table.
revoke all on table public.codex_backup_phone_field_state_20260610
from public, anon, authenticated;

-- Keep service_role access explicit for admin/export recovery.
grant select on table public.codex_backup_phone_field_state_20260610
to service_role;

-- ---------------------------------------------------------------------------
-- Post-change verification
-- ---------------------------------------------------------------------------

-- Function grants should be false for anon/authenticated and true for service_role.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mark_audio_record_pending_review', 'verify_login')
order by p.proname;

-- Trigger should still exist.
select event_object_table, trigger_name, action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name = 'trg_audio_records_pending_review';

-- Index should exist.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'audio_records'
  and indexname = 'audio_records_task_id_idx';

-- Backup table should have RLS enabled and no anon/authenticated table grants.
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'codex_backup_phone_field_state_20260610';

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'codex_backup_phone_field_state_20260610'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
group by grantee
order by grantee;

-- Re-run Supabase advisors after applying:
-- - security advisor
-- - performance advisor

-- ---------------------------------------------------------------------------
-- Rollback notes
-- ---------------------------------------------------------------------------

-- If mark_audio_record_pending_review direct RPC access is unexpectedly needed:
-- grant execute on function public.mark_audio_record_pending_review()
-- to anon, authenticated;
--
-- If verify_login is unexpectedly needed by an old client:
-- grant execute on function public.verify_login(text, text)
-- to anon, authenticated;
--
-- If the audio_records index causes an issue:
-- drop index if exists public.audio_records_task_id_idx;
--
-- Avoid rolling back the backup-table RLS/public-access change unless a concrete
-- recovery need is found. If access is needed, prefer granting service_role-only
-- access or exporting through an admin connection rather than reopening anon
-- or authenticated access.
