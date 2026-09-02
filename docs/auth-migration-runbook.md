# Supabase Auth 帳號搬移操作手冊

## 目前已完成

- 登入欄位接受既有 `investigators.account` 使用者名稱或 email。
- Edge Function `auth-login` 先在 active investigators 找到唯一帳號，再呼叫 Supabase Auth 密碼登入。
- `investigators.auth_login_email` 只用來處理舊帳號不是合法 email 的特殊情況。
- Root GAS 提供 `previewAuthUserMigration()` 與 `migrateInvestigatorsToSupabaseAuth()`，不經公開 `doPost` 路由。
- 正式搬移會將每位使用者連到獨立 Auth UUID；角色仍由 `investigators.role` 判斷。

## 第一次操作順序

1. 先在 Apps Script 編輯器確認 Root GAS 專案的 `程式碼.js` 已有兩個搬移函式。
2. 在 Apps Script 的 Project Settings > Script Properties 設定：
   - `SUPABASE_AUTH_MIGRATION_PASSWORD`：統一密碼，至少 8 個字元。不要貼到聊天、Git 或 log。
   - `SUPABASE_AUTH_MIGRATION_CONFIRM`：填入 `I_UNDERSTAND_SHARED_PASSWORD`。
   - `SUPABASE_AUTH_MIGRATION_EMAIL_MAP_JSON`：只有 `email` 欄位不是合法 email 的帳號才需要。
3. 先執行 `previewAuthUserMigration()`。它只讀取 active investigators 與 Auth users，不建立、重設或連結任何資料。
4. 確認預覽結果中的 email 對應、建立／重設數量與 skipped／failed 原因。
5. 執行 `migrateInvestigatorsToSupabaseAuth()`。它會逐筆建立或找到 Auth user、設定統一密碼，並回填 `auth_user_id` 與 `auth_login_email`。
6. 回到 Supabase 讀回 Auth 使用者與 investigators link，再用一個測試帳號登入。

## 特殊帳號對應

目前 `test2@test.com` 與大多數既有合法 email 可直接預覽；`kunui711` 與 `test` 不是合法 email，不能直接當作 Auth email。請替它們指定不重複且你可管理的合法 email，例如：

```json
{
  "kunui711": "指定的管理員登入 email",
  "test": "指定的測試登入 email"
}
```

如果同一個 email 對到兩個 active investigator，預覽會標示衝突，正式搬移會跳過該筆。

## 風險與回復

共用密碼代表知道別人 identifier 的人也可能嘗試登入該帳號；這是目前低風險工具的明確取捨。每位帳號仍有自己的 Auth UUID，便於權限與稽核。若發現錯誤，先停止後續搬移並移除 Script Property；不要直接刪除 Auth users 或清空 `auth_user_id`，先保留證據並個別修正。

搬移工具不會修改角色、正式標注欄位、音檔、工作清單、Google Sheet 或 `writeback_jobs`。帳號建立後，舊 `investigators.password` 欄位仍保留以供回溯，但新登入不再使用它。
