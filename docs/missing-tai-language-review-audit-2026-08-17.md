+# 缺少台語 task_language_reviews 稽核報表

- 產生日期：2026-08-17
- 資料來源：Supabase 正式資料庫
- 對象：active formal `final_tasks`，且找不到 `language='台語'` 的 `task_language_reviews`
- 筆數：3835
- 這是唯讀稽核報表；本次沒有建立 review、修改 Supabase 或修改 Google Sheet。

## 欄位說明

- `tai_source_state`、`tai_source_annotator`：舊來源表 `third_phase_places` 的台語狀態與指派人。
- `hakka_review_count`、`hakka_review_assignees`：同一任務目前已有的客語 review 情況。
- `active_*_audio_count`：目前尚未解除連結的音檔數量。
- `triage_category`：依目前來源表資料產生的初步分類，不代表已確認為錯誤。

請先用這份報表逐類判斷，再決定是否要補建台語 review。
