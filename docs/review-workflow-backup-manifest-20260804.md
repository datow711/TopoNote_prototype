# Review workflow backup manifest

Backup time: 2026-08-04 18:20:04 Asia/Taipei

## Backup location

- Folder: `TopoNote_review_workflow_backup_20260804_182004`
- Folder ID: `1TfAb4gMAOhn_jMdEw7bcUVxI8x21VSyA`
- Folder URL: https://drive.google.com/drive/folders/1TfAb4gMAOhn_jMdEw7bcUVxI8x21VSyA
- Original files were not renamed, edited, moved, or deleted.

## Drive files

| Type | Original | Original ID | Original modified | Backup | Backup ID | Backup modified | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google Form | 調查員邀請登記表單 | `1mwpuc0YEGJpT1KRuHA6pz204Ci2SVXH094-NlABW_Cw` | 2026-08-03T05:53:41.451Z | 調查員邀請登記表單_backup_20260804_182004 | `1BKYdctXEDDNCMZIUgDo4k0mRKERkeyo2e67IQMhveDQ` | 2026-08-04T10:20:34.674Z | Copy succeeded; backup metadata readable; MIME remained Google Form. |
| Response workbook | 調查員人力管理｜地名標注計畫 | `1ugAkMv3D1s4iRWk5wG96V1NzSbMerYd-ExYNyw4fJE4` | 2026-08-03T03:39:04.955Z | 調查員人力管理｜地名標注計畫_backup_20260804_182004 | `1CGefxkppcdmki5eD4F8nhOSbGKi9xkSWbMhgpBbq0hA` | 2026-08-04T10:20:44.817Z | Copy succeeded; 6 tabs and `調查員表單回應` metadata/header/rows read back. |
| Main worklist workbook | Places | `19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI` | 2026-08-04T07:54:25.942Z | Places_backup_20260804_182004 | `1obsWL0WofcJqC0mRxhVRgk3g-qWvfJcdz5MhbgT_jzY` | 2026-08-04T10:20:56.320Z | Copy succeeded; 33 tabs and `第三期工作清單`/`書面標注員名單` ranges read back. |
| Satellite workbook | 書面標注_調查員TEST1 | `1HyHvfkgUNMFufzJ2CHYLLCv7r9YHMcALdgxPHxf6baU` | 2026-05-18T09:10:46.927Z | 書面標注_調查員TEST1_backup_20260804_182004 | `1pVZzArStWPbqpjhqZK-je4hWedSknbuduccN8i5g23c` | 2026-08-04T10:21:13.893Z | Copy succeeded; 2 tabs and task/instruction headers read back. |
| Satellite workbook | 書面標注_調查員TEST2 | `1jcxRtoWKCTTvxAspYC39Qhz1loflH5LRn4n-WlZxQpI` | 2026-04-13T09:18:40.104Z | 書面標注_調查員TEST2_backup_20260804_182004 | `1dr4-4s9lZbLR32FQJmKEKAbvYdUV9gl4cG3I3dInlrk` | 2026-08-04T10:21:21.568Z | Copy succeeded; `工作表1` header/data range read back. |

The response-workbook relationship was grounded by the shared Drive parent folder, the exact `調查員表單回應` tab, and matching timestamp/name/email response rows. The connector could not fetch the Google Form body itself (HTTP 403), but Drive metadata and the copy operation both succeeded; no form content was changed.

## Apps Script source backup

The checked-in source was uploaded as a byte-preserving file backup under two subfolders. These are source snapshots from the local workspace; deployment state was not changed or assumed.

- Root GAS script ID: `16gtyfpxsC17zIBK3Ixd97yPRBi9IUIkkk3B8V8_CId2WSZ9iwIAwqTsi`
  - Folder: `Root_GAS_source_16gtyfpxsC17zIBK3Ixd97yPRBi9IUIkkk3B8V8_CId2WSZ9iwIAwqTsi` (`1Z2Qfmv-fNGS3iDdTzhVeYni7o72qgre0`)
  - Files: `appsscript.json` (`1YhTuW1eKnIONS-j046f_5GefcqynwghW`), `GAS_API.gsheet` (`1J2yelclLxgzkphM2AOgcHAPkl_cmov_4`), `程式碼.js` (`1aWl-u_rwqtWWgtqC7jvD_rdF5f93xYuz`)
- Places GAS script ID: `18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`
  - Folder: `Places_GAS_source_18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN` (`1-pIZ_MkC7whpwWnvT1JZiz8yICXzmbbM`)
  - Files: `appsscript.json` (`1QyEpAcPH9bbnOaNmvR8mf5b7BI1cbQtv`), `AuditLogger.js` (`1A08G56K-l2S7rIZOTA3SZRlM99oDqMpQ`), `Dialog.html` (`1NgNf0FJxMPjeGIftnAn_SwY-DStUepf-`), `Sidebar.html` (`1XEvjeU0Yl2Sh_ngdKDsm3lRcZhl9T7VB`), `SideBar.js` (`13kj-WzSwCocGdAljTA3QrbLExxunKbm9`), `程式碼.js` (`1_jdFB0XwTNbPfaoJmDUVFoOVus4HB7T0`)

All 9 uploaded source files were listed in their backup folders and fetched successfully through Drive readback. No service-role key, webhook, or other secret was included in this manifest or uploaded source set.

## Backup count check

- Root backup folder: 7 direct items: 5 copied Drive files plus 2 source folders.
- Root GAS source folder: 3 files.
- Places GAS source folder: 6 files.
- All backup IDs differ from their source IDs.
