# T_State／H_State 工作報告：狀態整理與新 workflow

- 報告日期：2026-09-22
- 專案：TopoNote_App
- 工作分支：codex/state-workflow-redesign-20260922
- 報告用途：離線閱讀、交接、部署前核對
- 目前結論：程式與 migration 已在本地完成，尚未套用線上 Supabase migration、尚未部署 GAS，也尚未批次改寫線上 Google Sheet 狀態。

## 1. 本次工作摘要

本次工作的核心不是只替換文字，而是重新劃分 T_State／H_State 的責任：

1. Google Sheet 的 T_State／H_State 成為對外可讀的 workflow State。
2. Supabase 的 task_language_reviews.app_state 成為 APP 語種工作狀態投影。
3. APP 產生狀態變更時，先由 Supabase trigger 建立 language_state_sync_queue，再由 GAS 單一路徑安全回寫 Google Sheet。
4. 每日從 Google Sheet 拉回 Supabase 時，已進入 APP workflow 的狀態不得被舊的外部總表值覆蓋。
5. AssignmentStatus 只表示是否已指派，不再兼任 workflow State。
6. 舊狀態仍可在相容層被辨識，但新程式與新資料流使用新的公開狀態詞彙。

這份報告分成「狀態定義」、「儲存位置」、「函數與路徑」、「新 workflow」、「實際改動」、「驗證與部署」六個部分。Mermaid 圖以原始碼形式保留，因此即使沒有網路，也可以閱讀流程節點與函數名稱；使用支援 Mermaid 的 Markdown 閱讀器時，還可以將圖形化呈現。

## 2. 新的公開 State 定義

APP 目前負責推進到「待審查」。審查中、審查完成、錄音中、音檔查核中、已完成等後續狀態保留給 APP 以外或下一階段流程，不由一般 APP workflow 自動推進。

| 新公開 State | 代表意義 | 主要進入條件 | APP 目前處理範圍 |
| --- | --- | --- | --- |
| 待發稿 | 地名尚未指派給書面標注或田野調查任務 | 沒有有效語種任務指派 | 是，起始狀態 |
| 標注中 | 已派給書面標注員，正在進行書面標注 | 語種任務為書面標注且已指派 | 是 |
| 調查中 | 已派給田野調查員，進行電話或現場調查 | 語種任務為調查且尚未完成音檔判讀前置 | 是 |
| 待判讀 | 調查音檔已取得，等待審聽員確認音檔可用性 | 音檔已建立或音檔階段完成待判讀 | 是 |
| 草稿待檢查 | 書面或音檔草稿已建立，尚未完成管理員校對 | 草稿送入共用 workflow | 是 |
| 草稿 | 草稿已完成校對，但尚未交付下一階段審查 | 校對 claim 或校對結果完成 | 是 |
| 待田調 | 校對後判定需要再次調查 | 審查／校對退回田野調查 | 保留狀態，完整 UI 仍屬後續工作 |
| 待審查 | 標注完成且校對無誤，等待 APP 以外的下一階段審查 | 管理員核准 workflow 案件 | 是，目前 APP 終點 |

### 舊值到新值的相容轉換

| 舊值或來源值 | 新公開值 | 說明 |
| --- | --- | --- |
| 空白、待指派、尚未標注 | 待發稿 | 代表尚未進入有效 APP 任務 |
| 書面標注中 | 標注中 | 書面標注進行中 |
| 錄音中 | 調查中 | 舊資料中以錄音中代表田調進行中 |
| 錄音標注中 | 待判讀 | 舊資料中代表音檔等待處理或判讀 |
| 待校對 | 草稿待檢查 | 草稿已建立但尚未完成校對 |
| 校對中 | 草稿 | 管理員正在或已完成校對的相容狀態 |
| 已完成標注、已完成 | 待審查 | 代表已完成 APP 端工作，等待下一階段 |
| legacy_unreviewed | 草稿待檢查 | annotation_cases 的舊內部值，邊界投影時轉為公開值 |

## 3. T_State／H_State 與其他欄位的責任

T_State 是台語 workflow 狀態，H_State 是客語 workflow 狀態。兩者是同一套狀態機在不同語種上的兩個欄位，不應再被「是否已指派」或「是否有音檔」直接混用。

