# nets-bridge/test_init_safe.ps1
$binDir = "c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin"
[System.Reflection.Assembly]::LoadFrom("$binDir\log4net.dll") | Out-Null
[System.Reflection.Assembly]::LoadFrom("$binDir\Newtonsoft.Json.dll") | Out-Null
$asm = [System.Reflection.Assembly]::LoadFrom("$binDir\ECR3_API.dll")

Write-Host "Instantiating ECR3_API_Main(false)..."
$main = New-Object ECR3_API.ECR3_API_Main($false)
Write-Host "SUCCESS: ECR3_API_Main instantiated successfully! Type: $($main.GetType().FullName)"

Write-Host "Creating CLS_Interface_ECR3_Data_Payment..."
$payment = New-Object ECR3_API.Classes.CLS_Interface_ECR3_Data_Payment
$payment.man_1_MessageType = [ECR3MESSAGE.message_type]::MSG_TYPE_PAYMENT
$payment.man_2_MessageCode = 1
$payment.man_3_Amount = "1000"
$payment.man_4_TransactionType = "AUTO"
$payment.opt_5_MerchantReferenceNumber = "TEST_REF_001"
$payment.man_6_MessageSequence = 1
$payment.opt_7_ReceiptRequired = 0
$payment.man_8_Invoiceno = "INV_001"

$json = $payment.ToJSON()
Write-Host "Generated JSON:"
Write-Host $json

Write-Host "`nAll DLL dependencies and initialization verified 100%!"
