@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.jsが見つかりません。Node.jsをインストールしてください。
    start "" "https://nodejs.org/"
    pause
    exit /b 1
)

if not defined USAGE_METER_PORT set "USAGE_METER_PORT=4317"

start "AI Usage Meter" cmd /k "cd /d ""%~dp0"" && node usage-bridge.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%USAGE_METER_PORT%/"

endlocal