| 欄位 | 責任 | 不應承擔的責任 |
| --- | --- | --- |
| T_State | 台語目前處於哪一個 workflow 節點 | 不應只表示是否已指派 |
| H_State | 客語目前處於哪一個 workflow 節點 | 不應只表示是否已指派 |
| T_AssignmentStatus | 台語是否已指派 | 不應取代 T_State |
| H_AssignmentStatus | 客語是否已指派 | 不應取代 H_State |
| T_UpdatedAt／H_UpdatedAt | 對應語種 State 的最後更新時間 | 不應當作指派時間的唯一來源 |
| task_language_reviews.app_state | Supabase 內 APP 語種工作狀態 | 不應和 Sheet State 各自自由演進 |
| language_state_sync_queue | 待回寫到 Sheet 的狀態工作佇列 | 不代表業務狀態本身 |

## 4. State 的實際儲存位置

### 4.1 Google Sheet

主要 workbook：Places。

- 正式總表：第三期工作清單。
- 測試資料：TestEntries。
- 台語公開狀態：T_State。
- 客語公開狀態：H_State。
- 台語狀態時間：T_UpdatedAt。
- 客語狀態時間：H_UpdatedAt。
- 指派欄位：T_AssignmentStatus、H_AssignmentStatus。
- 語種指派人及相關時間欄位由 assignment sync 路徑處理，但不應覆蓋主 State。

Google Sheet 是操作人員容易查看的公開工作表；在新的資料流中，它不再是所有 APP workflow 狀態的唯一決策來源。

### 4.2 Supabase

| 資料表或 view | 欄位／用途 | 在新 workflow 的角色 |
| --- | --- | --- |
| public.third_phase_places | t_state、h_state | 第三期來源資料的 T/H State |
| public.test_places | t_state、h_state | 測試資料的 T/H State |
| public.task_language_reviews | app_state | APP 以語種為單位的主要工作投影 |
| public.task_language_reviews | sheet_state | 記錄或比對 Sheet 端狀態的欄位 |
| public.annotation_cases | state | 審查案件內部狀態；由 trigger 投影到 app_state |
| public.language_state_sync_queue | target_state、status、expected_sheet_state 等 | APP 狀態寫回 Google Sheet 的可靠佇列 |
| public.app_language_state_sync_queue | queue 的受控 view | GAS 讀取佇列的邊界 |

本次 migration 會建立或調整 language_state_sync_queue、queue RPC、狀態正規化函數與 projection trigger；migration 目前只存在本地，尚未套用線上 Supabase。

## 5. 新 workflow 的總體資料流

以下圖表把資料庫、APP、GAS 與 Google Sheet 放在同一張圖中。節點內的括號就是主要作動函數。

```mermaid
flowchart LR
  APP[APP 使用者操作]
  DBREV[(task_language_reviews)]
  CASE[(annotation_cases)]
  AUDIO[(audio_records / audio_assessments)]
  QUEUE[(language_state_sync_queue)]
  GAS[Places GAS<br/>runDailyPreworkSync()]
  SHEET[Google Sheet<br/>第三期工作清單<br/>T_State / H_State]
  SOURCE[(third_phase_places / test_places)]

  APP -->|assign_task_language() / unassign_task_language()| DBREV
  APP -->|submit_satellite_annotation_draft() / save_audio_annotation_draft()| CASE
  APP -->|上傳音檔或判讀| AUDIO
  CASE -->|trg_annotation_cases_state_projection<br/>project_annotation_case_state_()| DBREV
  AUDIO -->|mark_audio_record_pending_review()| DBREV
  DBREV -->|trg_task_language_reviews_state_queue<br/>queue_task_language_review_state_()| QUEUE
  QUEUE -->|claim_language_state_sync_job()| GAS
  GAS -->|syncLanguageStatesToSheets()\n先比對 expected State / timestamp| SHEET
  GAS -->|complete_language_state_sync_job()\n或標記 conflict| QUEUE
  SHEET -->|syncThirdPhasePlacesToSupabase()\n已進入 APP workflow 時保留 DB| SOURCE
  SOURCE --> DBREV

  classDef state fill:#e8f4ff,stroke:#2878b5,color:#123;
  classDef storage fill:#f3f3f3,stroke:#777,color:#222;
  class DBREV,CASE,AUDIO,QUEUE,SOURCE storage;
  class SHEET,GAS state;
```

