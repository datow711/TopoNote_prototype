# 2026-05-26 Iansui place-name font

## Scope
- Loaded Google Fonts Iansui in `index.html`.
- Applied Iansui to place-card names through `.place-title`.
- Applied Iansui to the selected place title in the recording panel.

## UX Notes
- Kept the app chrome, filters, buttons, and metadata in the existing UI font so operational text stays compact and scannable.
- Limited Iansui to place-name surfaces where local-language character readability matters most.

## Verification
- `node --check main.js`
- `git diff --check`
