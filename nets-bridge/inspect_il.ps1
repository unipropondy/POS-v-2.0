# nets-bridge/inspect_il.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.ECR3_API_Main")
$m = $t.GetMethod("Process_Payment")
$body = $m.GetMethodBody()
Write-Host "MaxStackSize: $($body.MaxStackSize)"
Write-Host "LocalVariables count: $($body.LocalVariables.Count)"
foreach ($v in $body.LocalVariables) {
    Write-Host "  Local: $($v.LocalType.FullName)"
}
