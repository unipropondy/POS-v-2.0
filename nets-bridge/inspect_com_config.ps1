# nets-bridge/inspect_com_config.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.Classes.CLS_ComConfigurations")
Write-Host "Constructors of CLS_ComConfigurations:"
foreach ($c in $t.GetConstructors([System.Reflection.BindingFlags]'Public,NonPublic,Instance')) {
    Write-Host "  Constructor: $($c.Name)"
    $b = $c.GetMethodBody()
    $bytes = $b.GetILAsByteArray()
    for ($i = 0; $i -lt $bytes.Length - 4; $i++) {
        if ($bytes[$i] -eq 0x72) {
            $token = [System.BitConverter]::ToInt32($bytes, $i + 1)
            try {
                $str = $asm.ManifestModule.ResolveString($token)
                Write-Host "    Ldstr: '$str'"
            } catch {}
        }
    }
}
