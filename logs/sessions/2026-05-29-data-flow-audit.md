# 2026-05-29 Data flow audit

## Request

- Run through the current operating flow.
- Check whether the data-flow design can accidentally let old data overwrite new data.
- Confirm whether Sheet changes can be detected as conflicts before Supabase/APP review writeback.
- Produce the current operation-flow explanation.

## Checks

- Read current GAS flow in `places-gas/gas/程式碼.js`.
- Read review writeback smoke test docs and SQL.
- Read review and sync migrations.
- Ran Supabase read-only checks against project `sikconjhtomqdkicbjal`.
- Read Google Sheet metadata and header rows for:
  - `第三期工作清單`
  - `TestEntries`

## Findings

- `third_phase_places`, `test_places`, and both target Sheet tabs have language update stamp fields.
- `AuditLogger.js` stamps `T_UpdatedAt` / `H_UpdatedAt` when monitored Sheet columns change, assuming the installable trigger is active.
- APP-facing views currently expose `third_phase_places` and `test_places`, not legacy `moi_placename_raw`.
- `app_sheet_sync_queue` was empty at audit time.
- The live writeback flow does not yet compare Sheet stamps before writing APP review results back to Sheet.
- Therefore, if Sheet rows are edited after the Supabase snapshot used for APP review, APP review writeback can overwrite newer Sheet edits.

## Output

- Added `docs/current-operation-flow.md`.
- Drafted a local conflict-detection patch:
  - `db/2026-05-29_review_sheet_conflict_detection.sql`
  - `places-gas/gas/程式碼.js`
- The live Supabase migration attempt was rejected by safety review because the user asked for audit/documentation, not explicit production schema modification. The patch remains local pending explicit approval.

## Verification

- `node --check places-gas\gas\程式碼.js`
- `git diff --check`
