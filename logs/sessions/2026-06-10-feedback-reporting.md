# 2026-06-10 Feedback reporting

## Summary

- Added an investigator-only `問題回報` button between task-list export and logout.
- Added a feedback dialog with manager contact information:
  - `專案助理 - 藍君偉 Nâ Kun-uí`
  - `kunui711@mail.naer.edu.tw`
- The dialog collects a subject and free-form message textarea.
- Frontend submits feedback to the existing GAS web app with action `submitFeedback`.
- GAS creates a new `TopoNote_問題回報` spreadsheet on first submission and stores its ID in script properties.
- GAS appends rows to a `問題回報` sheet with ID, investigator name, email, submitted time, subject, message, and a default unchecked reply-status checkbox.
- Feedback IDs are generated server-side starting from `001`, guarded by `LockService`.
- Google Chat webhook notification is scaffolded behind the `FEEDBACK_CHAT_WEBHOOK_URL` script property and remains inactive until configured.
- Email sending is intentionally omitted because the deployed GAS account's Gmail capability is known to be disabled.

## Verification

- `node --check main.js`
- `node --check gas/程式碼.js`
- `git diff --check`
- Playwright headless check confirmed button ordering, dialog submission, preserved subject/message text, and `submitFeedback` payload shape.
- `npx.cmd clasp push`
- `npx.cmd clasp deploy -i AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw -d "Add feedback reporting"`
- `npx.cmd clasp deployments` confirmed the production Web App deployment is `@16 - Add feedback reporting`.
