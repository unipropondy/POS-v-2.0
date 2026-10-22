# nets-bridge/inspect_ctor_details.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.Classes.CLS_ComConfigurations")
$ctor = $t.GetConstructors()[0]
$b = $ctor.GetMethodBody()
$bytes = $b.GetILAsByteArray()

Write-Host "Local variables:"
foreach ($v in $b.LocalVariables) {
    Write-Host "  $($v.LocalType.FullName)"
}

Write-Host "`nAll Strings in ctor in order:"
for ($i = 0; $i -lt $bytes.Length - 4; $i++) {
    if ($bytes[$i] -eq 0x72) {
        $token = [System.BitConverter]::ToInt32($bytes, $i + 1)
        try {
            $str = $asm.ManifestModule.ResolveString($token)
            Write-Host "Offset $i : '$str'"
        } catch {}
    }
}
