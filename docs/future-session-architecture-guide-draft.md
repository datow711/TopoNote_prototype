# TopoNote future-session architecture guide draft

Status: draft before approved live cleanup.
Updated: 2026-06-24.

This is a quick-start guide for a future Codex session. It is not the final handoff requested by the user because live cleanup/refactor work has not been approved or applied yet.

## First things to read

1. `NEXT_ARCHITECTURE_CLEANUP_HANDOFF.md`
2. `docs/architecture-audit-2026-06-24.md`
3. `docs/architecture-cleanup-roadmap.md`
4. `docs/supabase-cleanup-batch-b-d-preview.sql`
5. `logs/timeline.md`
6. Recent `logs/sessions/` entries, especially:
   - `2026-06-23-record-text-editing.md`
   - `2026-06-23-ux-filter-upload-scope.md`
   - `2026-06-08-language-assignment-alignment.md`
   - `2026-05-29-data-flow-audit.md`

## Startup checks

Run from the repo root:

```powershell
git status --short --branch
git remote -v
git log --oneline -8
node --check main.js
node --check gas\程式碼.js
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

If touching Apps Script, also inspect status first:

```powershell
Set-Location gas
npx.cmd clasp status

Set-Location ..\places-gas
npx.cmd clasp status
```

Do not push/deploy GAS unless the user explicitly approves that step.

## Durable identifiers

- Supabase project ref: `sikconjhtomqdkicbjal`
- Places spreadsheet id: `19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
- Root GAS script id: `16gtyfpxsC17zIBK3Ixd97yPRBi9IUIkkk3B8V8_CId2WSZ9iwIAwqTsi`
- Root GAS active frontend deployment URL id: `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw`
- Places GAS script id: `18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`

## Current repo roles

- `index.html`, `config.js`, `main.js`, `style.css`, `sw.js`: static frontend app.
- `gas/`: active root Apps Script Web App backend for audio upload/playback, feedback, and admin profile write-through.
- `places-gas/gas/`: Places spreadsheet-bound Apps Script sync/admin tooling.
- `db/`: historical SQL migrations and smoke checks.
- `docs/`: current architecture, audit, and pending cleanup docs.
- `tests/`: Playwright coverage for admin profile and language assignment behavior.
- `logs/`: timeline and session context.

## Live cleanup status

No live cleanup has been applied as of this draft.

The first recommended approved live scope is:

1. Revoke direct public execute on `mark_audio_record_pending_review()`.
2. Revoke direct public execute on old `verify_login(text, text)`.
3. Add index `audio_records_task_id_idx` on `audio_records(task_id)`.
4. Enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`, unless the user approves dropping that backup table.

Use `docs/supabase-cleanup-batch-b-d-preview.sql` as the execution checklist after explicit approval.
Use `docs/architecture-cleanup-roadmap.md` for the staged approval order beyond the first SQL batch.

## Approval boundary

Do not execute live Supabase SQL until the user explicitly approves the exact batch.

Acceptable approval examples:

- `請執行 Batch B`
- `請執行 Batch B + Batch D interim`
- `請刪除 codex_backup_phone_field_state_20260610`

If the user approves only Batch B, do not touch the backup table.

## Architecture invariants

- UI display prefers names, but login/filtering/assignment/DB writes remain account/email based where the existing contract requires it.
- Root `gas/` is active. Do not delete it.
- `places-gas/` is active for spreadsheet-bound sync. Do not merge it into root `gas/`.
- Do not delete `moi_placename_raw`, `task_assignments`, `final_tasks.assigned_to`, or old Sheet tabs without a separate retention decision.
- `mark_audio_record_pending_review` is trigger-used. Revoke direct execute only; do not drop it.
- `ensure_task_language_reviews` is internally used by active RPCs. Do not treat it as dead code.

## After live cleanup

After applying any approved cleanup:

1. Run the SQL post-change checks in `docs/supabase-cleanup-batch-b-d-preview.sql`.
2. Run Supabase security and performance advisors.
3. Run local syntax and whitespace checks.
4. Update `docs/architecture-audit-2026-06-24.md` with what was applied.
5. Replace this draft with the final future-session handoff requested by the user.
6. Update the human developer README draft into the final README requested by the user.
