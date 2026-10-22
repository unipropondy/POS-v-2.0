// nets-bridge/NetsDllRunner.cs
// Official C# Native Runner for NETS ECR3_API.dll and NetsECR.dll
// Compiled as 32-bit (x86) .NET application using CSC.exe.

using System;
using System.IO;
using System.Net.Sockets;
using System.Xml;
using ECR3_API;
using ECR3_API.Classes;
using ECR3MESSAGE;
using Newtonsoft.Json.Linq;

public class NetsDllRunner {
    private static uint _sequenceNumber = 1;

    public static int Main(string[] args) {
        if (args.Length == 0) {
            Console.WriteLine("{\"success\":false,\"code\":\"NO_ARGS\",\"msg\":\"Usage: NetsDllRunner.exe <command> [args...]\"}");
            return 1;
        }

        string cmd = args[0].ToLower().Trim();

        try {
            switch (cmd) {
                case "probe":
                case "status":
                    return HandleProbe(args);

                case "sale":
                case "payment":
                    return HandleSale(args);

                case "settlement":
                    return HandleSettlement(args);

                case "logon":
                    return HandleLogon(args);

                case "reset-seq":
                    return HandleResetSeq(args);

                case "serial-sale":
                    return HandleSerialSale(args);

                default:
                    Console.WriteLine(string.Format("{{\"success\":false,\"code\":\"UNKNOWN_COMMAND\",\"msg\":\"Unknown command: {0}\"}}", EscapeJson(cmd)));
                    return 1;
            }
        } catch (Exception ex) {
            Console.WriteLine(string.Format("{{\"success\":false,\"code\":\"UNHANDLED_EXCEPTION\",\"msg\":\"{0}\"}}", EscapeJson(ex.Message)));
            return 99;
        }
    }

    /// <summary>
    /// Probe DLL initialization and configuration without executing live payment.
    /// </summary>
    private static int HandleProbe(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string configPath = Path.Combine(baseDir, "ECR3", "Config.xml");

        string terminalIp = "192.168.10.103";
        string terminalPort = "9742";

        if (File.Exists(configPath)) {
            try {
                XmlDocument doc = new XmlDocument();
                doc.Load(configPath);
                XmlNode ipNode = doc.SelectSingleNode("//IP_ipAddress");
                XmlNode portNode = doc.SelectSingleNode("//IP_Port");
                if (ipNode != null && !string.IsNullOrEmpty(ipNode.InnerText)) terminalIp = ipNode.InnerText.Trim();
                if (portNode != null && !string.IsNullOrEmpty(portNode.InnerText)) terminalPort = portNode.InnerText.Trim();
            } catch {}
        } else {
            EnsureConfigFile(terminalIp, terminalPort);
        }

        // Test instantiating ECR3_API_Main
        bool apiLoaded = false;
        string loadError = null;
        try {
            ECR3_API_Main testMain = new ECR3_API_Main(false);
            apiLoaded = (testMain != null);
        } catch (Exception ex) {
            loadError = ex.Message;
        }

        // Check TCP connectivity
        bool tcpReachable = false;
        int portNum = 9742;
        int.TryParse(terminalPort, out portNum);
        try {
            using (TcpClient client = new TcpClient()) {
                IAsyncResult ar = client.BeginConnect(terminalIp, portNum, null, null);
                bool success = ar.AsyncWaitHandle.WaitOne(3000);
                if (success) {
                    client.EndConnect(ar);
                    tcpReachable = true;
                }
            }
        } catch {}

        Console.WriteLine(string.Format(
            "{{\"success\":true,\"service\":\"NetsDllRunner x86\",\"dll\":\"ECR3_API.dll\",\"dllLoaded\":{0},\"terminalIp\":\"{1}\",\"terminalPort\":\"{2}\",\"tcpReachable\":{3},\"configXmlExists\":{4},\"error\":{5}}}",
            apiLoaded ? "true" : "false",
            EscapeJson(terminalIp),
            EscapeJson(terminalPort),
            tcpReachable ? "true" : "false",
            File.Exists(configPath) ? "true" : "false",
            loadError != null ? "\"" + EscapeJson(loadError) + "\"" : "null"
        ));
        return 0;
    }

