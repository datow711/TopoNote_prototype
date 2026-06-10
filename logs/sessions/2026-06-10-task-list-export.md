# 2026-06-10 Investigator task list export

## Summary

- Added an investigator-only `下載任務清單` button beside logout in the user info bar.
- Added a modal dialog for choosing PDF or XLS export.
- Exports use the investigator's assigned tasks, sorted by county, then town, then place name.
- The exported table includes county, town, category, place name, and blank writable fields for Taiwanese and Hakka annotations.
- PDF export is generated client-side by rendering table pages to canvas and wrapping them in a downloadable PDF, so no new package or backend change is needed.
- XLS export is generated as an Excel-readable HTML table with UTF-8 BOM.

## Verification

- `node --check main.js`
- `git diff --check`
- Playwright headless check loaded local `index.html`, injected fake investigator tasks, verified the download button and dialog, confirmed county sorting, and confirmed both XLS and PDF blobs were generated.
