@echo off
rem Clear ELECTRON_RUN_AS_NODE injected by DSH, otherwise electron runs in Node mode
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if exist "%~dp0_asr\venv\Scripts\python.exe" "%~dp0_asr\venv\Scripts\python.exe" "%~dp0asr\manage.py" start
set "PET_ELECTRON=%LOCALAPPDATA%\DesktopPetRuntime\electron-44.7.0\electron.exe"
if not exist "%PET_ELECTRON%" (
  echo Desktop pet runtime missing: "%PET_ELECTRON%"
  pause
  exit /b 1
)
start "" "%PET_ELECTRON%" "%~dp0"
