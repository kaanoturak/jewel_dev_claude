@echo off
title TuguJewelry PIM Server
echo.
echo ========================================
echo   TuguJewelry Insider PIM - Local Dev
echo ========================================
echo.
echo URL: http://localhost:8000
echo [SERVER] Keep this window open while using the app.
echo.
start "" python -m http.server 8000
timeout /t 2 /nobreak >nul
start "" http://localhost:8000
echo [OK] Browser opened. Server is running.
echo [STOP] Close this window to stop the server.
pause
