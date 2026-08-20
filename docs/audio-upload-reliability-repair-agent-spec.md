# TopoNote 音檔上傳可靠性修復 Agent Spec

- 文件日期：2026-08-20（Asia/Taipei）
- 狀態：待實作；本文件本身不代表 migration、GAS deployment 或正式前端已更新
- 目標工作區：`TopoNote_App`
- 實作策略：兩階段、小批次、各階段可獨立驗證與回復

【角色】

請扮演 TopoNote 的全端維護 agent。你需要理解原生 HTML/CSS/JavaScript 前端、Root Google Apps Script（GAS）、Supabase Postgres/Data API、Google Drive 與舊 `Records` Sheet 的雙軌音檔資料流。你必須以資料正確性、可回溯性、手機相容性與正式環境安全為優先，保留既有音檔及歷史紀錄，不做未經批准的破壞性清理。

【任務】

請依下列兩階段完成 TopoNote 音檔上傳可靠性修復。先完成第一階段的核心正確性修復與驗證，通過停等點後才進入第二階段。不得把兩階段混成一次難以回復的大型上線。

## 0. 開始前的唯讀確認

1. 讀取：
   - `AGENTS.md`
   - `LATEST_HANDOFF.md`
   - `docs/current-operation-flow.md`
   - `docs/architecture-inventory.md`
   - 本文件
2. 確認實際工作區與 Git 狀態：

   ```powershell
   git status --short --branch
   git remote -v
   git log --oneline -8
   ```

3. 重新檢查目前實作，不可只依本文件的行號判斷：
   - `main.js`：`handleFileUpload()`、`startRecording()`、`stopRecording()`、`uploadAudio()`、MIME helpers。
   - `gas/程式碼.js`：`doPost()`、`handleUpload()`、Supabase service-role helpers、`handleGetAudio()`。
   - `index.html`：檔案選擇器、錄音確認區及 `main.js` cache-busting 版本。
   - `tests/audio-playback.spec.js` 與其他音檔相關測試。
4. 對正式 Supabase 做唯讀 readback：
   - `audio_records` 欄位、constraint、index、RLS、policy、grant、trigger。
   - `final_tasks` 與 `audio_records.task_id` 外鍵狀態。
   - `service_role` 是否仍能讀寫 `audio_records`。
5. 唯讀確認 Root GAS：

   ```powershell
   npx.cmd clasp status
   npx.cmd clasp deployments
   ```

6. 檢查最新 Supabase changelog 與 Data API 文件。若平台行為與本文件不同，以當日官方文件及 live readback 為準，並在修改前說明差異。
7. 在開始修改前，先向使用者回報：預計修改的檔案、資料庫影響、GAS／前端部署影響、測試方法、回復方式，以及哪些步驟需要正式環境批准。

---

## 第一階段：核心資料正確性與跨手機格式修復

### 第一階段目標

修正已能重現的三個核心問題：

1. 上傳期間切換地名，造成 Drive／`Records` 與 Supabase 指向不同地名。
2. 手機實際錄成 MP4/AAC，前端卻強制標為 `audio/webm` 及 `.webm`。
3. Drive 成功、Supabase 失敗或回應遺失時，留下孤兒檔案、錯誤重試或重複上傳。

第一階段完成後，一筆上傳必須以同一個 immutable upload context（不可變上傳快照）及 `clientUploadId` 貫穿前端、Root GAS、Drive、Supabase 與 `Records` Sheet。

### 1. 建立不可變上傳快照

1. 在使用者按下確認上傳時，一次建立 `uploadJob`，後續流程不得再讀取可能變動的 `state.selectedPlace`、目前語言或輸入欄位來組裝資料。
2. `uploadJob` 至少包含：

   ```text
   clientUploadId
   taskId
   sourceId
   placeName
   language
   recorderAccount
   recorderName
   respondentKey
   annotations
   phoneticReading
   uploadSource        // recording 或 file
   originalFileName
   mimeType
   fileSizeBytes
   audioBlob
   startedAt
   ```

