const net = require('net');

/**
 * Direct ESC/POS Thermal Printer Test Script
 * Supports testing any LAN thermal printer on port 9100.
 */
async function testThermalPrinter(ip = '192.168.0.199', port = 9100) {
  console.log(`[Printer Test] Attempting to connect to ${ip}:${port}...`);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(port, ip, () => {
      console.log(`[Printer Test] Connected successfully to ${ip}:${port}`);

      const ESC = '\x1b';
      const GS = '\x1d';
      const LF = '\x0a';

      // Build ESC/POS payload
      let buffer = '';
      buffer += ESC + '@'; // Initialize printer
      buffer += ESC + 'a' + '\x01'; // Center align
      buffer += ESC + '!' + '\x38'; // Double height + double width
      buffer += 'TEST PRINT' + LF;
      buffer += ESC + '!' + '\x00'; // Normal font
      buffer += '================================' + LF;
      buffer += 'POS-v-2.0 Thermal Printer Test' + LF;
      buffer += `IP Address : ${ip}:${port}` + LF;
      buffer += `Date & Time: ${new Date().toLocaleString()}` + LF;
      buffer += 'Status     : Direct TCP Connected OK' + LF;
      buffer += '================================' + LF;
      buffer += LF + LF + LF;
      buffer += GS + 'V' + '\x41' + '\x03'; // Partial / full cut with feed

      socket.write(Buffer.from(buffer, 'binary'), () => {
        console.log(`[Printer Test] Test ticket bytes successfully sent!`);
        socket.end();
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      console.error(`[Printer Test] Connection error:`, err.message);
      reject(err);
    });

    socket.on('timeout', () => {
      console.error(`[Printer Test] Socket timeout on ${ip}:${port}`);
      socket.destroy();
      reject(new Error('Printer socket connection timeout'));
    });

    socket.on('close', () => {
      console.log(`[Printer Test] Connection closed.`);
    });
  });
}

// Target IP can be passed as argument: node scripts/test_printer_lan.js 192.168.0.199
const targetIp = process.argv[2] || '192.168.0.199';
const targetPort = parseInt(process.argv[3] || '9100', 10);

testThermalPrinter(targetIp, targetPort)
  .then(() => {
    console.log('[Printer Test] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Printer Test] Failed:', err.message);
    process.exit(1);
  });
