# TopoNote architecture inventory

Updated: 2026-06-24.

This inventory is a static local-code and prior read-only audit map. It is meant to answer: "What is active, what is legacy, and what needs a retention decision before removal?"

Batch B + Batch D interim Supabase cleanup was applied and verified on 2026-06-25. No Google Sheet or Apps Script changes have been applied for this inventory.

For the overall goal completion and approval matrix, see `docs/architecture-goal-status.md`.

## Status labels

- Active: used by the current app or current operations.
- Active but awkward: used now, but the design should be simplified later.
- Legacy candidate: not used by current app code, but still present and should be quarantined before deletion.
- Retention decision: may be historical or operational data; do not delete until the user decides retention.
- Do not remove: looks old or indirect, but is still required by current behavior.

## Browser frontend inventory

Current entry files:

- `index.html`
- `config.js`
- `main.js`
- `style.css`
- `sw.js`

Active Supabase reads:

| Object | Status | Current local evidence | Notes |
| --- | --- | --- | --- |
| `app_tasks_view` | Active | `main.js` loads task rows through `/rest/v1/app_tasks_view` | Primary task list source for investigators and admins. |
| `app_review_queue_view` | Active | `main.js` loads review rows for admin review | Keep while review UI is active. |
| `app_users_view` | Active | `main.js` uses it for session restore, admin user manager, and assignee labels | Keep name-first display contract; email/account remain identifiers. |
| `audio_records` | Active | `main.js` reads, inserts, and patches rows | Used for uploaded audio history and original-uploader text edits. |

Active Supabase RPCs called by frontend:

| RPC | Status | Current local evidence | Notes |
| --- | --- | --- | --- |
| `login_investigator` | Active | current investigator login path | Public execute is intentional under current static frontend design. |
| `login_admin` | Active | current admin login path and root GAS admin password verification | Public execute is intentional under current static frontend design. |
| `set_investigator_active` | Active | admin user manager | Requires current admin checks inside function. |
| `delete_investigator_user` | Active | admin user manager | Also preserves/deactivates related assignment state. |
| `approve_task_language` | Active | admin review flow | Sets review state and Sheet sync queue flags. |
| `revoke_task_language_review` | Active | admin review flow | Sets revoked/pending state and Sheet sync queue flags. |
| `assign_task_language` | Active | admin per-language assignment flow | Supersedes old generic assignment RPC. |
| `unassign_task_language` | Active | admin per-language unassignment flow | Supersedes old generic assignment RPC. |

Active frontend-to-root-GAS actions:

| Action | Status | Current local evidence | Notes |
| --- | --- | --- | --- |
| `upload` | Active | `main.js` sends audio payload to `CONFIG.GAS_WEB_APP_URL` | Stores Drive file; frontend then inserts `audio_records` in Supabase. |
| `getAudio` | Active | playback proxy for Drive audio | Keep unless playback is moved away from Drive/GAS. |
| `submitFeedback` | Active | feedback dialog | Writes feedback sheet and optional chat webhook. |
| `updateUserProfile` | Active | admin profile editor | Updates Supabase through service-role RPC and writes Places `Users` sheet. |

Frontend single-reference functions are not automatically dead code because many are called from inline HTML attributes or dynamically generated buttons. Examples include `loginAdmin`, `selectHakArea`, `selectStatus`, `handleFileUpload`, `stopRecording`, `uploadAudio`, `batchAssignTasks`, and `batchUnassignTasks`.

## Root GAS inventory

Root GAS script:

- Local folder: `gas/`
- Active role: frontend Web App backend for Drive audio, playback proxying, feedback, and admin profile write-through.
- Do not remove `gas/`.

Root GAS route map:

| Route/action | Status | Current local evidence | Cleanup decision |
| --- | --- | --- | --- |
| `doPost` | Active | Apps Script Web App entrypoint | Keep. |
| `upload` -> `handleUpload` | Active but awkward | current frontend calls it | Keep. It still appends to old `Records`; later decide whether the legacy log is still needed. |
| `getAudio` -> `handleGetAudio` | Active | current frontend playback path | Keep. |
| `submitFeedback` -> `handleSubmitFeedback` | Active | current frontend feedback path | Keep. |
| `updateUserProfile` -> `handleUpdateUserProfile` | Active | current admin profile path | Keep; this protects service-role RPC from browser exposure. |
| `login` -> `handleLogin` | Legacy candidate | current frontend does not call `action: 'login'`; it uses Supabase RPCs | Batch F should disable or remove route after approval. |
| `doGet?action=clearCache` | Legacy/utility candidate | no current frontend reference | Keep unless user approves removing old cache support. |
| `doOptions` | Active compatibility | CORS preflight support | Keep while GAS Web App receives browser requests. |

Root GAS old Sheet coupling:

