# TopoNote Supabase app-facing security design

Updated: 2026-06-25.

Status: Batch H phase 0 design memo. H1 live advisor snapshot was recorded in `docs/supabase-advisor-snapshot-2026-06-26.md`. H2 prep for `set_investigator_active` is in `docs/h2-set-investigator-active-wrapper-plan.md`. This file does not approve SQL changes, grant changes, view rewrites, RLS policy changes, frontend changes, or GAS deployment.

## Purpose

Supabase advisors still flag several active app-facing views and `SECURITY DEFINER` RPCs. The current APP is a static frontend that uses the Supabase anon key directly, so these findings cannot be fixed by blanket revokes without breaking live workflows.

This memo separates:

- current accepted exposure under the static frontend model;
- service-role-only backend surfaces that should stay behind Apps Script;
- public RPCs that should eventually move behind a backend;
- changes that are explicitly unsafe as a quick cleanup.

## Current access model

### Browser frontend with anon key

The browser frontend directly calls Supabase with `CONFIG.SUPABASE_ANON_KEY`.

Current direct reads:

| Object | Consumer | Current role |
| --- | --- | --- |
| `app_tasks_view` | Browser task lists | Active app-facing read. |
| `app_review_queue_view` | Browser admin review queue | Active admin-facing read. |
| `app_users_view` | Session restore, admin user manager, assignee labels | Active app-facing read. |
| `audio_records` | Audio history, insert, uploader text edits | Active app-facing table. |

Current direct RPC calls:

| RPC | Consumer | Current role |
| --- | --- | --- |
| `login_investigator` | Investigator login | Public login endpoint under static app model. |
| `login_admin` | Admin login and root GAS admin verification | Public login endpoint under static app model. |
| `set_investigator_active` | Admin user manager | Admin action exposed to browser; should be future migration candidate. |
| `delete_investigator_user` | Admin user manager | Admin action exposed to browser; should be future migration candidate. |
| `approve_task_language` | Admin review | Admin review write; should be future migration candidate. |
| `revoke_task_language_review` | Admin review | Admin review write; should be future migration candidate. |
| `assign_task_language` | Admin language assignment | Admin assignment write; should be future migration candidate. |
| `unassign_task_language` | Admin language assignment | Admin assignment write; should be future migration candidate. |

### Apps Script with service role

Root GAS and Places GAS hold service-role-only capabilities in script properties. Service role must never move to browser code.

| Surface | Consumer | Current role |
| --- | --- | --- |
| `update_investigator_profile` | Root GAS only | Correctly behind admin password verification and service role. |
| `sync_sheet_users` | Places GAS | Service-role sheet-to-Supabase sync. |
| `mark_reviews_sheet_synced` | Places GAS | Service-role review writeback acknowledgement. |
| `third_phase_places` / `final_tasks` upserts | Places GAS | Service-role source Sheet sync. |
| `app_sheet_sync_queue` | Places GAS | Service-role-oriented review writeback queue. |
| `app_language_assignment_sheet_view` | Places GAS plus currently broad grants | Assignment writeback source; should be reviewed separately. |

## Advisor finding classes

### Security-definer views

Current active views are advisor-flagged because they are defined as security-definer views:

- `app_tasks_view`
- `app_review_queue_view`
- `app_users_view`
- `app_sheet_sync_queue`
- `app_language_assignment_sheet_view`

Supabase guidance treats security-definer views as sensitive because they evaluate permissions as the view owner rather than as the querying role. In Postgres 15+, the safer target is usually `security_invoker = true`, but switching active views requires a row-by-row access design first.

### Public executable security-definer RPCs

Several current RPCs are intentionally callable by `anon` / `authenticated` under the static frontend model. This is a design compromise, not dead code.

These are not safe to revoke without replacing the browser call path:

- `login_investigator`
- `login_admin`
- `set_investigator_active`
- `delete_investigator_user`
- `approve_task_language`
- `revoke_task_language_review`
- `assign_task_language`
- `unassign_task_language`
- `ensure_task_language_reviews` if any active public path still depends on it

Already quarantined:

