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
      console.log(`\n--- SettlementID: ${billId} ---`);
      
      const stsRes = await pool.request()
        .input("billId", sql.UniqueIdentifier, billId)
        .query("SELECT * FROM SettlementTotalSales WHERE SettlementID = @billId");
      console.log("SettlementTotalSales:", stsRes.recordset);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
