@echo off
REM Overview Application Launcher
REM This script starts the database, API server, and opens the application

echo.
echo ===== Overview Application =====
echo.
echo Checking prerequisites...

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker from https://www.docker.com
    echo.
    pause
    exit /b 1
)

echo ^✓ Docker found

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo ^✓ Node.js found: %NODE_VERSION%

echo.
echo Starting database container...

REM Check if container exists and start it, or create it
docker ps -a --format "{{.Names}}" | findstr /R "overview-db" >nul 2>&1
if %errorlevel% equ 0 (
    echo Container exists, starting...
    docker start overview-db
) else (
    echo Creating new database container...
    docker volume create overview-db-data
    docker run --name overview-db -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=overview -p 5432:5432 -v overview-db-data:/var/lib/postgresql/data -d postgres:15
)

echo Waiting for database to be ready...
timeout /t 3 /nobreak

REM Wait for database to be ready
setlocal enabledelayedexpansion
for /L %%i in (1,1,30) do (
    docker exec overview-db pg_isready -U postgres >nul 2>&1
    if !errorlevel! equ 0 (
        echo ^✓ Database is ready
        goto db_ready
    )
    timeout /t 1 /nobreak
)

echo WARNING: Database may not be ready yet, continuing anyway...

:db_ready

echo.
echo Starting application...
echo The app will be available at http://localhost:3000
echo.

REM Start the application
cd /d "%~dp0"
start http://localhost:3000
npm start

pause
