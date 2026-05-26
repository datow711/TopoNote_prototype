# Project Timeline

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
