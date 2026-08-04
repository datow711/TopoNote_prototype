# 審查流程重啟：現況 mapping 與 MVP 變更邊界

日期：2026-08-04
分支：`codex/review-workflow-mvp`

## 1. 已核驗的來源與安全邊界

- Google Drive 備份資料夾：`TopoNote_review_workflow_backup_20260804_182004`
- 備份 manifest：`docs/review-workflow-backup-manifest-20260804.md`
- Supabase project ref：`sikconjhtomqdkicbjal`
- Root GAS script：`16gtyfpxsC17zIBK3Ixd97yPRBi9IUIkkk3B8V8_CId2WSZ9iwIAwqTsi`
- Places GAS script：`18SBj5m5aCfr9QnrU6WKke6ZE9p2OWtJ9Lcsd7VcRd-VttxqnDCSAt5tN`
- Places workbook：`19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI`

本輪只做本機程式、SQL migration 草稿、測試與文件；不執行正式 Supabase migration、不寫入正式 Google Sheet、不 `clasp push`、不更新 GAS deployment、不 push Git。

## 2. 現況資料流

| 邊界 | 目前讀取/寫入 | 目前問題 | MVP 保留方式 |
| --- | --- | --- | --- |
| APP 登入與任務 | `login_investigator`、`app_tasks_view`、`app_users_view` | role 目前只在前端正規化為 admin/user；沒有 proofreader workflow role | 保留既有登入；新增 `proofreader` 識別與獨立 read-only workflow tab |
| APP 上傳 | Root GAS `doPost(action=upload)` 先寫 Drive/Records，再 POST `audio_records` | 音檔有 URL、語言、錄音人與舊 note，但沒有 respondent identity 或 assessment event | 保留 `audio_records`；新增 respondent key 輸入寫入 note/新欄位，舊資料標為 `未審聽` |
| APP 既有審查 | `app_review_queue_view`、`task_language_reviews`、`approve_task_language` | live `approve_task_language` 是 disabled stub；舊 UI 直接比較 raw recordings，沒有兩位不同受訪者、claim、version、audit | 保留舊 view/RPC 作 compatibility；新 UI 改讀 workflow queue 與新 RPC |
| ADMIN 指派 | `assign_task_language`、`unassign_task_language` | 指派與主狀態耦合，舊 sheet view 只認錄音人指派狀態 | 新 `annotation_cases` 獨立存 assignment/claim；同步時仍回寫 `T_Annotator/H_Annotator` alias |
| Places 主表 | `第三期工作清單` 與 `third_phase_places`，欄位含 `T_State/H_State`、`T_Annotator/H_Annotator` | 舊欄位空白/待指派語意混在一起，容易被直接標注與錄音流程互相覆寫 | 新 workflow state 在 case 表；舊欄位只做 compatibility snapshot，不刪欄、不即時覆寫 final fields |
| Places GAS | 每日順序為 assignment 回寫、第三期同步、final_tasks、Users；舊 APP 審查回寫 disabled；衛星 Pull 直接寫主表 | 缺少 idempotency、版本/來源 stamp、失敗歷史；衛星 Pull 可越過 APP draft/proofing | 新增 queue consumer，先 conflict-check，再寫入，成功/失敗均回 RPC 留痕；舊 Push/Pull 暫不刪除 |
| Google Sheet / Form | Response workbook `調查員人力管理｜地名標注計畫`；Places workbook；兩本 `書面標注_調查員TEST*` | Form body 直接 Drive readback 回 403；衛星表單 ID 清單目前空白 | 已做檔案/分頁/範圍 metadata readback；Form 內容不宣稱已讀；衛星層保留但不作新 workflow final source |

## 3. 現況 schema 與 payload 對應

### 3.1 APP 任務與語言欄位

- `app_tasks_view` 目前輸出 `task_id/source_id/source_table`、地名與位置、`t_state/h_state`、`t_review_state/h_review_state`、`t_assignee/h_assignee`、錄音數量與 status。
- `main.js` 的 `normalizeTask` 將上述欄位轉為 `id/sourceId/taiClass/hakClass/tAssignee/hAssignee/taiAudioCount/hakAudioCount`。
- `normalizeReviewTask` 只把舊 `t_review_state/h_review_state` 當作審查 state，沒有 version 或 case identity。
- `isWrittenAnnotationPlace` 目前只比對 `書面標注`；`直接標注` 改名仍需完整 reference audit，不能在 MVP 中單點替換。

