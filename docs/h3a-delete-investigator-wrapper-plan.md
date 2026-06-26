# H3a implementation plan - backend-wrap delete_investigator_user

Updated: 2026-06-26.

Status: implementation branch in progress. Frontend and root GAS changes were implemented and root GAS was deployed to Apps Script Web App version 23 on 2026-06-26. Supabase grants were intentionally not changed in H3a.

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

## Not changed in H3a

- Supabase grants for `delete_investigator_user`.
- Review RPCs.
- Assignment RPCs.
- App-facing views or RLS policies.
- Google Sheet content.

Grant revocation should be a separate H3a-final batch only after the root GAS path is manually verified.

## Deployment evidence

- `npx.cmd clasp push --force` succeeded.
- Apps Script version 23 was created.
- Active Web App deployment `AKfycbyxPScSi3MxyJUT93vD0-fRx6dT3As7qWkCl_R6VD2BFmgxP4eqQVJKdYvir66CyHBUnw` was updated to `@23`.

## Verification evidence

- `node --check main.js` passed.
- `node --check gas\程式碼.js` passed.
- Search confirmed `main.js` no longer contains `/rpc/delete_investigator_user`.
- Live fake-password smoke test returned `{ "success": false, "error": "Error: Admin password verification failed" }`, which proves the route is deployed and rejects invalid admin credentials before mutation.

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

Because H3a does not revoke Supabase grants, rollback does not require emergency SQL.

## Follow-up after H3a verification

Only after the root GAS delete path is manually verified:

1. Confirm app no longer calls `/rpc/delete_investigator_user` from browser.
2. Decide whether to revoke `anon` / `authenticated` execute on `delete_investigator_user`.
3. If approved, make that grant change as a separate H3a-final SQL batch with rollback SQL.
