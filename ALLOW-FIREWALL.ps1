# Permite accesul din rețea la aplicație: deschide portul 3000 (frontend) în Windows Firewall,
# pe toate profilurile de rețea (Private / Public / Domain), ca link-ul http://192.168.1.128:3000
# să meargă de pe celelalte calculatoare indiferent cum clasifică Windows rețeaua.
# Fără această regulă, celelalte PC-uri primesc "This site can't be reached / took too long to respond".
# Trebuie rulat ca Administrator (RUN-APP-LOCAL.ps1 îl pornește automat cu prompt UAC când lipsește regula).

$ErrorActionPreference = 'Stop'

$RuleName = 'Overview app (port 3000)'
$Port     = 3000

try {
  Write-Host "Setez regula de firewall '$RuleName' (TCP $Port, toate profilurile)..." -ForegroundColor Cyan

  $rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
  if ($rule) {
    $rule | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort $Port
    Write-Host 'Regula exista deja; am actualizat-o.' -ForegroundColor Green
  } else {
    New-NetFirewallRule -DisplayName $RuleName `
      -Description 'Permite accesul din retea la aplicatia Overview (frontend pe portul 3000)' `
      -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Write-Host 'Regula a fost creata.' -ForegroundColor Green
  }

  Write-Host "Gata. Celelalte calculatoare pot deschide http://192.168.1.128:$Port/#/" -ForegroundColor Green
} catch {
  Write-Host "Eroare: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Ruleaza ALLOW-FIREWALL.bat (cere singur drepturi de Administrator).' -ForegroundColor Yellow
  exit 1
}
