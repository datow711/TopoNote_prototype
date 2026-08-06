# 審查流程重新上架：資料模型細節與不變量

本文件補充 `review-workflow-relaunch-goal.md` 第 8 節的邏輯資料模型。這是實作前設計，不是已套用的 migration；正式欄位型別與命名仍須先對照 live Supabase schema。

## 一、建模範圍

核心單位有兩種，不能混用：

1. `地名 × 語種`：標音案件、流程狀態、工作者、校對與版本。
2. `音檔 × 地名 × 語種`：該音檔對該地名的可用性、不可用原因、後續處理與審聽歷程。

同一實體音檔若連結到兩個地名，必須產生兩筆以上的 `audio_assessments` 關聯資料；不可用一個音檔欄位代表所有地名的判定。

## 二、建議邏輯實體

### 1. `annotation_cases`

一筆 `地名 × 語種` 的流程案件，作為 APP、衛星表單與校對介面的共同索引。

| 欄位 | 說明 |
|---|---|
| `id` | 案件 UUID，主鍵 |
| `task_id` | 現有 TopoNote task ID；相容現有查詢 |
| `source_table` | 來源表，例如 `third_phase_places` |
| `source_id` | 工作清單 UUID |
| `language` | `tai` 或 `hak`；依現有模型限制 |
| `workflow_type` | 工作流快照：未分類、書面標注、電話調查、現場調查、原住民族 |
| `assignment_status` | `未指派`／`已指派`，不可塞入 `main_state` |
| `worker_account` | 調查員／書面標注員；ADMIN 指派後使用 |
| `main_state` | 書面標注中、錄音中、待審聽、錄音標注中、待校對、校對中、退回助理處理、已核准；可為空 |
| `followup_status` | 無、待助理處理、助理處理中、待專業會議、已處理 |
| `current_version_id` | 目前草稿／送校對／核准版本指標 |
| `current_proofreader_account` | 目前被指派的校對者；釋回或退回後清空 |
| `source_updated_at` | 建立案件時取得的工作清單來源 stamp |
| `lock_version` | optimistic locking 遞增值 |
| `created_at/updated_at` | 案件異動時間 |

唯一性：`(source_id, language)`；若系統仍以 `task_id` 為主鍵，必須明確保證 task 與 source UUID 的 mapping 不會一對多誤建案件。

> 未指派時的 `main_state` 顯示仍需計畫最後確認；建議留白，僅由 `assignment_status=未指派` 呈現。

### 2. `annotation_versions`

保存每次送入校對的完整標音內容 snapshot。草稿可更新，但一旦送校對就不可覆蓋。

| 欄位 | 說明 |
|---|---|
| `id` | 版本 UUID，主鍵 |
| `case_id` | 對應 `annotation_cases` |
| `version_no` | 案件內遞增版本號 |
| `source_type` | `app`、`satellite`、`admin` |
| `content` | 完整標音內容 JSONB；必須包含 schema version |
| `content_schema_version` | 必填欄位規則版本 |
| `source_actor` | 送出者帳號 |
| `status` | draft、submitted、proofing、returned、approved、superseded |
| `annotation_note` | 選填備註 |
| `audio_basis_optional` | 選填的實際依據音檔列表；不可作為送出必填 |
| `submitted_at/locked_at` | 送校對與版本鎖定時間 |
| `approved_at/approved_by` | 核准資訊 |
| `created_at/updated_at` | 版本異動時間 |

必要內容規則：

- 台語：`TaiHan1`、`TL1` 必填。
- 客語：`Honzii`、`HP1` 必填。
- 其他標音欄位可留白。
- APP／衛星表單送出與後端 API 都必須檢查。

必要唯一性與限制：

- `UNIQUE(case_id, version_no)`。
- 每案件最多一筆未完成的 active draft。
- 同一版本送校對後不可原地修改；退回修正必須建立下一個版本。
- 版本內容使用完整 snapshot，不只保存差異欄位。

### 3. `audio_assessments`

保存「音檔 × 地名 × 語種」目前有效判定。

| 欄位 | 說明 |
|---|---|
| `id` | 關聯判定 UUID |
| `audio_record_id` | 現有實體音檔 ID |
| `task_id/source_id` | 對應地名 |
| `language` | 台語／客語 |
| `usability` | 未審聽、可用、不可用 |
| `unusable_reason_code` | 先提供 `無聲`、`聽不清楚`；其他可為 `other` |
| `unusable_reason_text` | 其他不可用原因文字 |
| `needs_followup` | 是否需後續處理的旗標 |
| `followup_reason_text` | 後續處理原因文字 |
| `followup_status` | 無、待助理處理、助理處理中、待專業會議、已處理 |
| `reviewer_account` | 最近一次判定者 |
| `reviewed_at` | 最近一次判定時間 |
| `claim_owner` | temporary lock 持有者 |
| `claim_token` | 防止舊頁面誤解鎖或覆蓋的 token |
| `claim_started_at` | claim 開始時間 |
| `claim_expires_at` | 30 分鐘後自動失效時間 |
| `updated_at` | 目前判定異動時間 |

