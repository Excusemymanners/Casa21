@echo off
REM Create Desktop Shortcut for Overview App
REM Run this once to create the shortcut

setlocal enabledelayedexpansion

REM Get the current directory (where the EXE is)
set "APP_DIR=%~dp0"
set "EXE_PATH=%APP_DIR%dist\win-unpacked\Overview.exe"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT_PATH=%DESKTOP%\Overview.lnk"

echo.
echo Creating Desktop Shortcut...
echo.

REM Check if EXE exists
if not exist "%EXE_PATH%" (
    echo ERROR: Overview.exe not found at:
    echo %EXE_PATH%
    echo.
    pause
    exit /b 1
)

REM Create shortcut using PowerShell (more reliable than VBS)
powershell -NoProfile -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); " ^
  "$Shortcut.TargetPath = '%EXE_PATH%'; " ^
  "$Shortcut.WorkingDirectory = '%APP_DIR%'; " ^
  "$Shortcut.Description = 'Overview - Job & Task Management'; " ^
  "$Shortcut.Save();"

if %errorlevel% equ 0 (
    echo.
    echo ✓ Shortcut created successfully!
    echo.
    echo Location: %SHORTCUT_PATH%
    echo.
    echo You can now:
    echo - Double-click the shortcut on your Desktop
    echo - The app will start automatically
    echo - Database and frontend will start in the background
    echo.
    echo First run may take 10-15 seconds to start.
    echo.
) else (
    echo.
    echo ERROR: Failed to create shortcut
    echo.
)

pause
