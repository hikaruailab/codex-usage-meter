@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "TEMP_ROOT="
set "REPO_URL=https://github.com/hikaruailab/codex-usage-meter/archive/refs/heads/main.zip"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.jsが見つかりません。Node.jsをインストールしてください。
    start "" "https://nodejs.org/"
    pause
    exit /b 1
)

if exist "%SCRIPT_DIR%usage-bridge.mjs" goto ready

where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo PowerShellが見つかりません。Windows PowerShellを有効にしてください。
    pause
    exit /b 1
)

echo 公式リポジトリから必要ファイルをダウンロードしています。
set "TEMP_ROOT=%TEMP%\codex-usage-meter-%RANDOM%-%RANDOM%"
mkdir "%TEMP_ROOT%" >nul 2>&1
if not exist "%TEMP_ROOT%" goto download_error

powershell.exe -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%REPO_URL%' -OutFile '%TEMP_ROOT%\codex-usage-meter.zip'"
if errorlevel 1 goto download_error

powershell.exe -NoProfile -Command "Expand-Archive -LiteralPath '%TEMP_ROOT%\codex-usage-meter.zip' -DestinationPath '%TEMP_ROOT%' -Force"
if errorlevel 1 goto download_error

set "SCRIPT_DIR=%TEMP_ROOT%\codex-usage-meter-main\"
if not exist "%SCRIPT_DIR%usage-bridge.mjs" goto download_error

:ready
cd /d "%SCRIPT_DIR%"
if not defined USAGE_METER_PORT set "USAGE_METER_PORT=4317"

start "" /b powershell.exe -NoProfile -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:%USAGE_METER_PORT%/'"
node usage-bridge.mjs
set "EXIT_CODE=%ERRORLEVEL%"

if defined TEMP_ROOT rmdir /s /q "%TEMP_ROOT%" >nul 2>&1
endlocal & exit /b %EXIT_CODE%

:download_error
echo 必要ファイルのダウンロードまたは展開に失敗しました。
if defined TEMP_ROOT rmdir /s /q "%TEMP_ROOT%" >nul 2>&1
pause
endlocal & exit /b 1
