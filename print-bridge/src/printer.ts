import * as net from 'net';
import * as fs from 'fs';
import { logger } from './logger';

/**
 * Parses tags like [C], [L], [R], <B>, </B>, <font size='big'> to ESC/POS binary buffers.
 */
function parseFormatting(content: string): Buffer {
  const chunks: Buffer[] = [];
  
  // Tag translation regex
  const tagRegex = /(\[C\]|\[L\]|\[R\]|<\/?B>|<font size='big'>|<font size='normal'>|<\/font>)/gi;
  const parts = content.split(tagRegex);
  
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (lower === '[c]') {
      chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Align center
    } else if (lower === '[l]') {
      chunks.push(Buffer.from([0x1B, 0x61, 0x00])); // Align left
    } else if (lower === '[r]') {
      chunks.push(Buffer.from([0x1B, 0x61, 0x02])); // Align right
    } else if (lower === '<b>') {
      chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
    } else if (lower === '</b>') {
      chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
    } else if (lower === "<font size='big'>" || lower === "<font size=\"big\">") {
      chunks.push(Buffer.from([0x1D, 0x21, 0x11])); // Double width + double height
    } else if (lower === "<font size='normal'>" || lower === "<font size=\"normal\">" || lower === '</font>') {
      chunks.push(Buffer.from([0x1D, 0x21, 0x00])); // Reset font size
    } else {
      chunks.push(Buffer.from(part, 'utf-8'));
    }
  }
  
  // Append line feeds and paper cut command (GS V 66 0)
  chunks.push(Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00]));
  
  return Buffer.concat(chunks);
}

/**
 * Verifies that the destination printer is reachable using a short TCP connection check.
 * Checks the actual ESC/POS port (9100) with a 750ms timeout. Returns true if reachable, false otherwise.
 * Does not throw exceptions for expected offline printers.
 */
export function checkPrinterReachable(ip: string, port: number = 9100, timeoutMs: number = 750): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeoutMs);

    socket.connect(port, ip, () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(true);
      }
    });

    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
  });
}

/**
 * Sends a raw data payload to a LAN/Wi-Fi thermal printer using a TCP socket connection.
 * Supports both base64 binary encoding and standard UTF-8 string encoding with tag translation.
 */
// Known cash drawer base64 payloads — these must be sent as raw binary with
// NO printer initialization (ESC @) or line feeds prepended, as that causes
// the printer to advance paper before executing the drawer-open pulse.
const CASH_DRAWER_PAYLOADS = new Set([
  'G3AAGRk=',   // ESC p 0 25 25 — standard drawer open
  'EBQBAAU=',   // DLE DC4 1 0 5 — real-time drawer open (no paper feed)
]);

export async function sendToPrinter(ip: string, port: number, content: string, jobId: string | number): Promise<void> {
  const targetPort = port || 9100;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const client = new net.Socket();
    const timeoutVal = 30000;
    const connectTimeoutMs = 3000; // 3 seconds connection timeout limit

    client.setTimeout(timeoutVal);

    let payload: Buffer;
    
    // Quick heuristic to check if content is base64 encoded binary
    const trimmed = content.trim();
    const isBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && (trimmed.length % 4 === 0);
    const isCashDrawerCommand = CASH_DRAWER_PAYLOADS.has(trimmed);

    if (isCashDrawerCommand) {
      // Decode the drawer command to pure binary — no extra bytes, no init
      payload = Buffer.from(trimmed, 'base64');
      console.log(`\n[CashDrawer] Opening drawer (raw binary only, no paper feed)\n`);
    } else if (isBase64) {
      payload = Buffer.from(trimmed, 'base64');
    } else {
      payload = parseFormatting(content);
    }

    if (!isCashDrawerCommand) {
      console.log(`\n[Print]\nStarted...\n`);
    }

    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip.trim());

    if (!isIp && ip.trim().length > 0) {
      const sharePath = ip.trim().startsWith('\\\\') ? ip.trim() : `\\\\localhost\\${ip.trim()}`;
      logger.info(`[Print Bridge] USB/Shared printer detected. Writing to path: ${sharePath}`);
      fs.writeFile(sharePath, payload, (err: any) => {
        if (err) {
          logger.error(`[Print Bridge] USB/Shared print failed: ${err.message}`);
          reject(err);
        } else {
          logger.info(`[Print Bridge] USB/Shared print completed successfully.`);
          resolve();
        }
      });
      return;
    }

    let resolved = false;
    const connectTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        console.log(`Status: FAILED\nError: Connection to printer timed out\n`);
        reject(new Error('Connection to printer timed out'));
      }
    }, connectTimeoutMs);

    client.connect(targetPort, ip, () => {
      clearTimeout(connectTimer);
      client.write(payload, () => {
        client.end();
      });
    });

    client.on('close', () => {
      clearTimeout(connectTimer);
      if (!resolved) {
        resolved = true;
        const duration = Date.now() - startTime;
        console.log(`Completed\nDuration: ${duration}ms\nStatus: COMPLETED\n`);
        resolve();
      }
    });

    client.on('error', (err: any) => {
      clearTimeout(connectTimer);
      if (!resolved) {
        resolved = true;
        client.destroy();
        console.log(`Status: FAILED\nError: ${err.message || 'TCP Socket Connection Failed'}\n`);
        reject(err);
      }
    });

    client.on('timeout', () => {
      clearTimeout(connectTimer);
      if (!resolved) {
        resolved = true;
        client.destroy();
        console.log(`Status: FAILED\nError: Connection timed out\n`);
        reject(new Error(`Connection to printer timed out`));
      }
    });
  });
}
