# 2026-05-26 UI polish and admin multi-select

## Scope
- Recording form: matched the Hakka annotation heading with the Taiwanese heading by adding the `選填` marker.
- Place cards: changed the displayed identifier from internal `task_id` to the source-list `UUID` (`sourceId`), while keeping the internal id for writes and assignment RPC calls.
- Admin assignment: added Shift + left click range selection for assignment checkboxes and a live selected-count indicator in the bottom assignment bar.
- UI polish: refreshed the app styling according to `DESIGN.md` with a denser documentation/tool style, white surfaces, black primary actions, mint green accents, pill controls, lighter borders, and cleaner task cards.

## Verification
- `node --check main.js`
- `git diff --check`

## Notes
- `DESIGN.md` remains untracked and was used only as a design reference.
- Browser-level visual QA was not completed in this turn because the in-app browser tool was not available after tool discovery; the change was verified statically.
