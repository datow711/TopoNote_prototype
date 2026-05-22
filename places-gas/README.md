# Places GAS

This folder tracks the Apps Script project bound to the `Places` spreadsheet.

- Script ID: `18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`
- Local clasp root: `places-gas/gas`
- Role: source data management, `第三期工作清單`, satellite annotator sheets, and Supabase task sync.

## Secrets

Do not commit Supabase service role keys. The script reads secrets from Apps Script project properties:

- `SUPABASE_SERVICE_ROLE_KEY`: required Supabase secret key. Prefer a scoped `sb_secret_*` key for this Apps Script.
- `SUPABASE_URL`: optional override; defaults to the TopoNote Supabase URL in code.

Set these in Apps Script project settings before running Supabase sync functions.
When the key starts with `sb_secret_`, the script sends it as `apikey` only with a backend-oriented `User-Agent`. Legacy JWT service-role keys are still supported and use `Authorization: Bearer ...`.

## Common Commands

Run commands from this folder:

```powershell
clasp status
clasp pull
clasp push
```

The `.clasp.json` file is intentionally ignored by git.
