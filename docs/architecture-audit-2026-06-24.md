# TopoNote architecture audit - 2026-06-24

This document is the approval checklist for cleanup and refactor work. It records evidence gathered from the current workspace, live Supabase read-only checks, Google Sheets metadata/range reads, and read-only `clasp` checks.

No production code, Supabase schema/data, Google Sheet content, or Apps Script deployment was changed during this audit.

## Current architecture snapshot

### Frontend

- Entry files: `index.html`, `config.js`, `main.js`, `style.css`, `sw.js`.
- The app is a static single-page frontend. `index.html` loads `config.js` and `main.js` directly.
- `main.js` owns login, session restore, task lists, filters, recording upload, history display, admin review, language assignment, task export, feedback, and admin user management.
- The frontend uses the Supabase anon key in `config.js` and calls Supabase REST/RPC directly for most data operations.
- The frontend also calls the root Apps Script Web App URL for Google Drive audio upload/playback, feedback submission, and admin profile write-through to the Places `Users` sheet.

### Root GAS backend

- Local root: `gas/`.
- Clasp script id from root `.clasp.json`: `16gtyfpxsC17zIBK3Ixd97yPRBi9IUIkkk3B8V8_CId2WSZ9iwIAwqTsi`.
- `config.js` Web App URL maps to root GAS deployment `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw @18 - Clean admin investigator profile editor`.
- Root GAS is still active and must not be deleted.
- Current handlers in `gas/程式碼.js`:
  - `upload`: stores audio in Drive and appends legacy `Records` sheet data.
  - `getAudio`: fetches Drive audio bytes for browser playback.
  - `submitFeedback`: writes feedback to a feedback spreadsheet and optionally posts Chat webhook.
  - `updateUserProfile`: verifies admin password, calls Supabase `update_investigator_profile`, and updates Places `Users`.
  - `login`: legacy Sheet-based login path, not used by current frontend.

### Places GAS backend

- Local root: `places-gas/gas/`.
- Clasp script id from `places-gas/.clasp.json`: `18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`.
- Bound to the Places spreadsheet and used for spreadsheet menus, scheduled sync, checkpoint sheets, AuditLogger, and batch update UI.
- Current live flow uses:
  - `runDailyPreworkSync`
  - `syncApprovedReviewsToSheets`
  - `syncTaskAssignmentsToSheets`
  - `syncThirdPhasePlacesToSupabase`
  - `syncFinalTasksToSupabase`
  - `syncUsersToSupabase`
  - `installDailyPreworkSyncTrigger`
  - `AuditLogger.onEdit`
- `places-gas` has a deployment, but the frontend does not call that deployment. Its main role is spreadsheet-bound execution.

### Google Sheet

- Spreadsheet id: `19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`.
- Main current tabs:
  - `第三期工作清單`: current source-of-truth sheet for third-phase task rows.
  - `Users`: source for normal investigator account sync and admin profile write-through.
  - `TestEntries`: hidden test writeback target.
- Legacy or mixed-use tabs still present:
  - `Places`: old large place source used by legacy root GAS login/CSV export helpers.
  - `Assignments`: old `UserID`/`PlaceID` assignment model.
  - `Records`: old audio upload log.
  - `Final_Tasks`: historical task staging tab.
  - `書面標注員名單`: used by older satellite sheet push/pull workflow.
- Checkpoint tabs are actively accumulating with names like `__ckpt_*`. This is expected from `ensureSheetCheckpoint_`, but retention should be verified periodically.

### Supabase

- Project ref: `sikconjhtomqdkicbjal`.
- Live public tables observed:
  - `moi_placename_raw`: 56,804 rows.
  - `final_tasks`: 18,201 rows.
  - `third_phase_places`: 6,842 rows.
  - `test_places`: 10 rows.
  - `audio_records`: 85 rows.
  - `investigators`: 37 rows.
  - `task_assignments`: 1,107 rows.
  - `task_language_reviews`: 21,104 rows.
  - `codex_backup_phone_field_state_20260610`: 3,087 rows.
- Live public views observed:
  - `app_tasks_view`
  - `app_review_queue_view`
  - `app_users_view`
  - `app_sheet_sync_queue`
  - `app_language_assignment_sheet_view`
  - `app_assignment_sheet_view`

## Current data flow

