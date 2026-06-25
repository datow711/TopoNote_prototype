# TopoNote architecture goal status

Updated: 2026-06-25.

This document tracks the original architecture cleanup goal against current evidence. It is not a replacement for the audit; it is a completion and approval matrix so future work can tell what is done, what is still blocked by approval, and what evidence is required before the goal can be marked complete.

## Current overall status

The goal is not complete yet.

Completed so far:

- Project architecture has been audited across frontend, root GAS, Places GAS, Google Sheet tabs, and Supabase.
- Stale or awkward candidates have been identified and grouped.
- Cleanup batches and review-only execution previews have been created.
- Batch B + Batch D interim has been applied and verified on 2026-06-25.
- Batch C assignment quarantine has been applied and verified on 2026-06-25.
- Batch F root GAS legacy login route quarantine has been pushed, deployed, and smoke-tested on 2026-06-25.
- Batch E documentation correction reclassified L3 satellite push/pull as an active separate Sheet workflow; no Places GAS code/menu change was made.
- Batch G phase 1 created a Google Sheet retention matrix; no Sheet content was changed.
- Two architecture docs requested by the user exist as drafts only.
- No Google Sheet content has been changed. Root GAS code has been changed and deployed for Batch F.

Still required:

- Explicit user approval for any further cleanup batch.
- Apply and verify only the next approved batches.
- Convert the two draft architecture docs into final docs after cleanup.

## Latest applied cleanup

Applied on branch `codex/batch-c-assignment-quarantine` on 2026-06-25:

- `app_assignment_sheet_view`: `anon` and `authenticated` grants were removed; `service_role` access remains.
- `assign_tasks_to_user(integer[], text, text)`: `anon` and `authenticated` execute are now false; `service_role` execute remains true.
- `unassign_tasks_from_user(integer[], text, text)`: `anon` and `authenticated` execute are now false; `service_role` execute remains true.
- Current assignment surfaces were intentionally left unchanged: `app_language_assignment_sheet_view`, `assign_task_language(integer[], text, text, text)`, and `unassign_task_language(integer[], text, text)`.

Live verification evidence:

- Supabase security advisor no longer reports `app_assignment_sheet_view` in the security-definer view list.
- Supabase security advisor no longer reports `assign_tasks_to_user` or `unassign_tasks_from_user` as anon/authenticated executable security-definer functions.
- Supabase performance advisor did not add any Batch C-specific finding.

SQL record:

- `db/2026-06-25_batch_c_assignment_quarantine.sql`

## Previous applied cleanup

Applied on branch `codex/batch-b-d-interim-cleanup` on 2026-06-25:

- `mark_audio_record_pending_review()`: `anon` and `authenticated` execute are now false; `service_role` execute remains true.
- `verify_login(text, text)`: `anon` and `authenticated` execute are now false; `service_role` execute remains true.
- `audio_records_task_id_idx` now exists on `public.audio_records(task_id)`.
- `codex_backup_phone_field_state_20260610` now has RLS enabled.
- `codex_backup_phone_field_state_20260610` table grants are removed from `anon` and `authenticated`; `service_role` access remains.

Live verification evidence:

- `trg_audio_records_pending_review` still exists on `audio_records`.
- Supabase security advisor no longer reports `mark_audio_record_pending_review` or `verify_login` as anon/authenticated executable security-definer functions.
- Supabase performance advisor no longer reports the original missing `audio_records.task_id` FK index finding.

Expected advisor residuals:

- `codex_backup_phone_field_state_20260610` now reports `RLS Enabled No Policy` as info because the interim quarantine intentionally has no anon/authenticated policies.
- `codex_backup_phone_field_state_20260610` still reports `No Primary Key`; it remains a quarantined backup table, not an active app table.
- `audio_records_task_id_idx` reports as `Unused Index` immediately after creation; this is expected until production queries use it.
- Other app-facing view/function advisor findings remain for later batches.

SQL record:

- `db/2026-06-25_batch_b_d_interim_cleanup.sql`

## Safest next approval

Batch C is already complete. No next live change is pre-approved. For the next refactor step, explain the candidate batch first, then wait for fresh user approval.

Historical recommended approval phrase after observing Batch B + D interim:

```text
同意執行 Batch C quarantine
```

This already approved quarantining old generic assignment Supabase objects only:

- Revoke public access to old `app_assignment_sheet_view`.
- Revoke public execute on old `assign_tasks_to_user(integer[], text, text)`.
- Revoke public execute on old `unassign_tasks_from_user(integer[], text, text)`.
- Keep these objects for one observation period before any drop decision.

Execution checklist:

- `docs/supabase-cleanup-batch-c-preview.sql`

## Previous approval already applied

Historical first-step approval phrase:

```text
同意執行 Batch B + Batch D interim
```

This already approved:

- Revoke direct public execute on trigger-only `mark_audio_record_pending_review()`.
- Revoke direct public execute on old `verify_login(text, text)`.
- Add `audio_records_task_id_idx` on `audio_records(task_id)`.
- Enable RLS and revoke public access on `codex_backup_phone_field_state_20260610`.

It would not approve:

- Dropping any table.
- Removing any GAS function.
- Pushing or deploying Apps Script.
- Hiding or deleting any Google Sheet tab.
- Changing current frontend behavior.

Execution checklist:

- `docs/supabase-cleanup-batch-b-d-preview.sql`

## Objective completion matrix