3. `clientUploadId` 使用瀏覽器 crypto API 產生 UUID；同一個 pending job 的重試必須沿用同一個 ID。只有使用者明確捨棄該音檔並重新錄製／重新選檔時，才建立新 ID。
4. 上傳處理期間可暫時禁止切換地名或關閉錄音區，以降低混淆；但資料正確性必須由 snapshot 保證，不能只依賴按鈕 disabled。
5. 成功前不要清除 `audioBlob` 或表單。可重試錯誤發生時，保留原 job；成功後才 reset。

### 2. 保存瀏覽器實際錄音格式

1. 建立 MediaRecorder 前先 feature-detect：
   - `navigator.mediaDevices?.getUserMedia`
   - `window.MediaRecorder`
   - `MediaRecorder.isTypeSupported()`（若存在）
2. 依瀏覽器支援選擇可用格式，不要假設所有裝置都是 WebM。允許瀏覽器自行選擇時，也必須讀回 `mediaRecorder.mimeType`。
3. `onstop` 組合 Blob 時，MIME 的優先順序應為：
   1. `mediaRecorder.mimeType`
   2. 第一個有效 chunk 的 `type`
   3. 明確且可驗證的 fallback
4. 副檔名由最終 MIME 映射產生，例如：
   - `audio/webm` → `webm`
   - `audio/mp4` → `m4a`
   - `audio/aac` → `aac`
   - `audio/ogg` → `ogg`
5. 現場錄音也要設定實際 `originalFileName`，不可再因 `uploadedFileName` 空白而一律落到 `.webm`。
6. Root GAS 仍需重新驗證 MIME／副檔名，但不得把內容只是 MP4/AAC 的檔案改標為 WebM。
7. UI 不可再顯示不存在的「轉碼」承諾；若沒有真正轉碼，改成「讀取並上傳音檔」等正確文字。

### 3. 以安全且不含帳號的 Drive 檔名保存

1. 不再把原始 `state.userId` 直接拼入 Drive 檔名。
2. 建議由 Root GAS 產生 ASCII 安全檔名：

   ```text
   Record_<taskId>_<clientUploadId>.<resolvedExtension>
   ```

3. 原始檔名、調查員帳號與顯示姓名分別保存於 metadata／Supabase／`Records` Sheet，不靠 Drive 檔名承擔識別責任。
4. 不改名或搬動既有 Drive 音檔；規則只適用於新上傳。

### 4. Supabase additive migration

1. 先用 Supabase CLI 的 `--help` 確認當前命令，再用 `supabase migration new <name>` 建立 migration，不手工猜 migration 序號。
2. 對 `public.audio_records` 採向後相容的 additive change。建議新增：

   ```text
   client_upload_id   uuid unique null
   recorder_account  text null
   original_file_name text null
   audio_mime_type   text null
   file_size_bytes   bigint null
   upload_source     text null
   ```

3. `client_upload_id` 的 UNIQUE constraint 必須允許既有 NULL rows，並可供 PostgREST `on_conflict=client_upload_id` 使用。
4. 不回填無法可靠推導的舊資料，不把 `recorder_name` 當成必然唯一帳號。
5. 第一階段先保留現有 anon INSERT path 的 grant／policy，確保舊快取前端仍可運作；不得在同一批直接 revoke。移除舊寫入路徑放到第二階段，且須再次批准。
6. Root GAS 使用 Script Properties 中的 `SUPABASE_SERVICE_ROLE_KEY`。禁止把 secret 寫入前端、repo、測試輸出或 log。
7. 新欄位及 constraint 套用後，以獨立 readback 驗證欄位、唯一約束、RLS、policy、grant 與 trigger，不能只以 migration 成功訊息判定。

### 5. Root GAS 成為單一上傳協調者

前端不再自行進行「GAS 存 Drive後，再直接 POST `audio_records`」的第二段正式寫入。Root GAS `upload` action 應協調完整流程：

