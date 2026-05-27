# 2026-05-27 Users role guard

## Summary

- Checked the newly synced investigator account in Supabase:
  - `tanliangkun@mail.naer.edu.tw`
  - `role = user`
  - `is_active = true`
- Confirmed `login_investigator()` returns this account as `user`, while `login_admin()` does not return it.
- Added a visible `role` column to the Places `Users` sheet while keeping `active` as the final column.
- Updated Places GAS Users sync:
  - Requires the original user profile columns plus `active`.
  - Treats blank role as `user`.
  - Skips rows whose role is not `user`.
- Hardened `sync_sheet_users()` in Supabase so non-`user` role payloads are skipped even if called directly.
- Hardened frontend login:
  - Investigator login only accepts `role = user`.
  - Admin login only accepts `role = admin`.
  - Clears stale session before a new login attempt.

## Verification

- Readback confirmed `Users!A1:M6` includes `role` before `active`; the admin row is `admin`, the new investigator row is `user`.
- `node --check main.js`
- `node --check places-gas/gas/程式碼.js`
- `git diff --check`
- `npx clasp push` succeeded at 下午 2:43:25.
- Supabase role guard test with `role=admin` payload created zero rows.
