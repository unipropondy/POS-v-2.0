# nets-bridge/inspect_ecr3_api_all.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.ECR3_API_Main")
Write-Host "=== ECR3_API.ECR3_API_Main All Members ==="
foreach ($m in $t.GetMembers([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static')) {
    Write-Host "  $($m.MemberType): $($m.Name)"
}
