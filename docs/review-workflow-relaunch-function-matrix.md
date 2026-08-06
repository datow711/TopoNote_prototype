# 審查流程重新上架：現況函數定位與資料流責任矩陣

本文件是 `review-workflow-relaunch-goal.md` 的配套盤點資料。它只描述目前程式的入口與新流程實作前的責任邊界，不修改程式、資料庫或 Google 工作清單。

## 一、現況函數定位矩陣

下一個工作階段開始實作前，應從下列入口逐一追到呼叫端、資料表、回寫端與錯誤處理；本表是盤點起點，不代表保留現有函數名稱或流程。

| 功能責任 | 目前主要位置 | 實作前要確認的邊界 |
|---|---|---|
| APP 讀取工作清單與音檔 | `main.js:3009` `loadDataFromSupabase()`；`main.js:837` `normalizeTask()`；`main.js:881` `getRecordingStatus()` | 改由新的地名×語種狀態與音檔審聽彙總提供資料；不可再用 raw 音檔筆數直接推導完成。 |
| APP 工作流／書面類型判定 | `main.js:866` `isWrittenAnnotationPlace()` | `直接標注` 改名為 `書面標注` 時，要同時盤點篩選、顯示、衛星表單條件與同步程式。 |
| APP 音檔列表、播放與上傳 | `main.js:3677` `getTaskRecords()`；`main.js:4719` `openRecordingUI()`；`main.js:5010` 附近 `submitAudioLink()`；`main.js:5228` `fetchAndPlayAudio()`；`main.js:5431` `uploadAudio()` | 實體音檔與地名×語種關聯要分開；審聽結果不可再塞進一般標音 note。 |
| APP 既有音檔標注修改 | `main.js:5183` `saveRecordAnnotationEdit()` | 需改為建立標音草稿／版本，不能直接成為核准內容。 |
| APP 指派 | `main.js:4011`、`main.js:4036`；Supabase `assign_task_language()`、`unassign_task_language()` | 既有 assignment 相容層暫保留；新狀態不可把「未指派」混入主流程狀態。 |
| APP 校對舊入口 | `main.js:3088` `switchTab()`；`main.js:3711–3918` 校對 UI；Supabase `approve_task_language()`、`revoke_task_language_review()` | 現況為停用／空 queue；應重建為獨立校對介面，不以解除停用的舊函數直接延伸。 |
| Root GAS 音檔 API | `gas/程式碼.js:140` `doPost()`；`gas/程式碼.js:720` `handleUpload()`；`gas/程式碼.js:758` `handleGetAudio()`；`gas/程式碼.js:87`、`499` 音檔連結／解除連結 | 確認音檔實體、`audio_records` 與地名×語種審聽資料的責任分離；解除連結不得破壞歷程。 |
| Places GAS 每日同步 | `places-gas/gas/程式碼.js:200` `runDailyPreworkSync()`；`546` `syncUsersToSupabase()`；`627` `syncThirdPhasePlacesToSupabase()`；`700` `syncFinalTasksToSupabase()` | 先釐清工作清單快照與校對層資料的單向／雙向責任，再替換舊狀態同步。 |
| Places GAS 舊審查回寫 | `places-gas/gas/程式碼.js:1265` `syncApprovedReviewsToSheets()` | 目前明確停用；新回寫必須改成版本、語種、目標欄位與回寫工作佇列的冪等流程。 |
| 衛星表單 Push/Pull | `places-gas/gas/程式碼.js:1577` `pushTasksToSatelliteSheets()`；`1690` `pullResultsFromSatelliteSheets()` | Pull 不得再直接覆蓋工作清單；應先建立／更新書面標注草稿，再送校對層。 |
| 審聽／校對資料同步 | Supabase `app_tasks_view`、`app_review_queue_view`、`app_sheet_sync_queue` | 既有 view／queue 是舊模型；需先定義新模型的查詢契約，再決定哪些舊欄位作相容輸出。 |

## 二、資料流責任矩陣

| 資料／動作 | 工作區 | 主要保存位置 | 可否直接寫工作清單 |
|---|---|---|---|
| 音檔上傳與實體檔案 | 錄音 APP／Root GAS | Drive、`audio_records` | 不可直接產生正式標音內容 |
| 音檔×地名×語種可用性與後續處理 | 錄音 APP | 新審聽／事件資料層 | 只回寫即時彙總與流程狀態，不寫正式標音欄位 |
| 書面標注草稿 | 衛星表單 | 新標注案件／版本資料層 | 不可直接寫正式欄位 |
| 錄音標注草稿 | 錄音 APP | 新標注案件／版本資料層 | 不可直接寫正式欄位 |
| 校對進度與結果 | 獨立校對介面 | 校對案件、事件與版本資料層 | 核准前不可 |
| 核准後正式內容 | 回寫服務 | 工作清單對應語種欄位 | 可以，但只能由核准版本冪等回寫 |
| 回寫失敗與重試 | 回寫服務／錯誤工作表 | `writeback_jobs`、錯誤工作表、必要時 Supabase 錯誤表 | 不可因失敗覆蓋上一版正式內容 |

## 三、現況與新流程的切換邊界

1. 舊 `task_language_reviews`、`task_assignments`、`final_tasks.assigned_to`、`AssignedUsers` 與既有同步欄位先保留，作為相容與歷史資料來源；不可在新流程尚未驗證前刪除。
2. `app_review_queue_view` 目前是空 queue；新校對介面應以新校對案件／版本資料為查詢來源，不直接依賴舊 view 恢復運作。
3. 衛星表單的 Pull 是第一個高風險切換點：現行「直接回工作清單」要改成「寫草稿／版本→送校對」，但表單的草稿保存與重送仍應維持。
4. APP 的音檔標注修改是第二個高風險切換點：現行 `saveRecordAnnotationEdit()` 的直接更新行為要改成版本化草稿，並由校對核准後才回寫正式欄位。
5. 工作清單只呈現每個地名×語種的即時流程狀態與核准內容；審聽細節、後續處理原因、校對事件與完整異動歷程留在 APP／校對資料層。

## 四、實作前必做的追蹤順序

1. 對照 `main.js`、Root GAS、Places GAS 的所有上述入口，畫出實際 payload 與欄位名稱。
2. 對照 live Supabase 的 table、view、RPC，確認哪些舊欄位仍有前端或 GAS 讀寫者。
3. 對照 `第三期工作清單` 的表頭與實際資料，建立正式欄位、相容欄位、舊資料欄位的 mapping。
4. 先完成新流程的資料契約與狀態機測試，再替換 APP、衛星表單與回寫流程。
5. 每一個舊函數若判定為 MVP 遺留，先標註「暫保留／待清理」，功能完成並驗證後再清理；本階段不刪除。