### 圖表閱讀重點

1. APP 先改 Supabase 的工作投影或案件內部狀態。
2. Database trigger 將新的 app_state 轉成 queue 工作，不直接讓 APP 呼叫 Google Sheet。
3. GAS 只處理 queue 的回寫，並在寫入前比對總表現況。
4. Google Sheet 拉回 Supabase 時，workflow-managed State 由 Supabase 優先，避免舊總表值倒灌。
5. T_State 與 H_State 仍在 Google Sheet，但改成可追蹤、可衝突檢查的投影。

## 6. APP workflow Mermaid

這張圖是目前要採用的公開流程。它把主要會動作的函數放在轉移箭頭上；函數名稱代表程式或資料庫中的實際入口，並不表示每個箭頭只有一個 SQL statement。

```mermaid
flowchart LR
  A[待發稿<br/>未指派]
  B[標注中<br/>書面標注]
  C[調查中<br/>電話／現場調查]
  D[待判讀<br/>等待音檔判斷]
  E[草稿待檢查<br/>尚未校對]
  F[草稿<br/>校對完成]
  G[待田調<br/>需要再次調查]
  H[待審查<br/>APP 目前終點]

  A -->|assign_task_language()\nnormalize_task_language_review_state_()| B
  A -->|assign_task_language()\n調查任務指派| C
  B -->|submit_satellite_annotation_draft()\npullResultsFromSatelliteSheets()| E
  C -->|音檔建立\nmark_audio_record_pending_review()| D
  D -->|save_audio_annotation_draft()\nsubmit_audio_assessment()| E
  E -->|save_proofing_draft()\nannotation_cases.state = 校對中| F
  F -->|approve_review_case()\napprove_review_case_core_()| H
  F -->|return_review_case()\n退回田野| G
  G -->|再次調查\nassign_task_language()| C
  H -->|下一階段審查\n不由本 APP 自動推進| H

  classDef active fill:#e8f4ff,stroke:#2878b5,color:#123;
  classDef review fill:#fff4d6,stroke:#b57d00,color:#321;
  class A,B,C,D,E,F,G active;
  class H review;
```

### APP workflow 的資料庫投影規則

- review-workflow-core.js 與 admin/review-workflow-core.js 的 CASE_STATES 定義公開狀態。
- deriveCaseState() 依指派、草稿、校對與音檔評估結果推導案件狀態。
- annotation_cases.state 是案件內部狀態；trg_annotation_cases_state_projection 會把它轉成 task_language_reviews.app_state。
- task_language_reviews 的 INSERT／UPDATE trigger 會將狀態正規化，並建立 language_state_sync_queue。
- queue 回寫成功後，Google Sheet 的 T_State／H_State 才會跟著更新。
- 待審查與已完成案件不可再被一般 claim 流程領取，避免已交付案件被重新分配。

## 7. 每日同步 workflow Mermaid

每日同步的重點是順序。先處理 APP 產生的狀態 queue，再把其他資料拉回；否則後面的來源同步可能重新覆蓋剛回寫的 State。

```mermaid
flowchart TD
  START[每日觸發器 06:30<br/>runDailyPreworkSync()]
  R1[syncReviewWorkflowWritebacks()<br/>只回寫正式標注欄位]
  R2[syncLanguageStatesToSheets()<br/>唯一 APP State 回寫入口]
  R3[syncTaskAssignmentsToSheets()<br/>只回寫 AssignmentStatus / 人員]
  R4[syncThirdPhasePlacesToSupabase()<br/>Sheet 拉回來源資料]
  R5[syncFinalTasksToSupabase()<br/>同步任務索引]
  R6[syncUsersToSupabase()<br/>同步使用者資料]
  CHECK{Sheet State / timestamp<br/>是否仍等於 queue 預期值?}
  WRITE[寫入 T_State 或 H_State<br/>及對應 UpdatedAt]
  CONFLICT[不覆蓋 Sheet<br/>queue 標記 conflict]
  GUARD{Supabase State<br/>是否已進入 APP workflow?}
  KEEP[保留 Supabase State、指派人、時間]
  BASE[只允許基礎狀態由 Sheet 初始化或更新]

  START --> R1 --> R2 --> CHECK
  CHECK -->|是| WRITE --> R3
  CHECK -->|否| CONFLICT --> R3
  R3 --> R4 --> GUARD
  GUARD -->|是| KEEP --> R5
  GUARD -->|否| BASE --> R5
  R5 --> R6

  classDef step fill:#e8f4ff,stroke:#2878b5,color:#123;
  classDef decision fill:#fff4d6,stroke:#b57d00,color:#321;
  class START,R1,R2,R3,R4,R5,R6,WRITE,CONFLICT,KEEP,BASE step;
  class CHECK,GUARD decision;
```

