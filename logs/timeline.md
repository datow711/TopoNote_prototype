# Project Timeline

[2026-06-10] [FEATURE]
新增調查員「問題回報」流程：按鈕位於下載任務清單與登出之間，dialog 顯示管理者職稱與 email，收集主旨與意見內容後送到既有 GAS Web App。GAS 會首次自動建立 `TopoNote_問題回報` 試算表，append 意見ID、調查員姓名、email、寄件時間、主旨、內容與預設未勾選的已回復 checkbox；Chat webhook 通知已預留 `FEEDBACK_CHAT_WEBHOOK_URL` script property，未設定時只寫入 Sheet，不寄 email。

[2026-06-10] [FIX]
調整調查員任務清單匯出格式：待填欄位縮減為台語/客語各「漢字、羅馬字、備註」共 6 欄；Excel 匯出由舊的 HTML table `.xls` 改為真正的 Office Open XML `.xlsx` workbook，避免副檔名與檔案類型不符警告。

[2026-06-10] [UI]
調查員個人任務頁新增「下載任務清單」按鈕，位於登出左側；點擊後可選 PDF 或 XLS。匯出資料使用目前登入調查員的指派任務，依縣市、鄉鎮、地名排序，表格欄位包含縣市、鄉鎮、分類、地名，以及台語/客語標注欄位空格。PDF 由前端 canvas 產生並下載，XLS 由 Excel 可開啟的 HTML table 產生，不新增後端或套件依賴。

[2026-06-09] [DATA]
Mapped existing legacy place assignments into 台語 language assignment and left 客語 unassigned for manual reset. Live Supabase now has 184 台語 assignees and 0 客語 assignees; `app_language_assignment_sheet_view` was narrowed to only `needs_sheet_sync` rows so GAS writeback does not sweep unrelated Sheet language columns. Places GAS was pushed to Apps Script at 上午8:49:37.

[2026-06-08] [FEATURE]
Aligned place assignment with the original Sheet per-language model. Admin place cards now expose separate 台語 and 客語 assignment controls, batch assignment/unassignment requires choosing a language, Supabase stores `assigned_to/assigned_by/assigned_at` on `task_language_reviews`, and Places GAS writes APP assignment state back to Sheet columns `T_State/T_Annotator` and `H_State/H_Annotator` through `app_language_assignment_sheet_view`. This supersedes the earlier generic `AssignedUsers` sheet sync approach.

[2026-06-08] [FEATURE]
新增管理員撤回地名指派流程。前端地名卡片的已指派調查員 chip 現在可單筆撤回，底部批次工具列也可對勾選地名執行「撤回指派」。Supabase 新增 `unassign_tasks_from_user()` RPC 與 `app_assignment_sheet_view`；Places GAS 新增 `syncTaskAssignmentsToSheets()`、選單項目與每日同步步驟，會將 APP 指派狀態回寫到 `第三期工作清單` / `TestEntries` 的 `AssignedUsers` 與 `AssignmentSyncedAt` 欄位。

[2026-06-01] [GAS]
Added a daily prework Sheet/Supabase alignment runner in Places GAS. The new `runDailyPreworkSync` uses a script lock, writes `LAST_DAILY_PREWORK_SYNC`, and runs APP review writeback before refreshing `third_phase_places`, `final_tasks`, and Users from Sheet. Added install/remove/status GAS helpers for the daily 06:30 Asia/Taipei trigger.

[2026-05-29] [AUDIT]
稽核目前 Sheet / Supabase / APP / GAS 資料流並產出 `docs/current-operation-flow.md`。Live read-only 檢查確認 APP-facing views 只暴露 `third_phase_places` 與 `test_places`，`app_sheet_sync_queue` 當下為空，Sheet 端有 `T_UpdatedAt/H_UpdatedAt/同步警告` 欄位可用於衝突偵測。稽核先發現正式回寫路徑尚未比對 Sheet 更新戳；之後已在使用者明確要求下套用 Supabase migration 並 `clasp push` GAS，APP review writeback 現在會在寫 Sheet 前比對語言更新戳，衝突時略過回寫並寫入 `同步警告`。

[2026-05-29] [UI]
管理員頁簽排版改為三等分同列顯示：「全部地名清單」、「審查清單」、「使用者管理」在管理員模式下各佔 1/3；調查員模式維持原任務/其他地名雙頁簽。篩選條件或功能頁切換時會關閉已展開的地名錄音卡片，避免切換清單後仍殘留上一筆地名的錄音操作區。

[2026-05-28] [UI]
Improved investigator audio upload UX for phone and desktop workflows where recordings may come from LINE. The recording area now has separate large entry points for on-site recording and LINE/mobile audio upload, Android/iPhone LINE save/share guidance, broader accepted audio formats, and a confirmation panel showing place, language, source, file name, and size before upload. Mobile viewport checks confirmed the new upload cards and LINE help stack to one column without horizontal overflow.

