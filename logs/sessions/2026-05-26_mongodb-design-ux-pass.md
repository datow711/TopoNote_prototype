# 2026-05-26 MongoDB design and UX pass

## Scope
- Switched the active design reference to `mongodb/DESIGN.md`.
- Re-tuned `style.css` to the MongoDB-inspired palette: bright green primary actions, deep teal dark surfaces, white documentation-style cards, stronger input borders, 44px form controls, and lighter card elevation.
- Cleaned up remaining inline UX styling for the user info badge and empty list state.
- Added a visible admin assignment hint so the Shift + left click range-selection behavior is discoverable.

## UX Notes
- The batch assignment toolbar now tells admins how to select ranges instead of relying on hidden knowledge.
- The selected count remains visible beside the assignment input, reducing the risk of assigning the wrong number of places.
- Empty search/filter results now use a reusable state style, which can later support a clearer reset-filter action.

## Verification
- `node --check main.js`
- `git diff --check`

## Notes
- `mongodb/DESIGN.md` is currently untracked and was used as a design reference only.