### 每日同步的實際行為

1. runDailyPreworkSync() 依序呼叫六個步驟。
2. syncReviewWorkflowWritebacks() 不再直接寫 T_State／H_State；它只處理已核准案件的正式標注資料。
3. syncLanguageStatesToSheets() 從 app_language_state_sync_queue 讀取 queue，依 task UUID 與 language 找到總表列。
4. queue 寫回前，比對目前 Sheet State 與 queue 建立時記錄的 expected state／expected timestamp。
5. 比對一致才寫入；比對不一致就標為 conflict，避免覆蓋人工或其他流程剛寫入的資料。
6. syncTaskAssignmentsToSheets() 只處理 T_AssignmentStatus／H_AssignmentStatus、Annotator 與指派時間。
7. syncThirdPhasePlacesToSupabase() 先讀取 Supabase 既有來源狀態；若該語種已經在 APP workflow，就保留 Supabase 狀態與相關 metadata。
8. syncFinalTasksToSupabase() 與 syncUsersToSupabase() 不直接改 T_State／H_State。

## 8. 目前會更動或可能影響 State 的函數清單

| 函數／資料庫入口 | 位置 | 作用 | State 影響 |
| --- | --- | --- | --- |
| normalizeWorkflowStateValue(value) | main.js:915 | 將前端讀到的舊值轉成新公開值 | 只正規化顯示／載入值，不直接寫 DB |
| loadReviewWorkflowQueue() | main.js:4157 附近 | 載入 APP review queue 並套用狀態正規化 | 影響前端看到的 queue State |
| canAnnotateReviewWorkflowAudio() | main.js:4875 附近 | 判斷案件是否仍可進行音檔標注 | 待審查與已完成不可再進入一般標注 |
| CASE_STATES | review-workflow-core.js:6、admin/review-workflow-core.js:6 | 定義 APP workflow 公開狀態常數 | 提供狀態轉移與權限判斷使用 |
| deriveCaseState() | review-workflow-core.js:98、admin/review-workflow-core.js:98 | 由指派、草稿、claim、音檔評估推導案件狀態 | 影響案件應投影的 app_state |
| runDailyPreworkSync() | places-gas/gas/程式碼.js:245 | 每日同步總入口 | 決定 State queue 先回寫，再拉回來源 |
| syncReviewWorkflowWritebacks() | places-gas/gas/程式碼.js:1388 | 回寫核准案件的正式欄位 | 本次已移除直接寫 T/H State 的舊邏輯 |
| syncLanguageStatesToSheets() | places-gas/gas/程式碼.js:1516 | 消化 queue 並回寫總表 T/H State | 新 workflow 唯一正式 State 回寫入口 |
| syncTaskAssignmentsToSheets() | places-gas/gas/程式碼.js:1705 | 回寫指派狀態、指派人、時間 | 不再寫主 T/H State |
| syncThirdPhasePlacesToSupabase() | places-gas/gas/程式碼.js:681 | 將總表資料拉回 third_phase_places | APP workflow 狀態由 Supabase 優先，衝突不覆蓋 |
| syncClassification() | places-gas/gas/程式碼.js:2288 | 從外部分類表拉分類與書面資料 | 只允許基礎狀態初始化，避免覆蓋 APP workflow |
| pullResultsFromSatelliteSheets() | places-gas/gas/程式碼.js:2865 | 將衛星表單結果送入共用草稿層 | 不直接寫 T/H State，由 APP workflow 投影 |
| normalizeLegacyStatesInSheets() | places-gas/gas/程式碼.js | 一次性將舊公開 State 轉換為新值 | 上線切換時需人工確認後執行，尚未執行 |
| normalize_task_language_review_state_() | supabase migration | 將 DB 舊值轉成新 app_state | 邊界正規化，避免舊值繼續擴散 |
| queue_task_language_review_state_() | supabase migration | 將 app_state 異動寫入 queue | 建立 Sheet 回寫工作 |
| project_annotation_case_state_() | supabase migration | 將 annotation_cases.state 投影到 task_language_reviews.app_state | 案件狀態變動的 DB 邊界 |
| mark_audio_record_pending_review() | supabase migration | 音檔建立時將適用案件推進到待判讀 | 產生待判讀的 DB 狀態投影 |
| claim_language_state_sync_job() | supabase migration | GAS 取得一筆待處理 queue | 不改業務 State，但改 queue status |
| complete_language_state_sync_job()／fail_language_state_sync_job() | supabase migration | 完成、失敗或衝突結束 queue 工作 | 保留回寫稽核結果 |

