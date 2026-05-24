# Overview Application Launcher (PowerShell)
# Run with: powershell -ExecutionPolicy Bypass -File RUN-APP.ps1

Write-Host ""
Write-Host "===== Overview Application =====" -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerExists = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
if (-not $dockerExists) {
    Write-Host "ERROR: Docker not found!" -ForegroundColor Red
    Write-Host "Install from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "✓ Docker found" -ForegroundColor Green

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeExists = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeExists) {
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Install from: https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
$nodeVersion = & node --version
Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green

Write-Host ""
Write-Host "Starting database..." -ForegroundColor Yellow

# Check if container exists
$containerExists = & docker ps -a --format "{{.Names}}" | Select-String "overview-db" -ErrorAction SilentlyContinue
if ($containerExists) {
    Write-Host "Starting existing container..." -ForegroundColor Cyan
    & docker start overview-db
} else {
    Write-Host "Creating new database container..." -ForegroundColor Cyan
    & docker volume create overview-db-data
    & docker run --name overview-db -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=overview -p 5432:5432 -v overview-db-data:/var/lib/postgresql/data -d postgres:15 | Out-Null
}

Write-Host "Waiting for database..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Wait for database to be ready
for ($i = 1; $i -le 30; $i++) {
    $ready = & docker exec overview-db pg_isready -U postgres 2>$null
    if ($?) {
        Write-Host "✓ Database is ready" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "Starting application..." -ForegroundColor Cyan
Write-Host "The app will be available at http://localhost:3000" -ForegroundColor Yellow
Write-Host ""

# Start app
& npm start
