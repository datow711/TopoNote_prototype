# TopoNote App 下一個 Chat 交接筆記

更新日期：2026-05-26

## 專案目前方向
- 這是一個地名錄音與標注工具，前端從 Supabase 的 `app_tasks_view` 讀取第三期地名任務。
- 正式地名來源是 Google Sheet「Places」中的「第三期工作清單」，透過 Places GAS 同步到 Supabase `third_phase_places`，再建立/更新 `final_tasks`。
- `app_tasks_view` 目前應只顯示 `third_phase_places` 來源的任務。
- 每筆地名有來源 `UUID`，前端地名卡片顯示這個 UUID；內部寫入與指派仍用 `task_id`。

## 主要資料表與定位
- `investigators`：使用者與調查員資料表，現在保存 DB `id`、登入帳號 `account/email`、姓名與 Sheet 同步來的個人資訊；一般帳號由 Places `Users` 單向 upsert，刪除只從 DB 後台做。
- `test_places`：測試用地名來源表，UUID 以 `TEST` 開頭，供管理者測試指派與審查流程。
- `third_phase_places`：Google Sheet「第三期工作清單」的來源快照，APP 不直接更動它。
- `final_tasks`：APP 任務表，對應可被指派/錄音的地名。
- `task_assignments`：任務和調查員多對多指派。
- `audio_records`：錄音檔紀錄，包含語言、上傳者、音檔 ID、標注 JSON。
- `task_language_reviews`：未來審查流程用，按語言記錄審查狀態。
- `app_tasks_view`：前端任務清單主要讀取來源。
- `app_users_view`：登入與管理者指派時讀取使用者資料。

## 已完成的重要功能
- 一般調查員 email 免密碼登入；管理者 email + password 登入。
- `localStorage` session restore 與登出。
- 調查員應看到「任務清單 / 其他地名」頁簽；管理者看到「全部地名清單」，並可批次指派。
- 管理者批次指派支援 checkbox 與 Shift + 左鍵連續選取。
- 錄音區語言以 tab/radio 二選一，預設台語，台語/客語欄位切換顯示。
- 台語欄位：`TaiHan`、`TL1`、`TaiNote`。
- 客語欄位：`Honzii`、`HP1`、`HakNote`。
- `TaiNote`、`HakNote` 是 4 行左右的 textarea，可捲動。
- HakArea 篩選器已加入，預設全部分區。

## UI 設計現況
- 設計依據改用 `mongodb/DESIGN.md`。
- 主 UI 字體：`Noto Sans TC`。
- 地名字卡與錄音區選取地名：`Iansui`。
- 台語/客語填寫區的 input/textarea 與 placeholder：`Iansui`，支援本土語言與拼音書寫。
- 上方使用者資訊、頁簽、篩選器已 compact 化，讓地名清單有更多垂直瀏覽空間。
- chips 改成單列橫向捲動。
- UI 保持 MongoDB 風格：深 teal、亮綠 CTA、白色文件型 surface；最新微調加入較活潑的 hover、綠色標題線、標注區內側綠線與彩色 badge。

## 最近修正過的 regression
- 管理者登入後會隱藏「其他地名」並改 tab 名稱；之前一般調查員登入可能繼承管理者 UI 狀態。
- 已新增 `configureRoleUI()` 修正：一般調查員登入會恢復「任務清單 / 其他地名」，並移除管理者篩選器與批次指派列。

