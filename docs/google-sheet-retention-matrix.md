# TopoNote Google Sheet retention matrix

Updated: 2026-06-25.

Status: Batch G phase 1 documentation prep. This file does not approve hiding, archiving, deleting, or editing any Google Sheet tab or column.

## Purpose

This matrix separates active app data, active Sheet-only workflows, historical records, and retention candidates before any Sheet cleanup is attempted.

No Sheet content, Apps Script code, Supabase object, or frontend file is changed by this batch.

## Decision labels

- Keep active: required by current APP, GAS, or operations.
- Keep separate workflow: active workflow outside the APP.
- Keep for now: still written or referenced, but its long-term purpose should be decided.
- Retention decision: likely historical or legacy, but deletion/archive needs explicit human approval.
- Do not delete yet: removal would be risky without a separate migration or export.

## Tab retention matrix

| Sheet tab | Current classification | Evidence / role | Recommended action |
| --- | --- | --- | --- |
| `第三期工作清單` | Keep active | Main Places GAS source and writeback target for third-phase task rows. | Do not hide, archive, or delete. |
| `Users` | Keep active | Source for investigator sync and root GAS admin profile write-through. | Do not hide, archive, or delete. |
| `TestEntries` | Keep active | Hidden test writeback target for app review sync. | Keep hidden if already hidden; do not delete. |
| `__ckpt_*` checkpoint tabs | Keep for now | Created by sync safety/checkpoint behavior before risky writebacks. | Define age/count retention separately before cleanup. |
| `書面標注員名單` | Keep separate workflow | Supports L3 satellite written/direct annotation outside the APP. | Do not treat as legacy APP data; keep unless the user redesigns the workflow. |
| L3 satellite annotator spreadsheets | Keep separate workflow | Receive/pull written annotation through `pushTasksToSatelliteSheets` / `pullResultsFromSatelliteSheets`. | Keep as active Sheet-only workflow. |
| `Records` | Keep for now | Root GAS upload still appends legacy audio log rows while Supabase `audio_records` is the APP source. | Decide whether this is an audit log before stopping writes or archiving. |
| `Places` | Retention decision | Old large source tab referenced by legacy helpers and historical model. | Export/check usage before hiding or archiving; do not delete yet. |
| `Assignments` | Retention decision | Old `UserID`/`PlaceID` assignment model. Batch F disabled the legacy login route that depended on it. | Candidate for archive after confirming no human/reporting dependency. |
| `Final_Tasks` | Retention decision | Historical staging tab; current Supabase `final_tasks` is maintained by Places GAS. | Candidate for archive only after source/history needs are confirmed. |
| Import/classification logs | Retention decision | Human-facing or historical tabs may support operations or audit trails. | Inventory exact tab names with the user before action. |

## Column retention matrix

| Column / field | Location | Current classification | Recommended action |
| --- | --- | --- | --- |
| `T_State`, `T_Annotator`, `H_State`, `H_Annotator` | `第三期工作清單`, `TestEntries` | Keep active | Current assignment writeback fields. |
| `T_UpdatedAt`, `H_UpdatedAt` | `第三期工作清單`, `TestEntries` | Keep active | Conflict protection for Sheet/manual edits. |
| Review/writeback fields | `第三期工作清單`, `TestEntries` | Keep active | Written by review sync and manual Sheet workflows. |
| `AssignedUsers` | `第三期工作清單`, `TestEntries` | Retention decision | Older assignment summary field; do not remove until humans confirm it is no longer read. |
| `AssignmentSyncedAt` | `第三期工作清單`, `TestEntries` | Retention decision | Older assignment sync timestamp; do not remove until humans confirm it is no longer read. |

## Non-removal rules

Do not delete or hide these as part of architecture cleanup:

- `第三期工作清單`
- `Users`
- `TestEntries`
- `書面標注員名單`
- L3 satellite annotator spreadsheets
- `T_State`, `T_Annotator`, `H_State`, `H_Annotator`
- `T_UpdatedAt`, `H_UpdatedAt`

Do not delete these without explicit export/retention approval:

- `Places`
- `Assignments`
- `Records`
- `Final_Tasks`
- `AssignedUsers`
- `AssignmentSyncedAt`
- `__ckpt_*` checkpoint tabs

## Next decision path

Recommended next Sheet cleanup should be a human decision session, not an automated deletion pass:

1. Confirm whether `Records` is required as an audit log.
2. Confirm whether `Places`, `Assignments`, and `Final_Tasks` need export/archive names.
3. Define checkpoint retention policy by age or count.
4. Confirm whether `AssignedUsers` and `AssignmentSyncedAt` are read by humans or reports.
5. Only then create a separate approved Sheet action batch.
