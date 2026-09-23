@echo off
REM One-click local launcher (no Docker)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-APP-LOCAL.ps1"
