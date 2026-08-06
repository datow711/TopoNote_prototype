# 審查流程：規劃書與實作的落差對照

- 建立日期：2026-08-06
- 規劃基準：`review-workflow-relaunch-goal.md`（2026-08-04 凍結）與 `review-workflow-relaunch-data-model-detail.md`
- 實作基準：分支 `codex/review-workflow-mvp`，`db/20260804_review_workflow_mvp.sql` 與 `db/20260805_*.sql`、`review-workflow-core.js`、`main.js`
- 用途：規劃書是實作前寫的，8/5 的實作在 UI 迭代中偏離了部分規格。本文件記錄「紙上寫什麼／實際做出什麼」，作為後續決策依據。

## 一、狀態機落差（**已於 2026-08-06 由 D-004 解決**）

> 本節記錄的落差已依 **D-004** 處理完畢：採選項 A（不補 `待審聽`、`退回助理處理`），但補回 `錄音標注中` 的正向轉移，並修正前後端常數不一致。
> 變更見 `db/20260806_recording_annotation_state.sql` 與 `review-workflow-core.js`。下方原始盤點保留作為決策依據。

### 1.1 主狀態對照

規劃書第 5.7 節列出 8 個每語種主狀態。實際 `annotation_cases.state` 的值如下：

| 規劃書狀態 | 實作狀況 | 實際寫入位置 |
|---|---|---|
| `書面標注中` | ✅ 有 | `assign_review_case()`，`class_name = 書面標注` 時 |
| `錄音中` | ✅ 有 | `assign_review_case()`，其他工作流時 |
| `待審聽` | ❌ **未實作** | 無。音檔未審聽時案件仍停在 `錄音中` |
| `錄音標注中` | ⚠️ **只能由退回進入** | 僅 `return_review_case()`（`20260805_review_returns.sql:66`）；正向流程從不寫入 |
| `待校對` | ✅ 有 | `save_annotation_version()`、`submit_satellite_annotation_draft()` |
| `校對中` | ✅ 有 | `claim_review_case()` |
| `退回助理處理` | ❌ **未實作** | 退回時改寫成 `錄音中`／`書面標注中`／`錄音標注中`，不另立狀態 |
| `已核准` | ⚠️ **改名為 `已完成`** | `approve_review_case()` |

實作額外新增、規劃書沒有的值：

| 實作狀態 | 說明 |
|---|---|
| `待指派` | `annotation_cases.state` 的 default，建立案件時的初始值 |
| `legacy_unreviewed` | 既有舊資料 backfill 標記，代表未經新流程校對的舊稿 |

### 1.2 `review-workflow-core.js` 與資料庫又不一致

前端常數 `CASE_STATES` 與資料庫實際使用的值也對不齊，這是**實作內部的不一致**，與規劃書無關：

- `CASE_STATES` 有 `FOLLOW_UP: '需追問'`，但資料庫從未寫入此值（`需追問` 只在前端邏輯出現；音檔層用的是 `待追問`）。
- `CASE_STATES` **缺少** `錄音標注中`，但資料庫退回流程會寫入該值。因此案件被退回後，前端 `deriveCaseState()` 無法對應到已知常數。

### 1.3 待決策事項

**問題：工作清單（Google Sheet）上的狀態要顯示到多細？**

- **選項 A — 維持現況（零改動）**：接受 6 個實際狀態，刪除規劃書中 `待審聽`、`退回助理處理`，並把 `已核准` 正名為 `已完成`。細部進度（音檔審聽到哪、後續處理狀態）只在 APP 內查看。
- **選項 B — 補齊細狀態**：補回 `待審聽` 與 `錄音標注中` 的正向轉移，讓工作清單能區分「還在錄音」「錄完等審聽」「審聽完正在標音」。需要改 RPC 狀態推導與前端常數，工作量中等。

無論選 A 或 B，1.2 的前後端不一致都必須修掉。

## 二、資料模型落差（已實作，僅記錄差異）

