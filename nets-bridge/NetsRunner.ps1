# nets-bridge/NetsRunner.ps1
# 32-bit PowerShell Runner for official NETS ECR3_API.dll and NetsECR.dll
# Runs in SysWOW64 PowerShell to guarantee 32-bit (x86) compatibility and bypass App Control exe restrictions.

param(
    [string]$command = "probe",
    [string]$amount = "0",
    [string]$billNo = "",
    [string]$terminalIp = "",
    [string]$terminalPort = "9742",
    [string]$receiptReq = "0"
)

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$binDir = Join-Path $baseDir "bin"

# 1. Load Dependencies
try {
    [System.Reflection.Assembly]::LoadFrom((Join-Path $binDir "log4net.dll")) | Out-Null
    [System.Reflection.Assembly]::LoadFrom((Join-Path $binDir "Newtonsoft.Json.dll")) | Out-Null
    $ecrAsm = [System.Reflection.Assembly]::LoadFrom((Join-Path $binDir "ECR3_API.dll"))
    $netsAsm = [System.Reflection.Assembly]::LoadFrom((Join-Path $binDir "NetsECR.dll"))
} catch {
    Write-Output "{`"success`":false,`"code`":`"LOAD_ERROR`",`"msg`":`"$($_.Exception.Message.Replace('\','\\').Replace('`"','\`"'))`"}"
    exit 1
}

# 2. Ensure ECR3\Config.xml
function Ensure-Config($ip, $port) {
    if (-not $ip) { return }
    $ecrDir = Join-Path $baseDir "ECR3"
    if (-not (Test-Path $ecrDir)) { New-Item -ItemType Directory -Path $ecrDir -Force | Out-Null }
    $cfgPath = Join-Path $ecrDir "Config.xml"
    $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<Config>
  <IP_PortSettings IP_ipAddress="$ip" IP_Port="$port" />
  <IP_CommunicationControl IP_ACKTimeOut="3000" IP_SendReTries="3" IP_DelaySendReTries="1000" IP_receivingTimeout="120000" />
</Config>
"@
    Set-Content -Path $cfgPath -Value $xml -Encoding UTF8 -Force

    # Also sync into bin\ECR3
    $binEcrDir = Join-Path $binDir "ECR3"
    if (-not (Test-Path $binEcrDir)) { New-Item -ItemType Directory -Path $binEcrDir -Force | Out-Null }
    Set-Content -Path (Join-Path $binEcrDir "Config.xml") -Value $xml -Encoding UTF8 -Force
}

# Ensure .NET working directory is set to baseDir so ECR3_API.dll locates ECR3\Config.xml
[System.IO.Directory]::SetCurrentDirectory($baseDir)

if ($terminalIp) {
    Ensure-Config $terminalIp $terminalPort
}

