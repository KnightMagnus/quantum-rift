@echo off
title Quantum Rift - Host a friend game
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org first.
  pause
  exit /b 1
)
echo Hosting a friend game on your network. Keep this window open while playing.
echo No router ports, firewall rules or tunnels are configured automatically.
node tools\start.ts --friends
pause
