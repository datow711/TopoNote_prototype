# State workflow pre-change backup

Captured on 2026-09-22 before the T_State/H_State workflow redesign.

## Git baseline

- Baseline commit: `22a8f84 docs: auto-flag sparse audio review`
- Backup branch: `codex/state-workflow-backup-20260922`
-施工 branch: `codex/state-workflow-redesign-20260922`
- The working tree was clean before the redesign work started.

## Google Sheet backup

- Source workbook: `Places`
- Source spreadsheet ID: `19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
- Source URL: https://docs.google.com/spreadsheets/d/19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI/edit
- Backup workbook: `Places__backup_before_state_workflow_20260922`
- Backup spreadsheet ID: `1tMrbWEcooAIZZbl0UYDSaXTYsZe9mtyaqkj54aDnEWo`
- Backup URL: https://docs.google.com/spreadsheets/d/1tMrbWEcooAIZZbl0UYDSaXTYsZe9mtyaqkj54aDnEWo/edit
- Verification: backup ID differs from the source; metadata reports 33 sheets; `第三期工作清單` and `TestEntries` headers and sample State rows were read back successfully.

## Supabase backup

- Project ref: `sikconjhtomqdkicbjal`
- Captured at: `2026-09-22 09:55:10.791239+00`
- Snapshot schema: `backup_state_workflow_20260922`
- The snapshot used `CREATE TABLE ... AS TABLE ...` and did not modify the corresponding `public` tables.
- Public access was revoked from the backup schema and its tables.

| Source table | Snapshot row count |
| --- | ---: |
| `third_phase_places` | 6,842 |
| `test_places` | 10 |
| `task_language_reviews` | 25,100 |
| `annotation_cases` | 13,704 |
| `annotation_versions` | 470 |
| `audio_assessments` | 680 |
| `writeback_jobs` | 1 |
| `writeback_errors` | 0 |
| `proofing_events` | 1,616 |

Each source row count was compared with its snapshot row count and matched.

## Restore caution

The snapshot is an in-project logical backup for this State/workflow change. Before restoring rows, stop the related sync jobs and review foreign-key relationships, queue status, and the Sheet source stamp. Supabase platform daily backup/PITR availability is a separate recovery layer and should be used for project-level disaster recovery.
