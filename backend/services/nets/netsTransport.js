/**
 * netsTransport.js
 * Hardware & Network transport communication layer for NETS ECR II terminal.
 * Supports Ethernet/LAN (TCP/IP) and RS-232 (Serial COM) with full Section 2.2 error handling,
 * retry limits, timeouts, ACK/NAK state machine, and hexadecimal communication logging.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const {
  STX,
  ETX,
  ACK,
  NAK,
  buildLanPacket,
  buildRs232Packet,
  parseLanResponse,
  parseRs232Response
} = require('./netsProtocol');

const LOG_DIR = path.resolve(__dirname, '../../logs');
const COMM_LOG_FILE = path.join(LOG_DIR, 'nets_comm.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// In-memory circular buffer of the last 100 log entries for UI inspection / UAT export
const recentLogs = [];
const MAX_LOGS = 100;

function logComm(direction, rawBytes, comment = '') {
  const timestamp = new Date().toISOString();
  let hexString = '';
  if (Buffer.isBuffer(rawBytes)) {
    hexString = Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  } else if (typeof rawBytes === 'string') {
    hexString = rawBytes;
  }

  const logEntry = `[${timestamp}] [${direction}] ${hexString}${comment ? ' # ' + comment : ''}`;
  console.log(`📡 [NETS COMM] ${logEntry}`);

  recentLogs.push({ timestamp, direction, hex: hexString, comment });
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();

  try {
    fs.appendFileSync(COMM_LOG_FILE, logEntry + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to append to nets_comm.log:', err.message);
  }
}

class NetsTransport {
  constructor(options = {}) {
    this.mode = (options.mode || process.env.NETS_INTERFACE_MODE || 'LAN').toUpperCase(); // 'LAN' or 'RS232'
    this.terminalIp = options.terminalIp || process.env.NETS_TERMINAL_IP || '192.168.9.38';
    this.terminalPort = parseInt(options.terminalPort || process.env.NETS_TERMINAL_PORT || '7500', 10);
    this.comPort = options.comPort || process.env.NETS_COM_PORT || 'COM1';
    this.baudRate = parseInt(options.baudRate || process.env.NETS_BAUD_RATE || '9600', 10);
    this.ackTimeoutMs = parseInt(options.ackTimeoutMs || '2000', 10); // Section 2.2.2.3: 2 seconds
    this.maxRetries = 2; // Section 2.2.2.1: Resend twice (total 3 attempts)
    this.onlineTimeoutMs = parseInt(options.onlineTimeoutMs || '120000', 10); // Section 2.2.2.6: 2 minutes
    this.offlineTimeoutMs = parseInt(options.offlineTimeoutMs || '60000', 10); // Section 2.2.2.6: 1 minute
  }

  updateConfig(cfg = {}) {
    if (cfg.mode) this.mode = cfg.mode.toUpperCase();
    if (cfg.terminalIp) this.terminalIp = cfg.terminalIp;
    if (cfg.terminalPort) this.terminalPort = parseInt(cfg.terminalPort, 10);
    if (cfg.comPort) this.comPort = cfg.comPort;
    if (cfg.baudRate) this.baudRate = parseInt(cfg.baudRate, 10);
    if (cfg.onlineTimeoutMs) this.onlineTimeoutMs = parseInt(cfg.onlineTimeoutMs, 10);
    if (cfg.offlineTimeoutMs) this.offlineTimeoutMs = parseInt(cfg.offlineTimeoutMs, 10);
  }

  getConfig() {
    return {
      mode: this.mode,
      terminalIp: this.terminalIp,
      terminalPort: this.terminalPort,
      comPort: this.comPort,
      baudRate: this.baudRate,
      onlineTimeoutMs: this.onlineTimeoutMs,
      offlineTimeoutMs: this.offlineTimeoutMs
    };
  }

  getRecentLogs() {
    return recentLogs;
  }

  /**
   * Executes a command over Ethernet/LAN (TCP/IP).
   * Follows Section 2.1.3.1 and Section 2.2 error handling.
   */
  async executeLan(ecn, functionCode, fields = [], timeoutMs = 60000) {
    const packet = buildLanPacket(ecn, functionCode, fields);
    let attempt = 0;
    const maxAttempts = 1 + this.maxRetries;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        logComm('OUT [LAN]', packet, `Attempt ${attempt}/${maxAttempts} - FC ${functionCode} ECN ${ecn}`);
        const responseBuf = await this._sendLanPacketOnce(packet, timeoutMs);
        logComm('IN  [LAN]', responseBuf, `Response received for FC ${functionCode}`);

        // Check if NAK was received on LAN (Section 2.2.2.2 - terminal busy)
        if (responseBuf.length === 1 && responseBuf[0] === NAK) {
          logComm('IN  [LAN]', 'NAK', 'Terminal replied NAK (busy)');
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          } else {
            throw new Error('Terminal busy (received NAK on LAN after retries)');
          }
        }

        const parsed = parseLanResponse(responseBuf);
        if (!parsed.valid) {
          logComm('ERR [LAN]', '', 'Corrupted response received (LRC mismatch)');
          throw new Error('Response failed LRC verification (corrupted packet from terminal)');
        }
        return parsed;
      } catch (err) {
        logComm('ERR [LAN]', '', `Attempt ${attempt} error: ${err.message}`);
        if (attempt >= maxAttempts) {
          throw err;
        }
        // Wait 2s before retry as per Section 2.2.2.3
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error(`Failed to communicate with NETS terminal via LAN after ${maxAttempts} attempts`);
  }

  _sendLanPacketOnce(packet, timeoutMs) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let timer = null;
      let receivedBuffers = [];
      let expectedTotalLength = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        client.removeAllListeners();
        client.destroy();
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`NETS terminal LAN timeout after ${timeoutMs}ms (IP: ${this.terminalIp}:${this.terminalPort})`));
      }, timeoutMs);

      client.connect(this.terminalPort, this.terminalIp, () => {
        client.write(packet);
      });

      client.on('data', (chunk) => {
        receivedBuffers.push(chunk);
        const combined = Buffer.concat(receivedBuffers);

        if (combined.length >= 2 && expectedTotalLength === null) {
          // In LAN mode, first 2 bytes are BCD length of (body + LRC)
          const { fromBcd2 } = require('./netsProtocol');
          const declared = fromBcd2(combined, 0);
          expectedTotalLength = declared + 2; // 2 bytes length + body + LRC
        }

        if (expectedTotalLength && combined.length >= expectedTotalLength) {
          cleanup();
          resolve(combined.slice(0, expectedTotalLength));
        }
      });

      client.on('error', (err) => {
        cleanup();
        reject(new Error(`TCP socket error connecting to ${this.terminalIp}:${this.terminalPort} - ${err.message}`));
      });

      client.on('close', () => {
        if (receivedBuffers.length > 0 && expectedTotalLength && Buffer.concat(receivedBuffers).length >= expectedTotalLength) {
          // Handled in 'data'
        } else if (receivedBuffers.length > 0) {
          cleanup();
          resolve(Buffer.concat(receivedBuffers));
        }
      });
    });
  }

  /**
   * Executes a command over RS-232 serial.
   * If serialport npm module is not installed, gracefully warns or fallbacks.
   */
  async executeRs232(ecn, functionCode, fields = [], timeoutMs = 60000) {
    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch (e) {
      throw new Error(`SerialPort package not installed. RS-232 mode requires 'serialport'. Please use LAN mode or install serialport.`);
    }

    const packet = buildRs232Packet(ecn, functionCode, fields);
    let attempt = 0;
    const maxAttempts = 1 + this.maxRetries;

    const port = new SerialPort({
      path: this.comPort,
      baudRate: this.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    });

    await new Promise((resolve, reject) => {
      port.open(err => (err ? reject(err) : resolve()));
    });

    try {
      while (attempt < maxAttempts) {
        attempt++;
        logComm('OUT [RS232]', packet, `Attempt ${attempt}/${maxAttempts} - FC ${functionCode} ECN ${ecn}`);

        // Step 1: Send command and wait for ACK (0x06) within 2 seconds (Section 2.2.2.3)
        const ackReceived = await this._sendAndAwaitAck(port, packet, this.ackTimeoutMs);
        if (!ackReceived) {
          logComm('ERR [RS232]', '', `No ACK received within ${this.ackTimeoutMs}ms (attempt ${attempt})`);
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error(`Terminal did not acknowledge command (No ACK received after ${maxAttempts} attempts)`);
        }

        logComm('IN  [RS232]', Buffer.from([ACK]), 'ACK received from terminal');

        // Step 2: Wait for response data packet (up to timeoutMs)
        const responseBuf = await this._readRs232Response(port, timeoutMs);
        logComm('IN  [RS232]', responseBuf, `Response packet received for FC ${functionCode}`);

        // Step 3: Validate LRC and send ACK (or NAK on corruption)
        const parsed = parseRs232Response(responseBuf);
        if (!parsed.valid) {
          logComm('OUT [RS232]', Buffer.from([NAK]), 'Corrupted response received, sending NAK');
          port.write(Buffer.from([NAK]));
          throw new Error('Response failed LRC verification (corrupted packet from terminal)');
        }

        // Send ACK back to terminal to confirm receipt (Section 2.2.1)
        logComm('OUT [RS232]', Buffer.from([ACK]), 'Sending ACK to terminal for valid response');
        port.write(Buffer.from([ACK]));
        return parsed;
      }
    } finally {
      if (port.isOpen) {
        port.close();
      }
    }
  }

  _sendAndAwaitAck(port, packet, timeoutMs) {
    return new Promise((resolve) => {
      let timer = null;
      const onData = (data) => {
        for (let i = 0; i < data.length; i++) {
          if (data[i] === ACK) {
            clearTimeout(timer);
            port.removeListener('data', onData);
            return resolve(true);
          } else if (data[i] === NAK) {
            clearTimeout(timer);
            port.removeListener('data', onData);
            return resolve(false);
          }
        }
      };

      timer = setTimeout(() => {
        port.removeListener('data', onData);
        resolve(false);
      }, timeoutMs);

      port.on('data', onData);
      port.write(packet);
    });
  }

  _readRs232Response(port, timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer = null;
      let chunks = [];
      let expectedTotalLength = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        port.removeAllListeners('data');
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for NETS response on ${this.comPort} after ${timeoutMs}ms`));
      }, timeoutMs);

      port.on('data', (data) => {
        chunks.push(data);
        const combined = Buffer.concat(chunks);

        // RS232: STX (1) + LEN (2) + Body (LEN) + ETX (1) + LRC (1)
        if (combined.length >= 3 && expectedTotalLength === null) {
          const { fromBcd2 } = require('./netsProtocol');
          const bodyLen = fromBcd2(combined, 1);
          expectedTotalLength = 1 + 2 + bodyLen + 1 + 1;
        }

        if (expectedTotalLength && combined.length >= expectedTotalLength) {
          cleanup();
          resolve(combined.slice(0, expectedTotalLength));
        }
      });
    });
  }

  /**
   * Unified execute method that dispatches to LAN or RS232 based on configured mode.
   */
  async execute(ecn, functionCode, fields = [], timeoutMs = null) {
    const finalTimeout = timeoutMs || (functionCode === '30' || functionCode === 'Q2' || functionCode === 'I0' ? this.onlineTimeoutMs : this.offlineTimeoutMs);

    if (this.mode === 'RS232') {
      return this.executeRs232(ecn, functionCode, fields, finalTimeout);
    }
    return this.executeLan(ecn, functionCode, fields, finalTimeout);
  }
}

// Global transport singleton
const defaultTransport = new NetsTransport();

module.exports = {
  NetsTransport,
  defaultTransport,
  logComm
};
