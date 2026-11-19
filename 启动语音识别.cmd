@echo off
setlocal
cd /d "%~dp0"
"%~dp0_asr\venv\Scripts\python.exe" "%~dp0asr\manage.py" start
if errorlevel 1 pause
