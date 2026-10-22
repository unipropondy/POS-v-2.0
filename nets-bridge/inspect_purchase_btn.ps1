# nets-bridge/inspect_purchase_btn.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_MainConsole.frmMainConsole")
$m = $t.GetMethod("btnPurchase_Click", [System.Reflection.BindingFlags]'NonPublic,Instance')
$b = $m.GetMethodBody()
$bytes = $b.GetILAsByteArray()

Write-Host "btnPurchase_Click string literals:"
for ($i = 0; $i -lt $bytes.Length - 4; $i++) {
    if ($bytes[$i] -eq 0x72) {
        $token = [System.BitConverter]::ToInt32($bytes, $i + 1)
        try {
            $str = $asm.ManifestModule.ResolveString($token)
            Write-Host "   '$str'"
        } catch {}
    }
}
