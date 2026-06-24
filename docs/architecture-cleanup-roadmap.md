# TopoNote architecture cleanup roadmap

Updated: 2026-06-24.

This roadmap converts the architecture audit into staged work. It is intentionally conservative: live Supabase, Apps Script, and Google Sheet changes require explicit user approval for the exact batch.

## Current state

- Audit docs exist and are committed locally.
- Future-session and human-developer architecture docs exist only as drafts.
- No live Supabase schema/data change has been applied.
- No Google Sheet content has been changed.
- No Apps Script push or deployment has been run.

## How to use this roadmap

For each batch:

1. Re-run the listed preflight checks.
2. Apply only the approved changes.
3. Run the listed verification checks.
4. Update `docs/architecture-audit-2026-06-24.md` with actual results.
5. Update the draft architecture docs only after the batch is verified.

## Batch A - documentation and decision framing

Status: completed locally, with drafts still marked pending.

Purpose:

- Preserve the current architecture understanding.
- Separate current active flows from stale candidates.
- Keep final handoff docs blocked until approved live cleanup is done.

Already produced:

- `NEXT_ARCHITECTURE_CLEANUP_HANDOFF.md`
- `docs/architecture-audit-2026-06-24.md`
- `docs/supabase-cleanup-batch-b-d-preview.sql`
- `docs/future-session-architecture-guide-draft.md`
- `docs/human-developer-architecture-readme-draft.md`

## Batch B - low-risk Supabase hardening

Requires explicit approval.

Suggested approval phrase:

```text
同意執行 Batch B
```

Changes:

- Revoke direct public execute on trigger-only `mark_audio_record_pending_review()`.
- Revoke direct public execute on old `verify_login(text, text)`.
- Add `audio_records_task_id_idx` on `audio_records(task_id)`.

Why:

- `mark_audio_record_pending_review()` is trigger-used and should not be callable as a direct public RPC.
- `verify_login(text, text)` is an old auth path; current frontend uses `login_investigator` and `login_admin`.
- `audio_records.task_id` has a foreign key but no supporting index.

Preflight:

- Confirm `mark_audio_record_pending_review()` is still attached to `audio_records`.
- Confirm no current frontend code calls `/rpc/verify_login`.
- Confirm the index does not already exist.

Verification:

- Check function execute grants no longer include `anon`, `authenticated`, or `public` for the two functions.
- Check the new index exists.
- Re-run Supabase security and performance advisors.

Rollback:

- Re-grant execute on the affected functions only if an old client is proven to need them.
- Drop `audio_records_task_id_idx` only if it causes an unexpected write regression.

## Batch D interim - backup table quarantine

Requires explicit approval.

Suggested approval phrase:

```text
同意執行 Batch D interim
```

Changes:

- Enable RLS on `codex_backup_phone_field_state_20260610`.
- Revoke public, anon, and authenticated table access.
- Keep `service_role` read access.

Why:

- The table appears to be a dated backup object.
- It is in the exposed `public` schema and was advisor-flagged because RLS is disabled.
- There is no local code reference that requires frontend access.

Verification:

- Confirm RLS is enabled.
- Confirm public/anon/authenticated grants are gone.
- Re-run Supabase security advisor.

Alternative:

- If the user explicitly confirms the backup is no longer needed, replace this batch with an export-and-drop workflow.

## Batch C - old generic assignment Supabase quarantine

Requires explicit approval after Batch B.

Suggested approval phrase:

```text
同意執行 Batch C quarantine
```

Changes:

- Revoke public access to `app_assignment_sheet_view`.
- Revoke direct public execute on `assign_tasks_to_user(integer[], text, text)`.
- Revoke direct public execute on `unassign_tasks_from_user(integer[], text, text)`.
- Keep the view and functions for one verification period.

Why:

- Current frontend uses language-specific RPCs: `assign_task_language` and `unassign_task_language`.
- Current Places GAS reads `app_language_assignment_sheet_view`, not `app_assignment_sheet_view`.
- The old view still returns rows, so deleting it immediately would be riskier than quarantining first.

Preflight:

