const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");

// ===== TOTAL SALES =====
router.get("/total-sales/:terminal", async (req, res) => {
  try {
    console.log("🔥🔥🔥 TOTAL SALES ROUTE HIT NEW FILE");
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    let dateFilter = "start_date = CAST(GETDATE() AS DATE)";

    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }
    console.log("🔥🔥🔥 TOTAL SALES ROUTE HIT NEW FILE,fromDate", fromDate);
    console.log("🔥🔥🔥 TOTAL SALES ROUTE HIT NEW FILE,toDate", toDate);
    const result = await request.query(`
      SELECT
        ISNULL(SUM(sh.SubTotal),0) AS SubTotal,
        ISNULL(SUM(sh.DiscountAmount),0) AS DiscountAmount,
        ISNULL(SUM(sh.ServiceCharge),0) AS ServiceCharge,
        ISNULL(SUM(ric.AdditionalServiceCharge),0) AS AdditionalServiceCharge,
        ISNULL(SUM(sh.TakeawayCharge),0) AS TakeawayCharge,
        ISNULL(SUM(sh.TotalTax),0) AS TotalTax,
        ISNULL(SUM(sh.RoundedBy),0) AS RoundedBy,
        ISNULL(SUM(ric.Tips),0) AS Tips,
        COUNT(sh.SettlementID) AS InvoiceCount,
        ISNULL(SUM(sh.SysAmount),0) AS NetTotal
      FROM RestaurantInvoiceCur ric
      INNER JOIN SettlementHeader sh ON ric.RestaurantBillId = sh.SettlementID
      WHERE ric.StatusCode <> 4 
        AND (sh.IsCancelled = 0 OR sh.IsCancelled IS NULL)
        AND ric.RestaurantBillId IN (
            SELECT RestaurantBillId 
            FROM RestaurantInvoiceCur
            WHERE ${dateFilter}
        )
    `);
    const data = result.recordset[0] || {};
    console.log("🔥 TOTAL SALES API =>", data);
    res.json(data);
  } catch (err) {
    console.error("❌ TOTAL SALES ERROR:", err);
    res.status(500).send(err.message);
  }
});

