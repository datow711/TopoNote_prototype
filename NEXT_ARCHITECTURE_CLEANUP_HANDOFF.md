# TopoNote architecture cleanup handoff

Updated: 2026-06-25

This handoff is for the ongoing architecture cleanup goal. The project has been audited. Batch B + Batch D interim and Batch C assignment quarantine have been applied and verified; Batch F root GAS legacy login route quarantine has been pushed, deployed, and smoke-tested.

## Current status

- Current cleanup branch: `codex/batch-f-root-gas-login-quarantine`.
- Root GAS code was changed for Batch F and deployed to the active Web App as version 19.
- Supabase Batch B + Batch D interim was applied on 2026-06-25.
- Supabase Batch C assignment quarantine was applied on 2026-06-25.
- No Google Sheet content was changed.
- No Apps Script push/deploy was run.

## Files created for review

- `docs/architecture-audit-2026-06-24.md`
  - Main architecture audit.
  - Covers frontend, root GAS, Places GAS, Google Sheet tabs, Supabase objects, stale candidates, risky objects, and proposed cleanup batches.
- `docs/architecture-goal-status.md`
  - Requirement-by-requirement completion matrix and approval matrix.
  - Use this to decide whether the full user goal is actually complete.
- `docs/architecture-inventory.md`
  - Structured active/legacy/retention inventory for frontend, root GAS, Places GAS, Google Sheet tabs, and Supabase objects.
  - Use this as the object-by-object deletion/refactor checklist.
- `docs/supabase-cleanup-batch-b-d-preview.sql`
  - Review-only SQL preview.
  - Contains preflight checks, intended SQL, post-change verification, and rollback notes.
  - Applied on 2026-06-25.
- `db/2026-06-25_batch_b_d_interim_cleanup.sql`
  - Applied SQL record for Batch B + Batch D interim.
- `docs/supabase-cleanup-batch-c-preview.sql`
  - Review-only SQL preview for quarantining old generic assignment Supabase objects.
  - Applied on 2026-06-25.
- `db/2026-06-25_batch_c_assignment_quarantine.sql`
  - Applied SQL record for Batch C assignment quarantine.
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

3. The first recommended live cleanup was Supabase-only and is now applied.
   - Revoke direct public execute on `mark_audio_record_pending_review()`.
   - Revoke direct public execute on old `verify_login(text, text)`.
   - Add `audio_records(task_id)` index.
   - Enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`, unless the user approves dropping that backup table.

4. Verified Batch B + D interim result:
   - `mark_audio_record_pending_review()` and `verify_login(text, text)` are no longer executable by `anon` or `authenticated`.
   - `service_role` execute remains true for both functions.
   - `trg_audio_records_pending_review` still exists.
   - `audio_records_task_id_idx` exists.
   - `codex_backup_phone_field_state_20260610` has RLS enabled and no `anon`/`authenticated` grants.

5. Verified Batch C assignment quarantine result:
   - `app_assignment_sheet_view` no longer has `anon` or `authenticated` grants.
   - `assign_tasks_to_user(integer[], text, text)` and `unassign_tasks_from_user(integer[], text, text)` are no longer executable by `anon` or `authenticated`.
   - `service_role` access remains for the quarantined old objects.
   - Current language assignment surfaces were left unchanged: `app_language_assignment_sheet_view`, `assign_task_language`, and `unassign_task_language`.

6. Batch F code quarantine result:
   - Root GAS `doPost` now rejects `action === 'login'` with `legacy_login_disabled`.
   - `handleLogin` remains in code for one observation period and rollback.
   - `upload`, `getAudio`, `submitFeedback`, and `updateUserProfile` were not changed.
   - `npx.cmd clasp push` succeeded.
   - Active deployment `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw` is now `@19`.
   - Live POST smoke test for `action: "login"` returned `legacy_login_disabled`.

7. Do not delete these yet:
   - `moi_placename_raw`
   - `final_tasks.assigned_to`
   - `task_assignments`
   - `ensure_task_language_reviews`
   - `Places`, `Assignments`, `Records`, `TestEntries` sheet tabs
   - `AssignedUsers` / `AssignmentSyncedAt` columns
   - old satellite sheet functions

## Next approval boundary

Batch B + Batch D interim, Batch C, and Batch F are complete. Before executing any next cleanup batch, first explain the exact step, purpose, and risk, then get explicit user approval.

Likely next discussion candidates are Batch E Places GAS old satellite menu quarantine, Batch G Sheet retention decisions, or Batch H app-facing Supabase security redesign. Do not start any without a fresh approval.

Historical next staged approval phrase after Batch B + D interim was:

> 同意執行 Batch C quarantine

That would quarantine old generic assignment Supabase objects using `docs/supabase-cleanup-batch-c-preview.sql`.

## Previous approval boundary

Before executing live Supabase SQL, get explicit user approval. A safe approval phrase would be:

> 請執行 Batch B + Batch D interim。

If the user approves only Batch B, do not touch the backup table.

If the user approves dropping the backup table, replace the Batch D interim quarantine with an explicit drop workflow after exporting or confirming the table is no longer needed.

## Previous Batch B + D execution plan

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
