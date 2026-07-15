# 2026-05-28 Task class filters

## Request

- Let admins filter places by the language-specific class fields from the total sheet:
  - `TaiClass`
  - `HakClass`
- Keep these class values aligned with the workflow meaning of direct annotation, phone survey, field survey, and Indigenous-language cases.

## Changes

- Added `tai_class` and `hak_class` to `app_tasks_view` and `app_review_queue_view`.
- Added admin-only TaiClass and HakClass filter selects in the task/review filter area.
- Kept investigator UI unchanged.
- Added compact 台/客 class badges to admin task rows and review summaries.

## Verification

- `node --check main.js`
- `git diff --check`
- Supabase migration `task_class_filters` applied successfully.
- Supabase live readback confirmed `app_tasks_view` and `app_review_queue_view` expose `tai_class` and `hak_class`; class summaries include `直接標注`, `電話調查`, `現場調查`, and `原住民族`.
- Browser visual verification was attempted, but the in-app browser runtime hit the known Windows sandbox setup failure in this Google Drive checkout.
