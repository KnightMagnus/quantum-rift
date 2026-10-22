@echo off
cd /d "%~dp0"
py -3 save_generator.py
if errorlevel 1 pause
