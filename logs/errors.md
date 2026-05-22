# Error Log

[2026-05-22 17:08] [ERROR] [已知問題暫緩]
錯誤訊息：Supabase HTTP 401: Forbidden use of secret API key in browser.
發生位置：Places GAS `syncFinalTasksToSupabase()` 呼叫 Supabase REST API。
根本原因：Supabase 將 Google Apps Script `UrlFetchApp` 使用 `sb_secret_*` 的請求判定為 browser-like 環境並拒絕 secret key。
解決方式：已嘗試移除 Bearer header、加入 backend-oriented User-Agent 與完整錯誤顯示，但仍被拒絕。依使用者指示先保留現狀。
後續建議：改回 legacy `service_role` JWT 放在 Script Properties，或改走 Supabase Edge Function/後端中介。
