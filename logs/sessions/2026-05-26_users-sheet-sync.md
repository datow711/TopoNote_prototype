# 2026-05-26 Users sheet sync

## Scope

- Converted Places `Users` sheet into the one-way source for normal investigator accounts.
- Required Sheet headers:
  - `email`
  - `name`
  - `phone`
  - `languages`
  - `hakka_dialect`
  - `life_area_1`
  - `survey_area_1`
  - `life_area_2`
  - `survey_area_2`
  - `life_area_3`
  - `survey_area_3`
  - `active`
- `email` and `name` are required; rows missing either are skipped by GAS sync.
- Added DB profile columns on `investigators`; `email`, `name`, and generated `id` are non-null.
- Deleted old non-admin investigator accounts, preserving the current admin account only.
- Marked existing assignments to deleted investigators inactive.
- Added `sync_sheet_users(p_users jsonb)` RPC for Sheet -> DB upsert. This RPC never deletes users and does not overwrite admin accounts.
- Added `set_investigator_active(p_user_id, p_is_active, p_actor_account)` RPC so admins can toggle normal investigator active state from the app.
- Recreated login RPCs to return only `user_id`, `account`, and `role`.
- Recreated `app_users_view` to expose only `id`, `account`, `role`, and `is_active`.
- Revoked `sync_sheet_users(jsonb)` execute permission from `PUBLIC`, `anon`, and `authenticated`; Places GAS must call it with the service role key.
- Added Places GAS menu items:
  - `建立/修正 Users 表頭`
  - `同步 Users 至 Supabase`
- Added frontend admin account status panel using only account/id/active state.

## Notes

- Sheet is one-way update into DB. Removing a row from Sheet will not delete the DB account.
- DB deletion remains backend-only.
- Normal investigators are assignable only when active.
- The Apps Script changes are local in `places-gas/`; `clasp push` was not completed because uploading local code to Google Apps Script requires explicit approval in this environment.