### 3.2 錄音 payload

目前 Root GAS 回傳 Drive URL，APP 寫入：

```json
{
  "task_id": 123,
  "recorder_name": "調查員帳號或顯示名",
  "audio_file_id": "Drive URL",
  "phonetic_reading": "TL1/HP1",
  "language": "台語",
  "note": "{\"annotations\":{...}}"
}
```

新 workflow 增加：

- `respondent_key`：新錄音必填；可為受訪者代號，不把姓名當成必要資料。
- 原有 `note.annotations` 保留，供 legacy readback 與既有 UI 使用。
- 新 assessment 不修改 `audio_records` 原始列，只 append event；`可用/不可用/待追問` 由 latest event/summary view 計算。

### 3.3 Sheet writeback payload

新 queue job 會攜帶：

- `job_id`、`case_id`、`task_id`、`source_id`、`source_table`、`language`
- `version_no`、`payload`、`source_stamp`、`idempotency_key`
- `status`、`attempt_count`、`last_error`

Places GAS 只在 source stamp 與目前 Sheet 的 `T_UpdatedAt/H_UpdatedAt` 相符時套用 payload；不相符就寫 `writeback_errors` 與 `同步警告`，不覆蓋人工修改。

## 4. 新 workflow 的 state/權限決策

### 4.1 case state

`annotation_cases.state` 使用：

- `待指派`：沒有 workflow assignee。
- `書面標注中`：書面標注語言已被指派，主 `T_State/H_State` 可仍為空白。
- `錄音中`：錄音語言已被指派。
- `待校對`：已有 draft/assessment evidence，等待 proofreader。
- `校對中`：proofreader 已 claim，claim 30 分鐘。
- `已完成`：proofing approve 已建立 writeback job；Sheet 尚未必然完成。
- `需追問`：audio summary 有待追問，不能直接完成。

既有 `T_State/H_State`、`T_Annotator/H_Annotator` 不刪除。新指派以 case 的 `assigned_to` 為 source of truth，舊 annotator 欄位只在 compatibility sync 時更新。

### 4.2 權限

- ADMIN：建立/改派/釋放任務、查看全部、建立 writeback job。
- PROOFREADER：只讀 annotation versions、audio assessment summary、legacy flags；可 claim/release/save proofing draft/approve；不能改 annotation version 或 audio assessment event。
- ANNOTATOR/AUDIO ASSESSOR：可建立自己的 annotation draft 或 audio assessment event，但不能 approve final。
- 舊 user：維持既有任務/上傳能力；沒有 workflow queue 權限。

新 RPC 每次都以 `p_actor_account` 在 `investigators` 驗證角色；不能只依賴前端隱藏按鈕。

## 5. 最小垂直切片

1. migration 建立 `annotation_cases`、`annotation_versions`、`audio_assessments`、`proofing_events`、`writeback_jobs`、`writeback_errors`，並以 legacy rows 初始化為未審查/未審聽。
2. 新 RPC 提供 `get_review_workflow_queue`、claim/release/reassign、draft version、audio assessment、proofing approve、writeback success/failure。
3. APP workflow tab 先以 read-only proofing surface 顯示 annotation/version、audio summary、兩位不同 respondent gate、claim/釋放/改派/approve；原有錄音與舊 review UI 不直接刪除。
4. Places GAS 增加 queue consumer；成功以 `source_id/source_table/language/version` 做 idempotency，衝突與例外寫 error history。
5. 先做 Playwright contract tests 與 Node syntax checks；正式 migration、RPC grant、GAS deployment 後才做 live smoke/readback。

## 6. 必須在手機 remote 完成的閘門

以下任一項未完成，就不能宣稱 production cutover 已完成：

- 套用新 Supabase migration 並讀回 tables/views/functions/grants。
- 建立或核對 `proofreader`/`audio_assessor` 帳號與角色權限。
- 更新/部署 Root GAS、Places GAS，並讀回 deployment version。
- 驗證正式 Google Sheet 寫回、conflict warning、retry/error history。
- 確認 Form body/response destination 的瀏覽器授權；本次 Drive API 對原始 Form body 回傳 403，不能用 metadata 代替內容驗證。

