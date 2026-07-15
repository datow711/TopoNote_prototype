# TopoNote App 最新開發交接

更新時間：2026-07-15（Asia/Taipei）

這份文件依 2026-07-15 本地工作區的實際程式碼、SQL、文件與資料檔重新盤點。它優先於 2026-05 至 2026-06 的舊 `NEXT_*_HANDOFF.md`；但線上 Supabase、Google Sheet 與 Apps Script 部署狀態尚未在本次盤點中重新 readback，因此文件內提到的線上狀態必須在變更前再次確認。

## 一句話架構

TopoNote 是一套原生 HTML/CSS/JavaScript 的靜態 PWA：瀏覽器直接使用 Supabase Data API 讀寫一般資料，Root Google Apps Script 負責 Drive 音檔與高權限管理操作，另一組綁定 Places 試算表的 Apps Script 負責 Google Sheet、Supabase 之間的同步與衝突保護。

## 接手後第一輪必做

1. 先讀本文件、`docs/architecture-inventory.md`、`docs/current-operation-flow.md`。
2. 不要立即 commit。先釐清目前 `.git` 為何沒有本地 commit/ref，詳見「Git 工作區異常」。
3. 執行 JS 語法檢查：

   ```powershell
   node --check main.js
   node --check gas\程式碼.js
   node --check places-gas\gas\程式碼.js
   node --check places-gas\gas\AuditLogger.js
   node --check places-gas\gas\SideBar.js
   node --check scripts\dev-server.mjs
   ```

4. 若要改登入、管理員密碼、RLS、view 或 RPC，先對線上 Supabase 做唯讀 schema/function/grant readback。
5. 若要跑 Playwright，先修復本地 npm 安裝；目前 `node_modules` 不完整。
6. 若要改 GAS，先分清楚 Root GAS 與 Places GAS，兩者不是同一個 Apps Script 專案。

## 專案入口與檔案角色

### 瀏覽器前端

- `index.html`：單頁 UI 骨架與 inline click handler。
- `style.css`：完整 UI 樣式，約 2,400 行。
- `main.js`：主要業務邏輯，約 4,647 行。
- `config.js`：Root GAS Web App URL、Supabase URL 與公開 anon key。
- `manifest.json`、`sw.js`：PWA 設定。Service Worker 目前只直接轉送請求，沒有離線快取。
- `scripts/dev-server.mjs`：無框架靜態開發伺服器，預設 `http://localhost:5173`。

啟動方式：

```powershell
npm run dev
```

### Root GAS

- 目錄：`gas/`
- clasp 設定：根目錄 `.clasp.json`
- Script ID：`16gtyfpxsC17zIBK3Ixd97yPRBi9IUIkkk3B8V8_CId2WSZ9iwIAwqTsi`
- Web App 設定：`executeAs: USER_DEPLOYING`、`access: ANYONE_ANONYMOUS`

目前 `doPost` 路由：

- `upload`：音檔存入 Google Drive，並保留舊 `Records` Sheet 紀錄。
- `linkAudioRecords`：把既有 Drive 音檔連結到其他地名並寫舊 `Records`。
- `getAudio`：代理 Drive 音檔供瀏覽器播放。
- `submitFeedback`：寫問題回報試算表，可選擇通知 Chat webhook。
- `setInvestigatorActive`：驗證管理員密碼後，以 service role 呼叫 Supabase。
- `deleteInvestigatorUser`：驗證管理員密碼後，以 service role 呼叫 Supabase。
- `changeAdminPassword`：驗證舊密碼後，以 service role 更新密碼。
- `updateUserProfile`：更新 Supabase，並回寫 Places `Users` Sheet。
- `unlinkAudioRecord`：軟解除錯誤地名與音檔的關聯。
- `getAnnouncements`、`markAnnouncementRead`、`createAnnouncement`：公告功能。
- 舊 `login` 路由已隔離，固定回傳 `legacy_login_disabled`；不要因為仍有 `handleLogin` 就誤判為現行登入流程。

Root GAS 需要的 Script Properties 至少包括：

