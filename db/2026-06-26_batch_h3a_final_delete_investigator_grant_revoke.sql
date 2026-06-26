-- Batch H3a-final: close direct public Supabase RPC access for delete_investigator_user.
-- Applied live on 2026-06-26 after the frontend was migrated to root GAS.
--
-- Goal:
--   Browser clients should no longer execute this destructive SECURITY DEFINER
--   function directly. Root GAS calls it with SUPABASE_SERVICE_ROLE_KEY after
--   admin password verification.

begin;

revoke execute on function public.delete_investigator_user(uuid, text) from public;
revoke execute on function public.delete_investigator_user(uuid, text) from anon;
revoke execute on function public.delete_investigator_user(uuid, text) from authenticated;

grant execute on function public.delete_investigator_user(uuid, text) to service_role;

commit;

-- Verification used after apply:
--
-- select
--   has_function_privilege('anon', 'public.delete_investigator_user(uuid, text)', 'EXECUTE') as anon_can_execute,
--   has_function_privilege('authenticated', 'public.delete_investigator_user(uuid, text)', 'EXECUTE') as authenticated_can_execute,
--   has_function_privilege('service_role', 'public.delete_investigator_user(uuid, text)', 'EXECUTE') as service_role_can_execute;
--
-- Expected:
--   anon_can_execute = false
--   authenticated_can_execute = false
--   service_role_can_execute = true

-- Rollback, only if a hidden direct caller is proven:
--
-- grant execute on function public.delete_investigator_user(uuid, text) to anon;
-- grant execute on function public.delete_investigator_user(uuid, text) to authenticated;
