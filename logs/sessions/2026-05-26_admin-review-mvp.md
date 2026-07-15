# 2026-05-26 Admin review MVP

## Scope

- Read `NEXT_CHAT_HANDOFF.md`, `logs/timeline.md`, `logs/errors.md`, and the latest session logs before continuing.
- Added an admin-only `審查清單` tab in `index.html`.
- Admin data loading now also reads `app_review_queue_view`.
- Review list combines `app_review_queue_view` tasks with existing `audio_records` so reviewers can see:
  - place UUID / county / town
  - 台語 and 客語 review states
  - uploaded audio records by language
  - annotation summaries
  - existing cloud audio playback button
- Added `approveReviewLanguage()` to call `approve_task_language()` with `p_task_id`, `p_language`, and `p_reviewed_by`.
- The bottom batch assignment bar now hides while the admin is on the review tab.

## Verification

- `node --check main.js`
- `git diff --check`

## Notes

- A read-only Supabase check confirmed `app_review_queue_view` exists and currently returns third-phase task rows with review state columns such as `t_review_state`, `h_review_state`, `t_state`, and `h_state`.
- Current `app_review_queue_view?record_count=gt.0` returned no third-phase rows with recordings during this session, so the review page empty state is expected until new third-phase recordings exist.
- Browser visual QA was attempted through the in-app Browser workflow, but the runtime failed with the same Windows sandbox setup issue recorded in earlier logs.
