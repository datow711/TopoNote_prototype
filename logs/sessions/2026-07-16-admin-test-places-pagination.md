# 2026-07-16 Admin Test Places Pagination

## Scope

- Fixed admin task loading when test places are beyond the first Supabase/PostgREST page.
- Live read-only checks confirmed `test_places`, `final_tasks`, `app_tasks_view`, and `app_review_queue_view` each still expose 10 active test rows.
- Live `app_tasks_view` source distribution showed 6,842 `third_phase_places` rows and 10 `test_places` rows; test task IDs are after the formal rows.

## Implementation Notes

- Added `fetchSupabaseRows()` to page through Supabase REST results with `Range` headers.
- Switched task, audio record, admin user, and review queue reads in `loadDataFromSupabase()` to use paged loading.
- Cache-busted `main.js` in `index.html` with `20260716-paged-supabase`.
- Added Playwright coverage for the regression where the first page has 1,000 formal rows and `TEST0001` appears on the second page.

## Verification

- `node --check main.js`
- `node --check tests/language-assignment.spec.js`
- `git diff --check`
- `npx.cmd playwright test tests/language-assignment.spec.js --reporter=line` (13 passed)
- `npm.cmd run test:ui -- --reporter=line` (22 passed)
