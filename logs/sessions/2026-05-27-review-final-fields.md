# 2026-05-27 Review final fields

## Summary

- Reworked admin review UI so each place/language block has:
  - Compact grid cards for every audio record.
  - Playback button per record.
  - Visible per-record annotation fields.
  - Per-field copy buttons that fill the final adjudication input.
  - Empty final adjudication inputs for Sheet-bound fields.
- Final adjudication fields:
  - 台語: `TaiHan1`, `TL1`, `TL2`, `TL3`, `TaiNote`
  - 客語: `Honzii`, `HP1`, `HP2`, `HP3`, `HDialect`, `HakNote`
- Added `task_language_reviews.final_fields jsonb`.
- Recreated `approve_task_language()` to accept `p_fields jsonb` and store final adjudication data.
- Recreated `app_sheet_sync_queue` to expose `final_fields`.
- Updated Places GAS Sheet sync to prioritize `final_fields` when writing approved reviews back to `第三期工作清單` or `TestEntries`.
- Uploaded `places-gas` with `npx clasp push` at 下午 4:24:17.

## Verification

- `node --check main.js`
- `node --check places-gas/gas/程式碼.js`
- `git diff --check`
- Supabase checks confirmed:
  - `task_language_reviews.final_fields` exists.
  - `approve_task_language()` now has `p_fields jsonb`.
  - `app_sheet_sync_queue` exposes `final_fields`.

## Note

- Browser visual verification was attempted, but the in-app browser runtime hit the known Windows sandbox setup failure in this Google Drive checkout.