    /// <summary>
    /// Execute Sale payment transaction via ECR3_API.dll.
    /// args: sale <amount> <billNo> [ip] [port] [receiptRequired]
    /// </summary>
    private static int HandleSale(string[] args) {
        if (args.Length < 2) {
            Console.WriteLine("{\"success\":false,\"code\":\"INVALID_ARGS\",\"msg\":\"Usage: sale <amount> [billNo] [ip] [port]\"}");
            return 1;
        }

        double amount = 0;
        if (!double.TryParse(args[1], out amount) || amount <= 0) {
            Console.WriteLine("{\"success\":false,\"code\":\"INVALID_AMOUNT\",\"msg\":\"Amount must be a positive number\"}");
            return 1;
        }

        string billNo = args.Length > 2 ? args[2] : ("POS" + DateTime.Now.ToString("HHmmss"));
        string ip = args.Length > 3 && !string.IsNullOrEmpty(args[3]) ? args[3] : "192.168.10.103";
        string port = args.Length > 4 && !string.IsNullOrEmpty(args[4]) ? args[4] : "9742";
        byte receiptReq = 0;
        if (args.Length > 5 && args[5] == "1") receiptReq = 1;

        // Ensure ECR3\Config.xml matches requested IP and port
        EnsureConfigFile(ip, port);

        // Convert amount to cents string
        long cents = (long)Math.Round(amount * 100);
        string amountCentsStr = cents.ToString();

        // Build ECR3 payment request
        CLS_Interface_ECR3_Data_Payment paymentData = new CLS_Interface_ECR3_Data_Payment();
        paymentData.man_1_MessageType = message_type.MSG_TYPE_PAYMENT;
        paymentData.man_2_MessageCode = 1; // 1 = Sale
        paymentData.man_3_Amount = amountCentsStr;
        paymentData.man_4_TransactionType = "AUTO";
        paymentData.opt_5_MerchantReferenceNumber = billNo;
        paymentData.man_6_MessageSequence = _sequenceNumber++;
        paymentData.opt_7_ReceiptRequired = receiptReq;

        string requestJson = paymentData.ToJSON();

        // Execute via ECR3_API.dll
        ECR3_API_Main api = new ECR3_API_Main(false);
        string responseJson = "";

        bool isSuccess = api.Process_Payment(requestJson, ref responseJson);

        // Parse result JSON
        string code = isSuccess ? "00" : "DECLINED";
        string msg = isSuccess ? "Approved" : "Transaction not approved";
        string approvalCode = "";
        string rrn = "";
        string cardLastFour = "";

        if (!string.IsNullOrEmpty(responseJson)) {
            try {
                JObject j = JObject.Parse(responseJson);
                if (j["Message_6_Code"] != null) code = j["Message_6_Code"].ToString();
                if (j["Message_7_Status"] != null) msg = j["Message_7_Status"].ToString();

                // Look for response fields
                JArray fields = j["Response_9_Fields"] as JArray;
                if (fields != null) {
                    foreach (JObject item in fields) {
                        string id = item["Field_1_Id"] != null ? item["Field_1_Id"].ToString() : "";
                        string val = item["Field_2_Data"] != null ? item["Field_2_Data"].ToString() : "";
                        if (id == "01" || id == "APPROVAL_CODE") approvalCode = val;
                        if (id == "02" || id == "RRN") rrn = val;
                        if (id == "03" || id == "CARD_NO") {
                            if (val.Length >= 4) cardLastFour = val.Substring(val.Length - 4);
                        }
                    }
                }
            } catch {}
        }

        Console.WriteLine(string.Format(
            "{{\"success\":{0},\"code\":\"{1}\",\"msg\":\"{2}\",\"approvalCode\":\"{3}\",\"transRef\":\"{4}\",\"cardLastFour\":\"{5}\",\"rawResponse\":{6}}}",
            isSuccess ? "true" : "false",
            EscapeJson(code),
            EscapeJson(msg),
            EscapeJson(approvalCode),
            EscapeJson(rrn),
            EscapeJson(cardLastFour),
            !string.IsNullOrEmpty(responseJson) ? responseJson : "\"\""
        ));

        return isSuccess ? 0 : 2;
    }

    /// <summary>
    /// Execute Settlement via ECR3_API.dll
    /// </summary>
    private static int HandleSettlement(string[] args) {
        EnsureConfigFile("192.168.10.103", "9742");
        CLS_Interface_ECR3_Data_Settlement data = new CLS_Interface_ECR3_Data_Settlement();
        data.man_1_MessageType = message_type.MSG_TYPE_DEVICE;
        data.man_2_MessageCode = 5; // Settlement
        data.man_3_MessageSequence = _sequenceNumber++;

        ECR3_API_Main api = new ECR3_API_Main(false);
        bool res = api.Process_Settlement(data.ToJSON());
        Console.WriteLine(string.Format("{{\"success\":{0},\"code\":\"{1}\",\"msg\":\"{2}\"}}",
            res ? "true" : "false",
            res ? "00" : "FAIL",
            res ? "Settlement Success" : "Settlement Failed"
        ));
        return res ? 0 : 2;
    }

