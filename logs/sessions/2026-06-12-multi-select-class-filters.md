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

## Follow-up Fix

- Fixed oversized filter chips caused by the shared `button` rule applying `width: 100%`, `min-height: 44px`, and bottom margin to chip buttons.
- Cached available category, TaiClass, and HakClass values during filter initialization so chip rerenders do not rescan all place arrays.
- Switched multi-select membership checks in `applyFilters()` to `Set` lookups.
- Added a no-op guard for already-selected "select all" actions.

## Follow-up Verification

- `node --check main.js`
- `git diff --check`
- Playwright headless check with 1500 generated rows confirmed:
  - Filter chip size stayed compact at 70 x 30 px.
  - Single category toggle completed in about 61 ms.
  - Select-all completed in about 150 ms.
  - Repeated select-all returned in about 1 ms without rerendering.
  - Filter counts matched the expected union behavior.
