@echo off
REM Cere drepturi de Administrator si ruleaza ALLOW-FIREWALL.ps1 (deschide portul 3000 in Windows Firewall)
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -NoExit -File \"%~dp0ALLOW-FIREWALL.ps1\"'"
