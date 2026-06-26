# H2 implementation plan - backend-wrap set_investigator_active

Updated: 2026-06-26.

Status: design/prep only. This file does not approve frontend changes, GAS changes, Supabase SQL/grant changes, `clasp push`, or Apps Script deployment.

## Plain-language goal

Today, the admin user manager toggles an investigator account on/off by calling Supabase directly from the browser:

```text
APP browser -> Supabase RPC set_investigator_active
```

H2 should move that admin write behind root GAS:

```text
APP browser -> root GAS -> Supabase RPC set_investigator_active
```

This keeps the high-impact account toggle out of direct browser-to-Supabase RPC exposure while preserving the current admin UI behavior as much as possible.

## Current code evidence

Current frontend caller:

- `main.js` function `toggleInvestigatorActive(userId, isActive, checkbox)`
- Direct endpoint: `/rest/v1/rpc/set_investigator_active`
- Current request body:
  - `p_user_id`
  - `p_is_active`
  - `p_actor_account`

Existing root GAS backend pattern:

- `gas/程式碼.js` route `action === 'updateUserProfile'`
- `handleUpdateUserProfile(data)`
- verifies admin password through `verifyAdminPassword_(actorAccount, adminPassword)`
- calls Supabase via `callSupabaseRpc_()` with `SUPABASE_SERVICE_ROLE_KEY`

## Proposed H2 scope

Implement one new root GAS action:

```text
setInvestigatorActive
```

Do not change these in H2:

- `delete_investigator_user`
- `approve_task_language`
- `revoke_task_language_review`
- `assign_task_language`
- `unassign_task_language`
- app-facing views or RLS policies
- Supabase grants for `set_investigator_active`

Grant revocation should be a later H2 follow-up only after the new GAS path is deployed and manually verified.

## Proposed frontend contract

Frontend request to root GAS:

```json
{
  "action": "setInvestigatorActive",
  "actorAccount": "admin@example.com",
  "adminPassword": "entered-admin-password",
  "userId": "target-user-uuid",
  "isActive": false
}
```

Success response:

```json
{
  "success": true,
  "userId": "target-user-uuid",
  "isActive": false,
  "supabase": {
    "id": "target-user-uuid",
    "is_active": false
  }
}
```

Failure response follows the existing root GAS error shape:

```json
{
  "success": false,
  "error": "message"
}
```

## Admin password UX decision

Current `toggleInvestigatorActive` does not ask for an admin password. Current `updateUserProfile` does ask for `adminPassword` inside the profile edit modal.

H2 needs one explicit UX decision before implementation:

1. Prompt for admin password each time the toggle changes.
2. Add an admin password field to the user manager section and reuse it for multiple toggles.
3. Defer H2 implementation until a real admin session token exists.

Recommended for first H2 implementation:

- Option 1: prompt for admin password on each toggle.

Reason:

- Smallest frontend change.
- Matches the existing admin password verification model without inventing a new session system.
- Easy rollback to direct RPC if needed.

Tradeoff:

- Less convenient for bulk admin user management.

## Proposed GAS implementation

Add route in `doPost`:

```javascript
if (action === 'setInvestigatorActive') return handleSetInvestigatorActive(requestData);
```

Add helper:

```javascript
function setInvestigatorActiveInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('set_investigator_active', {
    p_user_id: data.userId,
    p_is_active: !!data.isActive,
    p_actor_account: data.actorAccount
  }, config.serviceRoleKey);
}
```

Add handler:

```javascript
function handleSetInvestigatorActive(data) {
  var actorAccount = normalizeEmail_(data.actorAccount);
  var adminPassword = String(data.adminPassword || '');
  var userId = String(data.userId || '').trim();
  var isActive = data.isActive === true;

  if (!actorAccount || !adminPassword) {
    throw new Error('Admin account and password are required');
  }
  if (!userId) {
    throw new Error('User id is required');
  }

  verifyAdminPassword_(actorAccount, adminPassword);
  var supabaseResult = setInvestigatorActiveInSupabase_({
    userId: userId,
    isActive: isActive,
    actorAccount: actorAccount
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    userId: userId,
    isActive: isActive,
    supabase: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}
```

## Proposed frontend implementation

Change `toggleInvestigatorActive` from direct Supabase RPC to root GAS call:

1. Prompt for admin password.
2. If cancelled, restore checkbox and stop.
3. POST to `API_URL`.
4. On success, call `refreshAdminUsers()`.
5. On failure, restore checkbox and show error.

Pseudocode:

```javascript
const adminPassword = prompt('Admin password required');
if (!adminPassword) {
  checkbox.checked = !isActive;
  return;
}

const response = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    action: 'setInvestigatorActive',
    actorAccount: state.userId,
    adminPassword,
    userId,
    isActive
  })
});
```

## Deployment plan

Only after the user approves H2 implementation:

1. Create a new branch.
2. Edit `main.js`.
3. Edit root `gas/程式碼.js`.
4. Run local checks:
   - `node --check main.js`
   - `node --check gas/程式碼.js`
   - Places GAS syntax checks as a guard
   - `git diff --check`
5. `npx.cmd clasp push` from repo root.
6. Create a new Apps Script version.
7. Update active Web App deployment.
8. Manually verify admin user toggle in the APP.
9. Commit and merge only after verification.

## Manual verification for future H2 implementation

After deploy:

1. Log in as admin.
2. Open admin user manager.
3. Toggle one non-critical investigator inactive.
4. Enter admin password when prompted.
5. Confirm the UI refreshes and the user shows inactive.
6. Toggle the same investigator active again.
7. Confirm the user can log in again.
8. Confirm root GAS `updateUserProfile` still works.
9. Confirm no console errors mention `/rpc/set_investigator_active`.

## Rollback

Fast rollback:

1. Revert the frontend change to direct Supabase RPC.
2. Revert the root GAS route/handler if desired.
3. `clasp push`.
4. Deploy the previous or rollback Apps Script version.

Because H2 should not revoke Supabase grants yet, rollback does not require emergency SQL.

## Follow-up after H2 verification

Only after the GAS path is stable:

1. Run Supabase advisors again.
2. Confirm app no longer calls `/rpc/set_investigator_active` from browser.
3. Decide whether to revoke `anon` / `authenticated` execute on `set_investigator_active`.
4. If approved, make that grant change as a separate SQL batch with rollback SQL.
