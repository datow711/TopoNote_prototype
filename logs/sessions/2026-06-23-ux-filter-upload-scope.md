# 2026-06-23 UX filter and upload scope adjustments

## Summary

- Preserved the admin county and town filter selections after language assignment refreshes.
- Changed TaiClass and HakClass filter chips to default to all unselected while keeping empty selection as no class restriction.
- Made the TaiClass and HakClass "all" chips toggle between all selected and all unselected.
- Defaulted investigator recording tabs from per-language assignment, preferring Taiwanese when both languages are assigned to the same investigator.
- Added an upload confirmation warning when investigators upload a language they were not assigned or a place outside their task list.

## Verification

- `node --check main.js`
- `git diff --check`
- `npx.cmd playwright test tests/language-assignment.spec.js`
