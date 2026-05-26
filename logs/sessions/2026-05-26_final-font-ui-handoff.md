# 2026-05-26 Final font/UI handoff update

## Scope
- Updated Google Fonts loading to include both `Iansui` and `Noto Sans TC`.
- Switched the general UI font stack to `Noto Sans TC`.
- Kept place-name surfaces in `Iansui`.
- Applied `Iansui` to annotation inputs and textareas for Taiwanese/Hakka text and romanization entry.
- Added a livelier UI pass within the MongoDB-style design rules: subtle heading accent, hover motion, annotation panel accent line, and more colorful but restrained badges.
- Added `NEXT_CHAT_HANDOFF.md` for the next chat session.

## Verification
- `node --check main.js`
- `git diff --check`

## Notes
- This is intended as the final handoff change for the current chat.
