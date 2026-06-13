@echo off
REM ============================================================
REM  Printara API server (Stripe checkout, etc.)
REM  Double-click this to start the backend Herd proxies to.
REM  Keep this window OPEN while using payments. Close it to stop.
REM ============================================================
cd /d "%~dp0"
echo.
echo  Starting Printara API server on http://127.0.0.1:8888
echo  (Herd proxies /.netlify/functions/* here)
echo.
echo  Leave this window open. Press Ctrl+C or close it to stop.
echo.
node api-server.js
echo.
echo  Server stopped.
pause
