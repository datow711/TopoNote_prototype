# Supabase advisor snapshot - 2026-06-26

Status: Batch H1 live advisor snapshot and finding classification. This file records live advisor output categories only; it does not approve SQL, grant, RLS, RPC, view, frontend, or GAS changes.

Project ref: `sikconjhtomqdkicbjal`

## Snapshot summary

Security advisor returned 34 findings:

- 7 `rls_enabled_no_policy` info findings.
- 5 `security_definer_view` error findings.
- 2 `function_search_path_mutable` warning findings.
- 2 `rls_policy_always_true` warning findings.
- 9 `anon_security_definer_function_executable` warning findings.
- 9 `authenticated_security_definer_function_executable` warning findings.

Performance advisor returned 2 findings:

- 1 `no_primary_key` info finding.
- 1 `unused_index` info finding.

## Classification summary

| Classification | Meaning | Count / scope |
| --- | --- | --- |
| `accepted-current-model` | Currently required by static frontend or current GAS sync; do not revoke directly. | App-facing reads and login/admin workflows. |
| `migration-target` | Should be reduced through H2/H3 backend wrapping or later H4 view/RLS redesign. | Admin writes, security-definer views, permissive policies. |
| `quarantined-or-resolved` | Earlier B/C/D work already removed the public exposure from the targeted object. | Old login/generic assignment/trigger-only surfaces. |
| `retention-or-deferred` | Data retention or broader access-model decision required before cleanup. | Backup table, legacy source tables, checkpoint-like state. |

## Security findings

### RLS enabled, no policy

Remediation reference: [Supabase database linter 0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

| Object | Classification | Notes |
| --- | --- | --- |
| `codex_backup_phone_field_state_20260610` | `retention-or-deferred` | Batch D interim intentionally enabled RLS and removed public access. Drop/export decision remains separate. |
| `investigators` | `migration-target` | Active identity/profile table. Current access goes through views/RPCs; future RLS design should be explicit. |
| `moi_placename_raw` | `retention-or-deferred` | Legacy source data still referenced historically through `final_tasks`; do not delete through H. |
| `task_assignments` | `retention-or-deferred` | Compatibility/history layer; do not remove without assignment model migration. |
| `task_language_reviews` | `migration-target` | Active assignment/review table behind current RPCs and views. |
| `test_places` | `migration-target` | Active test source/writeback path. |
| `third_phase_places` | `migration-target` | Active Places sheet snapshot. |

### Security-definer views

Remediation reference: [Supabase database linter 0010](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)

| View | Current consumer | Classification | Notes |
| --- | --- | --- | --- |
| `app_tasks_view` | Browser frontend task list | `accepted-current-model` then `migration-target` | Do not revoke while frontend reads directly. Candidate for H4 view/RLS redesign. |
| `app_review_queue_view` | Browser admin review | `accepted-current-model` then `migration-target` | Do not revoke before admin review backend/read design exists. |
| `app_users_view` | Browser session restore, user manager, labels | `accepted-current-model` then `migration-target` | Name/account display contract depends on this view. |
| `app_sheet_sync_queue` | Places GAS review writeback | `migration-target` | Should stay service-role oriented; review under backend/sync design, not browser access. |
| `app_language_assignment_sheet_view` | Places GAS assignment writeback | `migration-target` | Current grants remain broad; review after assignment writeback design is stable. |

### Mutable search path functions

Remediation reference: [Supabase database linter 0011](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

| Function | Classification | Notes |
| --- | --- | --- |
| `touch_task_language_review_updated_at` | `migration-target` | Low-risk future SQL hardening candidate if function body is reviewed. |
| `verify_login` | `quarantined-or-resolved` | Public execute was revoked in Batch B. Search path warning can be fixed or dropped later with legacy auth cleanup. |

### Permissive RLS policies

Remediation reference: [Supabase database linter 0024](https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy)

| Table / policy | Classification | Notes |
| --- | --- | --- |
| `audio_records` / `Allow anon insert audio_records` | `migration-target` | Current audio upload flow inserts from browser after GAS upload. Future backend wrapping could reduce this. |
| `final_tasks` / `Allow anon update final_tasks` | `migration-target` | Broad update policy is risky; must be mapped to actual current writer before tightening. |

### Public executable security-definer RPCs

Remediation reference for anon: [Supabase database linter 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)

Remediation reference for authenticated: [Supabase database linter 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

Each function below appears once for `anon` and once for `authenticated`.

| Function | Current consumer | Classification | Recommended migration direction |
| --- | --- | --- | --- |
| `login_investigator(p_email text)` | Browser login | `accepted-current-model` | Keep until auth model changes; not first H2 target. |
| `login_admin(p_email text, p_password text)` | Browser admin login, root GAS admin verification | `accepted-current-model` | Keep until admin session/backend auth design changes. |
| `set_investigator_active(p_user_id uuid, p_is_active boolean, p_actor_account text)` | Admin user manager | `migration-target` | Best H2 candidate for backend wrapping. |
| `delete_investigator_user(p_user_id uuid, p_actor_account text)` | Admin user manager | `migration-target` | H3 candidate after H2 succeeds. |
| `approve_task_language(p_task_id integer, p_language text, p_reviewed_by text, p_fields jsonb)` | Admin review | `migration-target` | H3 candidate; impacts review/writeback. |
| `revoke_task_language_review(p_task_id integer, p_language text, p_reviewed_by text)` | Admin review | `migration-target` | H3 candidate; impacts review/writeback. |
| `assign_task_language(p_task_ids integer[], p_language text, p_user_name text, p_assigned_by text)` | Admin assignment | `migration-target` | H3 candidate; impacts assignment/writeback. |
| `unassign_task_language(p_task_ids integer[], p_language text, p_unassigned_by text)` | Admin assignment | `migration-target` | H3 candidate; impacts assignment/writeback. |
| `ensure_task_language_reviews(p_task_id integer)` | Internal helper but executable | `migration-target` | Review dependencies; likely revoke direct public execute only after callers are confirmed. |

## Performance findings

### No primary key

Remediation reference: [Supabase database linter 0004](https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key)

| Object | Classification | Notes |
| --- | --- | --- |
| `codex_backup_phone_field_state_20260610` | `retention-or-deferred` | Backup table remains quarantined. Drop/export decision should resolve this, not a primary-key patch. |

### Unused index

Remediation reference: [Supabase database linter 0005](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

| Object | Classification | Notes |
| --- | --- | --- |
| `audio_records_task_id_idx` on `audio_records` | `accepted-current-model` | Added in Batch B to support FK/query path. It may show unused until enough production traffic is observed. Do not drop now. |

## Confirmed absent from current advisor snapshot

These earlier targets are not present as public executable security-definer findings in this snapshot:

- `mark_audio_record_pending_review`
- `verify_login`
- `assign_tasks_to_user`
- `unassign_tasks_from_user`

`app_assignment_sheet_view` is also not present in the current `security_definer_view` findings.

## Recommended next step

Proceed to H2 only after user approval.

Recommended H2 candidate:

- Backend-wrap `set_investigator_active` through root GAS, following the existing `updateUserProfile` pattern.

Prep document:

- `docs/h2-set-investigator-active-wrapper-plan.md`

Why this is the best first implementation target:

- It is narrower than review or assignment writes.
- It already belongs to admin user management.
- It gives a concrete pattern for moving browser-callable admin RPCs behind a service-role backend.

Do not begin H2 by changing views or RLS policies. Those remain H4-level design work.
