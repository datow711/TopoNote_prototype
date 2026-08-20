# 2026-08-20 audio upload reliability First Stage

## Goal

- Deliver the spec's First Stage local repair while keeping the formal deployment gate intact.

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

- Not applied: supabase/migrations/20260820120000_audio_upload_reliability.sql.
- Not pushed: Root GAS source and GitHub.
- Not deployed: Root GAS update and frontend cache-busting update.
- Not smoke-tested: production Drive, Records Sheet and audio_records writes.
- The live audio_records readback still has the pre-migration columns, existing RLS/policies/grants and trigger; the new columns and unique constraint are local only.
- Stage Two was not started.

## Recovery

Keep the additive migration and local source changes as a cohesive commit. If the first stage is rejected, revert the local frontend/GAS/cache-busting commit; do not drop the additive columns or delete existing Drive, Supabase or Records data.