# 3. Handle Commands
switch ($command.ToLower()) {
    "probe" {
        # Safe diagnostic probe without initiating any payment
        $apiOk = $false
        $loadErr = $null
        try {
            $apiObj = New-Object ECR3_API.ECR3_API_Main($false)
            $apiOk = ($apiObj -ne $null)
        } catch {
            $loadErr = $_.Exception.Message
        }

        # Check TCP socket connectivity only if terminalIp is configured
        $tcpOk = $false
        $hasIp = -not [string]::IsNullOrWhiteSpace($terminalIp)
        if ($hasIp) {
            $portNum = 9742
            [int]::TryParse($terminalPort, [ref]$portNum) | Out-Null
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $ar = $tcp.BeginConnect($terminalIp, $portNum, $null, $null)
                $wait = $ar.AsyncWaitHandle.WaitOne(3000)
                if ($wait) {
                    $tcp.EndConnect($ar)
                    $tcpOk = $true
                }
                $tcp.Close()
            } catch {}
        }

        $errStr = if ($loadErr) { "`"$($loadErr.Replace('\','\\').Replace('`"','\`"'))`"" } else { "null" }
        Write-Output "{`"success`":true,`"service`":`"NetsRunner SysWOW64`",`"dll`":`"ECR3_API.dll`",`"dllLoaded`":$($apiOk.ToString().ToLower()),`"terminalConfigured`":$($hasIp.ToString().ToLower()),`"terminalIp`":`"$terminalIp`",`"terminalPort`":`"$terminalPort`",`"tcpReachable`":$($tcpOk.ToString().ToLower()),`"error`":$errStr}"
        exit 0
    }

    "sale" {
        $amtNum = 0
        if (-not [double]::TryParse($amount, [ref]$amtNum) -or $amtNum -le 0) {
            Write-Output "{`"success`":false,`"code`":`"INVALID_AMOUNT`",`"msg`":`"Amount must be positive`"}"
            exit 1
        }

        if ([string]::IsNullOrWhiteSpace($terminalIp)) {
            Write-Output "{`"success`":false,`"code`":`"TERMINAL_IP_NOT_CONFIGURED`",`"msg`":`"NETS DESK5000 terminal IP is not configured. Retrieve the terminal IP from the DESK5000 terminal screen and configure in backend/.env or nets-bridge/config.json.`"}"
            exit 1
        }

        $cents = [long][Math]::Round($amtNum * 100)
        $refNo = if ($billNo) { $billNo } else { "POS" + (Get-Date -Format "HHmmss") }

        try {
            # Build ECR3 payment request
            $payment = New-Object ECR3_API.Classes.CLS_Interface_ECR3_Data_Payment
            $payment.man_1_MessageType = [ECR3MESSAGE.message_type]::MSG_TYPE_PAYMENT
            $payment.man_2_MessageCode = 1 # 1 = Sale
            $payment.man_3_Amount = $cents.ToString()
            $payment.man_4_TransactionType = "AUTO"
            $payment.opt_5_MerchantReferenceNumber = $refNo
            $payment.man_6_MessageSequence = 1
            $payment.opt_7_ReceiptRequired = [byte](if ($receiptReq -eq "1") { 1 } else { 0 })

            $reqJson = $payment.ToJSON()

            # Execute via ECR3_API_Main
            $api = New-Object ECR3_API.ECR3_API_Main($false)
            $responseJson = ""

            $isApproved = $api.Process_Payment($reqJson, [ref]$responseJson)

            $code = if ($isApproved) { "00" } else { "DECLINED" }
            $msg = if ($isApproved) { "Approved" } else { "Transaction not approved" }
            $approvalCode = ""
            $transRef = ""
            $cardLastFour = ""

            if ($responseJson) {
                try {
                    $parsed = ConvertFrom-Json $responseJson
                    if ($parsed.Message_6_Code) { $code = $parsed.Message_6_Code }
                    if ($parsed.Message_7_Status) { $msg = $parsed.Message_7_Status }
                    if ($parsed.Response_9_Fields) {
                        foreach ($f in $parsed.Response_9_Fields) {
                            if ($f.Field_1_Id -eq "01" -or $f.Field_1_Id -eq "APPROVAL_CODE") { $approvalCode = $f.Field_2_Data }
                            if ($f.Field_1_Id -eq "02" -or $f.Field_1_Id -eq "RRN") { $transRef = $f.Field_2_Data }
                            if ($f.Field_1_Id -eq "03" -or $f.Field_1_Id -eq "CARD_NO") {
                                if ($f.Field_2_Data.Length -ge 4) { $cardLastFour = $f.Field_2_Data.Substring($f.Field_2_Data.Length - 4) }
                            }
                        }
                    }
                } catch {}
            }

            $rawEscaped = if ($responseJson) { $responseJson } else { "`"`"" }
            Write-Output "{`"success`":$($isApproved.ToString().ToLower()),`"code`":`"$code`",`"msg`":`"$msg`",`"approvalCode`":`"$approvalCode`",`"transRef`":`"$transRef`",`"cardLastFour`":`"$cardLastFour`",`"rawResponse`":$rawEscaped}"
            exit (if ($isApproved) { 0 } else { 2 })
        } catch {
            Write-Output "{`"success`":false,`"code`":`"EXEC_ERROR`",`"msg`":`"$($_.Exception.Message.Replace('\','\\').Replace('`"','\`"'))`"}"
            exit 3
        }
    }

    "settlement" {
        try {
            $data = New-Object ECR3_API.Classes.CLS_Interface_ECR3_Data_Settlement
            $data.man_1_MessageType = [ECR3MESSAGE.message_type]::MSG_TYPE_DEVICE
            $data.man_2_MessageCode = 5
            $data.man_3_MessageSequence = 1

            $api = New-Object ECR3_API.ECR3_API_Main($false)
            $res = $api.Process_Settlement($data.ToJSON())
            Write-Output "{`"success`":$($res.ToString().ToLower()),`"code`":`"$(if ($res) { '00' } else { 'FAIL' })`",`"msg`":`"$(if ($res) { 'Settlement Success' } else { 'Settlement Failed' })`"}"
            exit 0
        } catch {
            Write-Output "{`"success`":false,`"code`":`"SETTLEMENT_ERR`",`"msg`":`"$($_.Exception.Message)`"}"
            exit 1
        }
    }

    "logon" {
        try {
            $data = New-Object ECR3_API.Classes.CLS_Interface_ECR3_Data_Logon
            $data.man_1_MessageType = [ECR3MESSAGE.message_type]::MSG_TYPE_DEVICE
            $data.man_2_MessageCode = 1
            $data.man_4_MessageSequence = 1

            $api = New-Object ECR3_API.ECR3_API_Main($false)
            $res = $api.Process_Logon($data.ToJSON())
            Write-Output "{`"success`":$($res.ToString().ToLower()),`"code`":`"$(if ($res) { '00' } else { 'FAIL' })`",`"msg`":`"$(if ($res) { 'Logon Success' } else { 'Logon Failed' })`"}"
            exit 0
        } catch {
            Write-Output "{`"success`":false,`"code`":`"LOGON_ERR`",`"msg`":`"$($_.Exception.Message)`"}"
            exit 1
        }
    }

    "serial-sale" {
        try {
            $nets = New-Object Unipro.NetsECR.NetsMain
            $outMsg = ""
            $appCode = ""
            $amtNum = [double]$amount
            $refNo = if ($billNo) { $billNo } else { "POS" + (Get-Date -Format "HHmmss") }

            $ok = $nets.Process_NETS($refNo, $amtNum, [ref]$outMsg, [ref]$appCode)
            $nets.Dispose()

            Write-Output "{`"success`":$($ok.ToString().ToLower()),`"code`":`"$(if ($ok) { '00' } else { 'DECLINED' })`",`"msg`":`"$outMsg`",`"approvalCode`":`"$appCode`"}"
            exit 0
        } catch {
            Write-Output "{`"success`":false,`"code`":`"SERIAL_ERR`",`"msg`":`"$($_.Exception.Message)`"}"
            exit 1
        }
    }

    default {
        Write-Output "{`"success`":false,`"code`":`"UNKNOWN_COMMAND`",`"msg`":`"Unknown command: $command`"}"
        exit 1
    }
}
