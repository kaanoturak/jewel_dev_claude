@echo off
title TuguJewelry PIM Server
echo.
echo ========================================
echo   TuguJewelry Insider PIM - Local Dev
echo ========================================
echo.
echo Starting local server and opening browser...
echo.
echo URL: http://localhost:8000
echo.
echo [SERVER] Keep this window open while using the app.
echo.

:: Open the browser immediately
start "" http://localhost:8000

:: Start the Python HTTP server
python -m http.server 8000