1. 驗證 payload：UUID、task、language、MIME、Data URL、必要 metadata。
2. 用 service role 確認 `taskId` 存在，無效 task 必須在建立 Drive 檔案前失敗。
3. 使用 `LockService.getScriptLock()` 防止相同請求並行重入。鎖的 timeout 與失敗訊息要明確；第二階段再評估併發量與鎖粒度。
4. 以 `client_upload_id` 查詢 `audio_records`：
   - 已存在：不得重建 Drive 檔案；確認舊 `Records` row 後回傳既有紀錄。
   - 不存在：才建立 Drive file。
5. Drive 建立成功後，Root GAS 以 service role 寫入／upsert `audio_records`，並要求 `return=representation` 取得正式 `audio_records.id` 與 `created_at`。
6. `Records` Sheet 的既有「錄音ID」欄使用同一個 `clientUploadId`，避免新增另一個 Sheet schema。append 前先檢查該錄音ID是否已存在。
7. 建議順序：

   ```text
   validate
     → acquire lock
     → check existing client_upload_id
     → create Drive file
     → insert/upsert audio_records
     → ensure one Records row
     → return authoritative record
   ```

8. 失敗補償：
   - Drive 建檔後、Supabase 寫入失敗：將「本次新建且尚未被引用」的 Drive file 移到垃圾桶，保留可回復性；回傳可重試的 database-stage error。
   - Supabase 成功、`Records` append 失敗：不得刪除正式音檔或 DB row；回傳成功加 `legacyLogPending` warning。相同 ID 重試時必須補齊缺少的 `Records` row。
   - 回應在全部完成後遺失：相同 ID 重試必須回傳既有 row，不得產生第二個 Drive file／DB row／Sheet row。
9. 不建立公開可任意寫表的通用 service-role proxy；`upload` action 只能接受固定欄位並寫入固定資源。

### 6. 統一成功與錯誤 response contract

成功回應至少包含：

```json
{
  "success": true,
  "requestId": "client-upload-uuid",
  "recordData": {
    "id": 123,
    "clientUploadId": "client-upload-uuid",
    "taskId": 456,
    "sourceId": "source-uuid",
    "language": "台語",
    "audioFileId": "drive-url-or-id",
    "recorderAccount": "account",
    "recorderName": "display name",
    "createdAt": "timestamp",
    "deduplicated": false,
    "legacyLogPending": false
  }
}
```

錯誤回應至少包含：

```json
{
  "success": false,
  "requestId": "client-upload-uuid",
  "stage": "VALIDATION|LOCK|DRIVE|DATABASE|LEGACY_LOG",
  "code": "stable_machine_readable_code",
  "retryable": true,
  "message": "給使用者看的繁體中文訊息"
}
```

限制：不得將 stack trace、service-role key、完整 Base64、註記內容或不必要的個資回傳前端。

### 7. 第一階段 UI 行為

1. 顯示明確階段：讀取檔案、上傳 Drive、寫入正式紀錄、完成。
2. 可重試錯誤顯示同一個 request ID，重試沿用原 `clientUploadId`。
3. 不可重試錯誤要求重新選檔或修正資料。
4. 成功時使用 GAS 回傳的正式 `audio_records.id` 更新 `state.uploadedRecords`，保留既有「剛上傳即可編輯文字」功能。
5. 一次上傳期間阻擋重複點擊，但測試仍必須證明後端 idempotency；不能把 disabled button 當成唯一防重機制。
6. 成功後才刷新錄音數、歷史列表、管理員上傳報告與 reset 表單。

### 8. 第一階段自動測試與驗收

新增聚焦 spec（建議 `tests/audio-upload.spec.js`），至少覆蓋：

