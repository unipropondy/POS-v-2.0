# nets-bridge/inspect_frm.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_MainConsole.frmMainConsole")
Write-Host "=== ECR3_MainConsole.frmMainConsole Constructors ==="
foreach ($c in $t.GetConstructors([System.Reflection.BindingFlags]'Public,NonPublic,Instance')) {
    $p = ($c.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
    Write-Host "  $($t.Name)($p)"
}

Write-Host "`n=== ECR3_MainConsole.frmMainConsole Methods ==="
foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static,DeclaredOnly')) {
    $p = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
    Write-Host "  $($m.ReturnType.Name) $($m.Name)($p)"
}

Write-Host "`n=== ECR3_MainConsole.frmMainConsole Fields ==="
foreach ($f in $t.GetFields([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static')) {
    Write-Host "  $($f.FieldType.Name) $($f.Name)"
}