- `FOLDER_ID`
- `SHEET_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- 可選 `SUPABASE_URL`、`SUPABASE_ANON_KEY`
- 問題回報使用的 `FEEDBACK_SPREADSHEET_ID`、`CHAT_WEBHOOK`

禁止把 service role key 或 webhook 寫進 repo。

### Places GAS

- 目錄：`places-gas/`
- Apps Script 原始碼：`places-gas/gas/`
- Script ID：`18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`
- 綁定 Places spreadsheet：`19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`

主要責任：

- `syncThirdPhasePlacesToSupabase`：`第三期工作清單` 全量 upsert 到 `third_phase_places`。
- `syncFinalTasksToSupabase`：建立／更新 `final_tasks` 索引。
- `syncUsersToSupabase`：`Users` 單向同步到 `investigators`。
- `syncTaskAssignmentsToSheets`：語種指派狀態回寫 Sheet。
- `syncApprovedReviewsToSheets`：APP 審查結果回寫 Sheet。
- `AuditLogger.js`：在 Sheet 人工修改時更新 `T_UpdatedAt`／`H_UpdatedAt`，供衝突檢查。
- checkpoint tabs：風險較高的回寫前建立 `__ckpt_*`。
- L3 衛星表 push/pull：是獨立的書面／直接標注流程，不可當死碼移除。

每日 `runDailyPreworkSync` 使用 `LockService` 防止重疊，約在 Asia/Taipei 06:30 執行，順序為：

1. APP 審查回寫 Sheet。
2. APP 語種指派回寫 Sheet。
3. 第三期完整清冊同步到 Supabase。
4. 第三期任務索引同步到 Supabase。
5. Users 同步到 Supabase。

## 目前前端功能

- 調查員 email 登入、管理員 email＋密碼登入。
- 24 小時 localStorage session restore。
- 任務清單／其他地名／管理員審查／使用者管理 tabs。
- 縣市、複選鄉鎮、地名分類、台語／客語分類、客語區、錄音狀態與文字搜尋。
- 台語與客語分語種指派、解除指派、批次選取。
- 現場 MediaRecorder 錄音與手機／LINE 音檔上傳。
- 選取地名後，錄音區標題下方會顯示 `info` 的「地名補充資訊」；空白時隱藏，多行內容保留換行。
- 音檔先經 Root GAS 存 Drive，再由前端新增 `audio_records`。
- 原上傳者可只修改音檔文字內容，不需重傳音檔。
- 管理員可將既有音檔連結到其他地名，也可軟解除錯誤連結。
- 管理員逐語種審查、比較各錄音內容並填入最終審定欄位。
- 調查員公告、未讀狀態及管理員定向公告。
- 管理員使用者資料修改、啟停、刪除與改密碼。
- 管理員錄音上傳報告：可切換依台北日期或依上傳者彙整，最新在上；上傳者以姓名為主、email 為副，可展開查看地名明細；共用音檔連結不重複計數，軟解除的原始上傳仍保留於歷史報告。
- 問題回報、任務清單 PDF/XLSX 匯出、無資料寫入的操作教學。

## 正常資料流

```text
Google Sheet「第三期工作清單」
        │ Places GAS
        ▼
third_phase_places ──► final_tasks
        │                    │
        └──── app_tasks_view ┘
                     │
                     ▼
                  前端 APP
                     │
      錄音 ──────────┼────────── 審查／指派
       │             │                │
       ▼             ▼                ▼
  Root GAS       audio_records   task_language_reviews
       │                              │
  Google Drive       app_sheet_sync_queue / app_language_assignment_sheet_view
                                      │ Places GAS
                                      ▼
                                回寫 Google Sheet
