# nets-bridge/find_init.ps1
$asm = [System.Reflection.Assembly]::LoadFrom("c:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\ECR3_API.dll")
$t = $asm.GetType("ECR3_MainConsole.frmMainConsole")
$ms = $t.GetMethods([System.Reflection.BindingFlags]'Public,NonPublic,Instance,Static') | Where-Object { $_.Name -like "*config*" -or $_.Name -like "*init*" -or $_.Name -like "*load*" }
foreach ($m in $ms) {
    Write-Host "$($m.Name) (IsPrivate=$($m.IsPrivate), IsPublic=$($m.IsPublic))"
}
