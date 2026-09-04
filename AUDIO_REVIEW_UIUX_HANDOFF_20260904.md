# 審聽工作台 UI/UX 交接

更新時間：2026-09-04（Asia/Taipei）

這份文件是給下一個專門處理「審聽工作台 UI/UX」的 session。請先讀完本文件，再檢查目前的 /admin 畫面；本次已完成的資料庫權限不要重做。

## 一、這次 session 的使用者決定

審聽員不需要先領取案件，就可以查看音檔的原始標註資料。

「領取音檔案件」只影響能不能進行會改變資料的操作：

- 判定音檔可用／不可用。
- 建立或修改音讀標注草稿。
- 保存音讀標注草稿。

未領取時仍可以：

- 播放音檔。
- 查看所有相關音檔。
- 查看錄音人的原始標註。
- 查看案件目前的草稿與草稿歷史（既有功能）。

不要把「可以查看」誤做成「可以修改」。

## 二、已完成的程式改動

### 前端：只修改 /admin 審查工作台

檔案：admin/main.js

已完成：

1. 新增 canViewReviewWorkflowAudioSources(row)。
   - 只對 admin 或 audio_assessor 的音檔工作台開放。
   - 案件必須有音檔數量或音檔 evidence。
2. 未領取的審聽員也會自動呼叫 get_review_workflow_audio_sources。
3. 音檔工作台現在顯示語種的完整原始欄位：
   - 台語：TaiHan1、TL1、TL2、TL3、TaiNote。
   - 客語：Honzii、HP1、HP2、HP3、HDialect、HakNote。
4. 原始標註欄位仍是唯讀。
   - 未領取時不顯示判定、帶入或保存控制。
   - canAssessReviewWorkflowAudio(row) 沒有放寬。
   - canAnnotateReviewWorkflowAudio(row) 沒有放寬。
   - 音讀草稿保存 RPC 的 claim token 要求沒有放寬。
5. 修正原始資料載入完成後，沒有來源資料的欄位不應繼續顯示「讀取中」。

實際入口是 /admin；admin/index.html 載入 admin/main.js。根目錄 index.html 與 main.js 是一般入口，本次沒有改成同樣的審聽 UI。

### 資料庫：已部署讀取權限 migration

本地檔案：db/20260904_audio_assessor_source_read_without_claim.sql

線上 Supabase 專案：sikconjhtomqdkicbjal

線上 migration 已成功套用，遠端版本為：

20260904043603_audio_assessor_source_read_without_claim

這個 migration 只修改兩參數的內部來源讀取 function：

- admin、proofreader、audio_assessor 的角色檢查仍存在。
- 案件不存在仍拒絕。
- proofreader 的案件指派／claim 限制仍存在。
- audio_assessor 不再需要 active audio claim 才能讀取。
- audio_assessor 仍只能讀取有有效音檔的案件。
- 已解除連結的音檔仍不會回傳。
- 不修改 audio_records、正式標註欄位、annotation_cases 狀態、writeback_jobs 或 Google Sheet。

Auth wrapper 的 live readback：

- get_review_workflow_audio_sources(bigint,text)：SECURITY DEFINER；anon 與 authenticated 都不能直接 execute。
- get_review_workflow_audio_sources(bigint)：SECURITY INVOKER；只有 authenticated 可以 execute。
- /admin 前端使用目前登入者的 Auth session，不能由前端偽造 actor account。

## 三、已完成的驗證

本機：

- admin/main.js 語法檢查通過。
- tests/review-workflow-ui.spec.js 語法檢查通過。
- git diff --check 通過。
- tests/review-workflow-ui.spec.js：18/18 通過。
- tests/review-workflow-sql-contract.spec.js：6/6 通過。

審查 UI 測試已改為載入 admin/index.html，因為這份 spec 測試的是 staff 的 /admin 工作台，不是一般使用者入口。

線上 smoke：

- 以 test2@test.com 的角色脈絡呼叫來源 function 成功。
- 測試資料「水流崙」的音檔 #1836、#1837 可回傳原始標註。
- #1837 可回傳台語漢字與音讀；#1836 的原始欄位本來就是空白，顯示未填是正常資料結果。

