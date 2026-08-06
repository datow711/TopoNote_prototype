# TopoNote 審查流程 MVP 驗收報告

- 日期：2026-08-05
- Branch：codex/review-workflow-mvp
- 目前結論：本機 MVP 實作與測試完成；正式環境套用與端到端 readback 尚未完成。
- 資料安全：本輪沒有直接寫入正式 Supabase 資料或正式 Google Sheet。

## 已完成的 MVP 設計

| 項目 | 目前證據 |
| --- | --- |
| 地名 × 語種案件 | annotation_cases、審查 queue 與前端工作台 |
| 音檔 × 地名 × 語種判定 | 音檔檢驗工作台與 audio_assessments |
| 音檔可用／不可用／未審聽 | 音檔判定 UI、原因欄位與 server-side validation |
| 後續處理旗標 | needs_followup 與原因欄位，可與可用／不可用並存 |
| 受訪者代號 | 選填；依使用者最新決定，不強制也不顯示「兩名錄音人」要求 |
| 音檔 temporary claim | 30 分鐘 claim、token 驗證與過期防護 |
| APP／衛星表單草稿 | 先進入版本／草稿層，不直接覆蓋正式標音欄位 |
| 校對工作台 | 音檔檢驗與校對分離；校對者只能進入被指派案件 |
| 校對保存／釋回／核准 | claim token 綁定，核准後建立回寫工作 |
| 分開退回 | 標注內容、音檔可分開退回，原因必填 |
| 回寫保護 | idempotency key、source stamp、claim、retry、error history |
| AssignmentStatus | 未指派時主狀態留白，另以 T/H_AssignmentStatus=未指派 表示 |

## 本機驗證

- npm run test:ui：57 passed
- node --check main.js：通過
- node --check places-gas/gas/程式碼.js：通過
- git diff --check：通過

## 本輪主要 commits

- 10990a9 fix: keep respondent labels optional
- 2bb4082 fix: separate assignment status from main state
- b5bc867 fix: clarify satellite draft field guard
- d381c44 fix: claim writeback jobs atomically
- 56897b2 feat: add separate proofing returns
- cf8d546 feat: split audio inspection claims
- 6047458 fix: bind proofing writes to current claim
- 4caaa3b feat: split audio inspection and proofing workbenches
- 9d1f000 feat: bridge satellite drafts into proofing versions

## 正式環境 readback（2026-08-06 更新：已完成）

### Supabase

已套用至 `recording_annotation_state_20260806`。本輪依序套用並逐一 readback：

1. `review_workflow_guards_20260805`
2. `audio_review_claims_20260805`
3. `review_returns_20260805`
4. `writeback_claims_20260805`
5. `assignment_status_separation_20260805`
6. `recording_annotation_state_20260806`

驗證結果：

- `app_language_assignment_sheet_view` 由 9 欄增為 11 欄，含 `t_assignment_status`／`h_assignment_status`。
- `app_review_workflow_queue` 41 欄，可查詢。
- 新函數到位：`sync_recording_annotation_state_`、`return_review_case`、`claim_review_writeback_job`、`complete_review_writeback`、`fail_review_writeback`、`claim_audio_review_case`、`release_audio_review_case`、`get_audio_review_claims`。
- `save_annotation_version` 3 參數 wrapper 與 4 參數實作並存；4 參數版已含 `錄音標注中` 推進。
- `submit_audio_assessment` 8 參數版呼叫狀態同步函數；7 參數 admin wrapper 保留作相容。
- 資料未變動：13704 cases／176 versions／4 assessments／1 writeback job，與套用前一致。

### Google Sheet

正式檔案：Places，Spreadsheet ID `19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`。

- 「第三期工作清單」已補 `T_AssignmentStatus`、`H_AssignmentStatus`（AN、AO 欄），拼字經 Drive readback 確認。
- TestEntries 已由使用者手動執行 `setupTestEntriesSheet()` 重整，欄位改為對齊「第三期工作清單」。

### Places GAS

deployment `@9 - Review workflow relaunch: assignment status, audio claims, returns, writeback claims, TestEntries header sync`，已 `clasp push` 並讀回確認。

## 本輪修正的兩個缺陷

1. **`save_annotation_version` overload 改錯**：`20260806_recording_annotation_state.sql` 原本覆蓋 3 參數 wrapper。該 wrapper 的職責是擋下 proofreader 並轉呼叫帶 claim token 的 4 參數版；照原樣套用會使 claim token 檢查失效，且狀態清單根本不在該 overload。套用前發現並修正。
2. **退回的錄音案件無法回到佇列**：`return_review_case()` 退回標音時寫入 `錄音標注中`，但 `save_annotation_version()` 的推進清單未含此值，案件重存草稿後停留在 `錄音標注中`，無法回到 `待校對`。此缺陷自 `20260805_review_returns` 起即存在，因 `錄音標注中` 當時正向不可達而未被觸發。已一併修正。

## 尚未完成

- **前端未上線**：`codex/review-workflow-mvp` 尚未 push，領先 `main` 28 個 commit，repo 無 CI/CD 設定。審查工作台 UI 僅存在本機。舊前端不呼叫新 RPC，且相容 wrapper 保留，因此不會壞，但新功能對使用者尚未生效。
- **`app_language_assignment_sheet_view` 未經真實資料驗證**：目前回傳 0 列（無待同步指派），新增的兩個欄位要等第一次指派才會走到。
- **新 RPC 未在正式環境走過端到端**：8/5 的端到端驗收是對當時的舊 RPC 版本，claim token、分開退回、writeback claim 等新行為尚未在正式環境實測。

## 風險與保留事項

- 既有正式 Sheet 的第三期工作清單資料未被本輪修改。
- TestEntries 欄位順序已改為對齊第三期工作清單；資料依欄名重新對映，遷移前已用實際資料模擬驗證每個非空值均保留於原欄名下。
