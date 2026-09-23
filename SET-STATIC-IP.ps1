# Fixează IP-ul calculatorului la 192.168.1.128, ca link-ul aplicației să nu se schimbe.
# Revenire la IP automat: RESET-DHCP-IP.bat

$ErrorActionPreference = 'Stop'

$Adapter = 'Ethernet'
$IP      = '192.168.1.128'
$Prefix  = 24
$Gateway = '192.168.1.1'
$Dns     = @('192.168.1.1', '8.8.8.8')

try {
  Write-Host "Setez IP fix $IP pe placa '$Adapter'..." -ForegroundColor Cyan

  Set-NetIPInterface -InterfaceAlias $Adapter -AddressFamily IPv4 -Dhcp Disabled
  Get-NetIPAddress -InterfaceAlias $Adapter -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetRoute -InterfaceAlias $Adapter -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue

  New-NetIPAddress -InterfaceAlias $Adapter -IPAddress $IP -PrefixLength $Prefix -DefaultGateway $Gateway | Out-Null
  Set-DnsClientServerAddress -InterfaceAlias $Adapter -ServerAddresses $Dns

  Start-Sleep -Seconds 3
  $ok = Test-Connection -ComputerName $Gateway -Count 2 -Quiet
  if ($ok) {
    Write-Host "Gata. Calculatorul are acum mereu IP-ul $IP." -ForegroundColor Green
    Write-Host "Link aplicatie: http://$($IP):3000/#/" -ForegroundColor Green
  } else {
    Write-Host "IP setat, dar routerul ($Gateway) nu raspunde. Daca nu ai internet, ruleaza RESET-DHCP-IP.bat." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Eroare: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Ruleaza RESET-DHCP-IP.bat pentru a reveni la setarile automate." -ForegroundColor Yellow
}
