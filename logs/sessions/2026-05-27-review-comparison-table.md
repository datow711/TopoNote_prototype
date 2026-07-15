# 2026-05-27 Review comparison table

## Summary

- Changed the admin review audio candidates from card/grid blocks into an Excel-like comparison table.
- Each review item now shows place basics first:
  - place name
  - UUID
  - type
  - county / town / village
  - recording status
- Candidate rows are one audio record per row.
- Candidate columns are only fields investigators can currently submit:
  - 台語: `TaiHan1`, `TL1`, `TaiNote`, playback
  - 客語: `Honzii`, `HP1`, `HakNote`, playback
- Kept per-cell `填入` buttons so candidate values can be copied into the final adjudication fields.
- Kept the final adjudication panel unchanged.

## Verification

- `node --check main.js`
- `git diff --check`
