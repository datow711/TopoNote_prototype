# 2026-05-26 Investigator tabs regression fix

## Issue
- After admin UI work, investigator login could inherit admin-only DOM state.
- The admin flow changed the assigned tab label to `全部地名清單` and hid the `其他地名` tab, but the investigator flow did not restore those controls.
- The admin assignee filter could also remain in the filter area after role changes.

## Fix
- Added `configureRoleUI()` to centralize role-specific UI state.
- Admin mode now only hides the other-places tab through this function.
- Investigator mode restores `📝 任務清單` / `🌍 其他地名`, removes admin assignment filters, removes the admin batch bar, and clears admin-only bottom padding.
- Non-admin data loading now clears `state.allUsers` so admin-only investigator lists do not leak across sessions.

## Verification
- `node --check main.js`
- `git diff --check`

## Notes
- The underlying task filtering remains unchanged: investigators see `assignedPlaces` from `assignedUsers.includes(userName)` on the assigned tab and unassigned-to-self places on the other tab.
