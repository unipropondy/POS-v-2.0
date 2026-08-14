const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");

    const billIds = [
      '67342C70-9D75-4B6E-B801-2A5C410AEE03', // 20260812-0024
      '1038D65E-EF66-417F-8E98-2745F1CFFC6A'  // 20260812-0033
    ];

    for (const billId of billIds) {
      console.log(`\nUpdating Bill ID: ${billId}`);

      // 1. Update PaymentDetail
      const pdResult = await pool.request()
        .input("billId", sql.UniqueIdentifier, billId)
        .query("UPDATE PaymentDetail SET Paymode = 10 WHERE RestaurantBillId = @billId");
      console.log(`PaymentDetail update: ${pdResult.rowsAffected[0]} rows affected`);

      // 2. Update SettlementTotalSales
      const stsResult = await pool.request()
        .input("billId", sql.UniqueIdentifier, billId)
        .query("UPDATE SettlementTotalSales SET PayMode = 'Grab' WHERE SettlementID = @billId");
      console.log(`SettlementTotalSales update: ${stsResult.rowsAffected[0]} rows affected`);
    }

    console.log("\nUpdate complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
