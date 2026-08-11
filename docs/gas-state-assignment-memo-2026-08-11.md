# GAS State／Assignment 流程備忘錄

日期：2026-08-11

範圍：Places GAS 選單第 3–6 項，以及 `LM09081` 的 APP 錄音人指派回寫觀察。

## 一、先記住兩個欄位的分工

### AssignmentStatus：誰被分配

`T_AssignmentStatus`／`H_AssignmentStatus` 只回答：

- `已指派`：該語種目前有工作者。
- `未指派`：該語種目前沒有工作者。

目前新的 Assignment source of truth 是 Supabase 的 `task_language_reviews.assigned_to`，不是工作清單上的 `T_Annotator/H_Annotator`。後兩者仍是 Sheet 相容欄位，由 Places GAS 回寫供工作清單與衛星流程使用。

### State：工作做到哪裡

`T_State`／`H_State` 表示該語種的工作流程進度，不是單純的是否有人被分派。

目前約定：

| 條件 | State | AssignmentStatus |
| --- | --- | --- |
| 尚未分派 | 空白（舊資料可能仍為 `待指派`） | `未指派` |
| 分派給錄音工作者 | `錄音中` | `已指派` |
| 分派給書面標注員 | `書面標注中` | `已指派` |
| 音檔已完成判定、進入標音 | `錄音標注中` | 通常仍為 `已指派` |
| 草稿等待校對 | `待校對` | 通常仍為 `已指派` |
| 校對者處理中 | `校對中` | 通常仍為 `已指派` |
| 核准寫回完成 | `已完成`／工作表相容值 `已完成標注` | 不再以 AssignmentStatus 表示進度 |

因此，`已指派` 不等於 `已完成`，`未指派` 也不應被塞入 State。State 與 AssignmentStatus 是兩個互補欄位。

## 二、第 3–6 項 GAS 函數

### 3. 同步第三期完整清冊至 Supabase

函數：`syncThirdPhasePlacesToSupabase`

資料方向：

```text
第三期工作清單
  → upsert public.third_phase_places
```

它會讀取整張「第三期工作清單」，將地名、分類、標音欄位、`T_State/H_State`、`T_Annotator/H_Annotator`、更新時間等欄位完整 upsert 到 `third_phase_places`。

它不會：

- 呼叫 `assign_task_language`。
- 建立或更新新的 `annotation_cases`。
- 更新 `T_AssignmentStatus/H_AssignmentStatus`，目前 payload 沒有這兩個欄位。
- 清除或完成 `assignment_sheet_sync_pending`。

所以第 3 項是「工作表來源快照同步」，不是指派同步，也不是審查核准。

風險是：如果工作表上的 State 或 Annotator 是舊值，第 3 項會把舊值再次寫回 `third_phase_places`。它不會從 Supabase 的 `task_language_reviews` 反推正確的 AssignmentStatus。

### 4. 將第三期任務索引同步至 Supabase

函數：`syncFinalTasksToSupabase`

資料方向：

```text
第三期工作清單的 UUID
  → upsert public.final_tasks
```

它主要建立／維持 `final_tasks` 的任務索引，設定：

- `source_id = UUID`
- `source_table = third_phase_places`
- `status = pending`
- `is_active = true`
- `priority = 0`

目前程式 payload 明確寫入 `assigned_to: null`。這是目前最需要注意的衝突：

- `assign_task_language()` 會維護 `task_language_reviews.assigned_to`，也會更新 `final_tasks.assigned_to` 作為舊相容鏡像。
- 第 4 項重新 upsert 時，卻會把 `final_tasks.assigned_to` 清成 `null`。

它不會直接清除 `task_language_reviews.assigned_to`，所以不一定會讓 `H_AssignmentStatus` 消失；但會破壞 `final_tasks.assigned_to` 這個舊的總任務指派鏡像，影響沒有語種指派資料時的 fallback 或舊畫面。

結論：第 4 項不是單純無害的索引同步，與目前 Assignment 相容層有實質衝突，應在後續修正為保留既有 `final_tasks.assigned_to`，或改由資料庫端依語種指派結果維護。

### 5. 回寫 APP 錄音人指派至工作表

函數：`syncTaskAssignmentsToSheets`

資料方向：

```text
task_language_reviews
  → app_language_assignment_sheet_view
  → 第三期工作清單／TestEntries
```

它只讀 View 中 `assignment_sheet_sync_pending = true` 的列。對每個語種檢查：

- AssignmentStatus 必須是 `已指派` 或 `未指派`。
- 若是 `已指派`，State 必須是 `書面標注中` 或 `錄音中`。
- 若是 `已指派`，Annotator 不可空白。

通過後，會回寫：

- `T_State/H_State`
- `T_AssignmentStatus/H_AssignmentStatus`
- `T_Annotator/H_Annotator`
- 對應的 `T_UpdatedAt/H_UpdatedAt`

