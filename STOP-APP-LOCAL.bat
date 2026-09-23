@echo off
REM One-click local stopper
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0STOP-APP-LOCAL.ps1"
