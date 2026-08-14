// DEMO_2026_PONDY/backend/services/payment.service.js

const sql = require("mssql");
const config = require('../config');
const YeahPayService = require('./yeahpay.service');

async function processSplitPayments({
  referenceType,
  referenceId,
  payments,
  transaction,
  businessUnitId = null,
  cashierId = null,
  orderId = null,
  now = new Date(),
  receiptCount = 0
}) {
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    throw new Error("Payments array is required and cannot be empty.");
  }

  // 1️⃣ Fetch paymode config
  const paymodeRequest = new sql.Request(transaction);
  const paymodesRes = await paymodeRequest.query(`
    SELECT 
      Position, 
      PayMode, 
      Description,
      DeviceSN,
      DeviceSalt,
      YeahPayEnabled,
      Active
    FROM [dbo].[Paymode] 
    WHERE Active = 1
  `);
  const activePaymodes = paymodesRes.recordset;

  // 2️⃣ Process each payment
  for (const payment of payments) {
    const amount = parseFloat(payment.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    // Resolve paymode
    let dbPaymode = activePaymodes.find(pm => 
      pm.Position === Number(payment.payModeId) || 
      String(pm.PayMode).trim().toUpperCase() === String(payment.payModeId || payment.payMode || "").trim().toUpperCase()
    );

    if (!dbPaymode) {
      throw new Error(`Invalid or inactive payment mode specified: ${payment.payModeId || payment.payMode}`);
    }

    const payModeId = dbPaymode.Position;
    const payModeName = dbPaymode.PayMode;
    const referenceNo = payment.referenceNo || payment.referenceNumber || null;

    // ============================================================
    // 🆕 CHECK: Is YeahPay enabled?
    // ============================================================
    let gatewayResponse = null;
    let gatewayReferenceNo = null;
    let isYeahPay = false;

    // ✅✅✅ CRITICAL CHECK - YeahPay Enabled?
    if (dbPaymode.YeahPayEnabled && dbPaymode.DeviceSN) {
      
      isYeahPay = true;
      console.log(`🔄 [YEAHPAY] 🔥🔥🔥 YeahPay ENABLED for ${payModeName}`);
      console.log(`🔄 [YEAHPAY] DeviceSN: ${dbPaymode.DeviceSN}`);
      console.log(`🔄 [YEAHPAY] Amount: ${amount}`);
      console.log(`🔄 [YEAHPAY] ReferenceId: ${referenceId}`);
      
      // ✅ Validate DeviceSalt
      if (!dbPaymode.DeviceSalt) {
        throw new Error(`DeviceSalt not configured for ${payModeName}`);
      }

      // ✅ CREATE YEAHPAY SERVICE
      const yeahpay = new YeahPayService({
        appId: config.appId,
        deviceSn: dbPaymode.DeviceSN,
        secret: dbPaymode.DeviceSalt,
        syncApiUrl: config.syncApiUrl,
        asyncApiUrl: config.asyncApiUrl,
        serverPublicKeyPem: config.serverPublicKeyPem,
        clientPrivateKeyPem: config.clientPrivateKeyPem
      });

      // ✅ DETERMINE ACTION
      let action;
      if (payModeName.toLowerCase().includes('paynow')) {
        action = 'TRADE.QRCODE.PayNowPay';
        console.log(`🔄 [YEAHPAY] Action: PayNow Payment`);
      } else if (payModeName.toLowerCase().includes('card')) {
        action = 'TRADE.CARD.CONSUME';
        console.log(`🔄 [YEAHPAY] Action: Card Payment`);
      } else {
        throw new Error(`YeahPay not supported for ${payModeName}`);
      }

      // ✅✅✅ CALL YEAHPAY API
      try {
        console.log(`🔄 [YEAHPAY] 🚀🚀🚀 Calling YeahPay API...`);
        console.log(`🔄 [YEAHPAY] Action: ${action}`);
        console.log(`🔄 [YEAHPAY] Amount: ${amount}`);
        console.log(`🔄 [YEAHPAY] bizOrderId: ${referenceId}`);
        
if (payModeName.toLowerCase().includes('paynow')) {
    gatewayResponse = await yeahpay.processPayNowPayment({
        amount: amount,
        deviceSn: dbPaymode.DeviceSN,
        salt: dbPaymode.DeviceSalt,
        appId: config.appId
    });
} else if (payModeName.toLowerCase().includes('card')) {
    gatewayResponse = await yeahpay.processCardPayment({
        amount: amount,
        deviceSn: dbPaymode.DeviceSN,
        salt: dbPaymode.DeviceSalt,
        appId: config.appId
    });
}

        console.log(`✅ [YEAHPAY] Response received:`, JSON.stringify(gatewayResponse));

        // ✅ Extract reference number
        if (gatewayResponse.data?.tradeCardResponse?.referenceNo) {
          gatewayReferenceNo = gatewayResponse.data.tradeCardResponse.referenceNo;
        } else if (gatewayResponse.data?.tradeScanPaymentResponse?.orderId) {
          gatewayReferenceNo = gatewayResponse.data.tradeScanPaymentResponse.orderId;
        }

        // ✅ Log to PaymentGatewayTransactions
        await logGatewayTransaction({
          settlementId: referenceType === 'BILL' ? referenceId : null,
          memberId: referenceType === 'MEMBER' ? referenceId : null,
          payModeId,
          deviceSn: dbPaymode.DeviceSN,
          requestPayload: JSON.stringify({ action, amount, bizOrderId: referenceId }),
          responsePayload: JSON.stringify(gatewayResponse),
          responseCode: gatewayResponse.responseCode || gatewayResponse.code,
          responseMsg: gatewayResponse.error || gatewayResponse.data?.msg,
          status: gatewayResponse.success ? 'SUCCESS' : 'FAILED'
        }, transaction);

        // ❌ If gateway fails
        // After getting gatewayResponse:

if (!gatewayResponse.success) {
    const errorCode = gatewayResponse.code || gatewayResponse.responseCode;
    const errorMsg = gatewayResponse.msg || gatewayResponse.error || 'Payment declined';
    
    // ✅ Handle cancellation separately
    if (errorCode === -1027) {
        console.log(`ℹ️ [YEAHPAY] Transaction cancelled by user on terminal`);
        throw new Error('Transaction cancelled on terminal. Please try again.');
    }
    
    // ✅ Handle timeout
    if (errorCode === -1028 || errorCode === -1008 || errorCode === 50003) {
        console.log(`⏰ [YEAHPAY] Transaction timeout`);
        throw new Error('Transaction timed out. Please check terminal connection.');
    }
    
    // ✅ Handle other errors
    console.error(`❌ [YEAHPAY] Failed: ${errorMsg} (${errorCode})`);
    throw new Error(errorMsg || 'Payment gateway declined transaction');
}

        console.log(`✅ [YEAHPAY] 🎉🎉🎉 SUCCESS! Reference: ${gatewayReferenceNo}`);

      } catch (apiError) {
        console.error(`❌ [YEAHPAY] API Error:`, apiError.message);
        console.error(`❌ [YEAHPAY] Full Error:`, apiError);

        await logGatewayTransaction({
          settlementId: referenceType === 'BILL' ? referenceId : null,
          memberId: referenceType === 'MEMBER' ? referenceId : null,
          payModeId,
          deviceSn: dbPaymode.DeviceSN,
          requestPayload: JSON.stringify({ action, amount, bizOrderId: referenceId }),
          responsePayload: JSON.stringify({ error: apiError.message }),
          responseCode: -1,
          responseMsg: apiError.message,
          status: 'FAILED'
        }, transaction);

        throw apiError;
      }
    } else {
      console.log(`ℹ️ [YEAHPAY] NOT enabled for ${payModeName}`);
      console.log(`   YeahPayEnabled: ${dbPaymode.YeahPayEnabled}`);
      console.log(`   DeviceSN: ${dbPaymode.DeviceSN || 'NULL'}`);
    }

    // ============================================================
    // 3️⃣ ALWAYS save to PaymentTransactionDetails (REMOVED extra columns)
    // ============================================================
    const detailReq = new sql.Request(transaction);
    detailReq
      .input("ReferenceType", sql.NVarChar(50), referenceType)
      .input("ReferenceId", sql.UniqueIdentifier, referenceId)
      .input("PayModeId", sql.Int, payModeId)
      .input("Amount", sql.Decimal(18, 2), amount)
      .input("ReferenceNo", sql.NVarChar(100), gatewayReferenceNo || referenceNo)
      .input("CreatedBy", sql.UniqueIdentifier, cashierId);

    await detailReq.query(`
      INSERT INTO [dbo].[PaymentTransactionDetails] (
        PaymentTransactionId, ReferenceType, ReferenceId, PayModeId, Amount, 
        ReferenceNo, CreatedDate, CreatedBy
      ) VALUES (
        NEWID(), @ReferenceType, @ReferenceId, @PayModeId, @Amount, 
        @ReferenceNo, GETDATE(), @CreatedBy
      )
    `);

    // ============================================================
    // 4️⃣ If BILL, write to legacy tables
    // ============================================================
    if (referenceType === 'BILL') {
      // Fetch active business start_date
      let startDate = null;
      const activeDayRes = await transaction.request().query("SELECT TOP 1 StartDate FROM DateEntry ORDER BY CreatedDate DESC");
      if (activeDayRes.recordset.length > 0) {
        startDate = activeDayRes.recordset[0].StartDate;
      }

      const legacyReq = new sql.Request(transaction);

      await legacyReq
        .input("RestaurantBillId", sql.UniqueIdentifier, referenceId)
        .input("PaymentOrderId", sql.UniqueIdentifier, orderId)
        .input("BilledFor", sql.Int, 1)
        .input("PaymentType", sql.Int, 1)
        .input("Paymode", sql.Int, payModeId)
        .input("Amount", sql.Decimal(18, 2), amount)
        .input("ReferenceNo", sql.VarChar(100), gatewayReferenceNo || referenceNo)
        .input("Remarks", sql.VarChar(500), payModeName + (gatewayResponse ? ' (Gateway)' : ''))
        .input("BusinessUnitId", sql.UniqueIdentifier, businessUnitId)
        .input("CreatedBy", sql.UniqueIdentifier, cashierId)
        .input("startDate", sql.Date, startDate)
        .query(`
          DECLARE @PayId UNIQUEIDENTIFIER = NEWID();

          INSERT INTO [dbo].[PaymentDetailCur] (
            PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn,
            PaymentType, Paymode, Amount, ReferenceNumber, Remarks,
            BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, start_date
          ) VALUES (
            @PayId, @RestaurantBillId, @BilledFor, GETDATE(),
            @PaymentType, @Paymode, @Amount, @ReferenceNo, @Remarks,
            @BusinessUnitId, @CreatedBy, GETDATE(), @CreatedBy, GETDATE(), @startDate
          );

          INSERT INTO [dbo].[PaymentDetail] (
            PaymentId, RestaurantBillId, SettlementId, InvoiceId, OrderId,
            BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount,
            ReferenceNumber, Remarks, BusinessUnitId,
            CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, isSettlement, start_date
          ) VALUES (
            @PayId, @RestaurantBillId, @RestaurantBillId, @RestaurantBillId, @PaymentOrderId,
            @BilledFor, GETDATE(), @PaymentType, @Paymode, @Amount,
            @ReferenceNo, @Remarks, @BusinessUnitId,
            @CreatedBy, GETDATE(), @CreatedBy, GETDATE(), 1, @startDate
          );
        `);

      // ============================================================
      // 5️⃣ Update Settlement tables
      // ============================================================
      const settReq = new sql.Request(transaction);
      settReq
        .input("SettlementID", sql.UniqueIdentifier, referenceId)
        .input("PayMode", sql.VarChar(50), payModeName)
        .input("SysAmount", sql.Money, amount)
        .input("ManualAmount", sql.Money, amount)
        .input("AmountDiff", sql.Money, 0)
        .input("ReceiptCount", sql.Numeric(18, 0), receiptCount)
        .input("GatewayReference", sql.NVarChar(100), gatewayReferenceNo);

      let settlementSql = `
        INSERT INTO SettlementTotalSales (
          SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount, GatewayReference
        ) VALUES (
          @SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount, @GatewayReference
        );

        INSERT INTO [dbo].[SettlementDetail] (
          SettlementId, Paymode, SysAmount, ManualAmount, SortageOrExces, ReceiptCount, IsCollected
        ) VALUES (
          @SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount, 0
        );

        INSERT INTO SettlementTranDetail (
          SettlementID, PayMode, CashIn, CashOut
        ) VALUES (
          @SettlementID, @PayMode, @SysAmount, 0
        );
      `;

      if (payModeName.toUpperCase().trim() === 'CREDIT' || payModeName.toUpperCase().trim() === 'MEMBER') {
        settlementSql += `
          INSERT INTO SettlementCreditSales (
            SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff
          ) VALUES (
            @SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff
          );
        `;
      }

      await settReq.query(settlementSql);
    }
  }
}

