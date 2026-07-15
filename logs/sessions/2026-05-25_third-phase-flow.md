# Session Log: 2026-05-25 Third Phase Flow

## Goal

將正式的 `第三期工作清單` 納入 Supabase 資料模型，讓 APP 後續可從正式地名清冊取得任務資料，並替多調查員、錄音完成狀態、台語/客語審查回寫建立基礎結構。

## Supabase

- 新增 `third_phase_places`：
  - 對照 Google Sheet `第三期工作清單`
  - 一列一個 UUID
  - 作為來源快照，APP 不直接修改
- 新增 `task_assignments`：
  - 支援一筆任務指派給多個調查員
  - 保留 `final_tasks.assigned_to` 作為舊相容欄位
- 新增 `task_language_reviews`：
  - 分語言記錄台語 / 客語狀態
  - 支援 `待指派`、`尚未標注`、`待審查`、`已完成標注`
  - 用 `needs_sheet_sync` 標記需回寫 Google Sheet 的狀態
- 新增 / 更新 RPC：
  - `assign_tasks_to_user()`
  - `approve_task_language()`
  - 錄音新增後自動把對應語言標記為 `待審查`
- 重建 `app_tasks_view`：
  - 可從 `third_phase_places` 或舊 `moi_placename_raw` 取地名資料
  - 輸出多人指派清單
  - 依台語/客語錄音數計算 `recording_status`
- 新增 `app_review_queue_view` 作為後續 admin 審查介面基礎。

## Places GAS

- 新增 `syncThirdPhasePlacesToSupabase()`：
  - 將 `第三期工作清單` 完整 upsert 到 `third_phase_places`
  - 批次送出，避免單次 payload 過大
- `syncFinalTasksToSupabase()` 改為以 `third_phase_places` 作為來源表。
- 已執行 `clasp push`，推送時間為下午 5:27:30。

## Frontend

- 任務資料開始讀取 `assigned_users`、`recording_status`、台語/客語錄音數。
- 錄音狀態篩選改為：
  - `未錄音`
  - `台語完成`
  - `客語完成`
  - `全部完成`
- 管理者批次指派改呼叫 `assign_tasks_to_user()`，不再直接 patch `final_tasks.assigned_to`。

## Follow-up

- 需要從 Google Sheet 執行 `同步第三期完整清冊至 Supabase`，讓 `third_phase_places` 實際填入資料。
- 後續再接 admin 審查 UI 與 GAS 定時回寫 `T_State` / `H_State`。
