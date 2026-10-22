# nets-bridge/fetch_log4net.ps1
$url = "https://www.nuget.org/api/v2/package/log4net/2.0.5"
$zip = "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\log4net.zip"
$extractDir = "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\log4net_pkg"

Write-Host "Downloading log4net 2.0.5..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "Extracting..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $extractDir)

$dll = Get-ChildItem -Path $extractDir -Filter "log4net.dll" -Recurse | Where-Object { $_.FullName -like "*net40*" -or $_.FullName -like "*net45*" } | Select-Object -First 1
if ($dll) {
    Copy-Item $dll.FullName -Destination "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\" -Force
    Write-Host "Installed: $($dll.FullName) -> nets-bridge/bin/log4net.dll"
} else {
    Write-Host "Could not find net40 log4net.dll in package"
}

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Unblock-File -Path "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\log4net.dll"
Get-ChildItem -Path "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin" | Select-Object Name, Length
