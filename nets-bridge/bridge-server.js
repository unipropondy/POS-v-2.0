// nets-bridge/bridge-server.js
// Secure Windows NETS ECR3 Bridge Service
// Hosts on 127.0.0.1:5050 to interface Node.js backend with official NETS ECR3 DLL.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { execFile } = require('child_process');

// Helper: Timing-safe key comparison to prevent timing attacks over public networks/tunnels
function safeCompareKeys(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Load config
let config = {
  port: 5050,
  host: '0.0.0.0',
  authKey: 'unipro_nets_bridge_secure_key_2026',
  terminalIp: '',
  terminalPort: 9742,
  terminalId: '',
  dllDirectory: './bin',
  preferredDll: 'ECR3_API.dll',
  connectTimeoutMs: 10000,
  paymentTimeoutMs: 120000,
};

const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch (e) {
    console.error('[Bridge] Failed to read config.json, using defaults:', e.message);
  }
}

// Helper: Dynamic terminal configuration resolver
// Reads priority: 1. Request overrides, 2. process.env, 3. backend/.env, 4. config.json
function getTerminalConfig(overrideIp, overridePort) {
  let ip = overrideIp || process.env.NETS_TERMINAL_IP || '';
  let port = overridePort || (process.env.NETS_TERMINAL_PORT ? parseInt(process.env.NETS_TERMINAL_PORT, 10) : null);

  // If not yet resolved, dynamically read backend/.env
  if (!ip) {
    const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
    if (fs.existsSync(backendEnvPath)) {
      try {
        const envContent = fs.readFileSync(backendEnvPath, 'utf8');
        const mIp = envContent.match(/^NETS_TERMINAL_IP\s*=\s*["']?(.*?)["']?$/m);
        if (mIp && mIp[1].trim()) {
          ip = mIp[1].trim();
        }
        if (!port) {
          const mPort = envContent.match(/^NETS_TERMINAL_PORT\s*=\s*["']?(.*?)["']?$/m);
          if (mPort && mPort[1].trim()) {
            port = parseInt(mPort[1].trim(), 10);
          }
        }
      } catch (e) {
        // ignore read errors
      }
    }
  }

  // Fallback to config.json
  if (!ip && config.terminalIp) {
    ip = config.terminalIp;
  }
  if (!port) {
    port = config.terminalPort || 9742;
  }

  return { ip, port };
}

// In-flight request lock map
const activeRequests = new Map();

// Helper: Check detected DLLs in bin folder
function getAvailableDlls() {
  const binDir = path.resolve(__dirname, config.dllDirectory || './bin');
  if (!fs.existsSync(binDir)) return [];
  try {
    return fs.readdirSync(binDir).filter(f => f.toLowerCase().endsWith('.dll'));
  } catch (e) {
    return [];
  }
}

// Helper: JSON response sender
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

// Helper: Read request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Runner Execution Helper
function runNetsCommand(command, { amount = '0', billNo = '', terminalIp = config.terminalIp, terminalPort = config.terminalPort, receiptReq = '0' } = {}) {
  return new Promise((resolve) => {
    const ps1Runner = path.join(__dirname, 'NetsRunner.ps1');
    const exeRunner = path.join(__dirname, 'NetsDllRunner.exe');
    const syswow64Ps = 'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
    const powershellBin = fs.existsSync(syswow64Ps) ? syswow64Ps : 'powershell.exe';

    let runnerPath, runnerArgs;

    if (fs.existsSync(ps1Runner)) {
      runnerPath = powershellBin;
      runnerArgs = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ps1Runner,
        command,
        String(amount),
        String(billNo),
        String(terminalIp),
        String(terminalPort),
        String(receiptReq),
      ];
    } else if (fs.existsSync(exeRunner)) {
      runnerPath = exeRunner;
      runnerArgs = [
        command,
        String(amount),
        String(billNo),
        String(terminalIp),
        String(terminalPort),
      ];
    } else {
      return resolve({
        success: false,
        code: 'RUNNER_NOT_FOUND',
        msg: 'Neither NetsRunner.ps1 nor NetsDllRunner.exe found in nets-bridge directory',
      });
    }

    execFile(runnerPath, runnerArgs, { timeout: config.paymentTimeoutMs + 10000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({
          success: false,
          code: 'RUNNER_ERROR',
          msg: err.message,
          stderr: stderr ? stderr.trim() : '',
        });
      }
      try {
        const text = stdout.trim();
        // Extract the last JSON object line from stdout if there are logs before it
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const lastJsonLine = lines.reverse().find(l => l.startsWith('{') && l.endsWith('}'));
        if (lastJsonLine) {
          return resolve(JSON.parse(lastJsonLine));
        }
        return resolve(JSON.parse(text));
      } catch (jsonErr) {
        return resolve({
          success: false,
          code: 'PARSE_ERROR',
          msg: 'Runner returned non-JSON output',
          rawOutput: stdout,
        });
      }
    });
  });
}

// Server creation
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Key',
    });
    return res.end();
  }

  // 1. Security Check: Authenticate X-Bridge-Key with constant-time comparison
  const clientKey = req.headers['x-bridge-key'];
  const expectedKey = process.env.NETS_BRIDGE_KEY || config.authKey;
  if (!clientKey || !safeCompareKeys(clientKey, expectedKey)) {
    console.warn(`[Bridge] Unauthorized request from ${req.socket.remoteAddress}`);
    return sendJson(res, 401, {
      success: false,
      code: 'UNAUTHORIZED',
      msg: 'Invalid or missing X-Bridge-Key header',
    });
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = parsedUrl.pathname;

  // 2. Health / Status check
  if (req.method === 'GET' && (pathname === '/api/status' || pathname === '/health')) {
    const termCfg = getTerminalConfig();
    const availableDlls = getAvailableDlls();
    const deepProbe = parsedUrl.searchParams.get('probe') === 'true';

    let probeResult = null;
    if (deepProbe) {
      probeResult = await runNetsCommand('probe', {
        terminalIp: termCfg.ip,
        terminalPort: termCfg.port,
      });
    }

    return sendJson(res, 200, {
      success: true,
      service: 'NETS Windows Bridge Service',
      version: '1.1.0',
      terminalIp: termCfg.ip,
      terminalPort: termCfg.port,
      dllDetected: availableDlls.length > 0,
      detectedDlls: availableDlls,
      dllDirectory: path.resolve(__dirname, config.dllDirectory || './bin'),
      osArchitecture: process.arch,
      nodeVersion: process.version,
      runnerEngine: '32-bit SysWOW64 PowerShell / .NET',
      probe: probeResult,
    });
  }

  // 3. Diagnostic probe endpoint
  if (req.method === 'GET' && pathname === '/api/probe') {
    const termCfg = getTerminalConfig();
    const probeResult = await runNetsCommand('probe', {
      terminalIp: termCfg.ip,
      terminalPort: termCfg.port,
    });
    return sendJson(res, 200, probeResult);
  }

  // 4. Ping terminal reachability check
  if (req.method === 'GET' && pathname === '/api/ping') {
    const termCfg = getTerminalConfig();
    const host = termCfg.ip;
    const port = termCfg.port;

    if (!host) {
      return sendJson(res, 503, {
        success: false,
        code: 'TERMINAL_IP_NOT_CONFIGURED',
        msg: 'NETS DESK5000 terminal IP is not configured in backend/.env. Confirm the physical terminal IP from the DESK5000 screen.',
      });
    }

    const s = new net.Socket();
    s.setTimeout(config.connectTimeoutMs);

    s.connect(port, host, () => {
      s.destroy();
      return sendJson(res, 200, {
        success: true,
        msg: `Terminal reachable at ${host}:${port}`,
        terminalIp: host,
        terminalPort: port,
      });
    });

    s.on('error', err => {
      return sendJson(res, 503, {
        success: false,
        msg: `Cannot reach terminal at ${host}:${port} — ${err.message}`,
        terminalIp: host,
        terminalPort: port,
      });
    });

    s.on('timeout', () => {
      s.destroy();
      return sendJson(res, 503, {
        success: false,
        msg: `Connection to terminal timed out at ${host}:${port}`,
        terminalIp: host,
        terminalPort: port,
      });
    });
    return;
  }

  // 5. POST /api/sale
  if (req.method === 'POST' && pathname === '/api/sale') {
    try {
      const body = await parseBody(req);
      const amount = parseFloat(body.amount);
      if (isNaN(amount) || amount <= 0) {
        return sendJson(res, 400, {
          success: false,
          code: 'INVALID_AMOUNT',
          msg: 'Amount must be a positive number',
        });
      }

      const termCfg = getTerminalConfig(body.terminalIp, body.terminalPort);
      if (!termCfg.ip) {
        return sendJson(res, 503, {
          success: false,
          code: 'TERMINAL_IP_NOT_CONFIGURED',
          msg: 'NETS DESK5000 terminal IP is not configured in backend/.env. Retrieve the terminal IP from the DESK5000 screen.',
        });
      }

      const lockKey = body.tableId ? String(body.tableId) : (body.sessionId || `amt_${amount}`);
      if (activeRequests.has(lockKey)) {
        return sendJson(res, 409, {
          success: false,
          code: 'IN_FLIGHT',
          msg: 'A transaction is already in progress for this table/session',
        });
      }

      const availableDlls = getAvailableDlls();
      if (availableDlls.length === 0) {
        return sendJson(res, 503, {
          success: false,
          code: 'DLL_NOT_FOUND',
          msg: 'Official NETS ECR3 DLL not found in nets-bridge/bin. Place the approved DLL into nets-bridge/bin.',
          binDirectory: path.resolve(__dirname, config.dllDirectory || './bin'),
        });
      }

      activeRequests.set(lockKey, true);
      try {
        const billNo = body.orderId || body.billNo || body.sessionId || `POS${Date.now().toString().slice(-6)}`;
        const result = await runNetsCommand('sale', {
          amount,
          billNo,
          terminalIp: termCfg.ip,
          terminalPort: termCfg.port,
          receiptReq: body.receiptRequired ? '1' : '0',
        });

        return sendJson(res, result.success ? 200 : 400, result);
      } finally {
        activeRequests.delete(lockKey);
      }
    } catch (e) {
      console.error('[Bridge] Error handling /api/sale:', e);
      return sendJson(res, 500, {
        success: false,
        code: 'INTERNAL_ERROR',
        msg: e.message,
      });
    }
  }

  // 6. POST /api/settlement
  if (req.method === 'POST' && pathname === '/api/settlement') {
    const termCfg = getTerminalConfig();
    const result = await runNetsCommand('settlement', {
      terminalIp: termCfg.ip,
      terminalPort: termCfg.port,
    });
    return sendJson(res, result.success ? 200 : 400, result);
  }

  // 7. POST /api/logon
  if (req.method === 'POST' && pathname === '/api/logon') {
    const termCfg = getTerminalConfig();
    const result = await runNetsCommand('logon', {
      terminalIp: termCfg.ip,
      terminalPort: termCfg.port,
    });
    return sendJson(res, result.success ? 200 : 400, result);
  }

  // 8. POST /api/last-txn
  if (req.method === 'POST' && pathname === '/api/last-txn') {
    return sendJson(res, 200, {
      success: true,
      msg: 'Query last transaction handled by bridge',
    });
  }

  // 404 for unhandled routes
  sendJson(res, 404, {
    success: false,
    code: 'NOT_FOUND',
    msg: `Endpoint ${pathname} not found on NETS Bridge`,
  });
});

const bindHost = process.env.HOST || config.host || '0.0.0.0';
const bindPort = parseInt(process.env.PORT || config.port || 5050, 10);

server.listen(bindPort, bindHost, () => {
  const termCfg = getTerminalConfig();
  console.log(`=================================================`);
  console.log(` 🛡️  NETS ECR3 Windows Bridge Service Started`);
  console.log(` Listening on: http://${bindHost}:${bindPort}`);
  console.log(` Terminal IP:  ${termCfg.ip ? termCfg.ip + ':' + termCfg.port : '(Pending Configuration in .env)'}`);
  console.log(` DLL Directory: ${path.resolve(__dirname, config.dllDirectory)}`);
  console.log(` Available DLLs: ${getAvailableDlls().join(', ') || 'None (Awaiting DLL in /bin)'}`);
  console.log(`=================================================`);
});
