-- TopoNote Batch B + Batch D interim cleanup
-- Applied live via Supabase MCP execute_sql on 2026-06-25.
--
-- Scope approved by user:
-- - Revoke direct public/anon/authenticated execute on trigger-only
--   mark_audio_record_pending_review().
-- - Revoke direct public/anon/authenticated execute on old verify_login(text,text).
-- - Add audio_records(task_id) supporting index.
-- - Enable RLS and remove public/anon/authenticated access on the dated
--   codex_backup_phone_field_state_20260610 backup table.
--
-- This migration record mirrors the live SQL that was applied. It is kept for
-- repo history and future environment replay; it was not run through a local
-- Supabase migration command in this workspace.

begin;

revoke execute on function public.mark_audio_record_pending_review()
from public, anon, authenticated;

grant execute on function public.mark_audio_record_pending_review()
to service_role;

revoke execute on function public.verify_login(text, text)
from public, anon, authenticated;

grant execute on function public.verify_login(text, text)
to service_role;

create index if not exists audio_records_task_id_idx
on public.audio_records (task_id);

alter table public.codex_backup_phone_field_state_20260610
enable row level security;

revoke all on table public.codex_backup_phone_field_state_20260610
from public, anon, authenticated;

grant select on table public.codex_backup_phone_field_state_20260610
to service_role;

commit;
