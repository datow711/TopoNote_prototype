# Session Log: 2026-05-25 App Tasks Third Phase Only

## Goal

將 APP 任務來源收斂到正式第三期清冊，避免前端同時看到 MVP 舊任務與第三期任務。

## Supabase

- 重建 `app_tasks_view`。
- `app_tasks_view` 現在只 join `third_phase_places`。
- 舊 `moi_placename_raw` 任務仍保留在資料庫，但不再出現在 APP 任務 view。
- 同步重建 `app_review_queue_view`，讓後續 admin 審查也只針對第三期任務。

## Verification

- `app_tasks_view` 目前只回傳 `source_table = third_phase_places`。
- 任務數：6842。
- task id 範圍：16777 到 23618。
