-- Lock APP-to-Sheet writeback queue views to the service-role backend.
-- This migration changes view options and privileges only; it does not modify rows.
--
-- Rollback requires an explicit security review before restoring any public grants.

begin;

alter view public.app_sheet_sync_queue set (security_invoker = true);
alter view public.app_review_workflow_writeback_queue set (security_invoker = true);

revoke all on table public.app_sheet_sync_queue
from public, anon, authenticated;

revoke all on table public.app_review_workflow_writeback_queue
from public, anon, authenticated;

grant select on table public.app_sheet_sync_queue
to service_role;

grant select on table public.app_review_workflow_writeback_queue
to service_role;

commit;

-- Rollback example (do not run without a new access review):
-- grant select on table public.app_sheet_sync_queue to anon, authenticated;
-- grant select on table public.app_review_workflow_writeback_queue to anon, authenticated;
