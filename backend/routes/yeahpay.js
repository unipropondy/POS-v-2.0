// DEMO_2026_PONDY/backend/routes/yeahpay.js

const express = require('express');
const router = express.Router();
const YeahPayService = require('../services/yeahpay.service');  // ✅ Class
const { poolPromise, sql } = require('../config/db');

const FIXED_APP_ID = process.env.APP_ID || 'bin38m42efz4ta6f';

// Helper to resolve deviceSn & salt from DB if not passed
async function resolveTerminalConfig(isCard) {
    try {
        const pool = await poolPromise;
        const targetDesc = isCard ? '%CARD%' : '%PAYNOW%';
        const result = await pool.request()
            .input('pattern', sql.VarChar(50), targetDesc)
            .query(`
                SELECT TOP 1 DeviceSN, DeviceSalt 
                FROM [dbo].[Paymode] 
                WHERE (UPPER(PayMode) LIKE @pattern OR UPPER(Description) LIKE @pattern)
                  AND DeviceSN IS NOT NULL AND LTRIM(RTRIM(DeviceSN)) <> ''
                ORDER BY Position ASC
            `);

        if (result.recordset.length > 0) {
            return {
                deviceSn: (result.recordset[0].DeviceSN || '').trim(),
                salt: (result.recordset[0].DeviceSalt || '').trim()
            };
        }

        // Fallback: any paymode with DeviceSN configured
        const fallback = await pool.request().query(`
            SELECT TOP 1 DeviceSN, DeviceSalt 
            FROM [dbo].[Paymode] 
            WHERE DeviceSN IS NOT NULL AND LTRIM(RTRIM(DeviceSN)) <> ''
            ORDER BY Position ASC
        `);

        if (fallback.recordset.length > 0) {
            return {
                deviceSn: (fallback.recordset[0].DeviceSN || '').trim(),
                salt: (fallback.recordset[0].DeviceSalt || '').trim()
            };
        }
    } catch (e) {
        console.error('Error fetching terminal config from Paymode table:', e.message);
    }
    return { deviceSn: '', salt: '' };
}

// ✅ CREATE INSTANCE with config
const yeahpayService = new YeahPayService();

function broadcastTerminalStatus(io, tableId, amount, isCard, result, isSplit, splitRowId) {
    if (!io) return;
    const targetTableId = tableId || "COUNTER";
    
    let status = "failed";
    let message = "";
    const responseCode = result.code;
    
    if (result.success || responseCode === 0) {
        status = "success";
        message = `✅ $${parseFloat(amount).toFixed(2)} paid successfully`;
    } else if (responseCode === -1027) {
        status = "cancelled";
        message = `❌ Transaction cancelled on terminal`;
    } else if (responseCode === -1028 || responseCode === -1008) {
        status = "failed";
        message = `⏰ Transaction timeout`;
    } else {
        status = "failed";
        message = `❌ ${result.msg || result.error || 'Payment declined'}`;
    }

    console.log(`🔌 [Server] Broadcasting terminal sync for Table ${targetTableId} → Status: ${status}`);
    io.emit("terminal_payment_sync", {
        tableId: targetTableId,
        session: {
            tableId: targetTableId,
            status,
            message,
            method: isCard ? 'YEAHPAY CARD' : 'YEAHPAY PAYNOW',
            total: parseFloat(amount) || 0,
            isSplit: !!isSplit,
            splitRowId
        }
    });
}

// YeahPay PayNow Payment
router.post('/paynow-payment', async (req, res) => {
    try {
        let { amount, deviceSn, salt, tableId, isSplit, splitRowId } = req.body;
        
        if (!deviceSn) {
            const config = await resolveTerminalConfig(false);
            deviceSn = config.deviceSn;
            salt = config.salt;
        }

        console.log('📱 YeahPay PayNow:', { amount, deviceSn, salt: salt ? 'Yes' : 'No', tableId });
        
        if (!deviceSn) {
            return res.status(400).json({ 
                success: false, 
                code: -1, 
                msg: 'DeviceSN is not configured in Paymode table' 
            });
        }
        
        // ✅ Call method on INSTANCE
        const result = await yeahpayService.processPayNowPayment({
            amount, 
            deviceSn, 
            salt, 
            appId: FIXED_APP_ID
        });
        
        console.log('📤 YeahPay Result:', result);
        
        // Broadcast the status via socket
        broadcastTerminalStatus(req.io, tableId, amount, false, result, isSplit, splitRowId);
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ YeahPay Error:', error);
        
        const failResult = { success: false, code: -1, msg: error.message };
        broadcastTerminalStatus(req.io, req.body.tableId, req.body.amount, false, failResult, req.body.isSplit, req.body.splitRowId);
        
        res.status(500).json(failResult);
    }
});

// YeahPay Card Payment
router.post('/card-payment', async (req, res) => {
    try {
        let { amount, deviceSn, salt, tableId, isSplit, splitRowId } = req.body;
        
        if (!deviceSn) {
            const config = await resolveTerminalConfig(true);
            deviceSn = config.deviceSn;
            salt = config.salt;
        }

        console.log('💳 YeahPay Card:', { amount, deviceSn, tableId });
        
        if (!deviceSn) {
            return res.status(400).json({ 
                success: false, 
                code: -1, 
                msg: 'DeviceSN is not configured in Paymode table' 
            });
        }
        
        // ✅ Call method on INSTANCE
        const result = await yeahpayService.processCardPayment({
            amount, 
            deviceSn, 
            salt, 
            appId: FIXED_APP_ID
        });
        
        // Broadcast the status via socket
        broadcastTerminalStatus(req.io, tableId, amount, true, result, isSplit, splitRowId);
        
        res.json(result);
    } catch (error) {
        const failResult = { success: false, code: -1, msg: error.message };
        broadcastTerminalStatus(req.io, req.body.tableId, req.body.amount, true, failResult, req.body.isSplit, req.body.splitRowId);
        
        res.status(500).json(failResult);
    }
});

// Generic Kiosk /pay endpoint alias mapping to paynow or card
router.post('/pay', async (req, res) => {
    try {
        const { amount, action, payWay, tableId } = req.body;
        const isCard = payWay === "CARD" || (action && action.includes("CARD"));
        
        let config = await resolveTerminalConfig(isCard);
        if (!config.deviceSn) {
            return res.status(400).json({
                success: false,
                code: -1,
                msg: "DeviceSN not found in Paymode configuration"
            });
        }

        let result;
        if (isCard) {
            result = await yeahpayService.processCardPayment({
                amount,
                deviceSn: config.deviceSn,
                salt: config.salt,
                appId: FIXED_APP_ID
            });
        } else {
            result = await yeahpayService.processPayNowPayment({
                amount,
                deviceSn: config.deviceSn,
                salt: config.salt,
                appId: FIXED_APP_ID
            });
        }

        broadcastTerminalStatus(req.io, tableId, amount, isCard, result, false, null);
        res.json(result);
    } catch (error) {
        console.error("❌ YeahPay /pay Error:", error);
        res.status(500).json({ success: false, code: -1, msg: error.message });
    }
});

// Generic Kiosk /query endpoint
router.post('/query', async (req, res) => {
    res.json({ success: true, status: 104, msg: "Payment verified" });
});

// Generic Kiosk /cancel endpoint
router.post('/cancel', async (req, res) => {
    res.json({ success: true, msg: "Payment cancelled" });
});

module.exports = router;
