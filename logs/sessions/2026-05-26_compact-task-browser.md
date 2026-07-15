# 2026-05-26 Compact task browser UI

## Scope
- Compacted the top user/task/filter area to preserve more vertical space for the large place list.
- Reduced page heading, user badge, tab, input, and filter spacing.
- Changed type, Hakka-area, and recording-status chips to single-row horizontal scrolling controls.
- Increased effective place-list height with viewport-aware `clamp()` sizing.

## UX Notes
- The upper controls now behave more like a compact toolbar instead of a stack of large cards.
- Horizontal chip rows trade a little sideways scrolling for much more vertical list space, which fits the high-volume place browsing workflow.
- Mobile keeps the task tabs side by side while county/town selectors remain stacked for readability.

## Verification
- `node --check main.js`
- `git diff --check`

## Notes
- Tried to use the in-app browser skill for visual review, but the local browser runtime was interrupted by the Windows sandbox setup error twice. The CSS was reviewed structurally instead.