## 9. 這次實際修改的檔案與內容

### 9.1 places-gas/gas/程式碼.js

- 新增新公開 State 常數與舊值正規化 helper。
- 調整 runDailyPreworkSync() 順序，讓 queue 回寫先於來源拉回。
- 將 syncReviewWorkflowWritebacks() 的 State 直接寫回移除。
- 將 syncTaskAssignmentsToSheets() 的舊 State 寫回區塊移除，留下 AssignmentStatus／Annotator／時間欄位。
- 新增 syncLanguageStatesToSheets() 的 queue claim、UUID 找列、expected value 比對、成功寫回與 conflict 記錄。
- 調整 syncThirdPhasePlacesToSupabase()，在寫入前取得既有 Supabase State，保護已進入 APP workflow 的資料。
- 調整 syncClassification()，不讓外部分類同步覆蓋已進入 APP workflow 的 State。
- 保留 pullResultsFromSatelliteSheets() 的草稿輸入責任，避免衛星表單直接繞過狀態機。

### 9.2 supabase/migrations/20260922120000_state_workflow_alignment.sql

- 建立 language_state_sync_queue 與必要索引。
- 建立 queue 的 claim、complete、fail RPC，並限制 queue 由 service_role 使用。
- 建立 task_language_reviews 的 State 正規化與 queue trigger。
- 建立 annotation_cases 到 task_language_reviews 的 State projection trigger。
- 建立音檔進入待判讀的 trigger function。
- 建立 app_language_state_sync_queue 受控 view 供 GAS 讀取。
- 使用 INSERT／UPDATE 分開處理的 trigger 邏輯，避免 INSERT 階段錯誤讀取不存在的 OLD record。
- 空白 State 使用明確的 null 判斷歸入待發稿，避免 NULL／空字串漏過轉換。

### 9.3 main.js

- 新增 WORKFLOW_STATE_ALIASES 與 normalizeWorkflowStateValue()。
- review workflow queue 載入時統一將舊值轉為新公開值。
- 音檔標注能力判斷不再允許待審查與已完成案件重新進入一般標注。

### 9.4 review-workflow-core.js 與 admin/review-workflow-core.js

- 將 CASE_STATES 統一為新公開狀態。
- deriveCaseState() 的推導順序優先處理已核准、有效校對 claim、未指派、草稿、書面標注與音檔評估。
- 待審查與已完成案件不可再被 claim。
- admin 與一般 APP core 保持相同狀態語彙，避免兩端出現不同狀態機。

### 9.5 測試與文件

- 已通過 review workflow core、assignment contract、UI、SQL contract、satellite sheet contract 測試。
- 已保留較短的設計摘要：docs/state-workflow-redesign-20260922.md。
- 本檔是較完整的離線工作報告，補上函數目錄、Mermaid workflow、改動細節、備份與切換步驟。

## 10. 目前資料盤點與出入

盤點日期：2026-09-22。以下是部署前的現況，不是套用新 migration 後的結果。

