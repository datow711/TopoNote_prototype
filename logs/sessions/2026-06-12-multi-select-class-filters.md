# 2026-06-12 Multi-select class filters

## Summary

- Changed task type filtering from a single-select chip group to a multi-select chip group.
- Replaced admin TaiClass and HakClass dropdown filters with chip groups matching the category filter style.
- The `全部` chip now selects every available value in that filter group.
- Values inside the same filter group are matched as a union.
- Different filter groups still combine as intersections with the existing keyword, county, town, assignee, Hakka-area, and recording-status filters.
- Filter chip updates rerender only the chip groups, preserving other filter controls such as the admin assignee dropdown.

## Verification

- `node --check main.js`
- `git diff --check`
- Playwright headless check confirmed:
  - `全部類別` selects all category values.
  - Category and class chips can be narrowed independently.
  - TaiClass and HakClass render as chip groups.
  - Same-group matching behaves as union and cross-group filtering behaves as intersection.
  - Existing admin assignee selection is preserved while toggling chips.
