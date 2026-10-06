@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 請先安裝 Node.js 22 或以上，再開啟工具箱。
  pause
  exit /b 1
)
node tools/toolbox.mjs
echo.
echo 工具箱已關閉。執行紀錄保留在這個視窗。
pause
