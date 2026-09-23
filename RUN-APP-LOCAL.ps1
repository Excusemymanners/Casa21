# Overview local launcher (no Docker)
# Starts local PostgreSQL service (if available), backend and frontend.

param()

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-WarnMsg($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

Write-Host ''
Write-Host '===== Overview Local Launcher =====' -ForegroundColor Cyan
Write-Host ''

# Fixed IP: the login/QR link is http://192.168.1.128:3000 — make sure the PC keeps that address.
$StaticIp = '192.168.1.128'
$ipOk = [bool](Get-NetIPAddress -InterfaceAlias 'Ethernet' -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -eq $StaticIp -and $_.PrefixOrigin -eq 'Manual' })
if ($ipOk) {
  Write-Ok "Static IP already set: $StaticIp"
} else {
  Write-WarnMsg "IP $StaticIp is not fixed yet. Setting it (confirm the Administrator prompt)..."
  try {
    $staticScript = Join-Path $PSScriptRoot 'SET-STATIC-IP.ps1'
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$staticScript`""
  } catch {
    Write-WarnMsg 'Static IP was not set (Administrator prompt refused). The app will still start.'
  }
  $current = (Get-NetIPAddress -InterfaceAlias 'Ethernet' -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
  Write-Info "Current IP: $current"
}

# Node check
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Err 'ERROR: Node.js not found in PATH.'
  exit 1
}
Write-Ok ("Node found: " + (& node --version))

# npm.cmd check
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  Write-Err 'ERROR: npm.cmd not found in PATH.'
  exit 1
}
Write-Ok 'npm.cmd found'

# Ensure DB is reachable on localhost:5432
$dbReady = $false
try {
  $test = Test-NetConnection -ComputerName localhost -Port 5432 -WarningAction SilentlyContinue
  $dbReady = [bool]$test.TcpTestSucceeded
} catch { $dbReady = $false }

if (-not $dbReady) {
  Write-WarnMsg 'PostgreSQL not reachable on port 5432. Trying to start local PostgreSQL service...'
  $services = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue
  if ($services) {
    foreach ($svc in $services) {
      if ($svc.Status -ne 'Running') {
        try {
          Start-Service -Name $svc.Name -ErrorAction Stop
          Write-Ok ("Started service: " + $svc.Name)
        } catch {
          Write-WarnMsg ("Could not start service " + $svc.Name + ". Try running this launcher as Administrator.")
        }
      }
    }
  } else {
    Write-WarnMsg 'No PostgreSQL Windows service detected.'
  }

  Start-Sleep -Seconds 2
  try {
    $test = Test-NetConnection -ComputerName localhost -Port 5432 -WarningAction SilentlyContinue
    $dbReady = [bool]$test.TcpTestSucceeded
  } catch { $dbReady = $false }
}

if ($dbReady) {
  Write-Ok 'Database reachable on localhost:5432'
} else {
  Write-WarnMsg 'Database still not reachable on 5432. Backend may fail until DB is up.'
}

# Fixed ports: the login/QR link always uses 3000, so we never let the app move.
$FRONTEND_PORT = 3000
$BACKEND_PORT = 3001

# Kill whatever is listening on a port (including its child processes) and wait until it is free.
function Free-Port($port) {
  $pids = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 })
  if ($pids.Count -eq 0) { return }
  foreach ($procId in $pids) {
    $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    Write-WarnMsg ("Port {0} is used by {1} (PID {2}). Closing it..." -f $port, $name, $procId)
    & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null
  }
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
      Write-Ok ("Port {0} is free" -f $port)
      return
    }
    Start-Sleep -Milliseconds 500
  }
  Write-Err ("Could not free port {0}. Run this launcher as Administrator." -f $port)
  exit 1
}

Free-Port $BACKEND_PORT
Free-Port $FRONTEND_PORT

Write-Info "Starting backend on port $BACKEND_PORT..."
$backendCmd = "Set-Location -Path '$PSScriptRoot'; `$env:API_PORT='$BACKEND_PORT'; node server/server.js"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-Command', $backendCmd | Out-Null

Write-Info "Starting frontend on port $FRONTEND_PORT..."
# PORT=3000 is pinned in package.json ("start" script)
$frontCmd = 'cd /d "' + $PSScriptRoot + '" && npm.cmd run start'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $frontCmd | Out-Null

# Wait until the frontend actually answers (React dev server needs 20-60s to compile)
Write-Info "Waiting for the app to be ready on port $FRONTEND_PORT (up to 3 minutes)..."
$appReady = $false
for ($i = 0; $i -lt 180; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$FRONTEND_PORT/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $appReady = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
if ($appReady) { Write-Ok 'App is ready.' } else { Write-WarnMsg 'App did not answer in 3 minutes. Check the frontend window for errors.' }

# Print URLs
$lanHostLine = Get-Content -Path (Join-Path $PSScriptRoot '.env.local') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*LAN_HOST\s*=' } | Select-Object -First 1
if ($lanHostLine) { $lanIp = ($lanHostLine -split '=', 2)[1].Trim() } else {
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notlike 'vEthernet*' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
}

Write-Host ''
Write-Ok 'App launch complete.'
Write-Host ('Local URL: http://localhost:3000') -ForegroundColor White
if ($lanIp) {
  Write-Host ("LAN URL:   http://" + $lanIp + ':3000') -ForegroundColor White
}
Write-Host ''

try { Start-Process 'http://localhost:3000' | Out-Null } catch {}
