@echo off
setlocal
cd /d "%~dp0"
py -3 -m venv .build-env
if errorlevel 1 goto failed
.build-env\Scripts\python.exe -m pip install -r "..\..\tools\save-generator-requirements.txt"
if errorlevel 1 goto failed
.build-env\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name "Quantum Rift Save Generator" --add-data "catalog.json;." save_generator.py
if errorlevel 1 goto failed
echo.
echo Ready: dist\Quantum Rift Save Generator.exe
pause
exit /b 0
:failed
echo Build failed. Install Python 3 for Windows with the Python launcher and Tcl/Tk support.
pause
exit /b 1
