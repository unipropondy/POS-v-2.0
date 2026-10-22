# nets-bridge/list_classes.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
foreach ($t in $asm.GetExportedTypes()) {
    Write-Host "$($t.FullName) [IsClass=$($t.IsClass), IsInterface=$($t.IsInterface)]"
}