- Search current local code for `app_assignment_sheet_view`, `assign_tasks_to_user`, and `unassign_tasks_from_user`.
- Confirm Places GAS still reads `app_language_assignment_sheet_view`.
- Check Supabase function/view grants.

Verification:

- Current assignment UI still works.
- Places GAS assignment writeback still reads `app_language_assignment_sheet_view`.
- Supabase advisors no longer flag the old generic assignment functions for direct public execution.

Drop decision:

- Drop these objects only after a full work cycle with no hidden old integration depending on them.

## Batch F - root GAS legacy login quarantine

Requires explicit approval because it changes a live Web App route.

Suggested approval phrase:

```text
同意移除 root GAS legacy login route
```

Changes:

- Remove the `action === 'login'` route from root `gas/程式碼.js`, or make it return a disabled legacy-route error.
- Keep `upload`, `getAudio`, `submitFeedback`, and `updateUserProfile` unchanged.
- Push root GAS and update deployment only after local syntax checks.

Why:

- Current frontend does not send `action: 'login'`.
- Current login goes through Supabase RPCs.
- The old route reads `Users`, `Assignments`, `Records`, and `Places`, which belongs to the older Sheet-driven app model.

Preflight:

- Confirm `config.js` root GAS URL points at the active deployment.
- Confirm no current frontend code sends `action: 'login'`.
- Confirm whether any archived or external old frontend deployment is still used.

Verification:

- Browser login still works through Supabase RPC.
- Audio upload/playback still works through root GAS.
- Feedback still works through root GAS.
- Admin profile write-through still works through root GAS.

## Batch E - Places GAS old menu quarantine

Requires explicit user decision because it affects spreadsheet operators.

Suggested approval phrase:

```text
同意先從 Places GAS 選單移除舊 L3 satellite push/pull
```

Changes:

- Remove menu entries for `pushTasksToSatelliteSheets` and `pullResultsFromSatelliteSheets`.
- Keep the functions in code for one verification period.
- Later remove the functions only if no operator needs the satellite-sheet workflow.

Why:

- Current app assignment/review synchronization uses Supabase views and language-specific state.
- The old satellite flow uses `書面標注員名單` and separate annotator spreadsheets.
- Keeping unused menu entries makes the operational model look more complicated than it is.

Preflight:

- Ask whether any human operator still uses L3 satellite push/pull.
- Confirm whether `書面標注員名單` should remain as historical reference.

Verification:

- Places GAS menu still includes current sync actions:
  - daily prework sync trigger controls
  - third-phase sync
  - final task sync
  - review writeback
  - assignment writeback
  - Users sync
- No current sync route calls the removed menu items.

## Batch G - Google Sheet retention decisions

Requires explicit human retention decisions.

Candidates:

- `Places`
- `Assignments`
- `Records`
- `Final_Tasks`
- `AssignedUsers`
- `AssignmentSyncedAt`
- `書面標注員名單`

Recommended process:

1. Do not delete first.
2. Hide or move to an `Archive_*` naming scheme after approval.
3. Wait one operating cycle.
4. Delete only after confirming no old GAS route or human workflow uses them.

Do not archive yet:

- `第三期工作清單`
- `Users`
- `TestEntries`
- checkpoint sheets that are still within retention

## Batch H - app-facing Supabase view security refactor

Requires a larger design decision.

Issue:

- App-facing views are advisor-flagged as `SECURITY DEFINER`.
- The current static frontend still directly reads Supabase through the anon key.

Do not attempt as a quick cleanup:

- Blanket-revoking app view access would break the frontend.
- Replacing all direct Supabase reads requires a backend/API design decision.

Future options:

1. Keep the current direct Supabase model and accept the view pattern with documented scope.
2. Move sensitive reads/writes behind Apps Script or another backend and tighten direct frontend grants.
3. Redesign RLS/view ownership so advisors stop flagging the app-facing reads without losing functionality.

## Current recommended next approval

The safest first live step is:

```text
同意執行 Batch B + Batch D interim
```

This reduces exposed-surface risk without changing the user-facing workflow.

## Final docs gate

The two final Markdown docs requested by the user should be produced only after approved live cleanup/refactor work is applied and verified:

1. Future-session development handoff.
2. Human-developer architecture README.

Until then, keep the draft files explicitly marked as drafts.