- `verify_login`
- `assign_tasks_to_user`
- `unassign_tasks_from_user`
- direct execute on trigger-only `mark_audio_record_pending_review`

## Do-not-do list

Do not do these as a quick cleanup:

- Do not revoke `anon` / `authenticated` from `app_tasks_view`, `app_review_queue_view`, or `app_users_view` while the static frontend still reads them directly.
- Do not revoke current browser-called RPCs before a replacement backend route exists.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to frontend code or any static asset.
- Do not move all writes behind root GAS in one batch; this would mix auth, review, assignment, and sync risks.
- Do not convert views to `security_invoker` until the underlying tables have policies/grants that preserve the exact app behavior.
- Do not treat advisor findings as false positives; document accepted exposure and reduce it in staged migrations.

## Target architecture options

### Option A - accept current static frontend model

Keep browser direct reads and RPC calls, document the accepted risk, and continue only small quarantine work.

Pros:

- Lowest implementation risk.
- Keeps GitHub Pages/static hosting simple.
- No new backend surface.

Cons:

- Advisor findings remain.
- Admin writes remain callable through anon-key RPC endpoints.
- Authorization must be enforced inside RPC bodies and view definitions.

### Option B - backend-wrap admin writes first

Move admin-only writes behind root GAS or another backend while leaving read views public for now.

First migration candidates:

1. `set_investigator_active`
2. `delete_investigator_user`
3. `approve_task_language`
4. `revoke_task_language_review`
5. `assign_task_language`
6. `unassign_task_language`

Pros:

- Reduces high-impact public executable RPC surface.
- Keeps task/review/user reads stable.
- Matches the existing `updateUserProfile` pattern.

Cons:

- Root GAS would gain more app API responsibility.
- Requires admin verification/session design.
- Requires careful UI error handling and manual regression tests.

### Option C - redesign reads with security-invoker views and RLS

Move app-facing views toward `security_invoker = true`, with table policies/grants that express the intended access model.

Pros:

- Addresses the security-definer view finding more directly.
- Makes data visibility model explicit.

Cons:

- Highest breakage risk.
- Requires a real identity/auth model; the current static app mostly uses app-level account values, not Supabase Auth sessions.
- Requires extensive query-by-query compatibility checks.

## Recommended staged path

### H1 - inventory and live advisor snapshot

Status: completed in `docs/supabase-advisor-snapshot-2026-06-26.md`.

Before changing SQL:

1. Run Supabase security and performance advisors.
2. Record the exact remaining findings.
3. Confirm which findings are accepted under the current static frontend model.
4. Confirm which findings are migration candidates.

No behavior change.

### H2 - backend-wrap one admin write

Prep document: `docs/h2-set-investigator-active-wrapper-plan.md`.

Pick one narrow admin write and move it behind root GAS, following the `updateUserProfile` pattern.

Candidate: `set_investigator_active`, because it is smaller than review/assignment writeback and already belongs to admin user management.

Required design before implementation:

- How root GAS verifies the admin actor.
- Whether to reuse admin password verification or introduce a session token.
- Exact request/response contract.
- Rollback path to restore direct RPC call.

### H3 - backend-wrap destructive/admin-heavy writes

After one successful H2 cycle:

- `delete_investigator_user`
- `approve_task_language`
- `revoke_task_language_review`
- `assign_task_language`
- `unassign_task_language`

Each should be one separately approved batch or a carefully grouped admin-write batch.

### H4 - view/RLS redesign

Only after write surfaces are reduced:

- evaluate `app_tasks_view`, `app_review_queue_view`, `app_users_view`;
- decide whether to keep static public reads or introduce authenticated backend reads;
- consider `security_invoker` view rewrites with table-level RLS policies.

## Verification requirements for future H batches

Every implementation batch must include:

- pre-change advisor snapshot;
- SQL or code diff;
- post-change advisor snapshot;
- local `node --check main.js`;
- relevant GAS syntax checks;
- browser manual checks for login, task list, admin review, assignment, audio upload/playback;
- rollback SQL or commit path.

## Current recommendation

Do not start with view rewrites. Start with H1 live advisor snapshot and then H2 backend-wrap one admin write, unless the project is ready to replace the static frontend auth model.
