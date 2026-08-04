# 審查 workflow MVP 驗收與 remote handoff

日期：2026-08-04
分支：`codex/review-workflow-mvp`

## 本機已完成

- 建立 Google Drive 備份與 manifest：`docs/review-workflow-backup-manifest-20260804.md`。
- 完成現況 mapping：`docs/review-workflow-relaunch-current-mapping.md`。
- 新增 `review-workflow-core.js`：30 分鐘 claim、兩位不同受訪者門檻、legacy 未審查/未審聽、stable writeback key。
- APP 新增 proofreader 獨立工作台：claim、釋放、ADMIN 改派、校對草稿、approve 建立 writeback job；annotation 與 audio evidence 對 proofreader 唯讀。
- 新錄音要求受訪者代號，仍保留舊 `note.annotations` 與舊音檔資料。
- 新增逐筆 audio evidence；ADMIN 可提交 `可用/不可用/待追問` event。
- 新增未部署 migration：`db/20260804_review_workflow_mvp.sql`，包含 cases、versions、assessment events、proofing events、writeback jobs/errors、RPC/grants 與 legacy backfill。
- Places GAS 新增 writeback queue consumer：source-stamp conflict check、成功 idempotency、retry/error history；舊 satellite Push/Pull 保留。

## 驗證結果

- `node --check main.js`：通過。
- `node --check places-gas/gas/程式碼.js`：通過。
- workflow core/UI focused suite：6 passed。
- 既有音檔、語言指派、管理員使用者 suite：18 passed。
- 完整 Playwright suite：38 passed、8 failed；8 項均為目前既有 mobile touch-target 斷言，實際收到 36/42px、測試要求 44px，集中於 `mobile-quick-wins.spec.js` 與 mobile map。這些失敗沒有修改。

## Live readback 已確認

- Supabase 現有 `audio_records` 沒有 assessment/version 欄位；`task_language_reviews` 沒有 claims/events/version。
- live `approve_task_language` 是 `APP review is temporarily disabled` stub；本輪未啟用或替換。
- 現有 views/functions/grants 與 migration 歷史已讀回；沒有套用新 migration。
- Google Drive 備份已完成並驗證檔案數、ID、名稱、分頁 metadata/range；原始 Form body 透過 Drive API 回傳 403，因此沒有把 metadata 當作 Form 內容驗證。

## 仍需手機 remote 才能完成的項目

1. 套用 `db/20260804_review_workflow_mvp.sql`，讀回 tables、view columns、function definitions 與 grants。
2. 建立/核對至少一個啟用中的 `proofreader` 帳號；若要分離 audio assessor，再核對 `audio_assessor` 角色。
3. 更新並讀回 Root GAS、Places GAS deployment；只 `clasp push` 不算完成。
4. 用測試地名走一次：ADMIN 改派 → proofreader claim → 兩筆不同 respondent audio assessment → proofing approve → Sheet queue writeback → conflict/retry/error readback。
5. 若要恢復原始 Form 內容或確認 response destination，需以手機瀏覽器處理授權。

本機沒有 push Git、正式 Sheet 寫入、正式 GAS deployment 或 Supabase migration。
