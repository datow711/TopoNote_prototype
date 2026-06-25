# TopoNote GAS cleanup Batch E/F preview

Updated: 2026-06-24.

Status: Batch F pushed, deployed, and smoke-tested on 2026-06-25 after user approval. Batch E remains review only.

## Purpose

This preview prepares two behavior-changing GAS cleanups:

- Batch F: quarantine the root GAS legacy `login` route.
- Batch E: remove old Places GAS L3 satellite push/pull menu entries first, while keeping the functions for one observation period.

These are separated because they affect different operators and rollback paths.

## Approval phrases

Batch F:

```text
同意移除 root GAS legacy login route
```

Batch E:

```text
同意先從 Places GAS 選單移除舊 L3 satellite push/pull
```

Approving one batch does not approve the other.

## Batch F - root GAS legacy login route

### Current local evidence

Current root GAS routing in `gas/程式碼.js`:

```javascript
if (action === 'login') return handleLogin(requestData);
if (action === 'upload') return handleUpload(requestData);
if (action === 'getAudio') return handleGetAudio(requestData);
if (action === 'submitFeedback') return handleSubmitFeedback(requestData);
if (action === 'updateUserProfile') return handleUpdateUserProfile(requestData);
```

Current frontend login in `main.js` uses Supabase RPCs:

- `login_investigator`
- `login_admin`

Local search found no current frontend call that sends `action: 'login'` to root GAS.

### Recommended first implementation

Disable the route but leave `handleLogin` in place for one observation period:

```javascript
if (action === 'login') {
  throw new Error('Legacy GAS login route is disabled. Use Supabase login RPCs.');
}
```

Keep these routes unchanged:

- `upload`
- `getAudio`
- `submitFeedback`
- `updateUserProfile`

Why disable before deleting:

- It gives an immediate signal if an old external client still calls the route.
- It avoids deleting `handleLogin` and `getAllPlacesData` before observing whether an archived deployment still depends on them.

### Preflight checks

Run locally:

```powershell
rg -n "action.*login|handleLogin|login_investigator|login_admin" main.js gas docs tests
node --check main.js
node --check gas\程式碼.js
git diff --check
```

Read-only clasp checks from repo root:

```powershell
Set-Location gas
npx.cmd clasp status
npx.cmd clasp deployments
```

Confirm the active deployment URL in `config.js` still maps to the root GAS deployment.

### Post-change local checks

```powershell
node --check gas\程式碼.js
node --check main.js
git diff --check
```

### Manual app checks after push/deploy

Only after explicit approval to push/deploy:

- Investigator login still works.
- Admin login still works.
- Audio upload still works.
- Audio playback still works.
- Feedback submission still works.
- Admin profile edit still writes Supabase and Places `Users`.

### Deployment path

1. Edit local `gas/程式碼.js`.
2. Run local checks.
3. `npx.cmd clasp push` from `gas/`.
4. Create a new Apps Script deployment version or update the Web App deployment.
5. Confirm `config.js` still points at the active deployment URL.

### Rollback

Restore the old route:

```javascript
if (action === 'login') return handleLogin(requestData);
```

Then push and update the deployment again.

### Later deletion step

After one operating cycle with no old-client failures:

- Remove `handleLogin`.
- Remove `getAllPlacesData` if no other route uses it.
- Decide whether root GAS should still append to the old `Records` sheet during `upload`.

## Batch E - Places GAS L3 satellite menu quarantine

### Current local evidence

Current Places GAS menu includes:

```javascript
.addSubMenu(ui.createMenu('📋 L3 分發與回填')
  .addItem('分發任務到標注員表單 (Push)', 'pushTasksToSatelliteSheets')
  .addItem('從各表單回填結果 (Pull)', 'pullResultsFromSatelliteSheets'))
```

Current active app synchronization does not need these functions. It uses:

- `syncTaskAssignmentsToSheets`
- `syncApprovedReviewsToSheets`
- `app_language_assignment_sheet_view`
- `app_sheet_sync_queue`

The old satellite flow uses:

- `pushTasksToSatelliteSheets`
- `pullResultsFromSatelliteSheets`
- `書面標注員名單`
- separate annotator spreadsheets

### Recommended first implementation

Remove only the L3 submenu entries from `onOpen()` and keep both functions in code:

```javascript
// Temporarily hidden while the APP/Supabase assignment flow is the source of truth.
// pushTasksToSatelliteSheets and pullResultsFromSatelliteSheets remain in code
// for rollback during the observation period.
```

Do not delete:

- `pushTasksToSatelliteSheets`
- `pullResultsFromSatelliteSheets`
- `書面標注員名單`

Why hide before deleting:

- Spreadsheet operators may still know the old menu.
- A menu-only quarantine is easy to roll back.
- It reduces accidental use while keeping recovery simple.

### Preflight checks

Ask the user:

- Is anyone still using L3 satellite Push/Pull from the Places spreadsheet menu?
- Should `書面標注員名單` remain as historical reference?

Run locally:

```powershell
rg -n "pushTasksToSatelliteSheets|pullResultsFromSatelliteSheets|書面標注員名單|syncTaskAssignmentsToSheets|syncApprovedReviewsToSheets" places-gas docs
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

Read-only clasp checks:

```powershell
Set-Location places-gas
npx.cmd clasp status
npx.cmd clasp deployments
```

### Post-change local checks

```powershell
node --check places-gas\gas\程式碼.js
node --check places-gas\gas\AuditLogger.js
node --check places-gas\gas\SideBar.js
git diff --check
```

### Manual Sheet checks after push/deploy

Only after explicit approval to push/deploy:

- Reload the Places spreadsheet.
- Confirm the old L3 satellite Push/Pull submenu is gone.
- Confirm current menu items remain:
  - daily prework sync trigger controls
  - third-phase sync
  - final task sync
  - review writeback
  - assignment writeback
  - `Users` sync
  - `TestEntries` setup
- Run a read-only or test-target check before any production writeback.

### Deployment path

1. Edit local `places-gas/gas/程式碼.js`.
2. Run local checks.
3. `npx.cmd clasp push` from `places-gas/`.
4. Reload the bound spreadsheet.
5. Confirm the menu shape.

### Rollback

Restore the old submenu entries and push again.

### Later deletion step

After one operating cycle with no operator needing L3 satellite Push/Pull:

- Delete `pushTasksToSatelliteSheets`.
- Delete `pullResultsFromSatelliteSheets`.
- Decide whether to archive/hide `書面標注員名單`.
- Update `docs/architecture-inventory.md`.

## Shared cautions

- `clasp push` alone may not update Web App behavior if the live Web App points at an older deployment; root GAS route changes require a deployment/version step.
- Spreadsheet-bound Places GAS menu changes need a push and spreadsheet reload.
- Do not mix Batch E and Batch F in one commit unless both are approved together.
- Keep final architecture docs as drafts until live cleanup and verification are complete.
