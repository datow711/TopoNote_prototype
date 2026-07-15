# Session Log: 2026-05-25 Login Fields

## Goal

將登入改成一般調查員只輸入 email 即可進入個人頁面，管理者仍需密碼，並讓 Places `Users` 頁簽與 Supabase `investigators` 欄位對齊。

## Supabase

- `investigators` 新增欄位：
  - `email text`
  - `is_active boolean not null default true`
  - `specialty text`
- 既有資料先以 `account` 回填 `email`。
- 新增 RPC：
  - `login_investigator(p_email text)`：只允許非 admin 且 active 的使用者免密碼登入。
  - `login_admin(p_email text, p_password text)`：只允許 admin 且 active，並檢查密碼。
- `app_users_view` 改為輸出 `user_name`、`role`、`email`、`specialty`、`is_active`。

## Places Sheet

- `Users` 頁簽欄位改為：
  - `account`
  - `password`
  - `user_name`
  - `role`
  - `email`
  - `is_active`
  - `specialty`
- 密碼欄未從 Supabase 反查，避免讀取 plaintext credential；目前以空白保留欄位。

## Frontend

- 登入頁預設只顯示 email 與「進入我的任務」。
- 管理者點「管理者登入」後才顯示密碼欄與「進入管理模式」。
- 前端改呼叫 `login_investigator` / `login_admin`。
- 登入回傳的 `specialty` 會先存入 state，若未來值包含「客」，錄音標注區可預設顯示客語。
