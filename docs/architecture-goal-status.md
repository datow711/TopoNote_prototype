# TopoNote architecture goal status

Updated: 2026-06-24.

This document tracks the original architecture cleanup goal against current evidence. It is not a replacement for the audit; it is a completion and approval matrix so future work can tell what is done, what is still blocked by approval, and what evidence is required before the goal can be marked complete.

## Current overall status

The goal is not complete yet.

Completed so far:

- Project architecture has been audited across frontend, root GAS, Places GAS, Google Sheet tabs, and Supabase.
- Stale or awkward candidates have been identified and grouped.
- Cleanup batches and review-only execution previews have been created.
- Two architecture docs requested by the user exist as drafts only.
- No live Supabase, Google Sheet, or Apps Script changes have been applied.

Still required:

- Explicit user approval for one or more live cleanup batches.
- Apply and verify the approved batches.
- Update audit/inventory/roadmap with actual post-change evidence.
- Convert the two draft architecture docs into final docs after cleanup.

## Safest next approval

Recommended next approval phrase:

```text
同意執行 Batch B + Batch D interim
```

This would approve:

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
| Include GAS backend | Done for audit | Root GAS and Places GAS covered in audit, inventory, and GAS preview | Apply Batch E/F only after approval. |
| Include related Google forms/sheets | Done for audit | Sheet tabs and sync flows covered in audit/inventory | Human retention decisions still needed for old tabs/columns. |
| Include frontend code | Done for audit | Frontend entrypoints, Supabase calls, and root GAS actions covered in inventory | No frontend cleanup applied yet. |
| Include Supabase | Done for audit | Supabase tables/views/RPCs/security candidates covered in audit/inventory/SQL previews | Live SQL changes still pending approval. |
| Identify unused/stale data/tables/functions | Done as candidates | Legacy candidates listed in inventory and roadmap | Quarantine/drop only after approved batches and observation. |
| Identify over-complex or poor sync design | Done as design issues | Direct-browser Supabase access, dual audio logs, layered assignment model, old Sheet workflows documented in inventory | Refactor decisions remain staged; no behavior change applied yet. |
| Organize delete/refactor targets | Done | `docs/architecture-cleanup-roadmap.md`, preview files | Execute only approved batches. |
| Adjust gradually after permission | Not started | No live changes applied by design | Needs explicit user approval. |
| Produce final future-session MD after adjustment | Draft only | `docs/future-session-architecture-guide-draft.md` | Replace with final after approved cleanup is applied and verified. |
| Produce final human developer README after adjustment | Draft only | `docs/human-developer-architecture-readme-draft.md` | Replace with final after approved cleanup is applied and verified. |

## Approval matrix

| Batch | Approval phrase | Scope | Risk | Rollback |
| --- | --- | --- | --- | --- |
| B | `同意執行 Batch B` | Supabase function grant hardening and `audio_records(task_id)` index | Low; no current UI behavior should change | Re-grant execute or drop index if a regression is proven. |
| D interim | `同意執行 Batch D interim` | Quarantine dated backup table with RLS/revokes | Low to medium; affects only direct access to a backup table | Re-grant old table privileges if a hidden dependency is proven. |
| B + D interim | `同意執行 Batch B + Batch D interim` | Recommended first combined live change | Low; no active workflow deletion | Use preview rollback sections. |
| C quarantine | `同意執行 Batch C quarantine` | Revoke access to old generic assignment view/RPCs | Medium; should be after Batch B and preflight | Re-grant old view/RPC privileges if needed. |
| F | `同意移除 root GAS legacy login route` | Disable root GAS Sheet-based login route | Medium; requires GAS push/deploy and manual app checks | Restore old route and redeploy. |
| E | `同意先從 Places GAS 選單移除舊 L3 satellite push/pull` | Hide old satellite Push/Pull menu entries | Medium; affects spreadsheet operators | Restore menu entries and push. |
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
- `docs/supabase-cleanup-batch-c-preview.sql`: old generic assignment quarantine SQL preview.
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