| 比對範圍 | 結果 | 解讀 |
| --- | --- | --- |
| 第三期工作清單 vs public.third_phase_places | 6,842 筆 UUID 對得上；T/H State 差異 0 | 正式資料目前一致 |
| TestEntries vs public.test_places | 10 筆 UUID 對得上；10 筆至少有一個 T/H State 差異 | 測試資料既有差異，不能用來證明正式同步正常 |
| 正式總表 T State | 待指派 4,535、待審查 1,388、錄音中 800、尚未標注 118、書面標注中 1 | 仍是舊公開詞彙 |
| 正式總表 H State | 待指派 5,366、待審查 1,299、錄音中 116、尚未標注 58、空白 3 | 仍是舊公開詞彙 |
| task_language_reviews.app_state | 尚未標注 1,149、已完成標注 1、待審查 1,913、待指派 22,037 | 仍有舊值，尚未批次正規化 |
| annotation_cases.state | legacy_unreviewed 13,676、已完成 1、待校對 25、校對中 2 | 內部相容狀態尚未批次轉換 |

因此目前不能把線上資料說成已經完成新 State 切換。正確說法是：本地程式已具備新 workflow 與相容轉換，線上資料仍在舊值狀態，等待 migration、GAS 部署與人工確認後切換。

## 11. 備份、分支與復原

### 已建立的保護點

- Google Sheet 備份：Places__backup_before_state_workflow_20260922。
- Google Sheet 原始 workbook：Places，備份前已確認 33 個工作表並完成讀回檢查。
- Supabase 邏輯備份 schema：backup_state_workflow_20260922。
- Supabase 備份資料筆數：third_phase_places 6,842、test_places 10、task_language_reviews 25,100、annotation_cases 13,704、annotation_versions 470、audio_assessments 680、writeback_jobs 1、writeback_errors 0、proofing_events 1,616。
- 備份分支：codex/state-workflow-backup-20260922。
- 實作分支：codex/state-workflow-redesign-20260922。

### 目前 commit

- 5f17887 chore: snapshot state workflow baseline
- 6c43c3d feat: align workflow state synchronization
- 報告檔建立後會再新增一個 docs commit。

本次沒有 push，也沒有執行線上 destructive migration。若切換後需要回復，優先停止每日同步與 queue 消費，再以 Google Sheet 備份副本、Supabase backup schema 與備份分支做比對和復原；不要直接刪除正式資料表。

## 12. 驗證結果

### 語法檢查

以下檔案均已通過 node --check：

- main.js
- places-gas/gas/程式碼.js
- review-workflow-core.js
- admin/review-workflow-core.js

### 自動化測試

- review-workflow-core.spec.js、assignment-status-contract.spec.js：10 passed。
- review-workflow-ui.spec.js、review-workflow-sql-contract.spec.js、satellite-sheet-contract.spec.js：33 passed。
- git diff --check：通過。

這些測試證明本地程式語法、核心狀態契約、UI contract、SQL contract 與 satellite sheet contract 沒有出現已知回歸；它們不等於線上 migration 或 GAS deployment 已成功。

## 13. 尚未完成的線上切換步驟

以下工作需要在確認備份可用、部署時段與人工檢查者後執行：

1. 將 supabase/migrations/20260922120000_state_workflow_alignment.sql 套用到線上 Supabase。
2. 讀回 migration objects、trigger、RPC、queue table、RLS 與 grant，確認實際線上 schema。
3. 使用 clasp push 更新 Places GAS，並讀回部署版本；只 push 本地檔案不代表線上 web app 已使用新版。
4. 確認每日觸發器仍呼叫 runDailyPreworkSync()，且新版程式已生效。
5. 先檢查 language_state_sync_queue 的待處理資料與 conflict 狀態。
6. 確認備份可讀後，再人工執行 normalizeLegacyStatesInSheets()，將正式總表與 TestEntries 的舊公開值轉為新詞彙。
7. 觀察至少一輪 queue 回寫，檢查 Sheet 的 T/H State、UpdatedAt、UUID 與 Supabase app_state 是否一致。
8. 重新執行正式表與測試表的逐 UUID 比對，並另外記錄 TestEntries 的既有差異。