    /// <summary>
    /// Execute Terminal Logon via ECR3_API.dll
    /// </summary>
    private static int HandleLogon(string[] args) {
        EnsureConfigFile("192.168.10.103", "9742");
        CLS_Interface_ECR3_Data_Logon data = new CLS_Interface_ECR3_Data_Logon();
        data.man_1_MessageType = message_type.MSG_TYPE_DEVICE;
        data.man_2_MessageCode = 1; // Logon
        data.man_4_MessageSequence = _sequenceNumber++;

        ECR3_API_Main api = new ECR3_API_Main(false);
        bool res = api.Process_Logon(data.ToJSON());
        Console.WriteLine(string.Format("{{\"success\":{0},\"code\":\"{1}\",\"msg\":\"{2}\"}}",
            res ? "true" : "false",
            res ? "00" : "FAIL",
            res ? "Logon Success" : "Logon Failed"
        ));
        return res ? 0 : 2;
    }

    /// <summary>
    /// Reset message sequence number on terminal via ECR3_API.dll
    /// </summary>
    private static int HandleResetSeq(string[] args) {
        EnsureConfigFile("192.168.10.103", "9742");
        CLS_Interface_ECR3_Data_ResetSequenceNumber data = new CLS_Interface_ECR3_Data_ResetSequenceNumber();
        data.man_1_MessageType = message_type.MSG_TYPE_DEVICE;
        data.man_2_MessageCode = 2; // Reset Seq
        data.man_3_MessageSequence = 1;
        _sequenceNumber = 1;

        ECR3_API_Main api = new ECR3_API_Main(false);
        bool res = api.Process_Reset_Sequence_Number(data.ToJSON());
        Console.WriteLine(string.Format("{{\"success\":{0},\"code\":\"{1}\",\"msg\":\"{2}\"}}",
            res ? "true" : "false",
            res ? "00" : "FAIL",
            res ? "Reset Sequence Success" : "Reset Sequence Failed"
        ));
        return res ? 0 : 2;
    }

    /// <summary>
    /// Serial / COM port fallback using NetsECR.dll
    /// </summary>
    private static int HandleSerialSale(string[] args) {
        if (args.Length < 2) {
            Console.WriteLine("{\"success\":false,\"code\":\"INVALID_ARGS\",\"msg\":\"Usage: serial-sale <amount> [billNo]\"}");
            return 1;
        }

        double amount = 0;
        double.TryParse(args[1], out amount);
        string billNo = args.Length > 2 ? args[2] : "POS" + DateTime.Now.ToString("HHmmss");

        try {
            Unipro.NetsECR.NetsMain nets = new Unipro.NetsECR.NetsMain();
            string outputMsg = "";
            string approvalCode = "";
            bool ok = nets.Process_NETS(billNo, amount, ref outputMsg, ref approvalCode);
            nets.Dispose();

            Console.WriteLine(string.Format(
                "{{\"success\":{0},\"code\":\"{1}\",\"msg\":\"{2}\",\"approvalCode\":\"{3}\"}}",
                ok ? "true" : "false",
                ok ? "00" : "DECLINED",
                EscapeJson(outputMsg),
                EscapeJson(approvalCode)
            ));
            return ok ? 0 : 2;
        } catch (Exception ex) {
            Console.WriteLine(string.Format("{{\"success\":false,\"code\":\"SERIAL_ERR\",\"msg\":\"{0}\"}}", EscapeJson(ex.Message)));
            return 3;
        }
    }

    /// <summary>
    /// Ensure ECR3\Config.xml exists with the specified IP and Port.
    /// </summary>
    private static void EnsureConfigFile(string ip, string port) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string ecrDir = Path.Combine(baseDir, "ECR3");
        if (!Directory.Exists(ecrDir)) Directory.CreateDirectory(ecrDir);

        string configPath = Path.Combine(ecrDir, "Config.xml");
        string xml = string.Format(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n" +
            "<Config>\r\n" +
            "  <IP_PortSettings IP_ipAddress=\"{0}\" IP_Port=\"{1}\" />\r\n" +
            "  <IP_CommunicationControl IP_ACKTimeOut=\"3000\" IP_SendReTries=\"3\" IP_DelaySendReTries=\"1000\" IP_receivingTimeout=\"120000\" />\r\n" +
            "</Config>",
            ip, port
        );

        File.WriteAllText(configPath, xml);
    }

    private static string EscapeJson(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n");
    }
}
