# NETS DESK5000 ECR3 Windows Bridge Service

## 1. Overview & Architecture

The POS application utilizes the following approved multi-tier architecture to integrate NETS payment via the **official NETS ECR3 DLL**:

```
┌─────────────────────────────────────────────────────────────┐
│                 React Native Android POS App                 │
│              (payment.tsx / SplitPaymentComponent)          │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Node.js + Express POS Backend                  │
│       (/api/nets/sale, /api/nets/last-txn, /api/nets/ping)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Loopback HTTP (127.0.0.1:5050)
                               │ Header: X-Bridge-Key (Secret)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Windows NETS Bridge Service (Host)              │
│       (nets-bridge/bridge-server.js & NetsDllRunner.exe)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Native P/Invoke / .NET CLR
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Official NETS ECR3 DLL (bin/)                 │
│               (NETSECR.dll / EcrEngine.dll)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ ECR3 LAN Protocol (TCP/IP)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Ingenico DESK5000 NETS Terminal                │
│                 (IP: 192.168.10.103:9742)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
nets-bridge/
├── bin/                   <-- PLACE YOUR APPROVED OFFICIAL NETS DLL HERE
├── config.json            <-- Bridge port, terminal IP, security key
├── bridge-server.js       <-- Dedicated local Windows Bridge Service
├── NetsDllRunner.cs       <-- C# native runner (P/Invoke / Managed assembly caller)
├── NetsDllRunner.exe      <-- Compiled C# binary (via Microsoft C# Compiler)
├── DllInspector.cs        <-- Diagnostic inspection tool
├── DllInspector.exe       <-- Compiled inspection executable
├── start-bridge.bat       <-- Convenience batch script to launch the bridge
├── probe-dll.bat          <-- Batch script to inspect DLL architecture & exports
└── compile-runner.bat     <-- Batch script to recompile C# runner if modified
```

---

## 3. How to Install and Activate the Official DLL

1. Copy your approved NETS DLL (e.g. `NETSECR.dll`, `EcrEngine.dll`, or `NetsIntegration.dll`) into:
   ```
   C:\Users\UNIPRO\Desktop\POS\nets-bridge\bin\
   ```
2. Run `probe-dll.bat` (or `./nets-bridge/DllInspector.exe`).
   The tool will automatically:
   - Identify whether the DLL is 32-bit (x86) or 64-bit (x64)
   - Identify whether it is a Native C/C++ PE or Managed .NET Assembly
   - List all exported classes, methods, and functions
3. Start the Bridge Service:
   - Double-click `start-bridge.bat` (or run `node bridge-server.js` inside `nets-bridge`).
4. Verify bridge status from browser or command prompt:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:5050/api/status" -Headers @{"X-Bridge-Key"="unipro_nets_bridge_secure_key_2026"}
   ```

---

## 4. Environment Variables (`backend/.env`)

```env
# Terminal Network Settings
NETS_TERMINAL_IP="192.168.10.103"
NETS_TERMINAL_PORT="9742"
NETS_TERMINAL_ID=""

# Windows Bridge Service Settings
NETS_BRIDGE_URL="http://127.0.0.1:5050"
NETS_BRIDGE_KEY="unipro_nets_bridge_secure_key_2026"
NETS_PREFER_BRIDGE="true"
NETS_REQUIRE_DLL="false"
```

---

## 5. Security & Protection Features

- **Loopback-Only Binding**: Bridge listens exclusively on `127.0.0.1`, blocking all remote/public network access.
- **Shared Secret Header**: Requires `X-Bridge-Key` matching `NETS_BRIDGE_KEY` for every request.
- **In-Flight Lock Guard**: Prevents concurrent duplicate charges on the terminal for the same table or order session.
- **SQL Server Audit**: Every transaction (Approved, Declined, Cancelled, Timeout) is automatically logged to `dbo.NetsTransactions` with response codes and full JSON payloads.
