# nets-bridge/inspect_xml_read.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.Classes.CLS_ComConfigurations")
foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static,DeclaredOnly')) {
    Write-Host "Method: $($m.Name)"
    $b = $m.GetMethodBody()
    if ($b) {
        $bytes = $b.GetILAsByteArray()
        for ($i = 0; $i -lt $bytes.Length - 4; $i++) {
            if ($bytes[$i] -eq 0x72) {
                $token = [System.BitConverter]::ToInt32($bytes, $i + 1)
                try {
                    $str = $asm.ManifestModule.ResolveString($token)
                    Write-Host "   String: '$str'"
                } catch {}
            }
        }
    }
}
