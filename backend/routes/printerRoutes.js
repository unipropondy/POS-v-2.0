const express = require('express');
const router = express.Router();
const net = require('net');
const { poolPromise, sql } = require('../config/db');

/**
 * Format and send an ESC/POS receipt directly over TCP socket (Port 9100)
 */
function sendToPrinterSocket(ip, port = 9100, buffer, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!ip || ip.trim() === '') {
      return reject(new Error('Printer IP address is required'));
    }

    const cleanIp = ip.trim();
    const cleanPort = parseInt(port || '9100', 10);
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.connect(cleanPort, cleanIp, () => {
      socket.write(buffer, () => {
        socket.end();
        if (!isResolved) {
          isResolved = true;
          resolve({
            success: true,
            message: `Printed successfully to ${cleanIp}:${cleanPort}`,
            ip: cleanIp,
            port: cleanPort,
          });
        }
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!isResolved) {
        isResolved = true;
        reject(new Error(`Connection to printer at ${cleanIp}:${cleanPort} timed out (${timeoutMs}ms)`));
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      if (!isResolved) {
        isResolved = true;
        reject(new Error(`Socket error connecting to ${cleanIp}:${cleanPort}: ${err.message}`));
      }
    });
  });
}

/**
 * Build ESC/POS formatted receipt binary buffer for POS Kiosk orders
 */
function buildKioskEscPosReceipt(order, company = {}) {
  const ESC = '\x1b';
  const GS = '\x1d';
  const LF = '\x0a';
  const WIDTH = 38;

  const padLine = (left, right) => {
    const l = String(left || '');
    const r = String(right || '');
    const spaceCount = WIDTH - l.length - r.length;
    if (spaceCount <= 0) {
      return l + ' ' + r;
    }
    return l + ' '.repeat(spaceCount) + r;
  };

  const formatAmt = (val) => {
    const num = Number(val || 0);
    const s = '$' + num.toFixed(2);
    return s.padStart(8, ' ');
  };

  let text = '';

  // 1. Initialize printer
  text += ESC + '@';
  text += LF;

  // 2. Center alignment for Header
  text += ESC + 'a' + '\x01';

  // Double width & height for company name
  text += ESC + '!' + '\x38';
  const brandName = (company.CompanyName || company.OutletName || 'SMART POS').trim();
  text += brandName + LF;
  text += ESC + '!' + '\x00';

  if (company.Address) {
    const companyAddr = String(company.Address).replace(/\r?\n/g, ' ').trim();
    text += companyAddr + LF;
  }
  const companyPhone = company.Phone || company.Telephone ? `Tel: ${company.Phone || company.Telephone}` : '';
  const companyGst = company.GSTNo ? `GST: ${company.GSTNo}` : '';
  if (companyPhone || companyGst) {
    text += [companyPhone, companyGst].filter(Boolean).join(' | ') + LF;
  }

  // 3. Queue / Order Ticket Box
  text += '='.repeat(WIDTH) + LF;
  text += 'OFFICIAL QUEUE TICKET' + LF;
  text += ESC + '!' + '\x38'; // Double size for order/bill number
  const orderNumber = String(order.orderNumber || order.orderId || order.invoiceNumber || order.billNumber || 'KIOSK-01').trim();
  const cleanDigits = orderNumber.replace(/\D/g, '');
  const queueSuffix = cleanDigits ? cleanDigits.slice(-4) : (orderNumber.length >= 4 ? orderNumber.slice(-4) : orderNumber);
  text += `#${queueSuffix}` + LF;
  text += ESC + '!' + '\x00';
  text += '='.repeat(WIDTH) + LF;

  // 4. Order Details
  text += ESC + 'a' + '\x00'; // Left align
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
  text += padLine(`Date: ${dateStr}`, `Time: ${timeStr}`) + LF;

  const isSelfCollect = order.isSelfCollect === true;
  const isTent = order.isTentNumber === true;
  const tableLabel = isTent ? "TENT NO" : "TABLE";

  if (!isSelfCollect && order.tableNo && String(order.tableNo).toUpperCase() !== 'KIOSK') {
    text += `${tableLabel}: ${order.tableNo}` + LF;
  }

  // 5. Items Header
  text += '-'.repeat(WIDTH) + LF;
  text += padLine('ITEM', 'QTY   AMOUNT') + LF;
  text += '-'.repeat(WIDTH) + LF;

  // 6. Items
  const items = order.items || order.sentItems || [];
  let subtotal = 0;

  for (const item of items) {
    const itemName = String(item.name || item.DishName || item.Name || 'Item').trim();
    const qty = Number(item.quantity || item.qty || 1);
    const price = Number(item.price || item.PricePerUnit || item.Price || 0);
    const lineTotal = Number(item.LineTotal || (price * qty));
    subtotal += lineTotal;

    const qtyAndAmt = `${qty}x  ${formatAmt(lineTotal)}`;
    if (itemName.length + qtyAndAmt.length + 1 <= WIDTH) {
      text += padLine(itemName, qtyAndAmt) + LF;
    } else {
      text += itemName + LF;
      text += padLine('', qtyAndAmt) + LF;
    }

    // Modifiers / combos
    if (item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) {
      for (const m of item.modifiers) {
        const modName = `  + ${m.ModifierName || m.name || m}`;
        const modPrice = Number(m.Price || m.price || 0);
        if (modPrice > 0) {
          text += padLine(modName, formatAmt(modPrice)) + LF;
        } else {
          text += modName + LF;
        }
      }
    }
  }

  text += '-'.repeat(WIDTH) + LF;

  // 7. Totals
  const extraCharge = Number(order.extraCharge || 0);
  const totalAmount = Number(order.total || order.grandTotal || order.totalAmount || (subtotal + extraCharge));

  text += padLine('Subtotal:', formatAmt(subtotal)) + LF;
  if (extraCharge > 0) {
    text += padLine('Extra Charge / Fee:', formatAmt(extraCharge)) + LF;
  }

  // Tax breakdown if applicable
  const gstRate = Number(company.GSTPercentage || company.TaxPercentage || 9);
  const gstAmount = Number(order.gstAmount || ((totalAmount * gstRate) / (100 + gstRate)));
  if (gstAmount > 0) {
    text += padLine(`GST (${gstRate}% Included):`, formatAmt(gstAmount)) + LF;
  }
  text += '-'.repeat(WIDTH) + LF;

  // Grand Total Highlight
  text += ESC + 'E' + '\x01'; // Bold ON
  text += padLine('TOTAL AMOUNT:', formatAmt(totalAmount)) + LF;
  text += ESC + 'E' + '\x00'; // Bold OFF

  const payMode = (order.paymentMethod || order.payMode || order.paymentMode || 'PAID').toUpperCase();
  text += padLine('Payment:', `[${payMode}]`) + LF;
  text += '='.repeat(WIDTH) + LF;

  // 8. Footer
  text += ESC + 'a' + '\x01'; // Center
  text += 'Please collect your receipt & food' + LF;
  text += 'Thank you for ordering with us!' + LF;

  // 9. Feed and Cut
  text += LF + LF + LF;
  text += GS + 'V' + '\x41' + '\x03'; // ESC/POS cut

  return Buffer.from(text, 'binary');
}