最後呼叫 service-role-only 的 `mark_assignments_sheet_synced`，把待同步旗標清掉。因此 View 回寫成功後，再查 View 可能已經看不到該列；驗證順序必須是先讀 View，再執行第 5 項，最後讀 Sheet。

### 6. 重建 Records 錄音索引

函數：`rebuildRecordsSheetFromSupabase`

資料方向：

```text
app_tasks_view + audio_records
  → 重建 Records 工作表
```

它會讀取所有 `audio_records`，用 `app_tasks_view` 將 `task_id` 對回 UUID 與地名，清空 Records 的既有內容後重新寫入八個欄位。相同音檔 URL 會盡量保留原有錄音 ID。

它與 State／Assignment 無直接關係，也不會改 `task_language_reviews`、`third_phase_places` 或工作清單的 `T/H_State`。它是錄音索引維護功能；但會重排、重寫 Records，因此不應把 Records 當成手動編輯表。

## 三、`LM09081` 的觀察如何解讀

### 如果你看到的是「第三期工作清單」

依目前第 5 項的程式契約，只要同一列的 `H_AssignmentStatus=已指派` 被正常處理，`H_State` 理論上也應被寫成 `錄音中` 或 `書面標注中`，不應停留在 `待指派`。

因此「Annotator 已回寫、H_AssignmentStatus 已回寫，但 H_State 仍是待指派」在同一個第 5 項執行結果中是不一致的，應檢查：

1. `LM09081` 的 H 列是否被另一個 UUID 或重複列匹配。
2. Apps Script 實際部署版本是否就是目前讀回的 @9。
3. 第 5 項執行後是否又有手動編輯、舊版 GAS 或其他同步覆寫 H_State。
4. 執行結果訊息是否包含「已略過」或 State 不合法。

### 如果你看到的是 Supabase 的 `third_phase_places.h_state` 或 APP 舊欄位

第 5 項本身先寫 Sheet，再標記 Assignment sync 完成；它不直接 upsert `third_phase_places`。在第 3 項尚未執行前，Supabase source snapshot 仍可能保留 `待指派`。

目前每日流程是第 5 項先回寫 Sheet，再由第 3 項把 Sheet snapshot 同步回 Supabase。因此完整每日流程後應該收斂；若沒有收斂，表示第 5 項沒有成功改 State，或第 3 項讀到的不是同一份／同一列資料。

## 四、目前衝突結論

| 函數 | 與新流程關係 | 判定 |
| --- | --- | --- |
| 第 3 項 `syncThirdPhasePlacesToSupabase` | 同步 Sheet 的 State／Annotator 快照，不同步 AssignmentStatus | 可保留，但不可當指派來源 |
| 第 4 項 `syncFinalTasksToSupabase` | 重建任務索引，但將 `final_tasks.assigned_to` 寫成 null | 有衝突，應修正 |
| 第 5 項 `syncTaskAssignmentsToSheets` | 新 AssignmentStatus → Sheet 的核心回寫 | 流程正確，但 `LM09081` 的 State 差異需追查 |
| 第 6 項 `rebuildRecordsSheetFromSupabase` | 重建音檔索引 | 與 State／Assignment 無直接衝突 |

目前建議暫時採用：

1. 指派驗證後先執行第 5 項，讀回 Sheet。
2. 再執行第 3 項，讀回 Supabase source snapshot。
3. 第 4 項在修正 `assigned_to: null` 前，不把它視為指派流程的必要步驟。
4. 第 6 項只在要重建 Records 索引時執行。



## 五、LM09081 正式資料 readback 結論

2026-08-11 讀回正式 Places Sheet 與 Supabase 後，確認根因不是第 5 項指派回寫。

- Places「第三期工作清單」第 627 列（UUID LM09081）目前為 H_State=待指派、H_AssignmentStatus=已指派，但 H_UpdatedAt 是 亮均分類表單同步 | 2026-08-08 05:28:51。
- 隱藏 checkpoint __ckpt_third_phase_20260807_062410_third_phase_to_sup 的同一列曾是 H_State=錄音中，且 H_UpdatedAt=APP錄音人指派|2026-08-07 06:23:38。
- syncClassification() 對非書面標注分類會執行 H_State = 待指派；LM09081 的 HakClass=電話調查，因此該舊函數在 2026-08-08 把第 5 項已寫好的 錄音中 覆蓋掉，但沒有同步清除 Annotator／AssignmentStatus。
- Supabase 的客語 task_language_reviews 仍保留指派人，assignment_sheet_sync_pending=false，表示第 5 項已完成同步標記；third_phase_places.h_state 仍是舊快照，後續第 3 項又將工作表的待指派快照同步回去。

**結論：** LM09081 是「第 5 項先正確寫成 錄音中，第 2 項 syncClassification 後來覆寫成 待指派」；不是 AssignmentStatus 自己把 State 分開造成的問題。