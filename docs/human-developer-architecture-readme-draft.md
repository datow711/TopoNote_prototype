# TopoNote architecture README draft

Status: draft after approved live cleanup through Batch C; not final.
Updated: 2026-06-25.

This document explains the current project architecture for a human developer. It is not the final README requested by the user because the approved cleanup/refactor phase has not happened yet.

Batch B + Batch D interim and Batch C assignment quarantine were applied and verified on 2026-06-25. This document is still a draft because later cleanup/refactor batches and the final-doc gate remain pending.

## What TopoNote is

TopoNote is a static browser app plus Google Apps Script and Supabase backend pieces for place-name recording, review, assignment, and spreadsheet synchronization.

The system currently bridges four surfaces:

1. Browser frontend for investigators and admins.
2. Root Apps Script Web App for Drive audio, playback proxying, feedback, and admin profile write-through.
3. Places spreadsheet-bound Apps Script for Sheet/Supabase synchronization.
4. Supabase for app-facing task, user, audio, assignment, and review state.

## Main entry points

- Frontend:
  - `index.html`
  - `config.js`
  - `main.js`
  - `style.css`
  - `sw.js`
- Root GAS:
  - `gas/程式碼.js`
  - `gas/appsscript.json`
- Places GAS:
  - `places-gas/gas/程式碼.js`
  - `places-gas/gas/AuditLogger.js`
  - `places-gas/gas/SideBar.js`
  - `places-gas/gas/*.html`
- Supabase SQL history:
  - `db/*.sql`
- Operational docs:
  - `docs/current-operation-flow.md`
  - `docs/architecture-audit-2026-06-24.md`
  - `docs/architecture-goal-status.md`
  - `docs/architecture-inventory.md`
  - `docs/architecture-cleanup-roadmap.md`
  - `docs/supabase-cleanup-batch-b-d-preview.sql`
  - `docs/supabase-cleanup-batch-c-preview.sql`
  - `docs/gas-cleanup-batch-e-f-preview.md`
  - `NEXT_ARCHITECTURE_CLEANUP_HANDOFF.md`

## Frontend responsibilities

`main.js` currently owns most browser behavior:

- login and session restore
- investigator task list and other-place browsing
- filters for county, town, place type, language class, Hakka area, and recording status
- audio recording and file upload
- audio history and original-uploader text edits
- admin review queue
- final review fields
- per-language assignment and unassignment
- admin user manager
- feedback dialog
- task list export

The frontend reads and writes Supabase directly with the anon key in `config.js`. Sensitive admin profile writes are routed through the root Apps Script Web App, which then uses service-role-only Supabase RPC access.

## Root GAS responsibilities

Root GAS is the active frontend Web App backend. Do not delete `gas/`.

Current active responsibilities:

- Receive uploaded audio and store it in Google Drive.
- Proxy Drive audio bytes back to the browser for playback.
- Write user feedback to a feedback spreadsheet and optional Chat webhook.
- Update investigator profile data in both Supabase and the Places `Users` sheet after admin verification.

Root GAS also still contains a legacy `login` route that reads `Places`, `Assignments`, and `Records`. The current frontend does not use this route; it should be quarantined or removed only after confirming no old deployed frontend depends on it.

## Places GAS responsibilities

`places-gas/` is the spreadsheet-bound operational backend for the Places spreadsheet.

Current active responsibilities:

- Daily prework sync through `runDailyPreworkSync`.
- Review writeback from Supabase to `第三期工作清單` or `TestEntries`.
- Per-language assignment writeback to `T_State/T_Annotator` and `H_State/H_Annotator`.
- Third-phase Sheet snapshot upsert to `third_phase_places`.
- Task index upsert to `final_tasks`.
- `Users` sheet sync to Supabase through service-role-only RPC.
- Checkpoint creation before risky writebacks.
- AuditLogger stamping of `T_UpdatedAt` and `H_UpdatedAt`.

Older menu functions for L1 export, classification sync, and satellite sheet push/pull still exist. They need an operational decision before removal.

## Google Sheet model

Places spreadsheet id:

```text
19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI
```

Current main tabs:

- `第三期工作清單`: current source sheet for third-phase task rows.
- `Users`: current source for normal investigator user sync and admin profile write-through.
- `TestEntries`: hidden test writeback target.

Legacy or mixed-use tabs:

- `Places`: older large source tab.
- `Assignments`: older `UserID`/`PlaceID` assignment model.
- `Records`: older audio upload log.
- `Final_Tasks`: older task staging tab.
- `書面標注員名單`: older satellite sheet workflow support.

