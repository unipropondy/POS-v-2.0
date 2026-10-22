// backend/services/nets.service.js
// NETS ECR3 LAN Integration Service
// Communicates with the Ingenico DESK5000 terminal via TCP socket
// using the NETS ECR3 LAN message protocol.
//
// Protocol reference: NETS ECR3 LAN Integration Guide (provided by NETS Singapore)
// Message format: STX | LEN_HI | LEN_LO | DATA | ETX | LRC
//   STX = 0x02
//   LEN = 2 bytes big-endian = length of DATA bytes
//   DATA = ASCII command payload
//   ETX = 0x03
//   LRC = XOR of bytes from LEN_HI through ETX inclusive
//
// ⚠️  IMPORTANT: Verify message format and command codes against your
//     approved NETS ECR3 LAN Integration Guide before going live.
//     Contact NETS merchant support if the message format differs.

'use strict';

const net   = require('net');
const http  = require('http');
const https = require('https');
const { EventEmitter } = require('events');

// ─── Bridge Configuration ──────────────────────────────────────────────────────
const BRIDGE_URL     = process.env.NETS_BRIDGE_URL || 'http://127.0.0.1:5050';
const BRIDGE_KEY     = process.env.NETS_BRIDGE_KEY || 'unipro_nets_bridge_secure_key_2026';
const PREFER_BRIDGE  = process.env.NETS_PREFER_BRIDGE !== 'false'; // default: true

/**
 * Send an authenticated HTTP/HTTPS request to the Windows NETS Bridge Service.
 * Works seamlessly across both local development (http://127.0.0.1:5050)
 * and Railway cloud deployment (https://<tunnel-domain>).
 */
function callBridge(endpoint, method, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BRIDGE_URL);
    const bodyStr = payload ? JSON.stringify(payload) : null;
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': BRIDGE_KEY,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: PAYMENT_TIMEOUT_MS + 10_000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ success: false, code: 'BRIDGE_PARSE_ERR', msg: 'Invalid JSON from bridge', raw: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, code: 'TIMEOUT', msg: 'Bridge request timed out' });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STX = 0x02;
const ETX = 0x03;
const ACK = 0x06;
const NAK = 0x15;

// ECR3 Command codes (DATA byte 0-1)
const CMD_SALE        = '31'; // Sale / Purchase
const CMD_VOID        = '32'; // Void transaction
const CMD_STATUS      = '37'; // Check terminal status / last transaction

// ECR3 Response codes returned in DATA
const RESP_APPROVED   = '00'; // Approved
const RESP_DECLINED   = '01'; // Declined by host
const RESP_CANCELLED  = '02'; // Cancelled by cardholder on terminal
const RESP_TIMEOUT    = '03'; // Transaction timed out
const RESP_NO_RESP    = '04'; // No response from host
const RESP_COMM_ERR   = '05'; // Communication error

// Default configuration — override via .env
const DEFAULT_HOST = process.env.NETS_TERMINAL_IP   || '';
const DEFAULT_PORT = parseInt(process.env.NETS_TERMINAL_PORT || '9742', 10);
const DEFAULT_TID  = (process.env.NETS_TERMINAL_ID  || '').padEnd(8, ' ').substring(0, 8);

// Timeouts
const CONNECT_TIMEOUT_MS = 10_000;    // 10 s to establish TCP connection
const PAYMENT_TIMEOUT_MS = 120_000;   // 2 min for cardholder to present card and PIN

// ─── LRC Calculation ─────────────────────────────────────────────────────────
/**
 * Calculate LRC (Longitudinal Redundancy Check) — XOR of all bytes
 * from LEN_HI through ETX inclusive.
 */
function calcLRC(buf, start, end) {
  let lrc = 0;
  for (let i = start; i <= end; i++) {
    lrc ^= buf[i];
  }
  return lrc;
}

// ─── Message Builder ──────────────────────────────────────────────────────────
/**
 * Build a complete ECR3 LAN message buffer.
 * @param {string} data - ASCII payload string
 * @returns {Buffer}
 */
