@echo off
title Quantum Rift (solo game)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Quantum Rift needs Node.js, which is not installed yet.
  echo Opening the download page: install the LTS version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)
echo Starting your private Quantum Rift game... keep this window open while you play. Close it to stop.
set SOLO=1
set DATA_DIR=%~dp0solo-data
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server\main.js
pause