在上述步驟完成前，報告中的新 workflow 應視為「本地已完成、線上待切換」，不可當作已部署完成。

## 14. 已知風險與後續注意事項

- 線上 migration 尚未套用，所以線上仍可能使用舊 trigger、舊 State 值與舊 GAS 行為。
- Supabase live audit 曾發現六張 public table 的 RLS disabled advisory：annotation_cases、annotation_versions、audio_assessments、proofing_events、writeback_jobs、writeback_errors。這是既有安全問題，本次 State workflow 整理沒有一併修復。
- TestEntries 與 test_places 已存在逐筆 State 差異，切換時應獨立記錄，不要把測試資料差異誤判為正式同步失敗。
- normalizeLegacyStatesInSheets() 會修改 Sheet 公開 State，屬於資料寫入操作，應在備份驗證後由人工確認執行。
- queue conflict 是保護機制，不是單純錯誤；發生時應先查明是哪個流程先改了 Sheet，再決定重試、修正來源或保留人工值。
- 本報告的 Mermaid 是原始碼。純文字 Markdown 閱讀器會顯示程式碼區塊，不會自動繪圖，但不影響離線閱讀流程與函數名稱。

## 15. 最終結論

新的設計將 T_State／H_State 從多個同步函數各自寫入，整理成「Supabase workflow 狀態 → DB trigger → language_state_sync_queue → syncLanguageStatesToSheets() → Google Sheet」的單一路徑。每日同步則固定先處理 APP State queue，再執行 Sheet 回拉，並在回拉時保護已進入 APP workflow 的 Supabase 狀態。

本次已完成本地程式、migration、測試與文件整理；尚未完成線上 migration、GAS 部署、舊值批次轉換與部署後 readback。

## 16. 2026-09-24 正式切換完成紀錄

本節更新並取代前面「尚未部署」的部署前快照。2026-09-24 已完成正式切換，前面第 10、13、14 節仍保留作為切換前歷史紀錄。

### 16.1 切換前保護點

- Google Sheet 備份：Places__backup_before_state_cutover_20260924。
- Google Sheet backup ID：1nsy_RrGgqk5QeAnE-aN3ovEyoDC8e5YON633P0Pd7-k。
- Supabase 備份 schema：backup_state_workflow_cutover_20260924。
- Supabase 備份筆數：third_phase_places 6,842、test_places 10、final_tasks 18,201、task_language_reviews 25,100、annotation_cases 13,704、annotation_versions 470、audio_assessments 680、proofing_events 1,616。

### 16.2 線上 schema 與 GAS

- Supabase migration 已套用：remote version 20260924040916，name 為 state_workflow_alignment_20260922。
- public.language_state_sync_queue 與 public.app_language_state_sync_queue 已存在。
- task_language_reviews normalization／queue trigger、annotation_cases projection trigger、audio pending-review trigger 已存在。
- queue claim／complete RPC：service_role 可執行，anon 不可執行；trigger 專用函數一般角色不可直接執行。
- Places GAS 已完成 clasp push，clasp status 讀回沒有 untracked files。

### 16.3 Google Sheet 最終 State

正式表「第三期工作清單」共 6,842 筆：

- T_State：待發稿 4,121、待審查 1,812、調查中 903、標注中 6。
- H_State：待發稿 6,557、調查中 187、待審查 98。

測試表 TestEntries 共 10 筆：

- T_State：待審查 1、調查中 9。
- H_State：待發稿 6、調查中 1、待審查 3。

抽查切換前副本確認：未改動的 State 保留原有 UpdatedAt；實際轉換的 State 才寫入 State workflow cutover 時間戳。未改寫其他資料欄位。

### 16.4 Supabase 最終一致性

- active workflow 範圍內的舊 State 詞彙筆數：0。
- APP app_state 與來源 third_phase_places／test_places State 差異：0。
- APP app_state 與 task_language_reviews.sheet_state 差異：0。
- language_state_sync_queue：11,791 筆，全部為 succeeded。
- 已實際驗證第 1 筆 queue 的 claim／complete RPC，完成後狀態為 succeeded，無 error。
- 仍保留 legacy 來源 moi_placename_raw：尚未標注 47、待指派 11,349；這些資料不納入新 Sheet workflow queue。
