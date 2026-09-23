@echo off
REM Cere drepturi de Administrator si ruleaza SET-STATIC-IP.ps1
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"%~dp0SET-STATIC-IP.ps1\"'"
