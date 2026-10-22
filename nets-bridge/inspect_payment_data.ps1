# nets-bridge/inspect_payment_data.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_API.Classes.CLS_Interface_ECR3_Data_Payment")
$obj = [System.Activator]::CreateInstance($t)
Write-Host "Default ToJSON():"
Write-Host $obj.ToJSON()

# Check message_type enum
$mt = $asm.GetType("ECR3MESSAGE.message_type")
Write-Host "`nmessage_type values:"
[System.Enum]::GetNames($mt) | ForEach-Object { Write-Host "  $_ = $([int][System.Enum]::Parse($mt, $_))" }
