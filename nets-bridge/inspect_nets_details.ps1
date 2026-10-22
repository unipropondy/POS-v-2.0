# nets-bridge/inspect_nets_details.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\NetsECR.dll")
$t = $asm.GetType("Unipro.NetsECR.NetsMain")
Write-Host "=== Unipro.NetsECR.NetsMain Fields ==="
foreach ($f in $t.GetFields([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static')) {
    Write-Host "  Field: $($f.FieldType.Name) $($f.Name)"
}

Write-Host "`n=== Unipro.NetsECR All Types in Assembly ==="
foreach ($type in $asm.GetTypes()) {
    Write-Host "  Type: $($type.FullName)"
}
