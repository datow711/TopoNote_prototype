# 2026-06-08 Language Assignment Alignment

## Goal

Align APP place assignment with the original Sheet total-list model: one 台語 investigator and one 客語 investigator per place, with assignment state written back to the original Sheet language columns.

## Changes

- Added `assigned_to`, `assigned_by`, and `assigned_at` to `task_language_reviews`.
- Added `assign_task_language()` and `unassign_task_language()` RPCs.
- Rebuilt APP-facing views so admin cards can read `t_assignee` and `h_assignee`.
- Added `app_language_assignment_sheet_view` for GAS writeback.
- Updated admin UI cards with separate 台語 / 客語 controls, plus language-aware batch assignment and unassignment.
- Updated Places GAS `syncTaskAssignmentsToSheets()` to write `T_State/T_Annotator/T_UpdatedAt` and `H_State/H_Annotator/H_UpdatedAt`, instead of adding `AssignedUsers` fields.

## Verification

- Live Supabase readback confirmed new `task_language_reviews` columns, RPCs, and view columns.
- `node --check main.js`
- `node --check places-gas/gas/程式碼.js`
- `git diff --check`
- `npx.cmd playwright test tests/language-assignment.spec.js`

## Notes

The older generic multi-user assignment table remains as compatibility fallback, but the APP and GAS flow now treat per-language assignment in `task_language_reviews` as the source of truth.

## 2026-06-09 Follow-up

- Moved existing legacy assignments into 台語 assignment in live Supabase: 184 台語 assignees, 0 客語 assignees.
- Narrowed `app_language_assignment_sheet_view` so GAS only receives language rows marked `needs_sheet_sync`, avoiding broad Sheet rewrites.
- Updated GAS assignment writeback so an empty language state is skipped instead of defaulting to `待指派`.
- `npx.cmd clasp push` succeeded from `places-gas/` at 上午8:49:37.