1. MediaRecorder 實際為 `audio/mp4` 時，結果保持 MP4/M4A，不變成 WebM。
2. MediaRecorder 為 WebM 時仍正常。
3. `MediaRecorder`／`mediaDevices` 不支援與權限拒絕時，顯示可理解訊息並恢復 UI。
4. 原有 AAC generic MIME normalization 回歸。
5. 上傳啟動後切換 `state.selectedPlace`：GAS payload、Supabase row 與 UI 結果仍全部指向 snapshot 中的地名 A。
6. 重複點擊或同一 `clientUploadId` 重試：只有一筆正式紀錄。
7. 模擬 Drive 成功、DB 失敗：UI 保留 job，顯示 database stage，重試沿用相同 ID。
8. 模擬 server 全部成功但 response 遺失：重試取得同一 `audio_records.id`，不重複建立資源。
9. 模擬 `Records` append 失敗：正式上傳仍成功並顯示 warning；重試可補紀錄。
10. Supabase 回傳正式 row 後，立即編輯文字仍使用真實 record id。
11. recorder account／display name 含中文、空白、`+`、`@` 時 payload 與呈現正確，但 Drive 安全檔名不含這些值。
12. 一般使用者與管理員原有錄音列表、計數、報告、音檔連結與軟解除功能不回歸。

本機最低驗證：

```powershell
node --check main.js
node --check gas\程式碼.js
node --check tests\audio-upload.spec.js
git diff --check
npx.cmd playwright test tests/audio-upload.spec.js tests/audio-playback.spec.js --reporter=line
npm run test:ui -- --reporter=line
```

### 9. 第一階段正式環境停等點

完成本機實作及測試後，先停下並回報，不可自行執行以下操作：

- 套用正式 Supabase migration。
- `clasp push`。
- 更新 Root GAS Web App deployment。
- 對正式 Drive／`Records`／`audio_records` 寫 smoke-test 資料。
- push GitHub 或觸發正式前端發布。

取得使用者明確批准後，建議部署順序：

1. 套用向後相容 Supabase migration 並 readback。
2. `clasp push` Root GAS，更新既有 Web App deployment，執行 `clasp deployments` 確認版本。
3. 更新 `index.html` 的 `main.js` cache-busting 值。
4. 建立本地 commit，不 push；由使用者 push／發布前端。
5. 使用專用測試地名與無敏感內容的小音檔做一次正式 smoke test：
   - 一個 Drive file。
   - 一個 `audio_records` row。
   - 一個 `Records` row。
   - 三者使用同一 `clientUploadId`／錄音ID。
   - 可播放、列表可見、文字可立即編輯。
6. 用同一 ID 重送，確認三端數量都不增加。

### 10. 第一階段回復方式

1. 前端：回復上一版 `main.js`／`index.html`，重新發布。
2. Root GAS：將既有 Web App deployment 指回上一個已知正常版本，並 readback。
3. Supabase：第一階段只做 nullable additive columns 與 UNIQUE constraint；緊急回復時可先保留，不要為了回復前端而立即 drop 欄位或 constraint。
4. 新上傳失敗補償只允許將「本次建立且尚未被引用」的 Drive file 移到垃圾桶；不得掃描或刪除既有音檔。
5. 回復後重新驗證舊前端直接 insert path 仍可用。

---

## 第二階段：大檔、弱網、格式驗證與可觀測性

### 第二階段進入條件

- 第一階段已在正式環境通過至少一次正常上傳及一次 idempotent retry。
- 未發現 Drive／Supabase／`Records` 新增錯配。
- 使用者已確認第一階段結果並批准第二階段。

### 1. 檔案大小、長度與記憶體保護

1. 先分析實際新上傳 metadata 分布，再提出檔案大小／錄音長度門檻，不可憑空決定數值。
2. **假設：**在缺乏歷史檔案大小資料前，先採 warning-only 或保守建議值，不立即硬擋正式使用者。
3. 最終門檻需同時在前端與 Root GAS 驗證；前端可提早阻擋，後端不可只相信前端。
4. 明確處理 `FileReader` 的 `error`、`abort` 與空 result。
5. 記錄 Base64 後預估 payload 大小；超過門檻時在送出前停止。
6. Apps Script quota 與 runtime 需查當日官方文件；不可把目前限制寫死成永久事實。

### 2. 真正的格式／可播放驗證

