# Session Log: 2026-05-26 Session Logout

## Goal

新增登出按鈕與前端 session，避免使用者重新整理頁面後登入狀態消失。

## Changes

- 新增 `toponote_session` localStorage session。
- session 保存：
  - `user_name`
  - `role`
  - `specialty`
  - `email`
  - `savedAt`
- session 有效期設定為 24 小時。
- 頁面載入時會自動檢查 session：
  - 有效則直接恢復登入並重新載入任務。
  - 失效或解析錯誤則清除 session，停留在登入畫面。
- 使用者資訊列新增「登出」按鈕。
- 登出會：
  - 清除 localStorage session。
  - 清空前端 state。
  - 移除使用者資訊列與 admin 指派工具列。
  - 隱藏 APP，回到登入畫面。

## Verification

- `node --check main.js` passed.
- Local DOM simulation passed:
  - login saves `toponote_session`
  - app view appears after login
  - reload/session restore brings the user back into the app
  - logout clears `toponote_session`
  - logout hides the app and returns to login view
