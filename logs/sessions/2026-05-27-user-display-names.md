# 2026-05-27 User Display Names

## Request
- Show users by real name now that profile data exists.
- Hover should still reveal email.
- Admin hover/management should show name, email, and phone together without feeling cramped.

## Changes
- Extended app user API surface to include `name`, `email`, and `phone` in login RPCs and `app_users_view`.
- Kept assignment/filter values on account/email while changing visible labels to names.
- Added compact admin user rows with name, email, phone, active text, and checkbox controls.
- Added hover titles for user badges, assignment chips, review record labels, and recording history.

## Verification
- `node --check main.js`
- `git diff --check`
- Supabase live read of `app_users_view` confirmed `name`, `email`, and `phone` are available.
