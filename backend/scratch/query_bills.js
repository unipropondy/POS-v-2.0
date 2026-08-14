const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    // Check SettlementHeader columns
    const columnsRes = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SettlementHeader'"
    );
    console.log("SettlementHeader columns:", columnsRes.recordset.map(c => c.COLUMN_NAME).join(", "));
    
    const bills = ["20260812-0024", "20260812-0033"];
    for (const bill of bills) {
      console.log(`\n--- Querying Bill: ${bill} ---`);
      const shRes = await pool.request()
        .input("billNo", sql.NVarChar, bill)
        .query("SELECT * FROM SettlementHeader WHERE BillNo = @billNo");
      console.log(shRes.recordset);
      
      if (shRes.recordset.length > 0) {
        const id = shRes.recordset[0].SettlementID || shRes.recordset[0].SettlementId;
        const pdRes = await pool.request()
          .input("id", sql.UniqueIdentifier, id)
          .query("SELECT * FROM PaymentDetail WHERE RestaurantBillId = @id");
        console.log("PaymentDetail rows:", pdRes.recordset);
      }
    }
    
    console.log("\n--- Available Paymodes ---");
    const pmRes = await pool.request().query("SELECT Position, PayMode, Description FROM Paymode");
    console.log(pmRes.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
