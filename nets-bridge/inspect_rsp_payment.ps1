# nets-bridge/inspect_rsp_payment.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.Classes.CLS_Interface_ECR3_ResponseData_Payment")
Write-Host "CLS_Interface_ECR3_ResponseData_Payment properties:"
foreach ($pr in $t.GetProperties()) {
    Write-Host "  $($pr.PropertyType.Name) $($pr.Name)"
}

$fieldsType = $asm.GetType("ECR3_API.Classes.MSG_Fields")
Write-Host "`nMSG_Fields properties:"
foreach ($pr in $fieldsType.GetProperties()) {
    Write-Host "  $($pr.PropertyType.Name) $($pr.Name)"
}
