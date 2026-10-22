# nets-bridge/inspect_ecr3.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
Write-Host "=== ECR3_API REFERENCES ==="
$asm.GetReferencedAssemblies() | ForEach-Object { Write-Host "  $($_.FullName)" }

Write-Host "`n=== ECR3_API CLASSES ==="
$types = $asm.GetExportedTypes()
foreach ($t in $types) {
    if ($t.IsClass) {
        Write-Host "`nClass: $($t.FullName)"
        $ctors = $t.GetConstructors()
        foreach ($c in $ctors) {
            $p = ($c.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
            Write-Host "  Constructor: $($t.Name)($p)"
        }
        $methods = $t.GetMethods([System.Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly')
        foreach ($m in $methods) {
            $p = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
            Write-Host "  Method: $($m.ReturnType.Name) $($m.Name)($p)"
        }
    }
}
