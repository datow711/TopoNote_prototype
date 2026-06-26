# H3a implementation plan - backend-wrap delete_investigator_user

Updated: 2026-06-26.

Status: implemented and merged. Frontend and root GAS changes were implemented, root GAS was deployed to Apps Script Web App version 23, and Batch H3a-final revoked direct public Supabase execute on `delete_investigator_user` on 2026-06-26.

## Plain-language goal

Before H3a, the admin user manager deleted investigator accounts by calling Supabase directly from the browser:

```text
APP browser -> Supabase RPC delete_investigator_user
```

H3a moves that destructive admin write behind root GAS:

```text
APP browser -> root GAS -> Supabase RPC delete_investigator_user
```

Root GAS verifies the admin password first, then calls Supabase with `SUPABASE_SERVICE_ROLE_KEY`.

## Implemented scope

- `main.js` now posts `action: "deleteInvestigatorUser"` to root GAS instead of directly calling `/rest/v1/rpc/delete_investigator_user`.
- The existing typed delete confirmation remains.
- The frontend now also prompts for the admin password before sending the delete request.
- `gas/程式碼.js` routes `deleteInvestigatorUser` through `handleDeleteInvestigatorUser(data)`.
- Root GAS verifies the admin password with `verifyAdminPassword_()` before calling Supabase.
- Root GAS calls Supabase RPC `delete_investigator_user` using `SUPABASE_SERVICE_ROLE_KEY`.

## Not changed in initial H3a

- Review RPCs.
- Assignment RPCs.
- App-facing views or RLS policies.
- Google Sheet content.

Supabase grants for `delete_investigator_user` were intentionally left unchanged during the first H3a implementation, then revoked in the separate approved Batch H3a-final follow-up.

## Deployment evidence

- `npx.cmd clasp push --force` succeeded.
- Apps Script version 23 was created.
- Active Web App deployment `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw` was updated to `@23`.

## Verification evidence

- `node --check main.js` passed.
- `node --check gas\程式碼.js` passed.
- Search confirmed `main.js` no longer contains `/rpc/delete_investigator_user`.
- Live fake-password smoke test returned `{ "success": false, "error": "Error: Admin password verification failed" }`, which proves the route is deployed and rejects invalid admin credentials before mutation.

## H3a-final grant revoke notes from 2026-06-26

Applied on branch `codex/batch-h3a-final-grant-revoke`:

- Revoked `execute` on `public.delete_investigator_user(uuid, text)` from `public`.
- Revoked `execute` from `anon`.
- Revoked `execute` from `authenticated`.
- Granted/kept `execute` for `service_role`.
- SQL record: `db/2026-06-26_batch_h3a_final_delete_investigator_grant_revoke.sql`.

Verification evidence:

- `anon_can_execute = false`.
- `authenticated_can_execute = false`.
- `service_role_can_execute = true`.
- Root GAS fake-password smoke test still returns `Error: Admin password verification failed`, which confirms the backend service-role path still reaches the RPC flow.

## Manual verification

After deploy:

1. Log in as admin.
2. Open admin user manager.
3. Pick a disposable or non-critical investigator test account.
4. Click delete.
5. Enter the exact existing typed confirmation text.
6. Enter the admin password when prompted.
7. Confirm the UI refreshes and the investigator disappears or is marked according to the existing delete RPC behavior.
8. Confirm related assignment/profile state still looks correct for that test case.
9. Confirm no console errors mention `/rpc/delete_investigator_user`.

## Rollback

Fast rollback:

1. Revert the frontend change to direct Supabase RPC.
2. Revert the root GAS route/handler if desired.
3. `clasp push`.
4. Deploy the previous or rollback Apps Script version.

Because H3a-final revoked Supabase grants, rollback requires re-granting `execute` to `anon` and `authenticated` only if a hidden direct caller is proven.

## Follow-up after H3a verification

H3a and H3a-final are complete. The next staged backend-wrap candidates are the review or assignment functions listed in `docs/supabase-app-facing-security-design.md`.