```

音檔目前有雙軌紀錄：Root GAS 仍寫舊 `Records` Sheet，APP 的正式讀取來源則是 Supabase `audio_records`。未經營運決策不要任意移除 `Records` 寫入。

## Supabase 專案與資料模型

- Project ref：`sikconjhtomqdkicbjal`
- 前端透過 `config.js` 的公開 anon key 直接使用 PostgREST。
- 這不是 Supabase Auth session 架構，而是自訂 `investigators`＋login RPC＋前端 localStorage session。

重要 tables：

- `third_phase_places`：第三期 Sheet snapshot。
- `test_places`：測試資料，回寫 `TestEntries`。
- `final_tasks`：任務索引、來源路由與部分相容指派欄位。
- `audio_records`：音檔 metadata、文字內容及軟解除欄位。
- `investigators`：調查員與管理員資料。
- `task_language_reviews`：逐任務、逐語種的指派與審查狀態。
- `task_assignments`：舊相容／歷史層，仍不可移除。
- `moi_placename_raw`：legacy source，不在目前 app-facing views 內，但不可直接刪除。
- `announcements`、`announcement_reads`：公告與已讀紀錄。

重要 views：

- `app_tasks_view`
- `app_review_queue_view`
- `app_users_view`
- `app_sheet_sync_queue`
- `app_language_assignment_sheet_view`

重要 RPC：

- 瀏覽器仍會呼叫：`login_investigator`、`login_admin`、`assign_task_language`、`unassign_task_language`、`approve_task_language`、`revoke_task_language_review`。
- Root GAS／service role：`set_investigator_active`、`delete_investigator_user`、`update_investigator_profile`、`change_admin_password`、`soft_unlink_audio_record`、公告 RPC。
- Places GAS／service role：`sync_sheet_users`、`mark_reviews_sheet_synced` 等同步 RPC。

本地 `db/` 有 27 個增量 SQL，但沒有完整初始 schema dump。不要假設從這些 migration 可百分之百重建線上資料庫；重要變更前要先 readback 線上 object definitions、grants、RLS 與 policies。

## 近期變更（舊 handoff 尚未完整涵蓋）

### 2026-07-15 地名補充資訊

- `app_tasks_view.info` 已加入前端 task model。
- 選取地名後，在錄音區標題與語言 tabs 之間顯示「地名補充資訊：{info}」。
- `info` 為空白或只有空白字元時不顯示；多行文字保留換行並允許長文字自動折行。
- 新增 `tests/place-info.spec.js` 驗證多行與空白情況。

### 2026-07-15 管理員錄音上傳報告

- 管理員新增「上傳報告」分頁，一般調查員不可見。
- 前端讀取 `audio_records.created_at`，以 Asia/Taipei 日期分組並由新到舊排序。
- 每日依使用者 ID 彙整筆數；姓名、account、email 會透過 `app_users_view` 資料合併為同一使用者。
- 報告可在「依日期」與「依上傳者」兩種分類方式間切換；依上傳者模式按各人的最新上傳時間排序，內層再按日期與時間由新到舊。
- 上傳者顯示以姓名為主標、email／登入 ID 為副標；找不到姓名的舊紀錄才以原 ID 為主標。
- 展開 ID 可查看時間、地名、語種與任務 ID，明細同樣由新到舊。
- 報告只計算原始上傳，不把 `linkMeta` 共用音檔連結重複算成上傳；原始紀錄即使已軟解除連結仍保留並標示。
- 新增 `tests/upload-report.spec.js`；2026-07-15 完整 Playwright 回歸測試為 20/20 通過。

### 2026-06-29 管理員改密碼

- `db/2026-06-29_admin_password_change.sql`
- 前端經 Root GAS，不直接呼叫高權限 RPC。

### 2026-07-06 公告

- `db/2026-07-06_announcements.sql`
- 新增公告、已讀紀錄與四個 service-role-only RPC。
- 公告失敗不阻擋正常登入與登錄流程。

### 2026-07-08 音檔軟解除連結

- `db/2026-07-08_soft_unlink_audio_records.sql`
- `audio_records` 新增 `unlinked_at`、`unlinked_by`、`unlink_reason`。
- app-facing views 與前端讀取排除已解除的紀錄。
- 音檔本體與 audit 資訊保留，不做硬刪除。

## 已知高優先事項

### 1. Git 工作區異常

2026-07-15 唯讀檢查結果：

- `.git/config` 仍指向 `https://github.com/datow711/TopoNote_prototype.git`。
- `HEAD` 指向 `refs/heads/main`，但本地沒有正常的 `main` commit/ref。
- `git status` 顯示 `No commits yet on main...origin/main [gone]`。
- 目前全部專案檔都被視為 newly added；這與舊 handoff 記載的 commit 歷史不一致。

因此：

- 不要直接 commit 全部檔案。
- 不要用 `git reset --hard` 或 `git checkout --` 嘗試修復。
- 先確認這是否為 Google Drive 搬移／不完整 `.git` 同步造成。
- 最安全方案通常是從正確 GitHub repository 重新 clone 到另一個乾淨目錄，再比較目前工作區內容；執行前需取得使用者同意。

### 2. 管理員密碼欄位不一致

本地 migration 內存在需線上確認的差異：

- `db/2026-05-27_user_display_names.sql` 的 `login_admin` 比對 `investigators.admin_password`。
- `db/2026-06-29_admin_password_change.sql` 的 `change_admin_password` 更新 `investigators.password`。
- 更早的 `db/2026-05-26_users_sheet_sync.sql` 也曾使用 `password`。

這可能代表歷史 migration、線上手動修正或欄位兼容狀態不同。修改登入／密碼前必須查線上：

- `investigators` 實際欄位。
- `login_admin(text,text)` 目前定義。
- 兩個密碼欄的實際使用與資料狀況。
- 不要在輸出或 log 顯示任何密碼值。

### 3. npm／Playwright 測試環境

2026-07-15 已完成：

- 依 `package-lock.json` 執行 `npm ci`，恢復 Playwright 1.60.0 依賴。
- 安裝對應 Chromium 測試瀏覽器。
- `npm run test:ui -- --reporter=line`：20/20 tests 通過。

不要把本地 npm cache、Playwright browser cache 或 `node_modules` commit 進 repo。

### 4. 架構文件落後於程式碼

`docs/architecture-inventory.md`、`docs/current-operation-flow.md` 與 `docs/architecture-goal-status.md` 很有價值，但多停在 2026-06，尚未完整納入公告與音檔軟解除連結。以實際程式、最新 migration 和 live readback 為準。