function buildMessage(data) {
  const dataBytes = Buffer.from(data, 'ascii');
  const len = dataBytes.length;

  // Frame: STX, LEN_HI, LEN_LO, DATA..., ETX, LRC
  const msg = Buffer.alloc(4 + len + 2); // STX + 2-byte len + data + ETX + LRC
  let pos = 0;

  msg[pos++] = STX;
  msg[pos++] = (len >> 8) & 0xFF; // LEN_HI
  msg[pos++] = len & 0xFF;         // LEN_LO

  dataBytes.copy(msg, pos);
  pos += len;

  msg[pos++] = ETX;

  // LRC: XOR from LEN_HI (index 1) through ETX (current pos-1)
  msg[pos] = calcLRC(msg, 1, pos - 1);

  return msg;
}

/**
 * Build a SALE command payload.
 * DATA = CMD(2) + SUB_CMD(2) + AMOUNT(10 digits, in cents) + TERMINAL_ID(8 chars)
 *
 * @param {number} amountCents - amount in cents (e.g. $12.50 → 1250)
 * @param {string} terminalId  - 8-char terminal ID
 * @returns {string}
 */
function buildSalePayload(amountCents, terminalId) {
  const amtStr = String(amountCents).padStart(10, '0');
  const tid    = (terminalId || DEFAULT_TID).padEnd(8, ' ').substring(0, 8);
  return `${CMD_SALE}00${amtStr}${tid}`;
}

/**
 * Build a STATUS / last-transaction-query payload.
 * @param {string} terminalId
 * @returns {string}
 */
