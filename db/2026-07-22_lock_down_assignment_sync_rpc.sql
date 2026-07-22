-- Lock the assignment Sheet-sync acknowledgement RPC to the GAS backend.
-- Also make the two views changed by the preceding migration honor caller privileges.

revoke all on function public.mark_assignments_sheet_synced(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_assignments_sheet_synced(bigint[]) to service_role;

alter view public.app_review_queue_view set (security_invoker = true);
alter view public.app_language_assignment_sheet_view set (security_invoker = true);
