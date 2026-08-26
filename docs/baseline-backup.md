# TopoNote 一次性基線備份

`scripts/create_baseline_backup.py` 用來手動建立一個單一 ZIP 檔，保存目前 TopoNote 的程式、文件、本地音檔與可取得的外部匯出資料。

這是「第一層基線封存」，不是定期備份服務。它的目標是先快速留下某一個時間點的可追溯資料包；日後若要還原，可能需要人工解壓、執行 SQL 或重新設定 Apps Script。

## 最簡單的使用方式

在專案根目錄執行：

```powershell
python scripts\create_baseline_backup.py
```

預設會把 ZIP 放在：

```text
backups\TopoNote_baseline_backup_YYYYMMDD_HHMMSS.zip
```

也可以直接輸出到 Google Drive 同步資料夾：

```powershell
python scripts\create_baseline_backup.py `
  --output-dir 'C:\Users\user\我的雲端硬碟 (kunui711@alum.naer.edu.tw)\kunui711工作資料夾\TopoNote_Backups'
```

## 預設會備份什麼

- Git 追蹤中的程式碼、文件、SQL、測試與資料檔。
- 本地 `AudioUploads\` 音檔；這個資料夾雖然被 Git 忽略，但屬於重要資料，因此特別納入。
- 如果存在，納入 `backup-inputs\` 內的外部匯出檔。
- `repository.git.bundle`，保存 Git 歷史與 refs。
- `backup/manifest.json`，記錄備份時間、範圍、檔案大小、SHA-256 與未納入項目。

## 不會放進 ZIP 的項目

- `.git` 原始資料夾；改以 Git bundle 保存。
- `node_modules`、快取、測試結果與其他產生物。
- `.clasp.json`、`.env`、憑證、金鑰、token 等本機設定或疑似 secret。
- 尚未匯出的 Google Sheet 原生內容與正式 Google Drive 音檔。

最後一項很重要：程式無法從前端公開 Supabase anon key 推導資料庫密碼，也不會假裝已經備份正式 Sheet／Drive。若要把這些資料放入同一個 ZIP，請先將匯出檔放入 `backup-inputs\`，或用 `--include-path` 指定資料夾。

## 加入外部匯出資料

把 Google Sheet 的 XLSX/CSV、Drive 音檔或其他重要匯出資料放進：

```text
backup-inputs\
```

再執行：

```powershell
python scripts\create_baseline_backup.py
```

或直接指定資料夾：

```powershell
python scripts\create_baseline_backup.py `
  --include-path 'D:\TopoNote-live-exports'
```

## 加入 Supabase live dump

若電腦已安裝 PostgreSQL client 的 `pg_dump`，可以使用安全性較高的環境變數傳入連線字串：

```powershell
$env:TOPONOTE_SUPABASE_DB_URL = 'postgresql://使用者:密碼@主機:5432/postgres'
python scripts\create_baseline_backup.py --require-supabase
Remove-Item Env:TOPONOTE_SUPABASE_DB_URL
```

成功時 ZIP 會包含：

- `generated/supabase/live/supabase.custom.dump`：schema 與資料的 PostgreSQL custom dump。
- `generated/supabase/live/schema.sql`：schema-only SQL。

若沒有設定連線字串、找不到 `pg_dump` 或匯出失敗，預設仍會建立 ZIP，但 manifest 會把 Supabase 標示為 `skipped` 或 `failed`。使用 `--require-supabase` 則會直接失敗，避免誤以為已完成完整備份。

## 備份後檢查

程式會自動重新開啟 ZIP，執行 ZIP 完整性檢查，並讀回 `backup/manifest.json`。手動保存時仍建議確認：

1. ZIP 檔案確實已同步到 Google Drive 或複製到另一個磁碟。
2. ZIP 內的 `backup/manifest.json` 顯示必要資料沒有被列在 `omitted`。
3. 若需要 Supabase 基線，`supabase.status` 是 `exported`。
4. 音檔資料量合理，且至少抽樣解壓一個檔案確認可讀取。

## 目前的還原原則

這個工具目前只負責封裝與驗證，不自動覆寫正式環境。還原時應先解壓到隔離資料夾，再依資料類型處理：

- Git bundle：用 `git clone repository.git.bundle` 建立程式歷史副本。
- Supabase custom dump：使用 `pg_restore` 還原到隔離資料庫，再做資料核對。
- Google Sheet：從 ZIP 取出 XLSX/CSV，先建立副本後再人工核對 UUID。
- 音檔：先確認檔案與 `audio_records` 的 task/client upload ID 對應，再決定是否重新上傳或修復 metadata。

不要直接把 ZIP 內容覆蓋正式 Google Sheet、Supabase 或 Google Drive。