1. Places `第三期工作清單` -> `third_phase_places` through `syncThirdPhasePlacesToSupabase`.
2. Places `第三期工作清單` -> `final_tasks` through `syncFinalTasksToSupabase`, with `source_table = third_phase_places`.
3. Places `Users` -> `investigators` through service-role-only `sync_sheet_users`.
4. Frontend reads `app_tasks_view`, `app_review_queue_view`, `app_users_view`, and `audio_records`.
5. Investigator audio upload:
   - frontend sends audio to root GAS `upload`;
   - root GAS stores file in Drive;
   - frontend inserts `audio_records`;
   - DB trigger `mark_audio_record_pending_review` marks the relevant language review pending.
6. Admin review writes through `approve_task_language` or `revoke_task_language_review`, setting `needs_sheet_sync = true`.
7. Places GAS reads `app_sheet_sync_queue`, writes review results back to `第三期工作清單` or `TestEntries`, then calls service-role-only `mark_reviews_sheet_synced`.
8. Admin language assignment writes through `assign_task_language` / `unassign_task_language`; Places GAS writes pending assignment state back via `app_language_assignment_sheet_view`.

## Confirmed stale or risky candidates

### 1. Supabase backup table with RLS disabled

- Object: `public.codex_backup_phone_field_state_20260610`.
- Evidence:
  - Live table has 3,087 rows.
  - RLS is disabled.
  - It has no primary key.
  - Supabase advisors flag it as public-table RLS risk and no-primary-key performance issue.
  - No local code reference was found.
- Recommendation:
  - First choice: export or confirm backup is no longer needed, then drop the table.
  - Minimal safe interim: enable RLS and revoke public access.
- Approval needed because this changes live database data/schema.

### 2. Old generic assignment RPC/view

- Objects:
  - `assign_tasks_to_user(integer[], text, text)`
  - `unassign_tasks_from_user(integer[], text, text)`
  - `app_assignment_sheet_view`
- Evidence:
  - Current frontend calls `assign_task_language` and `unassign_task_language`.
  - Current Places GAS reads `app_language_assignment_sheet_view`, not `app_assignment_sheet_view`.
  - Timeline says the language assignment model superseded earlier generic `AssignedUsers` sheet sync.
  - Current `app_assignment_sheet_view` still returns 6,852 rows, so it can look active even though it is not used by current code.
- Recommendation:
  - Revoke anon/authenticated execute/select first.
  - Keep for one verification cycle if there is concern about hidden manual use.
  - Drop after confirming no external caller depends on it.

### 3. Trigger function callable as public RPC

- Object: `mark_audio_record_pending_review()`.
- Evidence:
  - It is used by trigger `trg_audio_records_pending_review` on `audio_records`.
  - Supabase advisor flags it as executable by `anon` and `authenticated`.
- Recommendation:
  - Do not drop the function.
  - Revoke direct execute from `PUBLIC`, `anon`, and `authenticated`; keep trigger behavior.

### 4. Old login RPC

- Object: `verify_login(p_account text, p_password text)`.
- Evidence:
  - Current frontend uses `login_investigator` and `login_admin`.
  - Local search found no current frontend call to `/rpc/verify_login`.
  - Function has no fixed `search_path` and is public-executable.
- Recommendation:
  - Revoke public execute first.
  - Drop later if no legacy client uses it.

### 5. Root GAS legacy login path

- Function: `handleLogin` in `gas/程式碼.js`.
- Evidence:
  - Root GAS still routes `action === 'login'` to `handleLogin`.
  - Current frontend does not send `action: 'login'`; it logs in via Supabase RPC.
  - The legacy path reads `Places`, `Assignments`, and `Records`.
- Recommendation:
  - Keep root GAS as a backend, but remove or quarantine only the unused login route after verifying no old deployed frontend still calls it.

### 6. Legacy Sheet assignment columns

- Columns:
  - `AssignedUsers`
  - `AssignmentSyncedAt`
- Evidence:
  - These columns remain in `第三期工作清單` and `TestEntries`.
  - Current assignment writeback uses `T_State`, `T_Annotator`, `H_State`, `H_Annotator`, and review ids from `app_language_assignment_sheet_view`.
- Recommendation:
  - Do not delete columns immediately.
  - Stop documenting them as current source of truth.
  - Hide or archive only after one full sync/review cycle confirms they are unused by humans.

### 7. Old satellite sheet workflow

- Functions:
  - `pushTasksToSatelliteSheets`
  - `pullResultsFromSatelliteSheets`
- Evidence:
  - Still exposed under Places GAS menu `L3 分發與回填`.
  - Uses `書面標注員名單` and satellite spreadsheets.
  - Current app workflow assigns and reviews in the frontend/Supabase path.
- Recommendation:
  - Ask whether the old satellite workflow is still used operationally.
  - If not used, move it to a legacy section or remove menu items first, then delete code later.

### 8. Security-definer views and broad table privileges

