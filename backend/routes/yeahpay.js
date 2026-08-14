// DEMO_2026_PONDY/backend/routes/yeahpay.js

const express = require('express');
const router = express.Router();
const YeahPayService = require('../services/yeahpay.service');  // ✅ Class

const FIXED_APP_ID = process.env.APP_ID || '';

// ✅ CREATE INSTANCE with config
const yeahpayService = new YeahPayService();

// YeahPay PayNow Payment
router.post('/paynow-payment', async (req, res) => {
    try {
        const { amount, deviceSn, salt } = req.body;
        
        console.log('📱 YeahPay PayNow:', { amount, deviceSn, salt: salt ? 'Yes' : 'No' });
        
        if (!deviceSn) {
            return res.status(400).json({ 
                success: false, 
                code: -1, 
                msg: 'DeviceSN is required' 
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
        res.json(result);
        
    } catch (error) {
        console.error('❌ YeahPay Error:', error);
        res.status(500).json({ 
            success: false, 
            code: -1, 
            msg: error.message 
        });
    }
});

// YeahPay Card Payment
router.post('/card-payment', async (req, res) => {
    try {
        const { amount, deviceSn, salt } = req.body;
        
        console.log('💳 YeahPay Card:', { amount, deviceSn });
        
        if (!deviceSn) {
            return res.status(400).json({ 
                success: false, 
                code: -1, 
                msg: 'DeviceSN is required' 
            });
        }
        
        // ✅ Call method on INSTANCE
        const result = await yeahpayService.processCardPayment({
            amount, 
            deviceSn, 
            salt, 
            appId: FIXED_APP_ID
        });
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, code: -1, msg: error.message });
    }
});

module.exports = router;
