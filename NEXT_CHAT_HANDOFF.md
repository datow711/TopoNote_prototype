# TopoNote App 下一個 Chat 交接

更新時間：2026-05-27
目前分支：`main`
目前狀態：工作樹乾淨，`main` 比 `origin/main` 超前 1 個 commit。使用者通常希望每次改動都 commit；push 預設由使用者自己做，除非明確要求。

## 最近完成的 commit

- `e8f53eb Display users by name`
- `6c496f5 Widen desktop review layout`
- `b931413 Use comparison table for review records`
- `b0c4b02 Add final review fields`
- `69a0edf Guard user roles from sheet sync`
- `1ed78ba Add review sheet sync`

## 目前最新功能狀態

- 調查員資料已從 Places Google Sheet 的 `Users` 工作表單向同步進 Supabase。
- `Users` 欄位目前至少包含：
  - `email`
  - `name`
  - `phone`
  - `languages`
  - `hakka_dialect`
  - `life_area_1`
  - `survey_area_1`
  - `life_area_2`
  - `survey_area_2`
  - `life_area_3`
  - `survey_area_3`
  - `active`
  - `role`
- Sheet 端 `email` 和 `name` 不可空；`active` 可用 checkbox 從 Sheet 單向更新進 DB。
- Sheet 同步不可刪 DB 資料。DB 刪除只允許從後台或資料庫端操作。
- `role` 欄位已保留並用來區分 `admin` / `user`，避免新調查員登入後變成管理員模式。
- 舊調查員已清掉，只保留管理者與目前新加的調查員。

## 使用者顯示規則

- 前端 UI 顯示使用者時，改用 `name`。
- 實際登入、指派、篩選、資料寫入仍使用 `account/email` 值，不要改成姓名。
- 一般使用者 hover 自己或錄音紀錄使用者時可看到 email。
- 管理員的使用者管理區會並排顯示姓名、email、手機，並保留 active checkbox。
- `app_users_view` 和 login RPC 已回傳 `name/email/phone`。
- 相關檔案：
  - `main.js`
  - `style.css`
  - `db/2026-05-27_user_display_names.sql`

## 測試地名與審查流程

- 已新增測試用來源表 `test_places`，10 筆 UUID 為 `TEST0001` 到 `TEST0010`。
- 測試地名類別、縣市、鄉鎮皆為「測試」。
- `app_tasks_view` / `app_review_queue_view` 已包含 `third_phase_places` 與 `test_places`。
- 一般調查員只能看到被指派的測試資料；未指派測試資料不出現在一般調查員的「其他」列表。
- 審查完成後：
  - 一般第三期資料回寫第三期工作表。
  - 測試資料回寫 `TestEntries`，避免污染正式第三期工作表。
- Places GAS 已 push 過一次到 Google Apps Script，包含 Users 同步與審查回寫相關調整。

## 審查介面目前狀態

- 審查頁可顯示地名基本資訊。
- 每個地名下面有錄音資料比較表，類似 Excel 並排：
  - 錄音序號
  - 填寫欄位
  - 播放按鈕
- 台語比較欄位：
  - `TaiHan1`
  - `TL1`
  - `TaiNote`
- 客語比較欄位：
  - `Honzii`
  - `HP1`
  - `HakNote`
- 比較表中每個有值的欄位有小按鈕，可複製到最終審定欄位。
- 最終審定欄位：
  - 台語：`TaiHan1`, `TL1`, `TL2`, `TL3`, `TaiNote`
  - 客語：`Honzii`, `HP1`, `HP2`, `HP3`, `HDialect`, `HakNote`
- 桌機版審查頁已加寬，`body` 最大寬度目前為 1120px，以減少錄音比較表橫向捲動。

## 重要資料表與 RPC

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
- `sync_sheet_users(p_users jsonb)`
- `set_investigator_active(...)`
- `assign_tasks_to_user(...)`
- `approve_task_language(...)`
- `mark_reviews_sheet_synced(...)`

## Google Sheet / GAS

- Spreadsheet：`Places`
- Spreadsheet id：`19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
- GAS 專案目錄：`places-gas/`
- GAS 檔案：`places-gas/gas/程式碼.js`
- `.clasp.json` 已存在於 `places-gas/`
- 若改 GAS，完成後通常需要在 `places-gas/` 執行 `npx clasp push`。
- 使用者已同意過上傳 `places-gas` 到 Google Apps Script，但新 session 還是要看當下是否需要再次 push。

## Supabase

- Project id/ref：`sikconjhtomqdkicbjal`
- 最近已 live check：
  - `app_users_view` 可查到 `id/account/role/is_active/name/email/phone`
- 如果改 schema 或 RPC，建議：
  - 用 Supabase connector live verify。
  - 同步補 `db/YYYY-MM-DD_*.sql` migration。

## UI / 設計偏好

- 這個 app 是工作型、列表密集工具，優先 compact、清楚、不要像 landing page。
- 主要 UI font：`Noto Sans TC`。
- 地名與標注輸入區保留 `Iansui`。
- 目前桌機審查流程是主要使用情境，寬一點可以。
- 避免無關裝飾，保持掃描效率。

## 驗證習慣

常用檢查：

```powershell
node --check main.js
git diff --check
git status --short --branch
```

如果改 GAS：

```powershell
Set-Location places-gas
npx clasp push
```

如果改 DB：
- 用 Supabase connector `_execute_sql` 做 live read 或 smoke test。
- 需要 DDL 時先確認是否要 live apply，然後補 migration。

## 環境注意

- 工作目錄：
  - `H:\我的雲端硬碟\kunui711工作資料夾\地名登錄工具_prototype\TopoNote_App`
- Windows / PowerShell。
- 這個 Google Drive 路徑偶爾會讓 sandbox 出現：
  - `windows sandbox: setup refresh failed with status exit code: 1`
- 遇到這個問題時，常見作法是同一個讀取或 git 命令用 escalated permission 重跑。
- Git commit 有時會出現 `.git/packed-refs.lock` stale lock 訊息；如果 commit hash 已產生，請用 `git status` 和 `git log -1` 確認，不要急著重做。

## 下一步候選

- 實際在瀏覽器或使用者端測試新姓名顯示：
  - 登入 badge 顯示姓名、hover email。
  - 管理員使用者列表姓名/email/手機並排。
  - 指派 dropdown 顯示姓名但 value 仍寫 account/email。
  - 已指派 badge 顯示姓名、hover email。
  - 審查錄音比較表與錄音歷史顯示姓名。
- 若使用者繼續測試審查流程，優先確認 `TestEntries` 回寫是否完整、欄位是否符合最終審定需求。
- 若使用者要求整理 Sheet，優先檢查 `Places` 中仍被 APP / GAS 最新流程使用的工作表。
