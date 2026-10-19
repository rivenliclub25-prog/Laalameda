@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish-prices.ps1"
echo.
pause
