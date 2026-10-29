@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\monitor-esp32.ps1" -Action Stop
pause
