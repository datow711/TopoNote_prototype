# T_State／H_State workflow 整理（2026-09-22）

## 1. 這次整理的範圍

目前 APP 只負責推進到「待審查」：

| 公開狀態 | 意義 |
| --- | --- |
| 待發稿 | 地名尚未指派給書面標注或田野調查任務 |
| 標注中 | 已指派給書面標注員，正在標注 |
| 調查中 | 已指派給田野調查員，正在電話／現場調查 |
| 待判讀 | 調查音檔已取得，等待審聽員判斷音檔可用性 |
| 草稿待檢查 | 書面標注或音檔標注草稿已建立，尚未完成管理員校對 |
| 草稿 | 草稿已完成校對，但尚未進入待審查交付狀態 |
| 待田調 | 校對後判定需要再次調查；目前保留為下一階段狀態 |
| 待審查 | 標注完成且校對無誤，等待 APP 以外的下一階段審查 |

審查中、審查完成、錄音中、音檔查核中、已完成是後續流程狀態，本次不讓一般 APP 流程推進到這些狀態。

## 2. State 的實際儲存位置

### Google Sheet

- 總表：Places → 第三期工作清單
- 測試表：Places → TestEntries
- 台語主狀態：T_State
- 客語主狀態：H_State
- 對應的時間戳：T_UpdatedAt、H_UpdatedAt
- T_AssignmentStatus／H_AssignmentStatus 只表示「未指派／已指派」，不再兼任 workflow State。

### Supabase

- 來源資料主表：
  - public.third_phase_places.t_state
  - public.third_phase_places.h_state
  - public.test_places.t_state
  - public.test_places.h_state
- APP 語種工作投影：
  - public.task_language_reviews.app_state
  - public.task_language_reviews.sheet_state
- 舊審查案件的內部相容狀態：
  - public.annotation_cases.state
  - 舊值如「待校對」、「校對中」、「已完成」只在相容層保留，邊界轉換成公開 State。
- APP State 回寫工作佇列：
  - public.language_state_sync_queue
  - 由本次 migration 建立；migration 尚未套用到線上專案。

## 3. 目前會改動 State 的路徑

### 每日 runDailyPreworkSync（06:30）

目前順序是：

1. syncReviewWorkflowWritebacks
   - 只回寫已核准案件的正式標注欄位。
   - 本次已移除直接寫 T_State/H_State 的舊邏輯。
2. syncLanguageStatesToSheets
   - 新增的 APP State 單一路徑。
   - 讀取 language_state_sync_queue，依 UUID 找到總表列。
   - 只有總表的 State／時間戳仍等於 queue 建立時的預期值，才會寫入新 State。
   - 不一致時標記 conflict，不覆蓋總表。
3. syncTaskAssignmentsToSheets
   - 只回寫 T_AssignmentStatus/H_AssignmentStatus、Annotator 與時間戳。
   - 不再寫主 State。
4. syncThirdPhasePlacesToSupabase
   - 把總表的資料拉回 third_phase_places。
   - 基礎狀態可由總表初始化／更新。
   - 若 Supabase 已進入 APP workflow 的狀態，保留 Supabase 的 State、Annotator 與 State 時間戳，不採用外部總表的衝突值，並在結果訊息報告衝突數。
5. syncFinalTasksToSupabase
   - 只同步任務索引，不直接改 T/H State。
6. syncUsersToSupabase
   - 不改 T/H State。

### 其他會影響狀態的路徑

- syncClassification
  - 從外部分類表拉回分類與書面資料。
  - 只初始化仍在基礎狀態的語種；若列已進入 APP workflow，會刪除該次對 State／Annotator 的外部更新。
  - 這是手動選單功能，不在每日同步步驟內。
- pullResultsFromSatelliteSheets
  - 從書面標注衛星表單送入共用草稿層。
  - 不直接改總表 T_State/H_State；草稿狀態由 Supabase APP workflow 投影，再經 queue 回寫。
- APP 指派 RPC
  - assign_task_language、unassign_task_language 改 task_language_reviews.app_state 與指派欄位。
  - 新增／修改 task_language_reviews 時，由 DB trigger 正規化 State 並建立 queue 工作。
- APP 審查／音檔 RPC
  - 建立衛星草稿、音檔判讀、校對與核准時，先改 APP／案件內部狀態。
  - annotation_cases.state 透過 trigger 投影到 task_language_reviews.app_state，再由 queue 回寫 Sheet。

## 4. 目前資料盤點結果

盤點時間：2026-09-22。

- 第三期工作清單與 public.third_phase_places：6,842 筆 UUID 對得上，T/H State 差異為 0。
- TestEntries 與 public.test_places：10 筆 UUID 對得上，但 10 筆都有至少一個 T/H State 差異；這是目前測試資料的既有差異，不能視為正式表已同步。
- 正式總表當時的主要 State：
  - T：待指派 4,535、待審查 1,388、錄音中 800、尚未標注 118、書面標注中 1。
  - H：待指派 5,366、待審查 1,299、錄音中 116、尚未標注 58、空白 3。
- task_language_reviews.app_state 當時仍有舊值：待指派、尚未標注、待審查、已完成標注。
- annotation_cases.state 當時仍以 legacy_unreviewed、待校對、校對中等舊值為主。

因此，migration 採取「先提供相容轉換與 queue，不在未部署程式前批次改線上 State」的方式。

## 5. 上線／切換順序

以下步驟尚未執行：

1. 將 supabase/migrations/20260922120000_state_workflow_alignment.sql 套用到線上 Supabase。
2. 以 clasp push 更新 Places GAS，並讀回部署版本確認不是只更新本地檔。
3. 確認每日同步觸發器使用最新程式。
4. 在人工確認備份可讀後，手動執行一次 normalizeLegacyStatesInSheets()，將總表與 TestEntries 的舊公開 State 轉成新詞彙。
5. 先檢查 language_state_sync_queue，再讓每日同步處理 queue。
6. 重新核對 Sheet／Supabase 的 UUID、T/H State、Annotator、AssignmentStatus 與時間戳。

本地已有：

- 備份分支：codex/state-workflow-backup-20260922
- 實作分支：codex/state-workflow-redesign-20260922
- Supabase 邏輯備份 schema：backup_state_workflow_20260922
- Google Sheet 備份：Places__backup_before_state_workflow_20260922

回復時可回到備份分支，Google Sheet 使用備份副本，Supabase 使用備份 schema 或平台備份；本次沒有 push，也沒有套用線上 migration 或部署 GAS。
