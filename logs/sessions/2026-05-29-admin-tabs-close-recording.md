# 2026-05-29 Admin tabs and recording panel reset

## Request

- In admin mode, keep `全部地名清單`, `審查清單`, and `使用者管理` on one row with each taking one third of the tab width.
- When a place card is open, close the recording panel after switching filters or changing to another functional page.

## Changes

- Added an admin-only `.admin-tabs` state on the tab container.
- Set `.tab-container.admin-tabs` to three equal columns, including the mobile breakpoint.
- Added `closeRecordingUI()` to clear the selected place, remove active place-card styling, and hide the recording panel.
- Routed user-driven filter controls through `handleFilterChange()`, so search, county/town, assignee, type, Hakka-area, status, and language-class filters close the open recording panel before re-rendering.
- Tab switching now closes the recording panel when moving to a different tab.

## Verification

- `node --check main.js`
- `git diff --check`
- Local browser target loaded at `http://127.0.0.1:8765/index.html`; direct admin-state mutation was blocked by the read-only browser evaluation scope, so the final layout verification was structural.
