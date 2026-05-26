# Project Timeline

[2026-05-26] [DATA]
新增 Supabase 測試地名來源 `test_places`，建立 10 筆 `TEST0001` 至 `TEST0010` 虛構地名並 upsert 到 `final_tasks`；`app_tasks_view` / `app_review_queue_view` 改為同時包含第三期正式地名與測試來源。前端一般調查員只會在被指派時看到測試地名，未指派測試來源只供管理者測試指派與審查。

[2026-05-26] [FEATURE]
管理者審查 MVP 起步：新增管理者「審查清單」頁簽，讀取 `app_review_queue_view` 並結合 `audio_records` 顯示可審查錄音、台語/客語標注摘要與雲端音檔播放入口；單一語言可按「審查通過」呼叫 `approve_task_language()`。審查頁會收起底部批次指派工具列，避免管理操作混在一起。

[2026-05-26] [UI]
收尾字型與交接：全站 UI 字體改用 `Noto Sans TC`，地名與台語/客語標注填寫框使用 `Iansui`；在 MongoDB design token 下加入更活潑的 hover、標題線、標注區內側線與彩色 badge。新增 `NEXT_CHAT_HANDOFF.md` 供下一個 chat 接續。

[2026-05-26] [UI]
地名字卡載入並套用 Google Fonts `Iansui`，優先用於地名卡片主標題與錄音區選取地名標題；其他操作介面維持原本工具型字體，兼顧本土語言文字可讀性與操作資訊密度。

[2026-05-26] [UI]
壓縮登入後上方操作區：使用者資訊、任務頁簽、篩選器改為較 compact 的工具列密度，chips 改成單列橫向捲動，地名清單高度改用 viewport-aware `clamp()`，讓大量地名瀏覽有更多垂直空間。

[2026-05-26] [FIX]
修正一般調查員登入後繼承管理者 UI 狀態的 regression。新增 `configureRoleUI()` 統一管理角色介面：管理者隱藏「其他地名」並顯示「全部地名清單」；一般調查員恢復「任務清單 / 其他地名」頁簽、移除管理者調查員篩選器與批次指派列，避免看起來像管理模式。

[2026-05-26] [UI]
設計依據改採 `mongodb/DESIGN.md`，前端視覺 token 調整為 MongoDB 風格：亮綠主按鈕、深 teal 管理列、白色文件型卡片、44px 表單控制項與較輕的卡片陰影。同時整理使用者資訊列、空清單狀態，並在管理者批次指派列補上 Shift + 左鍵連續選取提示。

[2026-05-26] [UI]
依照 `DESIGN.md` 調整前端視覺語言：白底、黑色主要操作、薄荷綠重點、圓角 pill 控制項與較乾淨的卡片層次。錄音填寫區補齊客語「選填」標示；地名卡片改顯示第三期工作清單來源 `UUID`；管理者批次指派 checkbox 新增 Shift + 左鍵連續選取與已選筆數顯示。

[2026-05-26] [FIX]
新增前端 session 與登出流程。登入成功後會以 `localStorage` 保存使用者資訊 24 小時，頁面重整後自動恢復登入並重新載入任務；使用者資訊列新增「登出」按鈕，登出時清除 session、移除 admin 指派列並回到登入畫面。

[2026-05-25] [FIX]
`app_tasks_view` 已收斂為只輸出 `third_phase_places` 任務，前端 APP 任務池正式切換到第三期工作清單來源。舊 MVP 來源 `moi_placename_raw` 仍保留在資料庫中，但不再出現在 APP 任務 view。

[2026-05-25] [MILESTONE]
建立第三期正式資料流的 Supabase 基礎結構。新增 `third_phase_places` 作為 `第三期工作清單` 的唯讀來源快照，新增 `task_assignments` 支援一地名多調查員，新增 `task_language_reviews` 承接台語/客語審查與回寫狀態。`app_tasks_view` 改為可從新來源取地名欄位，並計算 `未錄音 / 台語完成 / 客語完成 / 全部完成`。Places GAS 新增完整清冊同步函式並已 `clasp push`。

[2026-05-25] [FIX]
登入流程改為一般調查員 email 免密碼、管理者 email + password。Supabase `investigators` 新增 `email`、`is_active`、`specialty` 欄位，新增 `login_investigator()` 與 `login_admin()` RPC，`app_users_view` 補上使用者管理欄位。Places `Users` 頁簽欄位已對齊 Supabase：`account/password/user_name/role/email/is_active/specialty`。

[2026-05-25 10:44] [FIX]
Places GAS 已改回 legacy `service_role` JWT 呼叫法。`getSupabaseHeaders_()` 現在一律同時送出 `apikey` 與 `Authorization: Bearer <key>`，移除 `sb_secret_*` 的特殊分支；並已在 `places-gas/` 執行 `clasp push` 成功，推送時間為上午 10:44:32。

[2026-05-22 17:08] [MILESTONE]
完成：Places GAS 納入本機專案管理並移除硬編 Supabase service key
當前狀態：`places-gas/` 已保存 Places 試算表綁定 Apps Script；Supabase key 改由 Apps Script Properties 讀取；已嘗試新版 `sb_secret_*` 呼叫法但 Supabase 仍拒絕 Google Apps Script 環境。
下一步：資料同步欄位改版前，先決定是否改回 legacy `service_role` JWT 或改用其他安全後端中介。