| Original requirement | Current status | Evidence | What remains |
| --- | --- | --- | --- |
| Scan project architecture | Substantially done | `docs/architecture-audit-2026-06-24.md`, `docs/architecture-inventory.md` | Re-check live state before applying any approved live batch. |
| Include GAS backend | Done for audit | Root GAS and Places GAS covered in audit, inventory, and GAS preview; Batch F deployed; Batch E corrected L3 satellite classification | Further GAS cleanup still needs approval. |
| Include related Google forms/sheets | Done for audit | Sheet tabs and sync flows covered in audit/inventory; retention matrix added in `docs/google-sheet-retention-matrix.md` | Human approval still required before any hide/archive/delete action. |
| Include frontend code | Done for audit | Frontend entrypoints, Supabase calls, and root GAS actions covered in inventory | No frontend cleanup applied yet. |
| Include Supabase | Partially cleaned | Supabase tables/views/RPCs/security candidates covered in audit/inventory/SQL previews; Batch B + D interim and Batch C applied 2026-06-25 | Further batches still need approval. |
| Identify unused/stale data/tables/functions | Done as candidates | Legacy candidates listed in inventory and roadmap | Quarantine/drop only after approved batches and observation. |
| Identify over-complex or poor sync design | Done as design issues | Direct-browser Supabase access, dual audio logs, layered assignment model, old Sheet workflows documented in inventory | Refactor decisions remain staged; no behavior change applied yet. |
| Organize delete/refactor targets | Done | `docs/architecture-cleanup-roadmap.md`, preview files | Execute only approved batches. |
| Adjust gradually after permission | Started | Batch B + D interim and Batch C applied and verified 2026-06-25; Batch F pushed/deployed/smoke-tested; Batch E documentation correction applied | Further batches still need explicit approval. |
| Produce final future-session MD after adjustment | Draft only | `docs/future-session-architecture-guide-draft.md` | Replace with final after approved cleanup is applied and verified. |
| Produce final human developer README after adjustment | Draft only | `docs/human-developer-architecture-readme-draft.md` | Replace with final after approved cleanup is applied and verified. |

## Approval matrix

Status note: Batch B, Batch D interim, the combined Batch B + D interim scope, Batch C, and Batch F were approved, applied, and verified on 2026-06-25. The remaining approval phrases below are for future batches only.

| Batch | Approval phrase | Scope | Risk | Rollback |
| --- | --- | --- | --- | --- |
| B | `同意執行 Batch B` | Supabase function grant hardening and `audio_records(task_id)` index | Low; no current UI behavior should change | Re-grant execute or drop index if a regression is proven. |
| D interim | `同意執行 Batch D interim` | Quarantine dated backup table with RLS/revokes | Low to medium; affects only direct access to a backup table | Re-grant old table privileges if a hidden dependency is proven. |
| B + D interim | `同意執行 Batch B + Batch D interim` | Recommended first combined live change | Low; no active workflow deletion | Use preview rollback sections. |
| C quarantine | `同意執行 Batch C quarantine` | Revoke access to old generic assignment view/RPCs | Applied and verified 2026-06-25 | Re-grant old view/RPC privileges if needed. |
| F | `同意移除 root GAS legacy login route` | Disable root GAS Sheet-based login route | Pushed/deployed/smoke-tested 2026-06-25; user manual app checks still recommended | Restore old route and redeploy. |
| E doc correction | `批准` after L3 satellite clarification | Document L3 satellite Push/Pull as active separate Sheet workflow; no GAS code/menu change | Documentation-only | Revert documentation commit if this classification changes. |
| G | No single safe phrase yet | Sheet tab/column retention, hide/archive/delete decisions | Medium to high; human data retention | Restore from backup/checkpoint/export if available. |
| H | No single safe phrase yet | App-facing Supabase view/RLS/security redesign | High; can break frontend if rushed | Requires separate design and staged migration. |

## Non-removal rules

Do not remove these without a separate explicit decision:

- root `gas/`
- `places-gas/`
- `moi_placename_raw`
- `task_assignments`
- `final_tasks.assigned_to`
- `ensure_task_language_reviews`
- `mark_audio_record_pending_review`
- `第三期工作清單`
- `Users`
- `TestEntries`
- old Sheet tabs before retention decision

## Current documentation map

- `NEXT_ARCHITECTURE_CLEANUP_HANDOFF.md`: session handoff for this ongoing cleanup.
- `docs/architecture-audit-2026-06-24.md`: audit evidence and findings.
- `docs/architecture-inventory.md`: active/legacy/retention object inventory.
- `docs/architecture-cleanup-roadmap.md`: staged cleanup plan.
- `docs/supabase-cleanup-batch-b-d-preview.sql`: first recommended SQL preview.
- `db/2026-06-25_batch_b_d_interim_cleanup.sql`: applied SQL record for Batch B + D interim.
- `docs/supabase-cleanup-batch-c-preview.sql`: old generic assignment quarantine SQL preview.
- `db/2026-06-25_batch_c_assignment_quarantine.sql`: applied SQL record for Batch C assignment quarantine.
- `docs/gas-cleanup-batch-e-f-preview.md`: GAS behavior-change execution preview.
- `docs/future-session-architecture-guide-draft.md`: draft future-session doc, not final.
- `docs/human-developer-architecture-readme-draft.md`: draft human developer README, not final.

## Completion gate

Before marking the goal complete:

1. Confirm which batches the user approved.
2. Apply only those batches.
3. Verify live Supabase/GAS/Sheet behavior with the preview post-checks.
4. Update audit, inventory, roadmap, and this status file with actual results.
5. Replace the two draft architecture docs with final docs.
6. Run local checks:

```powershell
git status --short --branch
node --check main.js
node --check gas\程式碼.js
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

7. Confirm no required cleanup or final doc deliverable remains.
