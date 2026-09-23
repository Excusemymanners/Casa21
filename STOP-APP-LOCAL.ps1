# Overview local stopper
# Stops frontend (3000), backend (3001), and tries to stop local PostgreSQL service.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-WarnMsg($msg) { Write-Host $msg -ForegroundColor Yellow }

Write-Host ''
Write-Host '===== Overview Local Stop =====' -ForegroundColor Cyan
Write-Host ''

$ports = 3000, 3001
$stoppedAny = $false

foreach ($p in $ports) {
  $conns = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
  if ($conns) {
    foreach ($c in $conns) {
      try {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
        Write-Ok ("Stopped process {0} on port {1}" -f $c.OwningProcess, $p)
        $stoppedAny = $true
      } catch {
        Write-WarnMsg ("Could not stop process {0} on port {1}: {2}" -f $c.OwningProcess, $p, $_.Exception.Message)
      }
    }
  } else {
    Write-Info ("No listener on port {0}" -f $p)
  }
}

$services = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue
if ($services) {
  foreach ($svc in $services) {
    if ($svc.Status -eq 'Running') {
      try {
        Stop-Service -Name $svc.Name -Force -ErrorAction Stop
        Write-Ok ("Stopped service {0}" -f $svc.Name)
      } catch {
        Write-WarnMsg ("Could not stop service {0}: {1}" -f $svc.Name, $_.Exception.Message)
        Write-WarnMsg 'Tip: run this script as Administrator to stop PostgreSQL service.'
      }
    } else {
      Write-Info ("Service already stopped: {0}" -f $svc.Name)
    }
  }
} else {
  Write-Info 'No PostgreSQL service detected.'
}

Write-Host ''
if ($stoppedAny) {
  Write-Ok 'Application processes stopped.'
} else {
  Write-Info 'No application processes were running.'
}
Write-Host ''
