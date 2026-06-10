# TopoNote App Codex 帳號轉移交接文件

更新日期：2026-06-10  
目的：讓另一個帳號的 Codex agent 進入此專案時，可以先讀本檔掌握目前狀態、必要權限、啟動檢查、部署注意事項與資料同步風險。

## 最重要的轉移警告

1. 目前本地 `main` 比 `origin/main` 超前 5 個 commit。新帳號若只從 GitHub clone `origin/main`，會少掉這 5 個本地 commit。
2. 目前 workspace 路徑是：
   `C:\Users\user\我的雲端硬碟 (kunui711@alum.naer.edu.tw)\kunui711工作資料夾\地名登錄工具_prototype\TopoNote_App`
3. 舊 handoff 曾提到 `H:\`、`X:\` 或 `C:\codex-work\TopoNote_App`，但接手時一定要以 live environment 的 cwd 為準，不要沿用舊路徑假設。
4. GitHub remote 目前是：
   `https://github.com/datow711/TopoNote_prototype.git`
5. 接手帳號需要另外確認是否有 GitHub、Supabase、Google Sheet、Apps Script / clasp 權限。這些授權不會因為 Markdown 檔一起轉移。

## 接手 agent 第一輪必做檢查

在做任何修改前，請先執行：

```powershell
git status --short --branch
git remote -v
git log --oneline -8
node --check main.js
git diff --check
```

2026-06-10 本檔建立前的 live 結果：

```text
git status --short --branch
## main...origin/main [ahead 5]

git remote -v
origin  https://github.com/datow711/TopoNote_prototype.git (fetch)
origin  https://github.com/datow711/TopoNote_prototype.git (push)

node --check main.js
PASS

git diff --check
PASS
```

本地超前 `origin/main` 的 5 個 commit：

```text
6a704ee Align task export button with logout
c74e0e4 Fix dev server route resolution
73fb700 Add local dev server script
d634446 Add investigator task list export
8fccdd6 Batch assignment sheet writeback
```

如果新帳號要接續完整狀態，請先確認這些 commit 已經存在於新 workspace；若還沒有，必須從本機 repo 轉移或先由原帳號 push。

## 建議先讀的本地文件

請按這個順序閱讀：

1. `CODEX_ACCOUNT_TRANSFER_HANDOFF.md`：本檔，帳號轉移總覽。
2. `logs/timeline.md`：近期功能與資料流時間線。
3. `logs/sessions/2026-06-10-task-list-export.md`：最近一次功能變更摘要與驗證。
4. `logs/sessions/2026-06-08-language-assignment-alignment.md`：語言別指派模型重整。
5. `logs/sessions/2026-06-01-daily-prework-sync.md`：每日同步 runner 與手動 trigger 限制。
6. `docs/current-operation-flow.md`：Sheet / Supabase / APP / GAS 的資料流與衝突保護說明。
7. `NEXT_WORKSPACE_MIGRATION_HANDOFF.md`、`NEXT_CHAT_HANDOFF.md`：舊交接脈絡。部分終端輸出可能有亂碼，但仍有歷史資訊。

## 專案概況

TopoNote App 是一個靜態前端加 Supabase、Google Sheet、Google Apps Script 的地名登錄/審查工具。

主要檔案：

- `index.html`：入口頁。
- `main.js`：主要前端邏輯。
- `style.css`：主要樣式。
- `config.js`：Supabase URL、anon key、GAS web app URL。注意不要把 service role key 放進前端。
- `db/`：Supabase migration / smoke test SQL。
- `places-gas/gas/`：主要 Apps Script 原始碼。
- `logs/`：人工維護的 session 與 timeline 紀錄。
- `tests/`：Playwright 測試，目前有語言指派相關測試。
- `scripts/dev-server.mjs`：本地靜態 dev server。

本地執行：

```powershell
npm install
npm run dev
```

預設 URL：

```text
http://localhost:5173
```

測試：

```powershell
npm run test:ui
```

如果只是檢查 JS 語法：

```powershell
node --check main.js
```

## Git 與工作習慣

- 分支目前是 `main`。
- 不要假設本地 commit 已經 push。接手前先比對 `main...origin/main`。
- 這個專案的工作習慣是：有實質修改時通常要 commit；但不要自動 push，除非使用者明確要求。
- 可能存在使用者尚未提交的變更；不要使用 `git reset --hard` 或 `git checkout --` 之類會覆蓋他人工作的命令，除非使用者明確要求。

## Supabase

Project ref：

```text
sikconjhtomqdkicbjal
```

前端使用 `config.js` 內的 Supabase anon key。涉及 schema、RPC、RLS 或資料狀態時，不要只靠記憶或舊文件，請用 live Supabase connector 或 SQL readback 驗證。

重要表 / view / RPC 包含：

- `investigators`
- `test_places`
- `third_phase_places`
- `final_tasks`
- `task_assignments`
- `audio_records`
- `task_language_reviews`
- `app_tasks_view`
- `app_review_queue_view`
- `app_users_view`
- `app_language_assignment_sheet_view`
- `sync_sheet_users(p_users jsonb)`
- `assign_task_language(...)`
- `unassign_task_language(...)`
- `approve_task_language(...)`
- `revoke_task_language_review(...)`
- `mark_reviews_sheet_synced(...)`

重要規則：