| 規劃書設計 | 實作 | 差異評估 |
|---|---|---|
| `annotation_cases` 唯一性用 `(source_id, language)` | 實作用 `unique (task_id, language)`，表上**沒有** `source_id`／`source_table` 欄位 | 規劃書第 8.2 節已預警此風險：需保證 task 與 source UUID 不會一對多。目前靠 `final_tasks` join 取得 `source_id`，尚未有防護 |
| `audio_assessments` 為「目前有效判定」，`UNIQUE(audio_record_id, task_id, language)` | 實作為 **append-only 事件表**，無唯一約束，最新判定由 `review-workflow-core.js` 的 `latestRows()` 在前端算出 | 語意相反。好處是歷程天然保留，代價是「目前判定」沒有單一可信欄位，任何消費端都得自行取最新 |
| 另立 `audio_assessment_events` 事件表 | ❌ **未建立**，由上述 append-only 設計取代 | 合理，不需補 |
| `annotation_versions.status`：draft／submitted／proofing／returned／approved／superseded | 實作為 `version_kind`：draft／final／legacy | 粒度較粗，退回與 superseded 靠 `proofing_events` 還原 |
| `audio_assessments.followup_status` 五值（無／待助理處理／助理處理中／待專業會議／已處理） | ❌ **未實作**。只有 `decision = 待追問` 一個值 | 規劃書第 5.4 節的「後續處理與專業會議」整段等於未實作 |
| `unusable_reason_code`（`無聲`／`聽不清楚`／other）＋ `reason_text` 分欄 | 實作只有單一 `reason text` 自由文字欄 | 無法做快速篩選；規劃書第 5.3 節的「提供快速篩選」未達成 |
| `writeback_jobs` / `writeback_errors` | ✅ 已實作，含 idempotency key、source stamp、retry、error history | 符合規劃 |
| `proofing_events` | ✅ 已實作 | 符合規劃 |

## 三、業務規則落差

| 規劃書規則 | 實作 | 狀態 |
|---|---|---|
| 至少兩筆不同受訪人錄音（第 5.3、6.2 節） | 受訪者代號選填、不阻擋任何操作 | **已由 D-002 正式推翻**，非缺漏 |
| 書面與錄音草稿進同一校對層（第 10.2、10.3 節） | 同一套 `annotation_cases`／`annotation_versions`；介面分兩個工作台 | **已由 D-003 確認**，符合意圖 |
| 送校對前後續處理必須全部結案（第 5.3 節） | 未實作（因後續處理狀態機本身未實作） | 落差，隨第二節「followup_status」一併決定 |
| 音檔判定至少含 `未審聽`／`可用`／`不可用` | ✅ 有，另加 `待追問` | 符合 |
| 30 分鐘 temporary claim、token 防護、可手動釋放 | ✅ 有，且音檔 claim 與校對 claim 分離 | 符合，且比規劃更細 |
| 校對者只看被指派案件、對內容唯讀 | ✅ 有，RPC 層以 `p_actor_account` 驗角色 | 符合 |
| 標音／音檔可分開退回，原因必填 | ✅ 有（`return_review_case()` 雙旗標） | 符合 |
| 未指派時主狀態留白，assignment 另立欄位 | ✅ 有（`app_language_assignment_sheet_view`） | 符合 D-001 |
| 回寫前 source stamp 衝突檢查，不靜默覆蓋 | ✅ 有 | 符合 |

## 四、規劃書中尚未進入實作的整段內容

以下規劃書章節目前**完全沒有對應實作**，屬於後續 phase，不是 bug：

- 第 5.4 節「後續處理與專業會議」：ADMIN 處理流程、`待專業會議`、`已處理` 須含處理結果與處理者。
- 第 9.2 節建議新增的工作清單欄位中，`T_Proofreader/H_Proofreader`、`T_ApprovedAt/H_ApprovedAt` 尚未建立（`T/H_AssignmentStatus` 已在 GAS 端要求，但正式 Sheet 尚未補欄位）。
- 第 14 節第 4 點「已核准後重新修訂」：規劃書本身已聲明不納入第一階段。
- `直接標注` → `書面標注` 的正式改名：live 工作清單仍大量為 `直接標注`，程式 `isWrittenAnnotationPlace()` 只比對 `書面標注`。
