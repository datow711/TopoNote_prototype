# 2026-05-28 Workflow browser check

## Request

- Run the current TopoNote workflow in the browser and check for leaks or regressions.

## Findings

- Browser visual QA works after launching Codex as administrator and serving the app through `http://127.0.0.1:8765/index.html`.
- Investigator login with `tanliangkun@mail.naer.edu.tw` succeeded.
- Assigned task view showed `TEST0001` through `TEST0010`, which matches the live assignment to that investigator.
- Other-place view hid `TEST000x` rows and showed ordinary places instead.
- Investigator-only UI did not show admin assignee or class filters.
- Uploaded-record history initially showed recorder account `kunui711` instead of the display name.

## Change

- Non-admin sessions now load only the user label records needed for the current user's uploaded-record history.
- Assignment, filtering, active toggles, and review RPC payloads remain account-based.

## Verification

- Browser screenshot/DOM checks for login, assigned tasks, other-place filtering, and uploaded-record labels.
- Supabase read checks for active users and `test_places` review queue rows.
- `node --check main.js`
- `git diff --check`
