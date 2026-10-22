@echo off
title NETS Windows Bridge Service
echo ===================================================
echo   Starting NETS ECR3 Windows Bridge Service
echo   Port: 5050 (127.0.0.1)
echo ===================================================
cd /d "%~dp0"
node bridge-server.js
pause
