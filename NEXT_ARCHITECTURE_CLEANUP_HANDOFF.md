# TopoNote architecture cleanup handoff

Updated: 2026-06-24

This handoff is for the ongoing architecture cleanup goal. The project has been audited, but no live cleanup has been applied yet.

## Current status

- Current branch: `main`.
- Repo status at handoff creation: `main...origin/main` with only new audit/preview docs pending.
- No production code was changed.
- No Supabase schema/data change was applied.
- No Google Sheet content was changed.
- No Apps Script push/deploy was run.

## Files created for review

- `docs/architecture-audit-2026-06-24.md`
  - Main architecture audit.
  - Covers frontend, root GAS, Places GAS, Google Sheet tabs, Supabase objects, stale candidates, risky objects, and proposed cleanup batches.
- `docs/architecture-inventory.md`
  - Structured active/legacy/retention inventory for frontend, root GAS, Places GAS, Google Sheet tabs, and Supabase objects.
  - Use this as the object-by-object deletion/refactor checklist.
- `docs/supabase-cleanup-batch-b-d-preview.sql`
  - Review-only SQL preview.
  - Contains preflight checks, intended SQL, post-change verification, and rollback notes.
  - Has not been applied.
- `docs/supabase-cleanup-batch-c-preview.sql`
  - Review-only SQL preview for quarantining old generic assignment Supabase objects.
  - Has not been applied.
- `docs/gas-cleanup-batch-e-f-preview.md`
  - Review-only execution preview for root GAS legacy login route and Places GAS old L3 satellite menu cleanup.
  - No local GAS code edit, push, or deploy has been done.
- `docs/architecture-cleanup-roadmap.md`
  - Staged cleanup plan with approval phrases, preflight checks, verification checks, and rollback notes.
  - Use this as the execution map after the audit.

## Important findings

1. Root `gas/` is still active. Do not delete it.
   - `config.js` points to the root GAS deployment `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw`.
   - Root GAS handles audio upload/playback, feedback, and admin profile write-through.

2. `places-gas/` is the Places spreadsheet-bound sync backend.
   - It handles menu syncs, daily prework sync, review writeback, assignment writeback, Users sync, checkpoints, and AuditLogger.

3. The first recommended live cleanup is Supabase-only.
   - Revoke direct public execute on `mark_audio_record_pending_review()`.
   - Revoke direct public execute on old `verify_login(text, text)`.
   - Add `audio_records(task_id)` index.
   - Enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`, unless the user approves dropping that backup table.

4. Do not delete these yet:
   - `moi_placename_raw`
   - `final_tasks.assigned_to`
   - `task_assignments`
   - `ensure_task_language_reviews`
   - `Places`, `Assignments`, `Records`, `TestEntries` sheet tabs
   - `AssignedUsers` / `AssignmentSyncedAt` columns
   - old satellite sheet functions

## Approval boundary

Before executing live Supabase SQL, get explicit user approval. A safe approval phrase would be:

> 請執行 Batch B + Batch D interim。

If the user approves only Batch B, do not touch the backup table.

If the user approves dropping the backup table, replace the Batch D interim quarantine with an explicit drop workflow after exporting or confirming the table is no longer needed.

## Execution plan after approval

1. Re-run preflight checks from `docs/supabase-cleanup-batch-b-d-preview.sql`.
2. Apply only the approved SQL statements.
3. Run post-change verification queries from the same preview file.
4. Run Supabase security and performance advisors.
5. Run local checks:

```powershell
node --check main.js
node --check gas\程式碼.js
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

6. Update the audit file with what was applied and advisor results.
7. Commit local documentation and migration/SQL files if the work is complete.

## Final goal still pending

After approved cleanup/refactor work is completed, create two final Markdown docs:

1. Future-session handoff:
   - concise startup checklist
   - current architecture identifiers
   - live verification commands
   - known deployment cautions
   - active cleanup decisions

2. Human developer README:
   - current frontend/GAS/Supabase/Sheet architecture
   - day-to-day operation flow
   - sync and conflict rules
   - what is legacy
   - common maintenance commands
