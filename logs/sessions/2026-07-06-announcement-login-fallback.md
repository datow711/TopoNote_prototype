# 2026-07-06 announcement login fallback

## Summary

- Fixed a login regression after the announcement frontend was pushed while the root GAS deployment still returned `未知的操作` for `getAnnouncements`.
- `loadAnnouncementsForCurrentUser()` now treats announcement loading as optional:
  - logs a warning
  - clears unread announcement state
  - sets `state.announcementLoadFailed`
  - does not throw through `enterApp()`
- Opening the announcement dialog now shows a clear temporary service-unavailable message instead of blocking login.
- Added regression coverage for the `未知的操作` case.
- Stabilized the tutorial Playwright test by clicking the tour's `下一步` / `完成` buttons instead of coordinate-clicking the overlay.

## Verification

Passed:

```powershell
node --check main.js
node --check tests\announcements.spec.js
node --check tests\tutorial.spec.js
npx.cmd playwright test tests/tutorial.spec.js tests/announcements.spec.js
npm.cmd run test:ui
```
