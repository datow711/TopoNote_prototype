# TopoNote current operation flow

更新時間：2026-08-20

這份文件整理目前 `TopoNote_App` 的主要資料流、操作順序、回寫安全邊界，以及本次稽核看到的衝突風險。

## Live check snapshot

- Supabase project：`sikconjhtomqdkicbjal`
- Places spreadsheet：`19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
- Google Sheet tabs checked：
  - `第三期工作清單`
  - `TestEntries`
- `第三期工作清單` live headers include:
  - `UUID`
  - `TaiHan1`, `TL1`, `TL2`, `TL3`, `TaiNote`, `TaiClass`
  - `T_State`, `T_Annotator`, `T_CreatedAt`, `T_UpdatedAt`
  - `Honzii`, `HP1`, `HP2`, `HP3`, `HDialect`, `HakNote`, `HakClass`
  - `H_State`, `H_Annotator`, `H_CreatedAt`, `H_UpdatedAt`
  - `同步警告`
- `TestEntries` live headers include the same review/writeback columns.
- Supabase live counts:
  - `third_phase_places`: 6842
  - `test_places`: 10
  - `final_tasks` from `third_phase_places`: 6842
  - `final_tasks` from `test_places`: 10
  - `final_tasks` from legacy `moi_placename_raw`: 11349
- App-facing views currently route only:
  - `third_phase_places`
  - `test_places`
- `app_sheet_sync_queue` was empty during this check.

## Normal data flow

### 1. Sheet main list to Supabase source snapshot

Operator action:

1. Open the Places spreadsheet.
2. Run GAS menu `地名計畫系統 -> 3. 同步第三期完整清冊至 Supabase`.

What happens:

- GAS reads `第三期工作清單`.
- Rows are posted to Supabase table `third_phase_places` with `on_conflict=uuid`.
- The posted payload includes source fields, annotation fields, state fields, class fields, `T_UpdatedAt`, `H_UpdatedAt`, `同步警告`, and `synced_at`.

Current safety behavior:

- This is a full upsert from Sheet into `third_phase_places`.
- It does not compare against APP review state before updating the source snapshot.
- It should be treated as refreshing the Sheet snapshot in Supabase, not as final review approval.

### 2. Sheet task index to Supabase tasks

Operator action:

1. Run GAS menu `地名計畫系統 -> 4. 將第三期任務索引同步至 Supabase`.

What happens:

- GAS reads `第三期工作清單`.
- Rows are upserted into `final_tasks` with `source_table = third_phase_places`.
- Test rows are separately represented through `test_places` and route to `TestEntries`.

Current safety behavior:

- `app_tasks_view` and `app_review_queue_view` use `third_phase_places` and `test_places`.
- Live readback shows legacy `moi_placename_raw` rows still exist in `final_tasks`, but they are not exposed through the current app-facing views.

### 3. Users Sheet to Supabase

Operator action:

1. Run GAS menu `Users -> 同步 Users 至 Supabase`.

What happens:

- GAS reads the `Users` tab.
- Supabase RPC `sync_sheet_users(p_users jsonb)` upserts normal investigator accounts.

Current safety behavior:

- Sheet sync only creates/updates `role = user` records.
- Admin rows are preserved by DB-side guards.
- Frontend displays names, but assignment/filter/RPC values remain account/email-based.

### 4. Investigator recording flow

Operator action:

1. Investigator logs into the APP.
2. Investigator opens an assigned place.
3. Investigator records or uploads audio.
4. In the current deployed baseline, the browser sends one upload request to Root GAS and does not insert a new audio_records row directly.

What happens:

- The task remains in Supabase.
- Uploaded records are shown in task history and later in the admin review queue.

Current safety behavior:

- Test places `TEST0001` to `TEST0010` remain hidden from normal investigator "other places" unless assigned.

## Audio upload reliability First Stage（正式部署 readback）

本節記錄 2026-08-20 第一階段修補的正式環境 readback；本文件只把已取得證據的 migration、Root GAS、GitHub Pages 與 smoke 結果列為完成。

正式環境目前流程：

1. 前端在確認上傳時建立不可變 uploadJob，固定 clientUploadId、task snapshot、語言、帳號、原始檔名、實際 MIME、Blob 與註記。
2. 前端只送一個 upload action 給 Root GAS；Root GAS 以 service role 驗證 task、取得 Script Lock、檢查 client_upload_id，再依序建立 Drive、寫入 audio_records、確保一筆 Records row，最後回傳正式 row id。
3. 新 Drive 檔名為 Record_<taskId>_<clientUploadId>.<extension>；原始檔名與上傳者資料留在 metadata，不放進 Drive 檔名。
4. DB 失敗時只嘗試將本次新建且尚未被引用的 Drive 檔移到垃圾桶；Records 補寫失敗則保留正式 Drive/DB 資料並回傳 legacyLogPending。同一 ID 重試不重建資源。
5. 管理員既有的 linkAudioRecords 仍是獨立的連結流程，不能與新上傳 coordinator 混淆。

本機與正式驗證證據：

- audio-upload、audio-playback 與 Root GAS contract focused tests：18/18。
- npm run test:ui -- --reporter=line --workers=1：74/74。
- node --check main.js、node --check gas\程式碼.js、測試語法檢查與 git diff --check 通過。

正式環境 readback：

- Supabase migration `20260820065202_audio_upload_reliability` 已套用；`audio_records` 六個欄位與 `audio_records_client_upload_id_key` 已 read back，既有資料列數在套用後保持 1806。
- Root GAS 已部署至設定中的 Web App deployment `@34`；先前 `@32`、`@33` 版本仍可作為回復候選。正式部署前另修正 live `final_tasks` 使用 `id` 而非 `task_id` 的查詢欄位，並重新部署 @34。
- GitHub Pages 根網址回傳 HTTP 200，live `index.html` 使用 `main.js?v=20260820-audio-upload-reliability`，live `main.js` 已包含 `pendingUploadJob` 與 `clientUploadId`。
- 非破壞性 smoke 使用 `TEST0001`／task `23619`：`audio_records.id=1809`、Drive file `12HtvsDmaK_XmITwo1NQ1p63L2HvKfDaj`、Records row 的 `錄音ID` 均對應同一 clientUploadId；相同 payload 第二次送出回傳 `deduplicated=true`，未建立第二筆資源。
- smoke 的 payload 是 4 bytes 合成測試資料，只驗證傳輸、協調、metadata 與 idempotency，不代表已驗證可解碼音檔播放；第二階段仍未開始。

### 5. Admin review approval

Operator action:

1. Admin opens `審查清單`.
2. Admin compares audio records.
3. Admin fills final review fields.
4. Admin clicks `審查通過`.

What happens:

- APP calls `approve_task_language(...)`.
- Supabase updates `task_language_reviews`:
  - `app_state = 已完成標注`
  - `final_fields = ...`
  - `reviewed_by`
  - `reviewed_at`
  - `needs_sheet_sync = true`

### 6. Admin review revoke

Operator action:

1. Admin clicks `撤回審查`.

What happens:

- APP calls `revoke_task_language_review(...)`.
- Supabase updates `task_language_reviews`:
  - `app_state = 待審查`
  - `final_fields = {}`
  - `reviewed_by`
  - `reviewed_at`
  - `needs_sheet_sync = true`

### 7. Supabase review queue to Sheet

Operator action:

1. Run GAS menu `地名計畫系統 -> 5. 回寫 APP 審查結果至工作表`.

What happens:

- GAS reads `app_sheet_sync_queue`.
- If `source_table = test_places`, GAS writes to `TestEntries`.
- Otherwise, GAS writes to `第三期工作清單`.
- Approval writes final fields and sets `T_State` or `H_State` to `已完成標注`.
- Revoke writes `T_State` or `H_State` back to `待審查`.
- After successful write, GAS calls `mark_reviews_sheet_synced(...)` and clears `needs_sheet_sync`.

## Current conflict risk

The system now has the columns needed to detect conflict:

- Sheet has `T_UpdatedAt` and `H_UpdatedAt`.
- `third_phase_places` and `test_places` store `t_updated_at` and `h_updated_at`.
- `AuditLogger.js` updates those Sheet stamps when monitored Sheet cells change, assuming the installable `onEdit` trigger is active.

After the 2026-05-29 deployment, the live writeback path compares those stamps before writing APP review results back to Sheet.

Risk scenario:

1. Sheet is synced into Supabase at time A.
2. Admin reviews in APP based on the Supabase snapshot from time A.
3. Someone edits the same Sheet row/language fields at time B.
4. GAS runs APP review writeback.
5. Without stamp comparison, GAS can overwrite the newer Sheet edit with the APP review result from the older Supabase snapshot.

This was the main "old data overwrites new data" risk. The deployed conflict-detection rule now blocks the silent overwrite path when both stamps are present and differ.

## Conflict detection rule that should be enforced

Before writing APP review output to Sheet:

1. Determine language:
   - 台語 uses `T_UpdatedAt`
   - 客語 uses `H_UpdatedAt`
2. Compare:
   - current Sheet `T_UpdatedAt` / `H_UpdatedAt`
   - Supabase queue source stamp `t_updated_at` / `h_updated_at`
3. If both stamps exist and differ:
   - do not write review fields
   - do not call `mark_reviews_sheet_synced` for that review
   - write `同步警告` with a conflict message
   - keep `needs_sheet_sync = true` so the queue remains visible
4. If stamps match, write normally and clear `needs_sheet_sync`.

Limitation:

- If a Sheet edit does not update `T_UpdatedAt` or `H_UpdatedAt`, conflict cannot be reliably detected.
- Therefore the `AuditLogger` installable `onEdit` trigger must be active and monitored columns must include every field that can affect APP review writeback.

## Current recommendation

Treat the current live flow as conflict-aware for APP review writeback, with one important condition: the Sheet update stamps must be present and current.

The safe operational sequence is:

1. Keep the `AuditLogger` installable `onEdit` trigger active so manual Sheet edits update `T_UpdatedAt` / `H_UpdatedAt`.
2. When GAS reports APP writeback conflicts, inspect `同步警告`.
3. Resolve the conflict manually in Sheet or APP, then rerun Sheet -> Supabase sync before attempting APP review writeback again.
4. If a row has missing update stamps, treat it as lower confidence and avoid concurrent Sheet edits while APP review is pending.

## Daily prework sync

The ideal daily alignment is now a single GAS time-driven trigger instead of several separate triggers.

Schedule:

- Handler: `runDailyPreworkSync`
- Intended time: Asia/Taipei about 06:30 every day, before the 07:30 workday target
- Installer: run GAS function `installDailyPreworkSyncTrigger` once
- Removal: run GAS function `removeDailyPreworkSyncTriggers`
- Status: run GAS function `getDailyPreworkSyncStatus`
- If `clasp run` is unavailable, open the Apps Script editor and run `installDailyPreworkSyncTrigger` manually once.

Execution order:

1. APP review results -> Sheet: `syncApprovedReviewsToSheets({ silent: true, throwErrors: true })`
2. Sheet source snapshot -> Supabase: `syncThirdPhasePlacesToSupabase({ silent: true, throwErrors: true })`
3. Sheet task index -> Supabase: `syncFinalTasksToSupabase({ silent: true, throwErrors: true })`
4. Users Sheet -> Supabase: `syncUsersToSupabase({ silent: true, throwErrors: true })`

Why this order:

- Pending APP review writebacks are attempted first, using the conflict check against `T_UpdatedAt` / `H_UpdatedAt`.
- If a Sheet row changed after the APP review snapshot, GAS writes `同步警告`, skips that row, and keeps the Supabase queue pending.
- Only after writeback attempts does GAS refresh the Supabase source snapshot from Sheet, so Sheet remains the daily morning baseline.
- The script uses `LockService.getScriptLock()` so a manual sync and the daily sync cannot run at the same time.

Operational notes:

- Apps Script time triggers are approximate, so 06:30 means around 06:30, not exactly to the minute.
- The AuditLogger installable `onEdit` trigger must remain active; otherwise manual Sheet edits may not update `T_UpdatedAt` / `H_UpdatedAt`, reducing conflict detection confidence.
- The last run summary is stored in Script Properties as `LAST_DAILY_PREWORK_SYNC`.

## Verification commands used in this audit

```powershell
git status --short --branch
node --check places-gas\gas\程式碼.js
git diff --check
```

Supabase read-only checks:

- table counts for `third_phase_places`, `test_places`, and `final_tasks`
- app-facing source tables in `app_tasks_view`
- app-facing source tables in `app_review_queue_view`
- pending rows in `app_sheet_sync_queue`
- availability of stamp columns on `third_phase_places`, `test_places`, and `task_language_reviews`

Google Sheets read-only checks:

- spreadsheet metadata
- header row for `第三期工作清單`
- header row for `TestEntries`