1. `accept` 只是選檔提示，不能當驗證。
2. 選檔後等待 `loadedmetadata`／`canplay`，監聽 `<audio>` error；無法解碼時不得以正常成功路徑上傳。
3. 前後端都驗證 extension、declared MIME 與 Data URL MIME 的一致性；不因副檔名單方面覆蓋可信的實際格式。
4. 對 AMR、CAF、3GP、Opus 等格式建立明確支援矩陣。
5. 本階段不在 GAS 內假裝做媒體轉碼。若產品需求要求所有手機格式都轉為共同格式，另提 dedicated media service／Storage 架構方案與成本，等待獨立批准。

### 3. 弱網、逾時與重試

1. 為每個階段設定可配置 timeout，使用 `AbortController` 或等效機制。
2. timeout／offline／HTTP 5xx 視為可重試，沿用同一 `clientUploadId`。
3. HTTP 4xx、invalid task、invalid format 視為需修正資料，不做盲目重試。
4. 頁面內重試保留 Blob 與 snapshot。
5. **決策停等點：**若要跨重新整理保存音檔 Blob，須先向使用者說明 IndexedDB 的裝置留存、個資與清除政策；未批准前只做 session 內重試，不將音檔持久化在本機。
6. PWA Service Worker 目前只 pass-through；不得在沒有隱私與衝突設計的情況下擅自加入 background upload queue。

### 4. 錯誤追蹤與營運可觀測性

1. 每次上傳以 `clientUploadId` 作為 request ID，前端錯誤畫面可讓使用者複製。
2. Root GAS 結構化記錄：timestamp、request ID、stage、stable error code、task ID、MIME、檔案大小、是否重試、是否 deduplicated。
3. 不記錄 Base64、音檔內容、文字註記、密碼、API key 或非必要個資。
4. 目前 `clasp logs` 因未設定 standard GCP project ID 無法使用。若要啟用 Cloud Logging，先列出設定步驟、權限與影響，取得使用者批准後才操作。
5. 建立唯讀 reconciliation report，對照：
   - Supabase `audio_records.client_upload_id`
   - `Records` Sheet 錄音ID
   - Drive URL／file existence
6. reconciliation 只列出缺漏、重複與 orphan 候選，不自動刪除或改資料。

### 5. 權限與舊寫入路徑收斂

1. 確認新前端已正式發布、cache-busting 已更新，且沒有舊 client 仍直接 POST `audio_records`。
2. 唯讀確認其他功能是否仍依賴 anon INSERT。
3. 提出獨立 preview，說明 revoke anon INSERT 的影響與回復方式。
4. 只有取得明確批准後，才移除瀏覽器的舊直接 insert 權限／policy；不可 blanket revoke `audio_records` 的 SELECT 或其他仍在使用的權限。
5. `service_role` 只存在 Root GAS Script Properties，前端不得取得。

### 6. 第二階段測試矩陣

自動測試至少包含：

- 0 byte、空 FileReader result、被 abort 的 FileReader。
- 接近門檻、超過門檻及 Base64 膨脹後超過門檻。
- 可解碼 AAC／M4A／MP3／WAV／WebM／Ogg。
- MIME 與副檔名不一致。
- 無法解碼 AMR／CAF／3GP 等檔案的明確提示。
- offline、timeout、HTTP 429、500、503、GAS JSON error、非 JSON response。
- retry 使用相同 ID；重新選檔使用新 ID。
- `Records` warning 修復。
- 多個並行上傳與 LockService timeout。
- 原有播放、編輯文字、連結、軟解除及上傳報告回歸。

人工裝置驗證至少列出結果或明確標示未測：

- iPhone Safari。
- iOS 加到主畫面的 PWA。
- iPhone LINE 內建瀏覽器：選檔；若現場錄音 API 不可用，需顯示正確 fallback。
- Android Chrome。
- Android LINE 內建瀏覽器。
- Windows Chrome／Edge。
- 正常 Wi-Fi、行動網路、限速、途中離線、鎖定螢幕／切到背景。

不得因 Chromium 自動測試通過，就宣稱 iOS／LINE 實機已驗證。

### 7. 第二階段部署與回復