| Sheet/object | Status | Local evidence | Notes |
| --- | --- | --- | --- |
| `Users` | Active | profile write-through and legacy login | Current admin profile write-through needs it. |
| `Records` | Active but awkward | `handleUpload` appends a row; legacy login reads it | Decide whether this log is still useful before removing write. |
| `Places` | Legacy candidate | used by legacy login and CSV export helper | Do not remove until Batch F and Sheet retention are settled. |
| `Assignments` | Legacy candidate | used only by legacy login | Candidate for retention/archive after route is disabled. |

## Places GAS inventory

Places GAS script:

- Local folder: `places-gas/gas/`
- Active role: spreadsheet-bound operational backend.
- Do not remove `places-gas/`.

Current active menu/trigger functions:

| Function | Status | Purpose |
| --- | --- | --- |
| `runDailyPreworkSync` | Active | Runs assignment writeback, third-phase sync, final task sync, review writeback, and Users sync. |
| `installDailyPreworkSyncTrigger` / `removeDailyPreworkSyncTriggers` | Active | Controls daily sync trigger. |
| `syncThirdPhasePlacesToSupabase` | Active | Upserts `第三期工作清單` into `third_phase_places`. |
| `syncFinalTasksToSupabase` | Active | Upserts `final_tasks` index rows from `第三期工作清單`. |
| `syncApprovedReviewsToSheets` | Active | Writes pending review results from Supabase back to Sheet/TestEntries. |
| `syncTaskAssignmentsToSheets` | Active | Writes language assignment state to Sheet/TestEntries. |
| `syncUsersToSupabase` | Active | Upserts `Users` sheet to `investigators` via service-role RPC. |
| `setupUsersSheetHeaders` | Active utility | Repairs `Users` headers. |
| `setupTestEntriesSheet` | Active utility | Repairs hidden `TestEntries` headers. |
| `showStatusSidebar` / `SideBar.js` | Active utility | Batch Sheet editing sidebar. |
| `AuditLogger.js` onEdit helpers | Active | Stamps Sheet edit times for conflict detection. |

Places GAS legacy or decision-gated functions:

| Function | Status | Why it is not immediately removable |
| --- | --- | --- |
| `openExportDialog` / `processExport` | Retention decision | Old L1-to-L2 import flow still appears in menu. Ask whether source intake still uses it. |
| `syncClassification` | Retention decision | Uses an external source spreadsheet and writes classification back to `第三期工作清單`. Confirm whether still operational. |
| `pushTasksToSatelliteSheets` | Legacy candidate | Old L3 satellite annotator workflow; still exposed in menu. Remove menu first after approval, then remove code later. |
| `pullResultsFromSatelliteSheets` | Legacy candidate | Same old L3 satellite workflow; writes back to `第三期工作清單`. Quarantine before deletion. |
| `exportCleanCSVForSupabase` | Legacy candidate | Reads old `Places` tab and tags rows as `moi_placename_raw`. Not current app-facing sync path. |
| `keepSupabaseAwake` | Utility candidate | Pings `final_tasks`. Confirm whether any trigger uses it before removal. |

## Google Sheet tab inventory

| Tab | Status | Current role |
| --- | --- | --- |
| `第三期工作清單` | Active | Main source-of-truth sheet for third-phase task rows and review/writeback fields. |
| `Users` | Active | Investigator source sync and admin profile write-through. |
| `TestEntries` | Active | Hidden test writeback target for `test_places`. |
| checkpoint tabs `__ckpt_*` | Active/retention | Sync safety checkpoints. Retention is controlled by checkpoint settings. |
| `Places` | Retention decision | Old large source tab used by legacy root GAS and CSV helper. |
| `Assignments` | Retention decision | Old `UserID`/`PlaceID` assignment model used by legacy login. |
| `Records` | Active but awkward | Old audio upload log still written by root GAS upload. |
| `Final_Tasks` | Retention decision | Historical staging tab; current Supabase `final_tasks` is maintained by Places GAS. |
| `書面標注員名單` | Retention decision | Old satellite-sheet workflow support. |
| `梯次紀錄表` | Retention decision | Old L1-to-L2 import batch log. |
| `查詢瀏覽用`, `客語區`, `已完成各區`, `台中` | Retention decision | Human-facing or historical tabs; not enough local code evidence to delete. |

## Supabase object inventory

Active app-facing views:

| Object | Status | Current consumer |
| --- | --- | --- |
| `app_tasks_view` | Active but advisor-flagged | Browser frontend. |
| `app_review_queue_view` | Active but advisor-flagged | Browser admin review. |
| `app_users_view` | Active but advisor-flagged | Browser frontend and admin user manager. |
| `app_sheet_sync_queue` | Active but advisor-flagged | Places GAS review writeback; should remain service-role oriented. |
| `app_language_assignment_sheet_view` | Active but advisor-flagged | Places GAS assignment writeback. |

Active tables:

