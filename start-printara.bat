@echo off
title Printara Server
cd /d "%~dp0"

:: ── Step 1: Self-elevate to add hosts entry if needed ─────────────────────────
net session >nul 2>&1
if %errorLevel% == 0 goto :is_admin

:: Not admin — relaunch elevated for hosts entry only, then continue normally below
powershell -Command "Start-Process cmd -ArgumentList '/c net session >nul 2>&1 && (findstr /C:\"printara.test\" C:\Windows\System32\drivers\etc\hosts >nul 2>&1 || echo 127.0.0.1 printara.test >> C:\Windows\System32\drivers\etc\hosts)' -Verb RunAs -Wait" >nul 2>&1
goto :start_server

:is_admin
:: Running as admin — add hosts entry directly if missing
findstr /C:"printara.test" C:\Windows\System32\drivers\etc\hosts >nul 2>&1
if %errorLevel% neq 0 (
    echo 127.0.0.1 printara.test >> C:\Windows\System32\drivers\etc\hosts
    echo  Added printara.test to hosts file
)

:start_server
:: ── Step 2: Restore proxy nginx config (Herd may overwrite it on restart) ────
copy /Y "%~dp0printara.test.nginx.conf" "C:\Users\ShaneVandekrol\.config\herd\config\valet\Nginx\printara.test.conf" >nul 2>&1

:: ── Step 3: Reload nginx ──────────────────────────────────────────────────────
cd /d "C:\Program Files\Herd\resources\app.asar.unpacked\resources\bin\nginx"
nginx.exe -s reload -p "C:\Users\ShaneVandekrol\.config\herd\config\nginx" -c nginx.conf >nul 2>&1
cd /d "%~dp0"

:: ── Step 4: Kill any stale server.js and start fresh ─────────────────────────
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo  Printara is running
echo  ───────────────────────────────────
echo  Local:   https://printara.test
echo  Network: http://192.168.0.135:3000
echo  ───────────────────────────────────
echo  Press Ctrl+C to stop
echo.
node server.js
