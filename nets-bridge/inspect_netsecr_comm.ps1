# nets-bridge/inspect_netsecr_comm.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\NetsECR.dll")
foreach ($name in @("Unipro.NetsECR.CommConfiguration", "Unipro.NetsECR.EcrSetting", "Unipro.NetsECR.DeviceType")) {
    $t = $asm.GetType($name)
    Write-Host "`n=== Type: $name ==="
    foreach ($m in $t.GetMembers([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static')) {
        if ($m.MemberType -in @('Method', 'Property', 'Field')) {
            Write-Host "  $($m.MemberType): $($m.Name)"
        }
    }
}
