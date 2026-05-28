# 2026-05-28 LINE audio upload UX

## Request

- Make phone and desktop audio upload easier for investigators who may be older or less familiar with mobile apps.
- Support the likely workflow where audio comes from LINE voice messages.

## Changes

- Split the recording area into two clear entry points:
  - `現場錄音`
  - `LINE 或手機音檔`
- Renamed the file upload action to `上傳 LINE 語音或手機音檔`.
- Added Android and iPhone instructions for finding LINE voice messages by sharing or saving from LINE first.
- Expanded accepted audio file formats to include common mobile and LINE-export formats such as `.m4a`, `.aac`, `.mp4`, `.3gp`, `.amr`, `.opus`, and `.caf`.
- Added an audio confirmation panel showing place, language, source, file name, and size before upload.
- Added `重新選擇`, `重錄`, and `確認上傳這筆音檔` actions.
- Added an upload confirmation prompt, including a reminder when no annotation text has been filled.

## Verification

- `node --check main.js`
- `git diff --check`
- Browser DOM workflow check for investigator recording UI.
- Mobile viewport DOM/layout check at 390px width: upload cards and LINE help stack to one column with no horizontal overflow.