- Objects:
  - All app-facing views are advisor-flagged as `SECURITY DEFINER`.
  - Many public tables/views have broad table privileges granted to `anon` and `authenticated`.
- Evidence:
  - Current architecture relies on anon-key direct browser access and RLS/RPC behavior.
  - Advisors flag all app-facing views as security-definer views.
- Recommendation:
  - Do not blanket-revoke privileges. That would break the current app.
  - Long-term refactor: move sensitive writes behind service-role GAS or authenticated backend RPCs, then narrow anon permissions table-by-table.

### 9. Unindexed foreign key

- Object: `audio_records.task_id`.
- Evidence:
  - Supabase performance advisor flags `audio_records_task_id_fkey` as unindexed.
  - Frontend frequently groups records by task id.
- Recommendation:
  - Add an index on `audio_records(task_id)` in the first low-risk DB migration batch.

## Things that looked suspicious but should not be removed now

- Root `gas/` directory: still used by the frontend Web App URL.
- `mark_audio_record_pending_review`: needed by trigger, only its direct execute grants are suspect.
- `ensure_task_language_reviews`: called internally by active review/assignment functions.
- `task_assignments`: still used as compatibility/history for assignment summaries and profile update preservation.
- `final_tasks.assigned_to`: still used as compatibility fallback and migration target.
- `moi_placename_raw`: legacy source data is not app-facing now, but `final_tasks` still contains 11,349 rows from it. Do not delete without a separate data retention decision.
- `Places`, `Assignments`, `Records` Sheet tabs: legacy, but root GAS still contains paths that read/write them.
- `TestEntries`: hidden but actively used for test review writeback.
- Checkpoint tabs: expected from sync safety; clean only through a defined retention policy.

## Proposed cleanup batches

Detailed approval gates, preflight checks, verification checks, and rollback notes are in `docs/architecture-cleanup-roadmap.md`.

### Batch A - low-risk documentation and local cleanup

No live data/schema changes.

1. Create final human README after approved architecture decisions.
2. Create final future-session handoff after approved architecture decisions.
3. Mark legacy flows clearly in docs.
4. Optionally add `.gsheet` generated files and `debug.log` notes to local cleanup checklist; they are already ignored.

### Batch B - low-risk Supabase hardening

Requires approval before execution.

1. Revoke direct execute on trigger-only `mark_audio_record_pending_review`.
2. Revoke direct execute on unused `verify_login`.
3. Add index on `audio_records(task_id)`.
4. Re-run security/performance advisors.

### Batch C - stale object quarantine

Requires approval before execution.

1. Revoke public access to `app_assignment_sheet_view`.
2. Revoke public execute on `assign_tasks_to_user` and `unassign_tasks_from_user`.
3. Keep the objects for one verification period.
4. Drop them only after confirming no hidden manual integration depends on them.

### Batch D - backup table resolution

Requires explicit approval because it touches live data.

1. Confirm whether `codex_backup_phone_field_state_20260610` is still needed.
2. If not needed: drop it.
3. If unsure: enable RLS and revoke public access as interim protection.
4. Re-run advisors.

### Batch E - workflow simplification

Requires user decision because it affects human operations.

1. Decide whether `pushTasksToSatelliteSheets` / `pullResultsFromSatelliteSheets` are still used.
2. If unused: remove menu entries first.
3. After one cycle, remove code and update docs.
4. Decide whether `AssignedUsers` / `AssignmentSyncedAt` should be hidden, archived, or preserved.

## Suggested first approval

Recommended first approved scope:

1. Batch B: revoke direct execute on `mark_audio_record_pending_review` and `verify_login`, add `audio_records(task_id)` index, verify advisors.
2. Batch D interim: enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`, unless you are ready to drop it.
3. No deletion of historical Sheet tabs or `moi_placename_raw` yet.

This reduces live risk without changing the current user-facing workflow.

SQL preview for this first scope: `docs/supabase-cleanup-batch-b-d-preview.sql`. This file is for review only and has not been applied.

## Verification already run

Local:

```powershell
git status --short --branch
node --check main.js
node --check gas\程式碼.js
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

Read-only Apps Script:

```powershell
npx.cmd clasp status
npx.cmd clasp deployments
npx.cmd clasp versions
```

Read-only Supabase:

- Listed public tables and views.
- Queried function signatures and execute grants.
- Queried triggers.
- Queried view row counts.
- Queried table row distribution.
- Ran security and performance advisors.

Read-only Google Sheets:

- Read spreadsheet metadata for Places.
- Read bounded headers/sample rows from `第三期工作清單`, `Users`, `TestEntries`, `Places`, `Assignments`, and `Records`.
