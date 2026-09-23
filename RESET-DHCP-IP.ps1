# Readuce placa de rețea la IP automat (DHCP) — anulează SET-STATIC-IP.

$ErrorActionPreference = 'Continue'
$Adapter = 'Ethernet'

Write-Host "Revin la IP automat pe placa '$Adapter'..." -ForegroundColor Cyan
Get-NetRoute -InterfaceAlias $Adapter -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
Get-NetIPAddress -InterfaceAlias $Adapter -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
Set-NetIPInterface -InterfaceAlias $Adapter -AddressFamily IPv4 -Dhcp Enabled
Set-DnsClientServerAddress -InterfaceAlias $Adapter -ResetServerAddresses
& ipconfig /renew $Adapter | Out-Null

Start-Sleep -Seconds 3
$ip = (Get-NetIPAddress -InterfaceAlias $Adapter -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
Write-Host "Gata. IP curent: $ip" -ForegroundColor Green
