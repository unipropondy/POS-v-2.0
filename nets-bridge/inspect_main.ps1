# nets-bridge/inspect_main.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.ECR3_API_Main")
Write-Host "=== ECR3_API.ECR3_API_Main Constructors ==="
foreach ($c in $t.GetConstructors()) {
    $p = ($c.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
    Write-Host "  $($t.Name)($p)"
}

Write-Host "`n=== ECR3_API.ECR3_API_Main Methods ==="
foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly')) {
    $p = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
    Write-Host "  $($m.ReturnType.Name) $($m.Name)($p)"
}

Write-Host "`n=== ECR3_API.ECR3_API_Main Properties ==="
foreach ($pr in $t.GetProperties([System.Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly')) {
    Write-Host "  $($pr.PropertyType.Name) $($pr.Name)"
}
