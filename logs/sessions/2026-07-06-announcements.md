# 2026-07-06 announcements

## Summary

- Added an announcement feature for investigator/admin communication.
- Investigators get an `公告` button in the login action bar with a red unread-count badge.
- Opening the announcement dialog shows visible announcements and requires clicking `已讀` before the badge clears.
- Admins get `公告管理` in the same action bar, with a compose form for all investigators or one selected investigator.
- Announcement reads and writes are routed through root GAS actions:
  - `getAnnouncements`
  - `markAnnouncementRead`
  - `createAnnouncement`
- Supabase migration is prepared in `db/2026-07-06_announcements.sql`.

## Security note

- The first live Supabase apply attempt was rejected because anon-callable `SECURITY DEFINER` announcement RPCs with caller-supplied account parameters would expose targeted announcement data.
- The local migration was revised so announcement RPCs are granted only to `service_role`.
- Frontend code now calls root GAS only; root GAS calls the Supabase RPCs with `SUPABASE_SERVICE_ROLE_KEY`.
- Live Supabase migration and GAS deployment still need explicit approval before applying to production.

## Verification

Passed:

```powershell
node --check main.js
node --check gas\程式碼.js
node --check tests\announcements.spec.js
git diff --check
npx.cmd playwright test tests/announcements.spec.js
npm.cmd run test:ui
```

`git diff --check` only reported Windows LF-to-CRLF warnings for edited files.

## Pending

- Apply `db/2026-07-06_announcements.sql` to Supabase after explicit approval.
- Push/deploy root GAS after explicit approval so the web app can call the new announcement actions.
- Discuss the separate usage tutorial/onboarding feature after announcement rollout is live.
