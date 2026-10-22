# nets-bridge/fetch_newtonsoft.ps1
$url = "https://www.nuget.org/api/v2/package/Newtonsoft.Json/12.0.3"
$zip = "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\newtonsoft.zip"
$extractDir = "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\newtonsoft_pkg"

Write-Host "Downloading Newtonsoft.Json 12.0.3..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $zip

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $extractDir)

$dll = Get-ChildItem -Path $extractDir -Filter "Newtonsoft.Json.dll" -Recurse | Where-Object { $_.FullName -like "*net40*" -or $_.FullName -like "*net45*" } | Select-Object -First 1
if ($dll) {
    Copy-Item $dll.FullName -Destination "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\" -Force
    Write-Host "Installed: $($dll.FullName) -> nets-bridge/bin/Newtonsoft.Json.dll"
}

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Unblock-File -Path "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\Newtonsoft.Json.dll"
Get-ChildItem -Path "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin" | Select-Object Name, Length