沿用第一階段停等規則。每一種正式變更（migration、policy/grant、GAS deployment、前端發布、正式 smoke write）都先回報並取得批准。權限收斂與可觀測性設定應各自有獨立 commit／部署檢查點，避免與 UI 修正綁成同一回復單位。

---

## 完成定義（Definition of Done）

兩階段全部完成需同時符合：

1. 任一上傳在前端、Drive、Supabase、`Records` 使用同一 request ID 與 task snapshot。
2. iOS／Safari 產生的 MP4/AAC 不再被錯標成 WebM。
3. 同一 request ID 無論重複點擊、timeout 或 response 遺失，都最多只有一個 Drive file、一筆 `audio_records`、一筆 `Records` row。
4. 使用者在上傳期間切換地名，不會改變該 job 的 task。
5. 大檔、無法解碼、權限拒絕、離線及各後端階段失敗有不同且可行動的訊息。
6. 正式錯誤可用 request ID 追蹤，但 log 不含音檔、Base64、secret 或不必要個資。
7. 所有聚焦與完整 Playwright tests 通過；主要 JS、Root GAS 語法及 `git diff --check` 通過。
8. Supabase live schema／constraint／grant／RLS readback、GAS deployment readback 與測試地名 smoke test 均有證據。
9. `docs/current-operation-flow.md`、`docs/architecture-inventory.md`、session log 與 `logs/timeline.md` 已反映新流程。
10. 每階段建立 cohesive local commit，不 push；交由使用者驗證後手動 push。

【資料】

## 已知架構

- 前端是靜態 HTML/CSS/JavaScript PWA。
- Root GAS `upload` 目前把 Base64 音檔存入 Google Drive，並 append 舊 `Records` Sheet。
- 前端目前在 GAS 成功後再直接以 anon key POST Supabase `audio_records`。
- Supabase `audio_records` 是 APP 的正式音檔 metadata 來源；`Records` 是必須保留的 legacy／audit 軌。
- Root GAS 已有 `SUPABASE_SERVICE_ROLE_KEY` Script Property 與其他 service-role helper；不得把 key 移到前端。
- 原上傳者編輯文字依賴新上傳後取得真實 `audio_records.id`，此能力必須保留。

## 2026-08-20 診斷證據快照

以下是規劃依據，但實作當日仍須重新驗證：

- 已重現：MediaRecorder MIME 為 `audio/mp4`、chunk 為 `audio/mp4`，目前程式輸出 Blob 卻是 `audio/webm`。
- 已重現：Drive 上傳成功、Supabase 503 時，UI 顯示整體失敗並允許重送，缺少 idempotency。
- 已重現：Drive payload 指向 task 101，等待期間切換地名後 Supabase payload 指向 task 202。
- 現有 `tests/audio-playback.spec.js` 3/3 通過，但未涵蓋完整兩段上傳、弱網、MediaRecorder 實際 MIME、重試與地名切換。
- 正式 `audio_records.recorder_name` 是無長度限制的 text；當時 58 位使用者沒有空白／重複姓名或特殊帳號，故姓名不是目前最可能的失敗主因。
- 當時 Root GAS 正式 deployment 為 `@32`，`config.js` 指向同一 deployment。

## 重要參考

- MDN MediaRecorder MIME：<https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/mimeType>
- WebKit MediaRecorder：<https://webkit.org/blog/11353/mediarecorder-api/>
- MDN `accept` 屬性：<https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept>
- Apps Script quotas：<https://developers.google.com/apps-script/guides/services/quotas>
- Supabase Data API security：<https://supabase.com/docs/guides/api/securing-your-api>
- Supabase changelog：<https://supabase.com/changelog?types=breaking-change>

【格式】

實作 agent 每一階段都要依下列格式回報：

1. **開始前摘要**：問題、原因、影響範圍、檔案／schema、風險、驗證、回復、需批准項目。
2. **修改清單**：逐檔案／migration 說明行為改變，不只列檔名。
3. **資料契約**：request／response、Supabase 欄位、idempotency 與 Sheet 對應。
4. **測試表**：每項情境標示 PASS／FAIL／未測及證據。
5. **正式環境證據**：若尚未獲准，明寫「未套用／未部署／未 smoke test」，不得暗示完成。
6. **回復狀態**：上一個 GAS deployment、前端 commit、additive migration 是否可保留。
7. **Git 狀態**：commit hash、branch、是否 push；預設只 local commit、不 push。
8. 語言使用繁體中文；技術名詞第一次出現時附一句白話作用說明。

