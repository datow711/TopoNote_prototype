-- Batch H2-final: close direct public Supabase RPC access for set_investigator_active.
-- Applied live on 2026-06-26 after the frontend was migrated to root GAS.
--
-- Goal:
--   Browser clients should no longer execute this SECURITY DEFINER function directly.
--   Root GAS calls it with SUPABASE_SERVICE_ROLE_KEY after admin password verification.

begin;

revoke execute on function public.set_investigator_active(uuid, boolean, text) from public;
revoke execute on function public.set_investigator_active(uuid, boolean, text) from anon;
revoke execute on function public.set_investigator_active(uuid, boolean, text) from authenticated;

grant execute on function public.set_investigator_active(uuid, boolean, text) to service_role;

commit;

-- Verification used after apply:
--
-- select
--   has_function_privilege('anon', 'public.set_investigator_active(uuid, boolean, text)', 'EXECUTE') as anon_can_execute,
--   has_function_privilege('authenticated', 'public.set_investigator_active(uuid, boolean, text)', 'EXECUTE') as authenticated_can_execute,
--   has_function_privilege('service_role', 'public.set_investigator_active(uuid, boolean, text)', 'EXECUTE') as service_role_can_execute;
--
-- Expected:
--   anon_can_execute = false
--   authenticated_can_execute = false
--   service_role_can_execute = true

-- Rollback, only if a hidden direct caller is proven:
--
-- grant execute on function public.set_investigator_active(uuid, boolean, text) to anon;
-- grant execute on function public.set_investigator_active(uuid, boolean, text) to authenticated;
