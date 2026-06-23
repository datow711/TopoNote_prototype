# 2026-06-23 Recording text editing

## Summary

- Added an edit flow for uploaded audio records so the original uploader can revise text fields without uploading a new audio file.
- Shows an `編輯文字` action only when the current user matches the record uploader.
- Reuses the existing language-specific review field definitions to edit Taiwanese or Hakka text fields for the record language.
- Saves edits with a PATCH to `audio_records`, updating `note` and `phonetic_reading` only.
- Changed new audio inserts to request `return=representation` so the UI keeps the real `audio_records.id` for immediate editing.

## Verification

- `node --check main.js`
- `git diff --check`
- `npx.cmd playwright test tests/language-assignment.spec.js`
