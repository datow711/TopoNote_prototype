# 2026-07-06 usage tutorial

## Summary

- Added a repeatable `使用教學` button to the logged-in action bar.
- The tutorial runs an in-app guided walkthrough with overlay highlight, arrow, step text, and click-to-advance behavior.
- The walkthrough uses a temporary `教學示範地名` and does not write data to Supabase or GAS.
- Covered steps:
  - task list
  - place filtering
  - selecting a place
  - entering annotation text
  - recording entry point
  - audio confirmation and replay
  - uploading an existing audio file
  - final upload confirmation
  - ending message before starting real entry
- The tutorial snapshots and restores the user's current list/filter/recording state after completion or skip.

## Verification

Passed:

```powershell
node --check main.js
node --check tests\tutorial.spec.js
git diff --check
npx.cmd playwright test tests/tutorial.spec.js
npm.cmd run test:ui
```

`git diff --check` only reported Windows LF-to-CRLF warnings for edited files.