[2026-05-28] [FIX]
Browser workflow QA now runs through localhost after launching Codex as administrator. Investigator flow was checked with `tanliangkun@mail.naer.edu.tw`: login succeeded, assigned `TEST0001`-`TEST0010` stayed visible only in assigned tasks, other-place browsing excluded test rows, and console errors were clean. Fixed a name-label gap where non-admin uploaded-record history could fall back to recorder account values such as `kunui711`; non-admin sessions now load only the needed user label records while assignment/filter/RPC values remain account-based.

[2026-05-28] [FEATURE]
管理員篩選新增總表語言分級：`app_tasks_view` / `app_review_queue_view` 追加 `tai_class`、`hak_class`，前端管理員模式新增台語分級與客語分級下拉篩選，並在管理員任務列與審查摘要顯示台/客分級 badge，方便以 `直接標注`、電話調查、現場調查、原住民族等分類找地名。

[2026-05-28] [DOCS]
新增 APP 審查回寫 smoke-test 手順與只讀 SQL 檢查：`docs/review-sheet-sync-smoke-test.md` 說明以 `TEST0001` 驗證 `test_places` -> `app_sheet_sync_queue` -> GAS -> `TestEntries` 的 pass/fail 條件；`db/smoke_review_sheet_sync.sql` 可檢查任務來源、審查狀態、pending queue、`final_fields` 與 TEST 資料是否誤走正式來源。

[2026-05-27] [UI]
User display switched to name-first labels while keeping account/email values for login, filtering, and assignment writes. User hovers now expose email, and the admin user manager shows name, email, and phone in one compact row with active controls.

[2026-05-27] [UI]
放寬桌機版審查介面寬度：`body` 最大寬度從 760px 提高到 1120px，錄音比較表在桌機不再硬設 720px 最小寬度，減少橫向 scrollbar；手機版仍保留 720px 最小寬度與橫向捲動。

[2026-05-27] [UI]
審查頁錄音候選資料改成類 Excel 的橫向比較表：每個地名先顯示基本資訊，再依語言列出「錄音 / 三個候選標注欄位 / 播放」表格。台語候選欄位為 `TaiHan1/TL1/TaiNote`，客語為 `Honzii/HP1/HakNote`；每格保留填入最終審定欄位的小按鈕，最終審定區維持原樣。

[2026-05-27] [FEATURE]
審查介面改為真正的「最終審定」流程：每個語言區用緊湊 grid 顯示所有錄音紀錄的標注欄位與播放按鈕，單欄位可一鍵填入最終審定文字框。台語審定欄位為 `TaiHan1/TL1/TL2/TL3/TaiNote`，客語為 `Honzii/HP1/HP2/HP3/HDialect/HakNote`；送出審查後寫入 `task_language_reviews.final_fields`，Places GAS 回寫 Sheet 時優先使用審定欄位。

[2026-05-27] [FIX]
修正 Users 權限欄位與登入模式混淆：`Users` 工作表新增可讀的 `role` 欄，`active` 維持最後欄；Sheet/GAS/DB 同步只允許 `user` 角色從 Sheet 建立，避免 Sheet 產生 admin。前端登入新增角色防呆，一般登入只接受 `user`、管理者登入只接受 `admin`，並在新登入前清除舊 session，避免殘留管理員模式。

[2026-05-27] [FEATURE]
補齊 APP 審查結果回寫 Sheet 的最後一哩路。Supabase 新增 `app_sheet_sync_queue` 與 `mark_reviews_sheet_synced()`；Places GAS 新增「回寫 APP 審查結果至工作表」，正式 `third_phase_places` 回 `第三期工作清單`，測試 `test_places` 回新工作表 `TestEntries`。`TestEntries` 已建立並放入 `TEST0001` 至 `TEST0010` 測試列，Places GAS 已 `clasp push`。

[2026-05-27] [DATA]
已將 Places 試算表 `Users` 工作表改成 Sheet→DB 同步所需的新格式：`email/name/phone/languages/hakka_dialect/life_area_1/survey_area_1/life_area_2/survey_area_2/life_area_3/survey_area_3/active`。保留目前 admin 參考列，清掉舊測試調查員列，`active` 欄已設定 checkbox。

[2026-05-27] [DEPLOY]
已在使用者明確同意後執行 `npx clasp push`，將 `places-gas/` 的 Users 同步選單與函式上傳到 Google Apps Script。推送時間：上午 10:38:19。

[2026-05-26] [DATA]
Users 流程改為 Places `Users` 表單向同步至 Supabase。新增英文精簡欄位、調查員個資欄位、`sync_sheet_users()` RPC、admin active 切換 RPC，舊非管理者帳號已刪除只保留目前 admin；前端只使用使用者 id/account/role/active，admin 可切換一般調查員 active。

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
