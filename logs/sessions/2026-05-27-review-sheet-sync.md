# 2026-05-27 Review sheet sync

## Summary

- Confirmed the current architecture already marked approved reviews with `task_language_reviews.needs_sheet_sync = true`, but had no GAS job to write those rows back to Google Sheets.
- Added Supabase `app_sheet_sync_queue` for pending approved review rows and `mark_reviews_sheet_synced(p_review_ids bigint[])` for GAS to clear the pending flag after Sheet writes.
- Updated `ensure_task_language_reviews()` so test tasks can seed review state from `test_places` as well as formal tasks from `third_phase_places`.
- Added Places GAS menu item `5. 回寫 APP 審查結果至工作表`.
- Added `TestEntries` support:
  - `source_table = test_places` writes to `TestEntries`.
  - `source_table = third_phase_places` writes to `第三期工作清單`.
  - Test rows are created by UUID if missing.
- Created the real `Places` spreadsheet tab `TestEntries` and seeded `TEST0001` through `TEST0010`.
- Uploaded `places-gas` with `npx clasp push` at 下午 2:27:59.

## Verification

- `node --check places-gas/gas/程式碼.js`
- `git diff --check`
- Supabase query confirmed `app_sheet_sync_queue` exists and currently has `pending_sheet_sync_count = 0`.
- Google Sheets readback confirmed `TestEntries!A1:AH11` has the expected headers and ten test rows.
