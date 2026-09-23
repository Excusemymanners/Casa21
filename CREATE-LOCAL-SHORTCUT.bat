@echo off
REM Create Desktop shortcut for local launcher (no Docker)
setlocal

set "APP_DIR=%~dp0"
set "TARGET_PS=%APP_DIR%RUN-APP-LOCAL.ps1"
set "ICON_PATH=%APP_DIR%public\Sigla.svg"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_PATH=%DESKTOP%\Overview Local.lnk"

if not exist "%TARGET_PS%" (
  echo ERROR: %TARGET_PS% not found.
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); " ^
  "$Shortcut.TargetPath = 'powershell.exe'; " ^
  "$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File ""%TARGET_PS%""'; " ^
  "$Shortcut.WorkingDirectory = '%APP_DIR%'; " ^
  "$Shortcut.Description = 'Overview local launcher (DB + backend + frontend)'; " ^
  "if (Test-Path '%ICON_PATH%') { $Shortcut.IconLocation = '%ICON_PATH%,0' } else { $Shortcut.IconLocation = 'shell32.dll,220' }; " ^
  "$Shortcut.Save();"

if %errorlevel% neq 0 (
  echo ERROR: Could not create shortcut.
  pause
  exit /b 1
)

echo.
echo Shortcut created: %SHORTCUT_PATH%
echo Double-click it to start DB + backend + frontend.
echo.
pause
