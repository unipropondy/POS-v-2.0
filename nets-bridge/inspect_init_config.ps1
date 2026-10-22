# nets-bridge/inspect_init_config.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_MainConsole.frmMainConsole")
$m = $t.GetMethod("InitConfiguration", [System.Reflection.BindingFlags]'NonPublic,Instance')
$body = $m.GetMethodBody()
Write-Host "Local variables in InitConfiguration:"
foreach ($v in $body.LocalVariables) {
    Write-Host "  $($v.LocalType.FullName)"
}

# Print IL instructions
$bytes = $body.GetILAsByteArray()
Write-Host "IL Byte length: $($bytes.Length)"

# Let's search string constants in the assembly
$fields = $asm.GetType("ECR3_API.Classes.CLS_ComConfigurations").GetProperties()
Write-Host "CLS_ComConfigurations properties:"
foreach ($p in $fields) {
    Write-Host "  $($p.PropertyType.Name) $($p.Name)"
}