- UI 顯示使用者姓名。
- hover 顯示 email。
- login、filter、assignment、DB write 仍以 account/email 作為 key，不要改成 name。
- 指派已改為語言別模型：台語、客語分開指派。
- 2026-06-09 已把 legacy 既有指派映射到台語；客語保持未指派，供後續人工重設。
- `app_language_assignment_sheet_view` 已縮小到只輸出 `needs_sheet_sync` rows，避免 GAS 大量掃寫 Sheet 語言欄位。

## Google Sheet / Apps Script

Places spreadsheet id：

```text
19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI
```

主要 GAS 專案：

```text
places-gas/
places-gas/gas/
```

Apps Script script id：

```text
18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN
```

`places-gas/.clasp.json` 可能是本機存在但不一定被 git 追蹤的檔案。新帳號如果要 push GAS，請先確認 clasp 已登入正確 Google 帳號，且 `.clasp.json` 指向上面的 script id。

常用 GAS 指令：

```powershell
Set-Location places-gas
npx.cmd clasp status
npx.cmd clasp push
```

注意：

- `npx.cmd clasp push` 曾在此專案驗證可用。
- `clasp run` 在此環境曾失敗，錯誤為：`Script function not found. Please make sure script is deployed as API executable.`
- 因此一次性的 trigger 安裝通常要到 Apps Script 編輯器手動執行，除非新的帳號/部署模式已重新配置 API executable。
- Apps Script Properties 需要設定 `SUPABASE_SERVICE_ROLE_KEY`；不要把 service role key commit 到 repo。
- `SUPABASE_URL` 可選，未設定時 GAS 會使用程式碼內的預設 Supabase URL。

## 每日同步與衝突保護

目前建議是一個早晨同步 pipeline，而不是多個平行 trigger。

Handler：

```text
runDailyPreworkSync
```

預期排程：

```text
Asia/Taipei 每天約 06:30
```

一次性安裝 function：

```text
installDailyPreworkSyncTrigger
```

移除 / 查詢：

```text
removeDailyPreworkSyncTriggers
getDailyPreworkSyncStatus
```

執行順序：

1. `syncApprovedReviewsToSheets`
2. `syncThirdPhasePlacesToSupabase`
3. `syncFinalTasksToSupabase`
4. `syncUsersToSupabase`

原因：

- APP 審查結果要先回寫 Sheet。
- 再把 Sheet 當作早晨 baseline 同步回 Supabase。
- `LockService.getScriptLock()` 用來避免手動同步與每日同步重疊。

衝突保護依賴：

- Sheet 欄位 `T_UpdatedAt`
- Sheet 欄位 `H_UpdatedAt`
- Supabase 對應的 `t_updated_at`
- Supabase 對應的 `h_updated_at`
- `AuditLogger` installable `onEdit` trigger

如果 `AuditLogger` trigger 沒有啟用，手動 Sheet 編輯可能不會更新 timestamp，APP 回寫就無法可靠偵測衝突。

## 近期已完成但接手要特別留意的變更

2026-06-10：

- 新增調查員任務清單匯出功能。
- 調查員資訊列 logout 旁有匯出按鈕。
- 可匯出 PDF 與 XLS。
- 匯出資料依縣市、鄉鎮、地名排序。
- PDF/XLS 皆在前端產生，不需新 package 或後端改動。
- 已用 `node --check main.js`、`git diff --check` 與 headless browser blob 檢查驗證。

2026-06-08 至 2026-06-09：

- 地名指派改成台語/客語分開。
- Admin place cards 與 batch assignment/unassignment 都需要選語言。
- Supabase 在 `task_language_reviews` 儲存 `assigned_to`、`assigned_by`、`assigned_at`。
- GAS 透過 `app_language_assignment_sheet_view` 回寫 `T_State/T_Annotator` 與 `H_State/H_Annotator`。
- 已避免 broad Sheet rewrites，只回寫需要同步的 rows。

2026-06-01：

- 新增每日 prework sync runner。
- 新增 trigger 安裝、移除、查詢 helper。
- `clasp run` 目前不可依賴，可能需要 Apps Script editor 手動跑 trigger installer。

## 接手時要補的外部權限

新帳號若要完整開發/部署，至少需要：

1. GitHub repository access：`datow711/TopoNote_prototype`
2. Supabase project access：`sikconjhtomqdkicbjal`
3. Google Sheet access：Places spreadsheet `19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
4. Google Apps Script project access：script id `18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`
5. clasp login for the Google account that can edit that Apps Script project
6. Apps Script Properties access to verify `SUPABASE_SERVICE_ROLE_KEY`

## 不要踩的坑

- 不要把姓名當成資料 key；姓名只用於顯示。
- 不要讓前端持有 service role key。
- 不要用只 clone remote 的方式接手，除非已確認本地 ahead commits 已 push。
- 不要在未確認 `AuditLogger` trigger 的情況下宣稱 Sheet/APP 衝突保護已完整生效。
- 不要在未 live verify 的情況下修改 Supabase schema 或 RPC。
- 不要在 `places-gas/` 之外推送 GAS，除非已先查清楚根目錄 `gas/` 與 `places-gas/gas/` 的差異與用途。
- 不要自動 push；push 前需使用者明確要求。

## 下一個 agent 的建議開場回報

讀完本檔後，請向使用者回報：

1. 目前 workspace 實際路徑。
2. `git status --short --branch` 結果。
3. 是否仍 `ahead origin/main`，以及 ahead commits 是否已保留。
4. `node --check main.js` 與 `git diff --check` 是否通過。
5. 是否已具備 GitHub / Supabase / Google / clasp 權限。
6. 若要碰 GAS 或 Supabase，先說明會做 live verification。