function buildStatusPayload(terminalId) {
  const tid = (terminalId || DEFAULT_TID).padEnd(8, ' ').substring(0, 8);
  return `${CMD_STATUS}00${tid}`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────
/**
 * Parse a raw TCP response buffer from the terminal.
 * Returns null if the buffer is not yet complete.
 * Throws if LRC fails.
 *
 * Expected structure: STX | LEN_HI | LEN_LO | DATA | ETX | LRC
 */
function parseResponse(raw) {
  if (raw.length < 5) return null; // Minimum: STX + 2-byte len + ETX + LRC

  if (raw[0] !== STX) {
    throw new Error(`[NETS] Invalid frame: expected STX (0x02), got 0x${raw[0].toString(16)}`);
  }

  const dataLen = (raw[1] << 8) | raw[2];
  const expectedTotalLen = 4 + dataLen + 2; // STX(1) + LEN(2) + DATA(n) + ETX(1) + LRC(1)

  if (raw.length < expectedTotalLen) return null; // Not enough data yet

  const etxPos = 3 + dataLen;
  if (raw[etxPos] !== ETX) {
    throw new Error(`[NETS] Invalid frame: expected ETX at pos ${etxPos}, got 0x${raw[etxPos].toString(16)}`);
  }

  const receivedLRC = raw[etxPos + 1];
  const calculatedLRC = calcLRC(raw, 1, etxPos);
  if (receivedLRC !== calculatedLRC) {
    throw new Error(`[NETS] LRC mismatch: received 0x${receivedLRC.toString(16)}, calculated 0x${calculatedLRC.toString(16)}`);
  }

  const data = raw.slice(3, etxPos).toString('ascii');

  // Parse the DATA field
  // Typical response layout (ECR3 LAN):
  //   [0-1]  Response CMD (echoes sent CMD)
  //   [2-3]  Sub-command / function code
  //   [4-5]  Response code (00=approved)
  //   [6+]   Additional fields (approval code, card type, last-4, reference, batch, etc.)
  const responseCode  = data.substring(4, 6);  // positions 4-5
  const approvalCode  = data.substring(6, 12).trim();  // 6 chars
  const cardType      = data.substring(12, 20).trim(); // 8 chars
  const cardLastFour  = data.substring(20, 24).trim(); // 4 chars
  const transRef      = data.substring(24, 36).trim(); // 12 chars
  const batchNo       = data.substring(36, 43).trim(); // 7 chars

  return {
    raw: data,
    responseCode,
    approvalCode,
    cardType,
    cardLastFour,
    transRef,
    batchNo,
    approved: responseCode === RESP_APPROVED,
    declined: responseCode === RESP_DECLINED,
    cancelled: responseCode === RESP_CANCELLED,
    timedOut: responseCode === RESP_TIMEOUT,
  };
}

// ─── NetsService Class ────────────────────────────────────────────────────────
class NetsService extends EventEmitter {
  constructor() {
    super();
    this.host = DEFAULT_HOST;
    this.port = DEFAULT_PORT;
    this.terminalId = DEFAULT_TID;
  }

  /**
   * Send a payment / sale request to the NETS terminal via TCP.
   *
   * @param {object} options
   * @param {number} options.amount          - Dollar amount (e.g. 12.50)
   * @param {string} [options.terminalId]    - Optional override terminal ID
   * @param {string} [options.host]          - Optional override terminal IP
   * @param {number} [options.port]          - Optional override terminal port
   * @returns {Promise<{
   *   success: boolean,
   *   code: string,
   *   msg: string,
   *   approvalCode?: string,
   *   cardType?: string,
   *   cardLastFour?: string,
   *   transRef?: string,
   *   batchNo?: string,
   *   rawData?: string,
   * }>}
   */
  /**
   * Check status of Windows Bridge Service and whether official DLL is loaded.
   */
  async getBridgeStatus() {
    try {
      return await callBridge('/api/status', 'GET');
    } catch (e) {
      return {
        success: false,
        code: 'BRIDGE_OFFLINE',
        msg: `Windows NETS Bridge Service is not running at ${BRIDGE_URL} (${e.message})`,
      };
    }
  }

  /**
   * Send a payment / sale request.
   * Routes strictly through Windows Bridge Service using official NETS ECR3 DLL.
   * Direct TCP socket fallback is permanently disabled per NETS integration requirements.
   */
  async processSalePayment({ amount, tableId, orderId, sessionId, terminalId } = {}) {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return { success: false, code: 'INVALID_AMOUNT', msg: 'Invalid payment amount' };
    }

    try {
      console.log(`[NETS] Dispatching sale to Windows Bridge Service (${BRIDGE_URL}) for $${amountNum.toFixed(2)}...`);
      const bridgeResult = await callBridge('/api/sale', 'POST', {
        amount: amountNum,
        tableId,
        orderId,
        sessionId,
        terminalId: terminalId || this.terminalId,
        terminalIp: this.host || process.env.NETS_TERMINAL_IP || undefined,
        terminalPort: this.port || parseInt(process.env.NETS_TERMINAL_PORT || '9742', 10),
      });
      console.log('[NETS] Windows Bridge Service responded:', bridgeResult);
      return bridgeResult;
    } catch (bridgeErr) {
      console.error(`[NETS] Windows Bridge Service error at ${BRIDGE_URL}:`, bridgeErr.message);
      return {
        success: false,
        code: 'BRIDGE_OFFLINE',
        msg: `Windows NETS Bridge Service is not reachable at ${BRIDGE_URL}. The official NETS DLL bridge service is required. Direct TCP fallback is strictly disabled.`,
      };
    }
  }

  /**
   * Direct ECR3 TCP socket sale implementation.
   */
  _directTcpSale({ amount, terminalId, host, port } = {}) {
    return new Promise((resolve) => {
      const targetHost = host || this.host;
      const targetPort = port || this.port;
      const tid        = (terminalId || this.terminalId).padEnd(8, ' ').substring(0, 8);

      // Convert amount to cents (no floating-point issues)
      const amountCents = Math.round(amount * 100);
      if (!amountCents || amountCents <= 0) {
        return resolve({ success: false, code: 'INVALID_AMOUNT', msg: 'Invalid payment amount' });
      }

      console.log(`[NETS] Initiating sale: $${amount} (${amountCents} cents) → ${targetHost}:${targetPort} TID=${tid}`);

      const payload  = buildSalePayload(amountCents, tid);
      const msgBuf   = buildMessage(payload);

      let rxBuf = Buffer.alloc(0);
      let settled = false;
      let paymentTimer = null;

      const socket = new net.Socket();
      socket.setTimeout(CONNECT_TIMEOUT_MS);

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(paymentTimer);
        socket.destroy();
        resolve(result);
      };

      socket.on('connect', () => {
        console.log(`[NETS] TCP connected to terminal ${targetHost}:${targetPort}`);
        socket.setTimeout(PAYMENT_TIMEOUT_MS); // Reset timeout for the payment operation

        // Send the sale command
        socket.write(msgBuf, (err) => {
          if (err) {
            console.error('[NETS] Write error:', err.message);
            finish({ success: false, code: 'WRITE_ERR', msg: err.message });
          } else {
            console.log(`[NETS] Sale command sent (${msgBuf.length} bytes)`);
          }
        });
      });

      socket.on('data', (chunk) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        console.log(`[NETS] Received ${chunk.length} bytes (total: ${rxBuf.length})`);

        // Send ACK byte as soon as we receive data (per ECR3 protocol)
        socket.write(Buffer.from([ACK]));

        try {
          const parsed = parseResponse(rxBuf);
          if (!parsed) return; // Incomplete frame — wait for more data

          console.log(`[NETS] Response parsed — Code: ${parsed.responseCode}, Approved: ${parsed.approved}`);

          if (parsed.approved) {
            finish({
              success: true,
              code: parsed.responseCode,
              msg: 'Approved',
              approvalCode:  parsed.approvalCode,
              cardType:      parsed.cardType,
              cardLastFour:  parsed.cardLastFour,
              transRef:      parsed.transRef,
              batchNo:       parsed.batchNo,
              rawData:       parsed.raw,
            });
          } else if (parsed.cancelled) {
            finish({ success: false, code: RESP_CANCELLED, msg: 'Transaction cancelled on terminal' });
          } else if (parsed.timedOut) {
            finish({ success: false, code: RESP_TIMEOUT, msg: 'Transaction timed out on terminal' });
          } else if (parsed.declined) {
            finish({ success: false, code: RESP_DECLINED, msg: 'Transaction declined' });
          } else {
            finish({ success: false, code: parsed.responseCode, msg: `Terminal error (${parsed.responseCode})` });
          }
        } catch (parseErr) {
          console.error('[NETS] Parse error:', parseErr.message);
          finish({ success: false, code: 'PARSE_ERR', msg: parseErr.message });
        }
      });

      socket.on('timeout', () => {
        console.warn('[NETS] Socket timeout');
        finish({ success: false, code: RESP_TIMEOUT, msg: 'Connection to terminal timed out' });
      });

      socket.on('error', (err) => {
        console.error('[NETS] Socket error:', err.message);
        finish({ success: false, code: 'SOCKET_ERR', msg: `Terminal connection error: ${err.message}` });
      });

      socket.on('close', () => {
        if (!settled) {
          console.warn('[NETS] Socket closed before response received');
          finish({ success: false, code: RESP_COMM_ERR, msg: 'Terminal disconnected before response' });
        }
      });

      // Safety net: resolve with timeout after PAYMENT_TIMEOUT_MS + 5 s
      paymentTimer = setTimeout(() => {
        console.warn('[NETS] Payment timer exceeded — forcing timeout resolution');
        finish({ success: false, code: RESP_TIMEOUT, msg: 'Payment timed out — no response from terminal' });
      }, PAYMENT_TIMEOUT_MS + 5_000);

      socket.connect(targetPort, targetHost);
    });
  }

  /**
   * Query the last transaction status from the terminal.
   * Useful for reconciliation after a timeout.
   */
  queryLastTransaction({ terminalId, host, port } = {}) {
    return new Promise((resolve) => {
      const targetHost = host || this.host;
      const targetPort = port || this.port;
      const tid        = (terminalId || this.terminalId).padEnd(8, ' ').substring(0, 8);

      const payload = buildStatusPayload(tid);
      const msgBuf  = buildMessage(payload);

      let rxBuf   = Buffer.alloc(0);
      let settled = false;

      const socket = new net.Socket();
      socket.setTimeout(15_000);

      const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.on('connect', () => {
        socket.write(msgBuf, (err) => {
          if (err) finish({ success: false, code: 'WRITE_ERR', msg: err.message });
        });
      });

      socket.on('data', (chunk) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        socket.write(Buffer.from([ACK]));
        try {
          const parsed = parseResponse(rxBuf);
          if (!parsed) return;
          finish({
            success: true,
            code: parsed.responseCode,
            approved: parsed.approved,
            approvalCode: parsed.approvalCode,
            transRef: parsed.transRef,
            rawData: parsed.raw,
          });
        } catch (e) {
          finish({ success: false, code: 'PARSE_ERR', msg: e.message });
        }
      });

      socket.on('timeout', () => finish({ success: false, code: RESP_TIMEOUT, msg: 'Status query timed out' }));
      socket.on('error',   (e) => finish({ success: false, code: 'SOCKET_ERR', msg: e.message }));
      socket.on('close',   ()  => { if (!settled) finish({ success: false, code: RESP_COMM_ERR, msg: 'Socket closed' }); });

      socket.connect(targetPort, targetHost);
    });
  }
}

module.exports = new NetsService();