## 現在這個 chat 最後一段改動
- Places `Users` 表欄位改為英文精簡：`email`, `name`, `phone`, `languages`, `hakka_dialect`, `life_area_1`, `survey_area_1`, `life_area_2`, `survey_area_2`, `life_area_3`, `survey_area_3`, `active`。
- `email` 與 `name` 為必填；`active` 可用 checkbox，Sheet 同步會單向 upsert 到資料庫但不刪 DB 帳號。
- 舊非 admin 調查員帳號已刪除，只保留目前 admin；舊指派給已刪除帳號的 assignment 已標成 inactive。
- 新增 `sync_sheet_users(p_users jsonb)`、`set_investigator_active(...)`，前端 admin 可切換一般調查員 active。
- `app_users_view` 現在只給前端 `id`, `account`, `role`, `is_active`；登入 RPC 回傳 `user_id`, `account`, `role`。
- Places GAS 的 Users 同步程式已在使用者明確同意後完成 `clasp push`，Sheet 端應可看到 Users 同步選單。
- Places 試算表的 `Users` 工作表已改成新欄位格式，保留 admin 參考列並清掉舊測試調查員列；`active` 欄已設 checkbox。
- 新增 Supabase `test_places` 測試來源表，寫入 10 筆虛構地名：石崁頭、牛寮坑、刺竹坪、後茄苳、七甲寮、水流崙、大潭底、楓樹崎、瓦厝埕、砂崙尾。
- 測試地名 UUID 為 `TEST0001` 至 `TEST0010`，類別/縣市/鄉鎮/村里皆設為 `測試`。
- `app_tasks_view` 與 `app_review_queue_view` 已改為同時包含 `third_phase_places` 與 `test_places` 來源。
- 前端 `normalizeTask()` 保留 `source_table`，一般調查員的「其他地名」會排除未指派的 `test_places`；被指派後才會在「任務清單」看到。管理者仍可看到全部測試地名。
- 新增管理者「審查清單」頁簽，讀取 `app_review_queue_view` 並和 `audio_records` 結合顯示可審查錄音。
- 審查清單依地名分組，顯示 UUID、縣市鄉鎮、台語/客語審查狀態、標注摘要與音檔播放入口。
- 單一語言可按「審查通過」呼叫 `approve_task_language()`，目前送出 `p_task_id`、`p_language`、`p_reviewed_by`。
- 管理者切到審查頁時會收起底部批次指派工具列。
- `index.html` 的 Google Fonts 連結改為同時載入 `Iansui` 與 `Noto Sans TC`。
- `style.css`：
  - `body` 字體改成 `Noto Sans TC`。
  - `.place-title`、`#selected-place-title` 維持 `Iansui`。
  - `.annotation-group input`、`.annotation-group textarea`、其 placeholder 改成 `Iansui`。
  - 依 `mongodb/DESIGN.md` 增加較活潑但克制的 UI 細節。

## 已知狀態與注意事項
- 只讀查詢確認 `app_review_queue_view` 存在，欄位包含 `t_state`、`h_state`、`t_review_state`、`h_review_state`、`record_count`、`tai_audio_count`、`hak_audio_count`。
- 這次查詢 `app_review_queue_view?record_count=gt.0` 尚無第三期錄音資料，所以審查頁目前可能顯示空狀態，等第三期錄音進來後才會有可審項目。
- `approve_task_language()` RPC 的存在已由 OPTIONS 確認；尚未在真實資料上做通過寫入測試，避免對後端資料造成副作用。
- Google Drive 同步資料夾內的 Git 偶爾會出現 `.git/packed-refs.lock` stale lock 訊息；通常 commit 已成功，push 也可正常繼續。
- 這個環境曾因 usage limit 阻擋需要升權的 Git 操作；若無法由 Codex commit/push，可由使用者手動 commit/push。
- `mongodb/DESIGN.md` 是設計依據；若它仍是 untracked，先不要自動納入 commit，除非使用者明確要求。
- Browser skill 曾因 Windows sandbox setup error 無法啟動；若下一個 session 能用，建議補一次實際視覺 QA。

## 建議下一步
1. 使用瀏覽器實測登入後的一般調查員畫面，確認「任務清單 / 其他地名」正常顯示。
2. 使用瀏覽器實測管理者「全部地名清單 / 審查清單」切換，確認審查頁空狀態與批次指派工具列收合正常。
3. 等有第三期錄音資料後，實測「審查通過」是否正確更新 `task_language_reviews`；若 RPC 參數簽名不同，依錯誤訊息調整 `approveReviewLanguage()` payload。
4. 再設計 GAS 定時同步審查狀態回 Google Sheet 的流程。
