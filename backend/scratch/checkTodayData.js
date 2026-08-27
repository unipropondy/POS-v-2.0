require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { poolPromise } = require("../config/db");

async function checkTodayData() {
  const pool = await poolPromise;

  // Compute today in SGT (UTC+8)
  const now = new Date();
  const sgtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = sgtNow.getUTCFullYear();
  const mm   = String(sgtNow.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(sgtNow.getUTCDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  const start = `${today} 00:00:00`;
  const end   = `${today} 23:59:59.999`;

  console.log(`\n📅 Checking data for: ${today} (SGT)\n`);
  console.log("=".repeat(55));

  const checks = [
    // Sales / Settlement tables
    { name: "SettlementHeader",           q: `SELECT COUNT(*) c FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}'` },
    { name: "SettlementItemDetail",       q: `SELECT COUNT(*) c FROM SettlementItemDetail WHERE SettlementID IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    { name: "SettlementDetail",           q: `SELECT COUNT(*) c FROM SettlementDetail WHERE SettlementId IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    { name: "SettlementTranDetail",       q: `SELECT COUNT(*) c FROM SettlementTranDetail WHERE SettlementID IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    { name: "SettlementTotalSales",       q: `SELECT COUNT(*) c FROM SettlementTotalSales WHERE SettlementID IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    { name: "SettlementCreditSales",      q: `SELECT COUNT(*) c FROM SettlementCreditSales WHERE SettlementID IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    { name: "SettlementDiscountDetail",   q: `SELECT COUNT(*) c FROM SettlementDiscountDetail WHERE SettlementID IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    { name: "RestaurantInvoice",          q: `SELECT COUNT(*) c FROM RestaurantInvoice WHERE RestaurantBillId IN (SELECT SettlementID FROM SettlementHeader WHERE LastSettlementDate >= '${start}' AND LastSettlementDate <= '${end}')` },
    // Credit ledger
    { name: "CustomerCreditTransactions", q: `SELECT COUNT(*) c FROM CustomerCreditTransactions WHERE CreatedDate >= '${start}' AND CreatedDate <= '${end}'` },
    { name: "CustomerCreditAllocations",  q: `SELECT COUNT(*) c FROM CustomerCreditAllocations WHERE InvoiceTransactionId IN (SELECT TransactionId FROM CustomerCreditTransactions WHERE CreatedDate >= '${start}' AND CreatedDate <= '${end}')` },
    // Payment tables
    { name: "PaymentDetailCur",           q: `SELECT COUNT(*) c FROM PaymentDetailCur WHERE start_date = '${today}'` },
    { name: "PaymentDetail",              q: `SELECT COUNT(*) c FROM PaymentDetail WHERE start_date = '${today}'` },
    { name: "PaymentTransactionDetails",  q: `SELECT COUNT(*) c FROM PaymentTransactionDetails WHERE CreatedDate >= '${start}' AND CreatedDate <= '${end}'` },
    // Invoice
    { name: "RestaurantInvoiceCur",       q: `SELECT COUNT(*) c FROM RestaurantInvoiceCur WHERE start_date = '${today}'` },
    // Cash drawer / session
    { name: "CashDrawerLog",              q: `SELECT COUNT(*) c FROM CashDrawerLog WHERE CreatedOn >= '${start}' AND CreatedOn <= '${end}'` },
    { name: "CashInEntry",                q: `SELECT COUNT(*) c FROM CashInEntry WHERE COALESCE(start_date, CAST(CashInDate AS DATE)) = '${today}'` },
    { name: "CashOutEntry",               q: `SELECT COUNT(*) c FROM CashOutEntry WHERE COALESCE(start_date, CAST(CashOutDate AS DATE)) = '${today}'` },
    { name: "settlement (session)",       q: `SELECT COUNT(*) c FROM settlement WHERE SettlementDate = '${today}'` },
    { name: "OpeningCashDenomination",    q: `SELECT COUNT(*) c FROM OpeningCashDenomination WHERE CAST(CreatedOn AS DATE) = '${today}'` },
  ];

  let allClear = true;
  for (const { name, q } of checks) {
    try {
      const r = await pool.request().query(q);
      const count = r.recordset[0].c;
      const icon  = count === 0 ? "✅" : "❌";
      const label = count === 0 ? "CLEAR" : `${count} rows REMAINING`;
      console.log(`${icon}  ${name.padEnd(30)} ${label}`);
      if (count > 0) allClear = false;
    } catch (e) {
      console.log(`⚠️  ${name.padEnd(30)} ERROR: ${e.message}`);
    }
  }

  console.log("=".repeat(55));
  if (allClear) {
    console.log("\n🎉 ALL CLEAR — No today's sales data remaining in DB!\n");
  } else {
    console.log("\n⚠️  Some tables still have data — see ❌ rows above.\n");
  }
  process.exit(0);
}

checkTodayData().catch(e => { console.error(e); process.exit(1); });
