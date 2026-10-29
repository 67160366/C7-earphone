@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\monitor-esp32.ps1" -Action Start
if errorlevel 1 (
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\monitor-esp32.ps1" -Action Watch
