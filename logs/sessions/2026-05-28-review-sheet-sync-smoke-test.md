# 2026-05-28 Review sheet sync smoke test

## Request

- Add a small smoke-test or documented checklist for the APP review -> Sheet writeback flow.
- TEST0001 has already been manually verified by the user.

## Changes

- Added `docs/review-sheet-sync-smoke-test.md` with the TEST0001 smoke-test checklist, GAS steps, pass/fail criteria, and Sheet fields to inspect.
- Added `db/smoke_review_sheet_sync.sql` with read-only Supabase checks for task routing, review state, pending queue rows, unexpected TEST routing, and queue summary.

## Verification

- `git diff --check`
