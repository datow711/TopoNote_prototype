# 2026-06-08 Assignment unassign flow

## Summary

- Added an admin-facing unassign flow for place assignments.
- Place cards now show each assigned investigator as a removable chip.
- The bottom batch assignment bar now supports both assignment and unassignment for the selected investigator.
- Added Supabase RPC `unassign_tasks_from_user(p_task_ids, p_user_name, p_unassigned_by)`.
- Added Supabase view `app_assignment_sheet_view` for GAS to read current active assignments.
- Added Places GAS `syncTaskAssignmentsToSheets()` and menu item `6. 回寫 APP 指派狀態至工作表`.
- Updated the daily prework runner so APP assignment state is written back to Sheet before Sheet snapshots refresh Supabase.

## Sheet handling

- GAS appends `AssignedUsers` and `AssignmentSyncedAt` only when missing, preserving existing column order.
- The assignment sheet sync writes to `第三期工作清單` and `TestEntries`.
- The assignment sheet view is restricted to `third_phase_places` and `test_places`, avoiding legacy `moi_placename_raw` rows.

## Verification

- `node --check main.js`
- `node --check places-gas/gas/程式碼.js`
- `git diff --check`
- Supabase live migration applied successfully.
- Supabase readback confirmed `unassign_tasks_from_user` exists.
- Supabase readback confirmed `app_assignment_sheet_view` exposes only `test_places` and `third_phase_places` rows.
- No-op RPC smoke test returned `changed_count = 0`.
- Playwright smoke test confirmed the removable assigned-user chip, bottom `撤回指派` button, and correct RPC payload.