/**
 * POST /api/printers/print-kiosk-receipt
 * Automatically query active KIOSK printer from PrintMaster and print receipt via TCP
 */
router.post('/print-kiosk-receipt', async (req, res) => {
  try {
    const { order, saleData } = req.body;
    const orderData = order || saleData;

    if (!orderData) {
      return res.status(400).json({ success: false, message: 'Order details required for printing' });
    }

    const pool = await poolPromise;

    // 1. Automatically find the active configured Kiosk printer from PrintMaster (matching Car Wash implementation)
    let targetPrinter = null;
    try {
      const printerRes = await pool.request().query(`
        SELECT TOP 1 
          PrinterId, PrinterName, PrinterPath, PrinterIP, 
          ISNULL(PrinterPort, 9100) AS PrinterPort, PrinterType, KitchenTypeName, IsActive
        FROM PrintMaster
        WHERE IsActive = 1 AND IsEnabled = 1
          AND (PrinterType IN (5, 3) OR KitchenTypeName LIKE '%Kiosk%')
          AND PrinterIP IS NOT NULL AND PrinterIP != ''
        ORDER BY IsActive DESC, PrinterName ASC
      `);
      if (printerRes.recordset && printerRes.recordset.length > 0) {
        targetPrinter = printerRes.recordset[0];
      }

      // Fallback if not found with IsActive=1
      if (!targetPrinter) {
        const fallbackRes = await pool.request().query(`
          SELECT TOP 1 
            PrinterId, PrinterName, PrinterPath, PrinterIP, 
            ISNULL(PrinterPort, 9100) AS PrinterPort, PrinterType, KitchenTypeName, IsActive
          FROM PrintMaster
          WHERE IsEnabled = 1 
            AND (PrinterType IN (5, 3) OR KitchenTypeName LIKE '%Kiosk%')
            AND PrinterIP IS NOT NULL AND PrinterIP != ''
          ORDER BY PrinterType ASC, PrinterName ASC
        `);
        if (fallbackRes.recordset && fallbackRes.recordset.length > 0) {
          targetPrinter = fallbackRes.recordset[0];
        }
      }

      // 2. Fallback: Inherit from Cashier Receipt Printer (matching Car Wash inheritance logic)
      if (!targetPrinter || !targetPrinter.PrinterIP) {
        const cashierRes = await pool.request().query(`
          SELECT TOP 1 
            PrinterId, PrinterName, PrinterPath, PrinterIP, 
            ISNULL(PrinterPort, 9100) AS PrinterPort, PrinterType
          FROM PrintMaster
          WHERE IsActive = 1 AND IsEnabled = 1 AND PrinterType = 1 AND PrinterIP IS NOT NULL AND PrinterIP != ''
        `);
        if (cashierRes.recordset && cashierRes.recordset.length > 0) {
          targetPrinter = cashierRes.recordset[0];
          console.log('[PrinterRoutes] Kiosk inherited printer from Cashier Receipt Printer:', targetPrinter.PrinterIP);
        }
      }

      // 3. Fallback: Check CompanySettings.PrinterIP
      if (!targetPrinter || !targetPrinter.PrinterIP) {
        const compPrnRes = await pool.request().query("SELECT TOP 1 PrinterIP FROM CompanySettings WHERE PrinterIP IS NOT NULL AND PrinterIP != ''");
        if (compPrnRes.recordset && compPrnRes.recordset.length > 0) {
          targetPrinter = {
            PrinterIP: compPrnRes.recordset[0].PrinterIP,
            PrinterPort: 9100,
            PrinterName: 'Company Default Printer'
          };
        }
      }
    } catch (e) {
      console.warn('[PrinterRoutes] Could not query PrintMaster:', e.message);
    }

    if (!targetPrinter || !targetPrinter.PrinterIP) {
      return res.json({
        success: false,
        printedVia: 'NO_KIOSK_PRINTER_CONFIGURED',
        message: 'No active kiosk printer configured in PrintMaster. Please configure a kiosk printer in Settings.',
      });
    }

    const printerIP = targetPrinter.PrinterIP.trim();
    const printerPort = parseInt(targetPrinter.PrinterPort || 9100, 10);
    const printerName = targetPrinter.PrinterName || 'Kiosk Printer';

    // 2. Fetch CompanySettings for brand name, phone, GST
    let company = {};
    try {
      const compRes = await pool.request().query('SELECT TOP 1 * FROM CompanySettings');
      if (compRes.recordset && compRes.recordset.length > 0) {
        company = compRes.recordset[0];
      }
    } catch (compErr) {
      console.warn('[PrinterRoutes] Could not fetch CompanySettings:', compErr.message);
    }

    // 3. Format ESC/POS binary receipt
    const binaryBuffer = buildKioskEscPosReceipt(orderData, company);

    // 4. Send directly over TCP socket
    try {
      await sendToPrinterSocket(printerIP, printerPort, binaryBuffer, 4000);
      console.log(`[PrinterRoutes] Kiosk receipt printed successfully to "${printerName}" (${printerIP}:${printerPort})`);

      return res.json({
        success: true,
        printedVia: 'NETWORK_PRINTER',
        printer: printerName,
        ip: printerIP,
        port: printerPort,
        message: `Kiosk receipt printed automatically on ${printerName}`,
        orderNo: orderData.orderNumber || orderData.orderId,
      });
    } catch (socketErr) {
      console.warn(`[PrinterRoutes] Kiosk printer unreachable at ${printerIP}:${printerPort}: ${socketErr.message}`);
      return res.json({
        success: false,
        printedVia: 'OFFLINE',
        printer: printerName,
        ip: printerIP,
        port: printerPort,
        message: `Kiosk printer unreachable: ${socketErr.message}`,
      });
    }
  } catch (err) {
    console.error('[PrinterRoutes] print-kiosk-receipt error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/printers/test
 * Send a test ticket directly over TCP
 */
router.post('/test', async (req, res) => {
  try {
    const { ip, port = 9100 } = req.body;
    let targetIP = ip;
    let targetPort = port;

    if (!targetIP) {
      const pool = await poolPromise;
      const r = await pool.request().query(`
        SELECT TOP 1 PrinterIP, ISNULL(PrinterPort, 9100) AS PrinterPort 
        FROM PrintMaster 
        WHERE (PrinterType IN (5, 3) OR KitchenTypeName LIKE '%Kiosk%') AND PrinterIP IS NOT NULL AND PrinterIP != ''
      `);
      if (r.recordset.length > 0) {
        targetIP = r.recordset[0].PrinterIP;
        targetPort = r.recordset[0].PrinterPort;
      }
    }

    if (!targetIP) {
      return res.status(400).json({ success: false, message: 'Printer IP address is required' });
    }

    const ESC = '\x1b';
    const GS = '\x1d';
    const LF = '\x0a';

    let text = ESC + '@' + LF;
    text += ESC + 'a' + '\x01';
    text += ESC + '!' + '\x38' + 'TEST PRINT' + LF;
    text += ESC + '!' + '\x00';
    text += 'Printer connection verified OK!' + LF;
    text += `Time: ${new Date().toLocaleString()}` + LF;
    text += LF + LF + LF + GS + 'V' + '\x41' + '\x03';

    const buffer = Buffer.from(text, 'binary');
    await sendToPrinterSocket(ip, port, buffer, 3500);

    res.json({ success: true, message: `Test ticket printed successfully to ${ip}:${port}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

