# nets-bridge/disasm.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_MainConsole.frmMainConsole")
$m = $t.GetMethod("InitConfiguration", [System.Reflection.BindingFlags]'Public,Instance')
$body = $m.GetMethodBody()
$bytes = $body.GetILAsByteArray()

# Read metadata tokens referenced in IL
Write-Host "IL Bytes: " + [System.BitConverter]::ToString($bytes)
$module = $asm.ManifestModule
for ($i = 0; $i -lt $bytes.Length - 4; $i++) {
    if ($bytes[$i] -eq 0x72) { # ldstr
        $token = [System.BitConverter]::ToInt32($bytes, $i + 1)
        try {
            $str = $module.ResolveString($token)
            Write-Host "Ldstr string: '$str'"
        } catch {}
    }
}
