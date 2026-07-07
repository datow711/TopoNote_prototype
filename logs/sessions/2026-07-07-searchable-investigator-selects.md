# 2026-07-07 Searchable Investigator Selects

## Scope

- Added lightweight search inputs in front of existing investigator select controls:
  - admin assignee filter
  - per-place language assignment rows
  - batch assignment bar
- Kept native `<select>` elements and existing values intact so current assignment/filter flows and Playwright `selectOption` tests continue to work.

## Implementation Notes

- `filterSelectOptions(selectId, query)` filters existing options with `option.hidden`.
- Search matches option text, value, and title so investigator name, account/email, and phone can be used where present in the option metadata.
- Styling keeps the language assignment row compact on desktop and falls back to the existing one-column mobile layout.

## Verification

- `node --check main.js`
- `node --check tests/language-assignment.spec.js`
- `git diff --check`
- `npx.cmd playwright test tests/language-assignment.spec.js` (9 passed)