唯一性：`(audio_record_id, task_id, language)`。

有效音檔計算條件：

1. `audio_records.unlinked_at IS NULL`。
2. 最新 `usability=可用`。
3. 同一地名×語種的不同受訪人由審聽者依耳朵判定；系統不保存受訪人身份。
4. `needs_followup` 不影響可用數量，但只要尚有未結案後續處理，就不得送校對。
5. 改判後重新計算有效數量；若少於兩筆，案件回到錄音／補件處理，已保存草稿不得刪除。

### 4. `audio_assessment_events`

追加保存所有審聽事件，不更新既有事件：

`created`、`claimed`、`claim_released`、`usable`、`unusable`、`rejudged`、`followup_marked`、`followup_started`、`meeting_pending`、`followup_resolved`、`unlinked`。

建議欄位：`id、assessment_id、event_type、from_value、to_value、reason_code、reason_text、actor、claim_token、metadata、created_at`。

### 5. `proofing_events`

追加保存版本的校對歷程：

`submitted`、`assigned`、`started`、`saved`、`released`、`reassigned`、`returned_annotation`、`returned_audio`、`audio_recheck_required`、`approved`。

建議欄位：`id、case_id、version_id、event_type、actor、from_state、to_state、reason_text、metadata、created_at`。

標音退回與音檔退回必須使用不同 `event_type`；同一次校對可以同時建立兩種退回事件。

### 6. `writeback_jobs`

核准後寫入工作清單的冪等工作：

| 欄位 | 說明 |
|---|---|
| `id` | 工作 UUID |
| `case_id/version_id` | 來源案件與核准版本 |
| `task_id/source_id/language` | 目標識別 |
| `idempotency_key` | 建議由 `source_id + language + version_id` 組成且唯一 |
| `target_sheet/target_row` | 目標工作清單位置 |
| `expected_source_stamp` | 建立工作時讀到的來源 stamp |
| `status` | 未需回寫、已核准待回寫、回寫中、回寫完成、回寫失敗 |
| `attempt_count` | 嘗試次數 |
| `last_error_id` | 最近錯誤 |
| `started_at/completed_at` | 執行時間 |
| `created_at/updated_at` | 工作時間 |

同一 `idempotency_key` 不得建立多筆有效 job。重試不得要求重新校對。

### 7. `writeback_errors`

保存每次失敗，不覆蓋歷史錯誤：

`id、job_id、source_id、task_id、language、version_id、operation、target_sheet、target_row、attempted_at、error_type、error_message、retry_count、status、resolved_at、resolved_by`。

此資料可同步摘要至新的 Google 工作表，例如 `審查回寫錯誤`；工作表不是唯一交易來源。

## 三、狀態推導契約

以下是邏輯優先順序；最後一項「已分類未指派」的呈現仍待確認：

| 條件 | `main_state` |
|---|---|
| workflow 未分類 | `未分類`，主狀態可留白 |
| 已選工作流、尚未指派 | 建議主狀態留白，`assignment_status=未指派` |
| 書面流程已指派且尚未送校對 | 書面標注中 |
| 音檔流程已指派、有效音檔未達兩筆 | 錄音中 |
| 有效音檔達兩筆但存在未審聽關聯 | 待審聽 |
| 有效音檔達兩筆且審聽完成，尚未送標音校對 | 錄音標注中 |
| 標音版本已送出 | 待校對 |
| 校對者已開始處理 | 校對中 |
| 校對退回 ADMIN | 退回助理處理 |
| 校對核准 | 已核准；另由 writeback status 表示是否回寫成功 |

`followup_status`、可用音檔數與待審聽數是附帶資料，不另擴張主狀態；但後續處理未結案時，阻止送校對。

## 四、必須保護的不變量

1. 所有唯一性至少含 `source_id + language`；音檔判定再加 `audio_record_id`。
2. 不同語種不得互相覆蓋狀態、標音內容、校對者或回寫工作。
3. 校對者不能修改標音內容或音檔判定；只能提交校對結果。
4. 退回不刪除版本、事件或音檔判定；只改變目前流程指標。
5. 核准回寫失敗時，工作清單保留上一版正式內容，核准版本與錯誤仍可追溯。
6. 回寫前若來源 stamp 改變，必須產生衝突，不得靜默覆蓋人工修改。
7. 30 分鐘 claim 過期後，其他審聽者可以自取；舊 token 不得再提交判定。
8. APP、衛星表單、GAS 寫入與瀏覽器人工編輯都要保留最後更新 stamp；完整歷程只在事件資料層保存。

