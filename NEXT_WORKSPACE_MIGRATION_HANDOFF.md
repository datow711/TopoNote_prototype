# TopoNote App Workspace Migration Handoff

更新時間：2026-05-28

這份文件給「Google Drive 從 `H:\` 改成直接同步到本機路徑後」的新 Codex workspace 使用。新 session 請先讀本檔，再讀 `NEXT_CHAT_HANDOFF.md`、`logs/timeline.md`、最近的 `logs/sessions/`。

## 新 workspace 目標

- 不要再依賴舊的 `H:\我的雲端硬碟\...` workspace。
- 建議把 repo 實體放在非雲端虛擬磁碟、非 junction/subst 的本機 NTFS 路徑，例如：
  - `C:\codex-work\TopoNote_App`
- 新 Codex project/thread 請直接以新本機路徑作為 workspace root。

## 舊路徑與 sandbox 問題

舊工作目錄：

```text
H:\我的雲端硬碟\kunui711工作資料夾\地名登錄工具_prototype\TopoNote_App
```

曾測試 `X:\` 對應原本 `H:\我的雲端硬碟`，一般 shell 可以讀 repo、跑 `git status`、跑 `node --check main.js`，但 Codex browser / node runtime 仍會把 write root 解析回 `H:\...TopoNote_App`，並失敗：

```text
windows sandbox failed: setup refresh failed with status exit code: 1
write ACE grant failed on H:\...\TopoNote_App: SetNamedSecurityInfoW failed: 87
```

因此搬家後應確認新 workspace 的實體路徑真的不在 Google Drive 虛擬磁碟、junction、subst、或會解析回 `H:\` 的映射之下。

## Git 狀態快照

最後確認時間：2026-05-28

```powershell
git status --short --branch
```

當時結果：

```text
## main...origin/main
```

代表工作樹乾淨，且當時 `main` 沒有顯示超前或落後 `origin/main`。

```powershell
git log --oneline -8
```

最近 commit：

```text
48f4936 Add admin task class filters
2be6a75 Add review sheet sync smoke test
94363a5 Update next session handoff
e8f53eb Display users by name
6c496f5 Widen desktop review layout
b931413 Use comparison table for review records
b0c4b02 Add final review fields
69a0edf Guard user roles from sheet sync
```

Git remote：

```text
origin  https://github.com/datow711/TopoNote_prototype.git
```

新 workspace 開始前仍請重新跑 `git status --short --branch` 和 `git log --oneline -8`，以 live 狀態為準。

## 最近新增功能

### 管理員語言分級篩選

最新 commit：`48f4936 Add admin task class filters`

- `app_tasks_view` / `app_review_queue_view` 已新增：
  - `tai_class`
  - `hak_class`
- 管理員任務列表與審查列表新增台語分級、客語分級下拉篩選。
- 管理員列表與審查摘要會顯示台/客分級 badge。
- 一般調查員 UI 不顯示這些管理員分級篩選。
- Supabase migration `task_class_filters` 已 live apply 到 project `sikconjhtomqdkicbjal`。
- Live readback 曾確認正式資料分級包含：
  - `直接標注`
  - `電話調查`
  - `現場調查`
  - `原住民族`
  - `未分類`
  - `N/A`

相關檔案：

- `main.js`
- `style.css`
- `db/2026-05-28_task_class_filters.sql`
- `logs/sessions/2026-05-28-task-class-filters.md`

### 審查回寫 smoke test

commit：`2be6a75 Add review sheet sync smoke test`

- 新增 `docs/review-sheet-sync-smoke-test.md`
- 新增 `db/smoke_review_sheet_sync.sql`
- 用 `TEST0001` 驗證 `test_places` -> `app_sheet_sync_queue` -> GAS -> `TestEntries` 流程。
- SQL 是 read-only，可用於 Supabase SQL editor 或 connector。

## 仍要遵守的專案規則

- 使用者 UI 顯示姓名，hover 看 email。
- 指派、篩選與 DB 寫入仍使用 `account/email` 作為資料值，不要把姓名寫進 assignment/filter value。
- 管理員使用者列表顯示姓名、email、手機，並可切 active。
- 測試地名 `TEST0001` 到 `TEST0010` 走 `test_places`；審查回寫應進 `TestEntries`。
- 審查頁是錄音資料比較表與最終審定欄位。
- 每次完成改動後預設 commit；push 預設由使用者自己做，除非使用者明確要求。

## 新 workspace 開始檢查

在新本機路徑開啟 Codex 後，先跑：

```powershell
git status --short --branch
git remote -v
git log --oneline -8
node --check main.js
git diff --check
```

如果有前端 UI 改動，請再嘗試 browser visual verification。搬到本機路徑後，browser / node runtime 理論上應該比較有機會避開舊的 `SetNamedSecurityInfoW failed: 87` 問題。

## 重要系統連結

- Supabase project id/ref：`sikconjhtomqdkicbjal`
- Places spreadsheet id：`19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`
- GAS 專案目錄：`places-gas/`
- GAS 主檔：`places-gas/gas/程式碼.js`
- 若改 GAS，通常要在 `places-gas/` 執行 `npx clasp push`。

## 建議下一步

- 搬家後先確認 browser / node runtime 是否能在新本機路徑正常啟動。
- 用管理員帳號檢查新分級篩選：
  - 台語分級可篩 `直接標注`、`電話調查`、`現場調查`、`原住民族` 等。
  - 客語分級同上。
  - 一般調查員模式不應出現管理員分級篩選。
- 若篩選視覺太擠，再做 compact toolbar 微調。
