# 2026-08-20 audio upload reliability First Stage

## Goal

- Deliver the spec's First Stage repair through formal Supabase, Root GAS, frontend and smoke readback.

## Changes

- Frontend creates an immutable upload snapshot with UUID clientUploadId and keeps the same Blob, task snapshot, language, metadata and request ID across retries.
- MediaRecorder feature detection reads the actual recorder or chunk MIME and maps the final MIME to the filename extension; unsupported or denied microphones show a file-upload fallback.
- Root GAS local source validates the fixed upload contract, verifies the task with service role, uses Script Lock and client_upload_id idempotency, writes a safe Drive filename, inserts audio_records with return=representation, compensates a new Drive file on database failure, and ensures one legacy Records row.
- Records append failures leave authoritative Drive and Supabase data intact and return legacyLogPending; the same request ID can repair the missing legacy row.
- Added focused Playwright coverage for MP4, WebM, fallback, MIME mismatch, snapshot task stability, stage failure, response loss, duplicate clicks, special account/display-name metadata and formal record IDs.
- Added playwright.config.js so npm run test:ui uses the repository's existing tests directory.

## Verification

- Focused audio and Root GAS contract tests: 18/18 passed.
- Full UI regression: npm run test:ui -- --reporter=line --workers=1, 74/74 passed.
- node --check main.js passed.
- node --check gas\程式碼.js passed.
- node --check tests\audio-upload.spec.js passed.
- git diff --check passed.
- Read-only clasp status showed local gas/程式碼.js modified and clasp deployments showed two deployments; the configured Web App remains @32.

## Formal environment status

- Applied: Supabase migration 20260820065202_audio_upload_reliability; six metadata columns and the unique client_upload_id constraint were read back, with existing row count preserved at 1806 immediately after migration.
- Deployed: Root GAS Web App deployment @34. The live task lookup mismatch (final_tasks.id, not task_id) was corrected before the final deployment; @32 and @33 remain available versions for rollback.
- Live frontend: GitHub Pages returned HTTP 200 and served main.js?v=20260820-audio-upload-reliability with the First Stage markers.
- Smoke readback: task 23619 / source TEST0001 created audio_records.id=1809, Drive file 12HtvsDmaK_XmITwo1NQ1p63L2HvKfDaj, and one matching Records row. Repeating the exact payload returned deduplicated=true and did not create another resource.
- The smoke payload was a 4-byte synthetic test body, so transport, metadata and idempotency were verified but real codec playback was not.
- Stage Two was not started.

## Recovery

Keep the additive migration and source changes as cohesive commits. If rollback is required, point the configured Web App back to the retained @32 or @33 version and preserve the additive columns; do not delete the smoke Drive file, existing Drive files, Supabase rows or Records data automatically.