Checkpoint tabs named `__ckpt_*` are expected from sync safety behavior.

## Supabase model

Project ref:

```text
sikconjhtomqdkicbjal
```

Current important tables:

- `third_phase_places`: Supabase snapshot of `第三期工作清單`.
- `test_places`: app test rows.
- `final_tasks`: task index and compatibility assignment fields.
- `audio_records`: uploaded audio metadata and annotation text.
- `investigators`: user/admin profile records.
- `task_language_reviews`: per-task, per-language review and assignment state.
- `task_assignments`: compatibility/history table for assignment summaries.
- `moi_placename_raw`: legacy source data, not current app-facing.

Current app-facing views:

- `app_tasks_view`
- `app_review_queue_view`
- `app_users_view`
- `app_sheet_sync_queue`
- `app_language_assignment_sheet_view`

Quarantined stale view:

- `app_assignment_sheet_view`: old generic assignment writeback view, superseded by `app_language_assignment_sheet_view`; public/anon/authenticated grants revoked on 2026-06-25.

## Normal workflow

1. Places GAS syncs `第三期工作清單` into `third_phase_places`.
2. Places GAS syncs task index rows into `final_tasks`.
3. Places GAS syncs `Users` into `investigators`.
4. Frontend reads `app_tasks_view`, `app_review_queue_view`, `app_users_view`, and `audio_records`.
5. Investigator uploads audio:
   - frontend sends file to root GAS;
   - root GAS stores Drive file;
   - frontend inserts `audio_records`;
   - Supabase trigger marks relevant language review pending.
6. Admin reviews audio and writes final fields through `approve_task_language` or `revoke_task_language_review`.
7. Places GAS writes pending review results back to the Sheet via `app_sheet_sync_queue`.
8. Admin language assignment uses `assign_task_language` and `unassign_task_language`.
9. Places GAS writes pending assignment state back through `app_language_assignment_sheet_view`.

## Conflict protection

APP review writeback relies on Sheet update stamps:

- Taiwanese fields use `T_UpdatedAt`.
- Hakka fields use `H_UpdatedAt`.
- `AuditLogger.js` must be installed as an onEdit trigger.

If the current Sheet stamp differs from the Supabase source stamp, Places GAS should skip the writeback, leave `needs_sheet_sync = true`, and write a conflict warning instead of silently overwriting newer Sheet edits.

## Known cleanup queue

Applied on 2026-06-25:

- Revoke direct public execute on trigger-only `mark_audio_record_pending_review()`.
- Revoke direct public execute on old `verify_login(text, text)`.
- Add `audio_records(task_id)` index.
- Enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`.
- Quarantine old generic assignment Supabase objects: `app_assignment_sheet_view`, `assign_tasks_to_user`, and `unassign_tasks_from_user`.

Pending approval:

- Decide later whether to drop `codex_backup_phone_field_state_20260610`.

Use `docs/architecture-cleanup-roadmap.md` for the staged cleanup order and approval phrases.

Needs operational decision:

- Whether to keep or remove old satellite sheet push/pull.
- Whether to hide/archive `AssignedUsers` and `AssignmentSyncedAt`.
- Whether old Sheet tabs `Places`, `Assignments`, `Records`, and `Final_Tasks` are still needed.
- Whether and when to drop `app_assignment_sheet_view`, `assign_tasks_to_user`, and `unassign_tasks_from_user`.

Do not delete without separate approval:

- `moi_placename_raw`
- `task_assignments`
- `final_tasks.assigned_to`
- `ensure_task_language_reviews`
- root `gas/`
- `places-gas/`

## Common commands

Local checks:

```powershell
git status --short --branch
node --check main.js
node --check gas\程式碼.js
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

Local dev server:

```powershell
npm run dev
```

UI tests:

```powershell
npm run test:ui
```

Root GAS status:

```powershell
Set-Location gas
npx.cmd clasp status
```

Places GAS status:

```powershell
Set-Location places-gas
npx.cmd clasp status
```

## Maintenance cautions

- `clasp push` alone is not enough when a Web App deployment must change; update the deployment version too.
- `clasp run` is known unreliable in this project. Use Apps Script editor-side execution for one-time trigger setup when needed.
- Do not commit service-role secrets. Apps Script reads them from script properties.
- Do not treat Supabase advisors as purely theoretical: the backup table RLS issue is a real exposed-schema risk.
- Do not blanket-revoke anon/authenticated access from active tables/views without a staged backend refactor; the current frontend still depends on direct Supabase access.
