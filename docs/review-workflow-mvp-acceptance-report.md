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

## 正式環境 readback

### Supabase

目前已套用至：

20260805101350 satellite_draft_bridge_class_guard_20260805

尚未看到下列本機 migration：

- 20260805_review_workflow_guards
- 20260805_audio_review_claims
- 20260805_review_returns
- 20260805_writeback_claims
- 20260805_assignment_status_separation

目前正式 RPC 仍是舊版，例如 save_annotation_version(case, actor, fields)、approve_review_case(case, actor)、七參數 submit_audio_assessment。

### Google Sheet

正式檔案：Places
Spreadsheet ID：19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI

目前「第三期工作清單」與 TestEntries 都尚未有：

- T_AssignmentStatus
- H_AssignmentStatus

### Places GAS

目前可見 deployment：

- @8 - Satellite draft bridge and written class guard
- 另有 @HEAD deployment，但尚未以本輪程式碼完成 push／deployment readback。

## 正式驗收前待辦

1. 依序套用 Supabase migrations：
   review_workflow_guards → audio_review_claims → review_returns → writeback_claims → assignment_status_separation。
2. 在兩張正式工作表補上四個 AssignmentStatus 欄位。
3. clasp push，建立並讀回 Places GAS 新 deployment。
4. 以授權的測試流程確認：
   地名／語種 → 音檔判定 → 草稿 → 指派校對 → 核准 → 回寫工作 → Sheet readback。
5. 確認舊 token、回寫失敗、退回原因、主狀態留白等防呆後，才宣告 MVP 正式完成。

## 風險與保留事項

- 正式 migration、Sheet 欄位寫入與 GAS deployment 尚未執行，因此目前不能宣告正式 MVP 驗收完成。
- 既有正式 Sheet 資料未被本輪修改。
- 使用者既有未追蹤規劃文件與 UI 截圖保持不動。