// ============================================================
// LOG GATEWAY TRANSACTION
// ============================================================
async function logGatewayTransaction(data, transaction) {
  const request = new sql.Request(transaction);
  await request
    .input('SettlementId', sql.UniqueIdentifier, data.settlementId || null)
    .input('MemberId', sql.UniqueIdentifier, data.memberId || null)
    .input('PayModeId', sql.Int, data.payModeId)
    .input('DeviceSN', sql.NVarChar(100), data.deviceSn)
    .input('RequestPayload', sql.NVarChar(sql.MAX), data.requestPayload || '')
    .input('ResponsePayload', sql.NVarChar(sql.MAX), data.responsePayload || '')
    .input('ResponseCode', sql.Int, data.responseCode)
    .input('ResponseMsg', sql.NVarChar(500), data.responseMsg || '')
    .input('Status', sql.NVarChar(20), data.status)
    .query(`
      INSERT INTO PaymentGatewayTransactions (
        SettlementId, MemberId, PayModeId, DeviceSN,
        RequestPayload, ResponsePayload, ResponseCode, ResponseMsg, Status,
        RequestTime, ResponseTime
      ) VALUES (
        @SettlementId, @MemberId, @PayModeId, @DeviceSN,
        @RequestPayload, @ResponsePayload, @ResponseCode, @ResponseMsg, @Status,
        GETDATE(), GETDATE()
      )
    `);
}

module.exports = {
  processSplitPayments
};