## 四、目前 Git 狀態

本次功能 commit：

01fbaf5 fix: allow assessors to view original audio annotations

目前 main 比 origin/main 多 1 個 local commit，尚未 push。

下一個 session 不要假設前端已發布。若要在正式 /admin 看到這次改動，需要由使用者手動 push 並讓靜態網站更新；之後再 hard refresh 或以無快取方式重新開啟 /admin。

## 五、下一個 UI/UX session 的工作範圍

請先做 UI 現況檢查與規劃，不要先改資料庫。

第一個實際驗證：

1. 開啟 /admin。
2. 使用 audio_assessor 測試帳號登入。
3. 找一筆尚未領取、但有音檔的案件，例如水流崙。
4. 確認未領取時：
   - 能播放多筆音檔。
   - 原始標註欄位會載入實際內容。
   - 看不到判定按鈕。
   - 看不到帶入按鈕。
   - 看不到保存草稿按鈕。
5. 領取後再確認：
   - 判定控制出現。
   - 可用且無待追問的音檔可以作為音讀草稿來源。
   - 草稿欄位可以修改與保存。
6. 以手機寬度檢查是否橫向溢出。

UI/UX 優先觀察項目：

- 原始標註和審聽員自己的草稿是否容易區分。
- 多筆音檔之間的播放、判定、原始標註閱讀順序是否清楚。
- 未領取、已領取、其他人領取、案件已完成等狀態是否容易理解。
- 「可查看」與「可修改」是否有明顯的文字或視覺提示。
- 原始標註正在載入、載入失敗、沒有資料時，提示是否清楚。
- 台語五個欄位與客語六個欄位在桌面及手機寬度是否好閱讀。
- 縣市、鄉鎮、語種三個主要篩選是否仍是最容易操作的入口。
- legacy_unreviewed、legacy 未審查／未審聽等內部狀態不應直接呈現給使用者。
- 已完成案件應保持唯讀，不應讓使用者誤以為還能繼續修改。

建議先交付一張「未領取／已領取」畫面對照與操作流程，再決定要不要改版。不要在 UI/UX session 重新設計 RPC 或 claim 規則。

## 六、不可誤改的安全邊界

不要做以下改動：

- 不要把 canAssessReviewWorkflowAudio 改成未領取也能判定。
- 不要把 canAnnotateReviewWorkflowAudio 改成未領取也能保存。
- 不要重新開放 save_annotation_version 給 audio_assessor。
- 不要讓審聽員直接修改 audio_records 或正式標註欄位。
- 不要新增每個音檔各自的草稿；草稿仍是案件層級。
- 不要因為 UI 顯示原始資料，就把原始資料寫回正式欄位。
- 不要在本次 UI/UX 工作順便啟用 workflow tables 的 RLS。

目前另外有一個獨立的 Supabase 安全議題：annotation_cases、annotation_versions、audio_assessments、proofing_events、writeback_jobs、writeback_errors 的 RLS 尚未啟用。這不是本次讀取功能的 bug；若要處理，應另開安全／資料庫 session，先設計 policies 再部署，避免直接開啟後讓現有流程讀不到資料。

## 七、建議給下一個 session 的開場提示

請讀取 AUDIO_REVIEW_UIUX_HANDOFF_20260904.md。這次已完成審聽員未領取即可唯讀查看原始音檔標註的前後端權限改動，請不要重做 migration，也不要放寬判定或音讀草稿保存的 claim 要求。

先檢查 /admin 的實際畫面，分別比較未領取與已領取狀態，聚焦縣市／鄉鎮／語種篩選、音檔卡片、原始標註、草稿區、手機寬度與已完成唯讀狀態。先提出 UI/UX 調整方案與影響範圍，再等待確認後修改。

## 八、參考檔案

- admin/index.html
- admin/main.js
- admin/style.css
- db/20260831_audio_assessor_annotation_draft.sql
- db/20260902_audio_annotation_draft_history.sql
- db/20260904_audio_assessor_source_read_without_claim.sql
- tests/review-workflow-ui.spec.js
- tests/review-workflow-sql-contract.spec.js
- LATEST_HANDOFF.md
