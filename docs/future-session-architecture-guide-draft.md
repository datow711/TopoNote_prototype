# TopoNote future-session architecture guide draft

Status: draft after approved cleanup through Batch H2 implementation branch; not final.
Updated: 2026-06-26.

This is a quick-start guide for a future Codex session. It is not the final handoff requested by the user because live cleanup/refactor work has not been approved or applied yet.

## First things to read

1. `NEXT_ARCHITECTURE_CLEANUP_HANDOFF.md`
2. `docs/architecture-audit-2026-06-24.md`
3. `docs/architecture-goal-status.md`
4. `docs/architecture-inventory.md`
5. `docs/architecture-cleanup-roadmap.md`
6. `docs/google-sheet-retention-matrix.md`
7. `docs/supabase-app-facing-security-design.md`
8. `docs/supabase-advisor-snapshot-2026-06-26.md`
9. `docs/h2-set-investigator-active-wrapper-plan.md`
10. `docs/supabase-cleanup-batch-b-d-preview.sql`
11. `docs/supabase-cleanup-batch-c-preview.sql`
12. `docs/gas-cleanup-batch-e-f-preview.md`
13. `logs/timeline.md`
14. Recent `logs/sessions/` entries, especially:
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

Batch B + Batch D interim and Batch C assignment quarantine were applied and verified on 2026-06-25. Batch F root GAS legacy login route quarantine was pushed, deployed, and smoke-tested on 2026-06-25. Batch E documentation correction reclassified L3 satellite push/pull as an active separate Sheet workflow. Batch G phase 1 created a Sheet retention matrix. Batch H phase 0 created a Supabase app-facing security design memo. Batch H1 recorded the live Supabase advisor baseline. Batch H2 prep planned the `set_investigator_active` backend wrapper. Batch H2 implementation branch now routes that toggle through root GAS and deploys Web App version 22. Apps Script authorization is complete and fake-password smoke testing passed; manual app toggle validation is still pending. This draft is still not final because later cleanup/refactor batches remain pending.

Applied first approved live scope:

1. Revoke direct public execute on `mark_audio_record_pending_review()`.
2. Revoke direct public execute on old `verify_login(text, text)`.
3. Add index `audio_records_task_id_idx` on `audio_records(task_id)`.
4. Enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`, unless the user approves dropping that backup table.

Use `db/2026-06-25_batch_b_d_interim_cleanup.sql` as the applied SQL record.
Use `db/2026-06-25_batch_c_assignment_quarantine.sql` as the Batch C applied SQL record.
Use `docs/architecture-cleanup-roadmap.md` for the staged approval order beyond the first SQL batch.

## Approval boundary

Do not execute live Supabase SQL until the user explicitly approves the exact batch.

Batch C, Batch F, and Batch E documentation correction are already complete. For the next live change, explain the candidate batch first, then wait for a fresh explicit approval.

Historical approval examples after Batch B + D interim:

- `同意執行 Batch C quarantine`
- `同意移除 root GAS legacy login route`
- `同意先從 Places GAS 選單移除舊 L3 satellite push/pull` (superseded by documentation correction: L3 satellite is active separate Sheet workflow)

Batch B + Batch D interim, Batch C, and Batch F are already complete. Do not rerun them unless a rollback/replay need is explicit.

Batch H2 implementation is not ready to merge until the admin active toggle is manually validated.

Historical pre-Batch B+D approval examples:

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

1. Run the SQL post-change checks in the relevant preview file.
2. Run Supabase security and performance advisors.
3. Run local syntax and whitespace checks.
4. Update `docs/architecture-audit-2026-06-24.md` with what was applied.
5. Replace this draft with the final future-session handoff requested by the user.
6. Update the human developer README draft into the final README requested by the user.
