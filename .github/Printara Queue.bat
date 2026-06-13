@echo off
cd /d "%~dp0"
title Printara Queue

echo.
echo  Printara Print Queue
echo  ________________________________
echo.

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  Node.js is required but not installed.
    echo  Opening nodejs.org  --  install it then run this file again.
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

:: Download queue.html if missing
if not exist queue.html (
    echo  Downloading queue.html ...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/shanevandekrol-dotcom/printara/main/queue.html' -OutFile 'queue.html' -UseBasicParsing"
    if not exist queue.html (
        echo  Download failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo  Done.
)

:: Download serve.js if missing
if not exist serve.js (
    echo  Downloading server ...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/shanevandekrol-dotcom/printara/main/serve.js' -OutFile 'serve.js' -UseBasicParsing"
)

echo  Starting Printara Queue ...
echo.
node serve.js
pause
