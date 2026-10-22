@echo off
title Quantum Rift server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Quantum Rift needs Node.js, which is not installed yet.
  echo Opening the download page: install Node.js, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)
echo Starting Quantum Rift... keep this window open while you play. Close it to stop the server.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node tools\start.mjs
pause