// ===== PAYMENT DETAILS =====
router.get("/payment/:terminal/:userId", async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    request.input("TerminalCode", sql.VarChar, req.params.terminal);
    request.input("UserId", sql.VarChar, req.params.userId);

    let dateFilter = "start_date = CAST(GETDATE() AS DATE)";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    // Fetch active bill payments — EXCLUDE CREDIT paymode (deferred/unpaid, not cash received)
    const billsResult = await request.query(`
      SELECT
        LTRIM(RTRIM(ISNULL(Remarks, ''))) AS PaymodeName,
        ISNULL(SUM(Amount), 0) AS Amount,
        COUNT(*) AS PayCount
      FROM PaymentDetailCur
      WHERE ${dateFilter}
        AND UPPER(LTRIM(RTRIM(ISNULL(Remarks, '')))) NOT IN ('CREDIT', 'MEMBER')
        AND (RestaurantBillId IS NULL OR RestaurantBillId NOT IN (
            SELECT RestaurantBillId 
            FROM RestaurantInvoiceCur 
            WHERE StatusCode = 4 AND RestaurantBillId IS NOT NULL
        ))
      GROUP BY LTRIM(RTRIM(ISNULL(Remarks, '')))
    `);

    // Fetch credit outstanding & issued amounts separately for Credit Activity tracking
    const creditOutstandingResult = await request.query(`
      SELECT
        ISNULL(CustomerType, 'CREDIT') AS PaymodeName,
        ISNULL(SUM(OutstandingAmount), 0) AS Amount,
        ISNULL(SUM(BillAmount), 0) AS BilledAmount,
        ISNULL(SUM(PaidAmount), 0) AS PaidAmount,
        COUNT(*) AS PayCount
      FROM CustomerCreditTransactions
      WHERE TransactionType = 'CREDIT_SALE'
        AND ${dateFilter.replace(/start_date/g, 'COALESCE(start_date, CAST(CreatedDate AS DATE))')}
      GROUP BY ISNULL(CustomerType, 'CREDIT')
    `);

    // Fetch non-cash ledger collections (e.g. PAYNOW, NETS, CARD paid on receivables screen)
    const ledgerResult = await request.query(`
      SELECT
        pm.PayMode AS PaymodeName,
        ISNULL(SUM(ptd.Amount), 0) AS Amount,
        COUNT(*) AS PayCount
      FROM PaymentTransactionDetails ptd
      INNER JOIN Paymode pm ON ptd.PayModeId = pm.Position
      WHERE ptd.ReferenceType = 'MEMBER'
        AND UPPER(pm.PayMode) NOT LIKE '%CASH%'
        AND ${dateFilter.replace(/start_date/g, 'CAST(ptd.CreatedDate AS DATE)')}
      GROUP BY pm.PayMode
    `);

    const normalizePayMode = (paymentMethod = "CASH") => {
      const raw = String(paymentMethod || "CASH").toUpperCase().trim();
      if (raw === "Q-R" || raw === "Q.R.") return "QR";
      if (raw === "PAY_NOW") return "PAYNOW";
      if (raw === "U-P-I") return "UPI";
      if (raw === "G-PAY") return "GPAY";
      if (raw === "P-H-O-N-E") return "PHONE";
      if (raw === "P-A-Y-T-M") return "PAYTM";
      if (raw === "CASH" || raw === "CAS" || raw === "1") return "CASH";
      if (raw.includes("CARD") || raw.includes("VISA") || raw.includes("MASTER") || raw.includes("AMEX") || raw.includes("DINERS")) return "CARD";
      if (raw.includes("PAYNOW") || raw.includes("GRAB") || raw.includes("FOODPANDA") || raw === "3" || raw.includes("PAY NOW")) return "PAYNOW";
      if (raw.includes("UPI") || raw === "4" || raw.includes("GPAY") || raw.includes("PHONE") || raw.includes("PAYTM")) return "UPI";
      if (raw.includes("NETS") || raw === "2") return "NETS";
      if (raw.includes("MEMBER") || raw === "5") return "MEMBER";
      if (raw.includes("CREDIT") || raw === "6") return "CREDIT";
      return raw;
    };

    // Aggregate cash/non-cash movements (excludes CREDIT deferred payments)
    const aggregated = {};
    
    // 1. Process direct checkout payments
    (billsResult.recordset || []).forEach(row => {
      const normName = normalizePayMode(row.PaymodeName);
      if (!aggregated[normName]) {
        aggregated[normName] = {
          PaymodeName: normName,
          Amount: 0,
          PayCount: 0
        };
      }
      aggregated[normName].Amount += parseFloat(row.Amount) || 0;
      aggregated[normName].PayCount += parseInt(row.PayCount, 10) || 0;
    });

    // 2. Process non-cash ledger payments separately (prefixed so they don't merge)
    (ledgerResult.recordset || []).forEach(row => {
      const normName = normalizePayMode(row.PaymodeName);
      const ledgerName = `Credit Settlement - ${normName}`;
      if (!aggregated[ledgerName]) {
        aggregated[ledgerName] = {
          PaymodeName: ledgerName,
          Amount: 0,
          PayCount: 0
        };
      }
      aggregated[ledgerName].Amount += parseFloat(row.Amount) || 0;
      aggregated[ledgerName].PayCount += parseInt(row.PayCount, 10) || 0;
    });

    // Aggregate credit outstanding (deferred bills — shown separately on screen, NOT in total movements)
    const creditAggregated = {};
    (creditOutstandingResult.recordset || []).forEach(row => {
      const normName = normalizePayMode(row.PaymodeName);
      if (!creditAggregated[normName]) {
        creditAggregated[normName] = { 
          PaymodeName: normName, 
          Amount: 0, 
          BilledAmount: 0,
          PaidAmount: 0,
          PayCount: 0 
        };
      }
      creditAggregated[normName].Amount += parseFloat(row.Amount) || 0;
      creditAggregated[normName].BilledAmount += parseFloat(row.BilledAmount) || 0;
      creditAggregated[normName].PaidAmount += parseFloat(row.PaidAmount) || 0;
      creditAggregated[normName].PayCount += parseInt(row.PayCount, 10) || 0;
    });

    res.json({
      payments: Object.values(aggregated),
      creditOutstanding: Object.values(creditAggregated)
    });

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== TRANSACTIONS =====
router.get("/transactions/:terminal/:userId", async (req, res) => {
  try {
    // [TEMP FIX]: Commenting this out because the 'Transactions' table is missing,
    // which was causing the tedious driver to throw a fatal unhandled rejection stream error
    /*
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TerminalCode", sql.VarChar, req.params.terminal)
      .input("UserId", sql.VarChar, req.params.userId)
      .query(`SELECT 
              ISNULL(TransactionMode,'') AS TransactionMode,
              ISNULL(TransactionType,'') AS TransactionType,
              ISNULL(Amount,0) AS Amount
              FROM Transactions
              WHERE TerminalCode = @TerminalCode
         AND UserId = @UserId
      `);

    res.json(result.recordset || []);
    */

    res.json([]);

  } catch (err) {
    console.error("❌ TRANSACTION ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== SALES SUMMARY =====
router.get("/sales-summary/:terminal", async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();
    request.input("TerminalCode", sql.VarChar, req.params.terminal);

    let dateFilter = "";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `AND start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    const result = await request.query(`
             SELECT 
          ISNULL(Paymode,'') AS Paymode,
          ISNULL(SUM(Amount),0) AS Amount
        FROM PaymentDetailCur
        WHERE TerminalCode = @TerminalCode
        AND isSettlement = 0
        AND (RestaurantBillId IS NULL OR RestaurantBillId NOT IN (
            SELECT RestaurantBillId 
            FROM RestaurantInvoiceCur 
            WHERE StatusCode = 4 AND RestaurantBillId IS NOT NULL
        ))
        ${dateFilter}
        GROUP BY Paymode 
      `);

    res.json(result.recordset || []);

  } catch (err) {
    console.error("❌ SALES SUMMARY ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== CHECK PENDING ORDERS =====
router.get("/pending-orders", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT * FROM RestaurantOrderCur
      WHERE StatusCode < 5
    `);

    res.json({
      hasPending: result.recordset.length > 0,
      data: result.recordset
    });

  } catch (err) {
    console.error("❌ PENDING ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== SAVE SETTLEMENT =====
router.post("/settlement", async (req, res) => {
  const { terminal, userId } = req.body;

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    const request = new sql.Request(transaction);

    // HEADER
    const result = await request
      .input("TerminalCode", sql.VarChar, terminal)
      .input("UserId", sql.VarChar, userId)
      .query(`
        INSERT INTO SettlementHeader (
          SettlementId,
          TerminalCode,
          CreatedBy,
          CreatedOn
        )
        OUTPUT INSERTED.SettlementId
        VALUES (NEWID(), @TerminalCode, @UserId, GETDATE())
      `);

    const settlementId = result.recordset[0].SettlementId;

    // UPDATE ONLY THIS TERMINAL
    await request
      .input("TerminalCode", sql.VarChar, terminal)
      .query(`
        UPDATE PaymentDetailCur
        SET isSettlement = 1
        WHERE isSettlement = 0
        AND TerminalCode = @TerminalCode
      `);

    await transaction.commit();

    // Notify all connected clients to refresh settlement data
    const io = req.app.get('io');
    if (io) io.emit('settlement_updated', { action: 'settlement_saved' });

    res.json({
      message: "Settlement Completed ✅",
      settlementId
    });

  } catch (err) {
    console.error("❌ SETTLEMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== LAST SETTLEMENT =====
router.get("/last-settlement/:terminal", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TerminalCode", sql.VarChar, req.params.terminal)
      .query(`
        SELECT 
          ISNULL(MAX(CreatedOn), DATEADD(DAY,-1,GETDATE())) AS LastSettlementDate
        FROM SettlementHeader
        WHERE TerminalCode = @TerminalCode
      `);

    res.json(result.recordset[0]);

  } catch (err) {
    console.error("❌ LAST SETTLEMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== TERMINAL LIST =====
router.get("/terminals", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TerminalCode, TerminalName FROM TerminalMaster
    `);

    console.log("🔥 TERMINALS FROM DB 👉", result.recordset);

    res.json(result.recordset);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

module.exports = router;
