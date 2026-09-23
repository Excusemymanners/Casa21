@echo off
REM Create Desktop shortcut for local stopper
setlocal

set "APP_DIR=%~dp0"
set "TARGET_PS=%APP_DIR%STOP-APP-LOCAL.ps1"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_PATH=%DESKTOP%\Overview Stop Local.lnk"

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
  "$Shortcut.Description = 'Overview local stop (backend + frontend + try DB service)'; " ^
  "$Shortcut.IconLocation = 'shell32.dll,131'; " ^
  "$Shortcut.Save();"

if %errorlevel% neq 0 (
  echo ERROR: Could not create stop shortcut.
  pause
  exit /b 1
)

echo.
echo Shortcut created: %SHORTCUT_PATH%
echo Double-click it to stop backend + frontend (and DB service when permissions allow).
echo.
pause
