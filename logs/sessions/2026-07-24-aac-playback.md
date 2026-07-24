# 2026-07-24 AAC playback MIME fix

## Goal

- Restore preview and cloud playback for `.aac` recordings.

## Changes

- Added shared frontend MIME normalization for known mobile audio extensions and MIME aliases.
- Normalized generic `.aac` uploads to `audio/aac` before preview and FileReader upload.
- Normalized root GAS upload blobs and Drive playback responses from the stored filename.
- Returned `fileName` and `mimeType` from `getAudio` so the browser can apply a final MIME correction.
- Added a visible decode-error message instead of leaving a broken audio control.
- Cache-busted `main.js` in `index.html`.
- Added focused MIME, upload-preview, and Drive-playback Playwright coverage.
- Updated the existing linked-audio payload expectation to include its already-present `sourceId` field.

## Deployment and verification

- `node --check main.js`, root GAS, and the new test spec passed.
- Focused AAC Playwright tests passed 3/3.
- Full Playwright regression passed 29/29.
- Root GAS source was pushed and the production Web App deployment was updated and read back at version 31.
- A live `getAudio` request returned `fileName=Record_tall850320@gmail.com_19723_1784875390255.m4a`, `mimeType=audio/mp4`, and a matching Data URL prefix.