| Object | Status | Notes |
| --- | --- | --- |
| `final_tasks` | Active | Current task index, including current `third_phase_places` and `test_places` rows plus older `moi_placename_raw` rows. |
| `third_phase_places` | Active | Supabase snapshot of `第三期工作清單`. |
| `test_places` | Active | Controlled test source routed to `TestEntries`. |
| `audio_records` | Active | Current uploaded audio metadata and editable text. |
| `investigators` | Active | Login/user source after `Users` sync. |
| `task_language_reviews` | Active | Language-specific assignment and review state. |
| `task_assignments` | Do not remove | Compatibility/history layer used by current functions and profile-preservation logic. |
| `moi_placename_raw` | Retention decision | Legacy source data; not app-facing now, but `final_tasks` still contains rows from it. |
| `codex_backup_phone_field_state_20260610` | Quarantined legacy candidate | Dated backup object; no local code reference. RLS/revokes applied 2026-06-25; explicit drop still needs separate confirmation. |

Active RPCs/functions:

| Object | Status | Notes |
| --- | --- | --- |
| `login_investigator` | Active | Current frontend investigator login. |
| `login_admin` | Active | Current frontend admin login and root GAS admin verification. |
| `sync_sheet_users` | Active service-role | Called by Places GAS. |
| `update_investigator_profile` | Active service-role | Called only by root GAS after admin password verification. |
| `set_investigator_active` | Active | Admin user manager. |
| `delete_investigator_user` | Active | Admin user manager. |
| `assign_task_language` | Active | Current language assignment UI. |
| `unassign_task_language` | Active | Current language unassignment UI. |
| `approve_task_language` | Active | Current review approval UI. |
| `revoke_task_language_review` | Active | Current review revoke UI. |
| `ensure_task_language_reviews` | Do not remove | Internal helper called by active assignment/review functions. |
| `mark_reviews_sheet_synced` | Active service-role | Called by Places GAS after review writeback. |
| `mark_audio_record_pending_review` | Do not remove | Trigger-used by `audio_records`; direct anon/authenticated execute revoked 2026-06-25. |

Supabase legacy candidates:

| Object | Status | Suggested batch |
| --- | --- | --- |
| `verify_login(text, text)` | Quarantined legacy candidate | Direct anon/authenticated execute revoked 2026-06-25. Current frontend uses `login_investigator`/`login_admin`. |
| `app_assignment_sheet_view` | Legacy candidate | Batch C quarantine in `docs/supabase-cleanup-batch-c-preview.sql`. Superseded by `app_language_assignment_sheet_view`. |
| `assign_tasks_to_user(integer[], text, text)` | Legacy candidate | Batch C quarantine in `docs/supabase-cleanup-batch-c-preview.sql`. Superseded by `assign_task_language`. |
| `unassign_tasks_from_user(integer[], text, text)` | Legacy candidate | Batch C quarantine in `docs/supabase-cleanup-batch-c-preview.sql`. Superseded by `unassign_task_language`. |

## Synchronization design issues

### Direct-browser Supabase access

The current static frontend directly reads app-facing views and calls several RPCs with the anon key. This is active design, not dead code. It keeps the app simple, but it explains why many views and functions are intentionally exposed and why Supabase advisor findings need staged refactors rather than blanket revokes.

Recommendation: keep Batch B/C targeted. Treat a full app-facing view security redesign as a separate architecture project.

### Dual audio logs

Audio upload has two records:

1. Root GAS writes a legacy row to the `Records` Sheet.
2. Frontend writes current metadata to Supabase `audio_records`.

The Supabase row is the current app source. The Sheet `Records` log may still be useful as an operational audit trail, but it should be explicitly decided rather than left as accidental coupling.

### Assignment model layers

The current assignment model is language-specific in `task_language_reviews`, but older generic assignment surfaces still exist:

- `task_assignments`
- `final_tasks.assigned_to`
- `AssignedUsers`
- `AssignmentSyncedAt`
- `app_assignment_sheet_view`
- `assign_tasks_to_user`
- `unassign_tasks_from_user`

Do not delete all of these together. `task_assignments` and `final_tasks.assigned_to` still support compatibility/profile preservation. The old generic view/RPCs can be quarantined first.

### Old Sheet workflows still in menus

The Places GAS menu still exposes old L1/L2/L3 operations. Some may be real human workflows, not dead code. Cleanup should start by removing or hiding menu entries after user approval, then waiting one operating cycle before deleting code.

Batch E/F GAS cleanup previews are in `docs/gas-cleanup-batch-e-f-preview.md`.

## Safest next live change

Batch B + Batch D interim has already been applied and verified.

Use the next roadmap approval after observing that cleanup:

```text
同意執行 Batch C quarantine
```

This quarantines old generic assignment Supabase objects without deleting them.

## Previous first live change already applied

Use the roadmap approval:

```text
同意執行 Batch B + Batch D interim
```

This does not delete active workflows. It only hardens old/public Supabase surfaces and quarantines a dated backup table.
