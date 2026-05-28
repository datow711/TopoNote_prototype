# APP 審查回寫 Smoke Test

這份手順用 `TEST0001` 驗證 APP 審查結果是否會經由 Supabase queue 正確回寫到 Google Sheet 的 `TestEntries`，避免測試資料污染正式的 `第三期工作清單`。

## 測試目標

- `TEST0001` 的任務來源必須是 `test_places`。
- 管理員審查通過後，`task_language_reviews.needs_sheet_sync` 必須變成 `true`。
- `app_sheet_sync_queue` 必須出現 `TEST0001`，而且 `source_table` 必須是 `test_places`。
- `app_sheet_sync_queue.final_fields` 必須包含審查頁送出的最終審定欄位。
- 執行 Places GAS 的「5. 回寫 APP 審查結果至工作表」後，`needs_sheet_sync` 必須被清回 `false`，`last_synced_at` 必須有時間。
- Sheet 實際回寫位置必須是 `TestEntries` 的 `TEST0001` 列，不是 `第三期工作清單`。

## 前置條件

- Places 試算表已有 `TestEntries` 工作表。
- `TestEntries` 已有 `TEST0001` 到 `TEST0010` 測試列。
- APP 已完成一筆 `TEST0001` 的錄音與管理員審查。
- 管理員審查頁已按下通過，並送出最終審定欄位。

## Supabase 檢查

在 Supabase SQL editor 或 connector 執行：

```sql
-- db/smoke_review_sheet_sync.sql
```

判斷標準：

- `target_task_exists` 查詢應該回傳一列，且 `source_table = test_places`。
- `review_state_for_test0001` 至少有一列 `app_state = 已完成標注`。
- GAS 回寫前，對應語言的 `needs_sheet_sync = true`。
- GAS 回寫前，`queue_rows_for_test0001` 應該回傳 `source_table = test_places`，並帶有 `final_fields`。
- `unexpected_test_queue_routing` 應該回傳 0 列。
- GAS 回寫後，對應語言的 `needs_sheet_sync = false`，且 `last_synced_at` 不為空。

## GAS 回寫步驟

1. 開啟 Places 試算表。
2. 到選單 `地名計畫系統`。
3. 執行 `5. 回寫 APP 審查結果至工作表`。
4. 成功訊息應顯示已回寫筆數，且已清除待同步標記。
5. 到 `TestEntries` 找 `TEST0001`，確認審定欄位已更新。

## Sheet 檢查欄位

台語審查至少確認：

- `TaiHan1`
- `TL1`
- `TL2`
- `TL3`
- `TaiNote`
- `T_State`
- `T_Annotator`
- `T_UpdatedAt`

客語審查至少確認：

- `Honzii`
- `HP1`
- `HP2`
- `HP3`
- `HDialect`
- `HakNote`
- `H_State`
- `H_Annotator`
- `H_UpdatedAt`

狀態欄位應寫入 `已完成標注`。

## Pass / Fail

Pass：

- `TEST0001` 只出現在 `test_places` / `TestEntries` 測試路徑。
- queue 在審查後出現，GAS 回寫後清掉。
- `final_fields` 的值被優先寫入 Sheet。

Fail：

- `TEST0001` 出現在 `source_table != test_places` 的 queue。
- 回寫後 `needs_sheet_sync` 仍為 `true`。
- `last_synced_at` 沒有更新。
- `TestEntries` 沒有更新，或正式 `第三期工作清單` 被測試資料更新。
