# 2026-07-06 announcements live deploy

## Summary

- Applied `db/2026-07-06_announcements.sql` to live Supabase project `sikconjhtomqdkicbjal`.
- Verified live table/function security:
  - `announcements` and `announcement_reads` have RLS enabled.
  - `anon` and `authenticated` have no direct table select access.
  - announcement RPCs are executable by `service_role` only.
- Fixed `mark_announcement_read(...)` after rollback smoke found an ambiguous `announcement_id` reference in `on conflict`.
  - Local migration now uses `on conflict on constraint announcement_reads_pkey`.
  - Live function was replaced with the same fix.
- Ran rollback smoke test:
  - temporary targeted announcement was created inside a transaction.
  - target account could see it before read.
  - `mark_announcement_read` worked.
  - target account saw it as read.
  - a different account could not see it.
  - transaction was rolled back, leaving no smoke rows.
- Pushed root GAS with `clasp push`.
- Updated the existing Web App deployment used by `config.js`:
  - deployment id `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw`
  - `clasp deploy -i ... -d "Add announcements"` returned `@26`.
- Live Web App smoke call to `getAnnouncements` returned `success: true`, so the previous `未知的操作` condition is gone.

## Notes

- `clasp deployments` still displayed the old description line after deploy, but the direct Web App smoke confirmed the active URL runs the announcement action.
- No persistent smoke announcement rows remained after rollback verification.