## 不可誤刪／不可任意改動

- `gas/`：Root GAS 仍在使用。
- `places-gas/`：Sheet operational backend，仍在使用。
- `task_assignments`、`final_tasks.assigned_to`：仍有相容與 profile preservation 用途。
- `ensure_task_language_reviews`：active helper。
- `moi_placename_raw`：需要獨立 retention 決策。
- `第三期工作清單`、`Users`、`TestEntries`。
- `__ckpt_*` checkpoint tabs。
- L3 satellite sheet push/pull 流程。
- `Records`、`Places`、`Assignments`、`Final_Tasks` 等舊 Sheet tab 未取得 retention 決策前不可刪除。
- 隔離中的 Supabase legacy objects 應先 readback 和觀察，不要直接 drop。

## 本地資料檔

`db/placename_base.xlsx` 約 7.8 MB，包含：

- `比對結果_first_million`
- `統計摘要`
- `使用說明`

主表包含地名序號、類型、名稱、音譯、行政區、經緯度、各期計畫、詞頻與重複標記。它是基礎研究／篩選資料，不是 APP 目前直接讀取的線上資料源。

## 測試與驗證狀態

Playwright specs：

- `tests/language-assignment.spec.js`
- `tests/admin-user-profile.spec.js`
- `tests/admin-password-change.spec.js`
- `tests/announcements.spec.js`
- `tests/tutorial.spec.js`
- `tests/upload-report.spec.js`

主要覆蓋：

- 語種指派／解除指派與批次選取。
- 篩選狀態與一般／管理員 UI 差異。
- 既有音檔連結與軟解除。
- 原上傳者修改文字。
- 管理員資料與密碼操作經 Root GAS wrapper。
- 公告、已讀與公告失敗 fallback。
- 不寫資料的操作教學。
- 管理員上傳報告的日期／ID 彙整、明細排序與一般使用者權限。

2026-07-15 已通過所有主要 JS 檔案的 `node --check`，完整 Playwright UI tests 為 20/20 通過。

## 變更類型的安全工作方式

### 前端

1. 確認 inline HTML handler 與動態產生按鈕；函式只有單一文字引用不代表死碼。
2. 執行 `node --check main.js`。
3. 修復依賴後跑 `npm run test:ui`。
4. 用瀏覽器檢查登入、篩選、錄音、審查與管理員流程。

### Supabase

1. 先 readback live schema、function、view、grant、RLS/policy。
2. 公開前端目前依賴 anon Data API；不可 blanket revoke active views/tables/RPC。
3. `SECURITY DEFINER` RPC 必須逐一確認呼叫角色與內部授權檢查。
4. schema 變更要補 migration，並做測試 query／advisor 檢查。
5. 沒有明確授權不要對 live database 寫入。

### Root GAS

1. 修改 `gas/程式碼.js`。
2. 先做語法檢查。
3. `clasp push` 只更新 script source；Web App 行為要更新 deployment version。
4. 驗證 Script Properties 與 OAuth scopes，不輸出 secret。

### Places GAS

1. 修改 `places-gas/gas/`。
2. 確認 checkpoint、LockService、衝突 timestamp 與 test routing。
3. `clasp push` 後仍需在 Sheet／Apps Script 端做 smoke test。
4. `clasp run` 過去不可靠；trigger installer 可能需從 Apps Script editor 手動執行。

## UI／設計原則

- 這是高密度工作工具，不是 landing page。
- 優先 compact、清楚、可快速掃描。
- 一般 UI 使用 `Noto Sans TC`；地名與標注欄位使用 `Iansui`。
- 使用者 UI 顯示姓名，但登入、指派、filter value 與 DB key 維持 account/email。
- 管理員審查以桌機為主要情境，可使用較寬版面。
- 不要為視覺重構破壞既有欄位、inline handler 或 GAS／Supabase contract。

## 建議下一步

依優先順序：

1. 修復／重建正確 Git 工作區與 commit 歷史。
2. 以唯讀方式確認 live Supabase 的登入密碼欄位和 `login_admin` 定義。
3. 修復 npm 安裝並跑完整 Playwright tests。
4. 將公告與音檔軟解除連結補進正式 architecture inventory／operation flow。
5. 再依使用者需求開始功能開發；不要在上述基線未確認前進行大規模清理。

## 交接開場建議

下一位開發者可以先回報：

> 我已讀取 `LATEST_HANDOFF.md`，理解目前由靜態前端、Root GAS、Places GAS、Supabase 與 Google Sheet 組成。開始修改前，我會先避開現有 Git metadata 異常，並在涉及登入／資料庫時先唯讀確認 live schema 與 `login_admin` 定義；任何 live 寫入、GAS deployment、Git 修復或依賴重裝都會先說明範圍。
