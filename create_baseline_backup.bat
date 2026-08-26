@echo off
setlocal

cd /d "%~dp0"

echo Creating TopoNote baseline backup...
echo Output folder: "%~dp0backups"
echo.

python -X utf8 "%~dp0scripts\create_baseline_backup.py"
set "BACKUP_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%BACKUP_EXIT_CODE%"=="0" (
    echo Backup completed. Check the backups folder for the ZIP file.
) else (
    echo Backup failed. Error code: %BACKUP_EXIT_CODE%
    echo Keep the messages above for troubleshooting.
)

echo.
pause
exit /b %BACKUP_EXIT_CODE%
