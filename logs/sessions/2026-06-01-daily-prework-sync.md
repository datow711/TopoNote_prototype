# 2026-06-01 Daily Prework Sync

## Goal

Set up a safer daily GAS/Supabase alignment mechanism that finishes before the workday target of 07:30.

## Design

- Added one master GAS runner: `runDailyPreworkSync`.
- Intended schedule: Asia/Taipei about 06:30 via an Apps Script time-driven trigger.
- Uses `LockService.getScriptLock()` to avoid overlapping scheduled/manual syncs.
- Stores the last run summary in Script Properties: `LAST_DAILY_PREWORK_SYNC`.

## Sync order

1. `syncApprovedReviewsToSheets`
2. `syncThirdPhasePlacesToSupabase`
3. `syncFinalTasksToSupabase`
4. `syncUsersToSupabase`

This order writes pending APP review results first, with Sheet stamp conflict checks, then refreshes Supabase from the Sheet morning baseline.

## GAS helpers

- `installDailyPreworkSyncTrigger`
- `removeDailyPreworkSyncTriggers`
- `getDailyPreworkSyncStatus`

## Notes

- Time-driven triggers are approximate, so the configured 06:30 run is intentionally earlier than 07:30.
- The AuditLogger installable `onEdit` trigger must remain active for reliable `T_UpdatedAt` / `H_UpdatedAt` conflict detection.
- `npx.cmd clasp push` succeeded at 11:01.
- `npx.cmd clasp run installDailyPreworkSyncTrigger` was blocked by the Apps Script Execution API/deployment mode with: `Script function not found. Please make sure script is deployed as API executable.` The same response occurred for existing functions, so manual one-time execution from the Apps Script editor may be required unless the script is redeployed as an API executable.
