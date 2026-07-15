# 2026-06-10 Investigator task list export

## Summary

- Added an investigator-only `下載任務清單` button beside logout in the user info bar.
- Added a modal dialog for choosing PDF or XLSX export.
- Exports use the investigator's assigned tasks, sorted by county, then town, then place name.
- The exported table includes county, town, category, place name, and six blank writable fields: Taiwanese Hanzi, Taiwanese romanization, Taiwanese note, Hakka Hanzi, Hakka romanization, and Hakka note.
- PDF export is generated client-side by rendering table pages to canvas and wrapping them in a downloadable PDF, so no new package or backend change is needed.
- XLSX export is generated as a real Office Open XML workbook, avoiding Excel extension/type mismatch warnings.

## Verification

- `node --check main.js`
- `git diff --check`
- Playwright headless check loaded local `index.html`, injected fake investigator tasks, verified the download button and dialog, confirmed county sorting, confirmed the reduced writable field set, and confirmed both XLSX and PDF exports were generated.
