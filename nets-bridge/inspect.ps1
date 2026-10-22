# nets-bridge/inspect.ps1
param([string]$dllPath)

function Inspect-File($path) {
    Write-Host "==================================================="
    Write-Host "INSPECTING: $path"
    Write-Host "==================================================="
    try {
        $an = [System.Reflection.AssemblyName]::GetAssemblyName($path)
        Write-Host "FullName: $($an.FullName)"
        Write-Host "ProcessorArchitecture: $($an.ProcessorArchitecture)"
        Write-Host "Version: $($an.Version)"

        $asm = [System.Reflection.Assembly]::LoadFrom($path)
        Write-Host "ImageRuntimeVersion: $($asm.ImageRuntimeVersion)"

        Write-Host "`n--- REFERENCED ASSEMBLIES ---"
        foreach ($ref in $asm.GetReferencedAssemblies()) {
            Write-Host "  $($ref.FullName)"
        }

        Write-Host "`n--- EXPORTED TYPES ---"
        $types = $asm.GetExportedTypes()
        foreach ($t in $types) {
            Write-Host "`n[Type] $($t.FullName)"
            Write-Host "  IsClass: $($t.IsClass) | IsEnum: $($t.IsEnum) | IsInterface: $($t.IsInterface)"
            
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

            $props = $t.GetProperties([System.Reflection.BindingFlags]'Public,Instance,Static,DeclaredOnly')
            foreach ($pr in $props) {
                Write-Host "  Property: $($pr.PropertyType.Name) $($pr.Name)"
            }

            if ($t.IsEnum) {
                foreach ($val in [System.Enum]::GetNames($t)) {
                    Write-Host "  EnumValue: $val = $([int][System.Enum]::Parse($t, $val))"
                }
            }
        }
    } catch {
        Write-Host "Inspection error: $_"
    }
}

if ($dllPath) {
    Inspect-File $dllPath
} else {
    Inspect-File "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll"
    Inspect-File "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\NetsECR.dll"
}
