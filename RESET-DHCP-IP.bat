@echo off
REM Cere drepturi de Administrator si ruleaza RESET-DHCP-IP.ps1
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"%~dp0RESET-DHCP-IP.ps1\"'"