【限制】

- 只做與音檔上傳可靠性直接相關的窄範圍修改，不順便重設整個 UI 或登入架構。
- 不刪除既有 Drive 音檔、`audio_records` rows、`Records` rows 或 linked data。
- 不修改正式資料、migration、grant、policy、GAS deployment、Sheet schema 或正式前端，除非使用者明確批准該一步。
- 不 push；完成本地驗證後建立 local commit，交由使用者手動 push。
- 不把 service-role key、webhook、密碼、Base64、音檔內容或個資寫入 repo／log／測試快照。
- 不用正式使用者音檔做自動測試；正式 smoke test 只用經批准的測試地名與無敏感內容小檔案。
- 不以「按鈕 disabled」代替 idempotency，不以「副檔名在 accept list」代替格式驗證，不以「clasp push 成功」代替 deployment readback。
- 不宣稱未執行的 iOS／LINE 實機測試、正式 schema readback、部署或 smoke test 已完成。
- Supabase 新 function／table 必須明確處理 grant 與 RLS。除非有充分理由，不新增 public `SECURITY DEFINER` function；若新增，預設 revoke `PUBLIC`／`anon`／`authenticated` 並只授權必要角色。
- 遇到本文件與 live schema、官方文件或現行程式不一致時，先停下、提出證據及最小修正版，不盲目照抄。

【整合後提示詞】

請扮演 TopoNote 的全端維護 agent，在目前 `TopoNote_App` 工作區修復音檔上傳可靠性。先讀 `AGENTS.md`、`LATEST_HANDOFF.md`、本 spec、架構文件與現行程式，確認 Git、Root GAS deployment 及 Supabase live schema／RLS／grant。工作必須分兩階段：第一階段先建立不可變 `uploadJob` 與 UUID `clientUploadId`，修正 MediaRecorder 實際 MIME／副檔名，改用安全 Drive 檔名，為 `audio_records` 增加向後相容的 request／format metadata 與唯一約束，並讓 Root GAS 以 service role 協調 Drive、Supabase 及 `Records` 的 idempotent 單一上傳流程；同一 ID 重試不得重建資源，Drive 成功但 DB 失敗時只可回收本次尚未引用的新檔，DB 成功但 legacy Sheet 失敗時保留正式資料並讓重試補齊。前端必須使用 GAS 回傳的正式 row id，保留立即編輯文字、列表、計數、報告、連結與軟解除功能。完成第一階段本機測試後先停下，列出 migration、GAS deployment、前端發布與正式 smoke test 的影響，等待使用者逐項批准。

第一階段通過正式驗證後，第二階段再依實際檔案分布制定大小／長度門檻，補 FileReader error／abort、音檔可解碼驗證、弱網 timeout、同 ID retry、可觀測 request ID、結構化錯誤及唯讀 reconciliation report；不得在 GAS 假裝轉碼，也不得未經批准將音檔持久化到 IndexedDB、啟用 background upload、設定 GCP logging 或 revoke anon INSERT。自動測試需覆蓋 MP4/AAC 不被錯標、地名切換不改 task、兩階段失敗、response 遺失、重複點擊／重送、特殊顯示姓名、大檔、無法解碼、offline／429／5xx、LockService 及既有音檔功能回歸；iPhone Safari、PWA、LINE 內建瀏覽器與 Android 情境必須實機驗證或明確標示未測。每階段執行語法檢查、聚焦與完整 Playwright、`git diff --check`、live readback 及經批准的測試地名 smoke test；更新操作／架構文件與 session log，建立 cohesive local commit，但不要 push。任何未獲准的正式 migration、資料寫入、GAS deployment、權限變更或前端發布都必須停下等待使用者確認。
