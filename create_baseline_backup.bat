@echo off
setlocal

rem 從批次檔所在的專案根目錄執行，避免雙擊時工作目錄不正確。
cd /d "%~dp0"

echo 正在建立 TopoNote 完整基線備份，請稍候...
echo 備份輸出資料夾：%~dp0backups
echo.

python -X utf8 "%~dp0scripts\create_baseline_backup.py"
set "BACKUP_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%BACKUP_EXIT_CODE%"=="0" (
    echo 備份完成。請確認 backups 資料夾內已產生 ZIP 檔。
) else (
    echo 備份失敗，錯誤代碼：%BACKUP_EXIT_CODE%
    echo 請保留上方錯誤訊息以便後續排查。
)

echo.
pause
exit /b %BACKUP_EXIT_CODE%
