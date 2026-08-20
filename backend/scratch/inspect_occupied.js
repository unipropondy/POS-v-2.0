const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const tables = await pool.request().query("SELECT TableId, TableNumber, DiningSection, Status, TotalAmount, CurrentOrderId, entry_status, PAYMENT_STATUS FROM TableMaster WHERE Status > 0");
    console.table(tables.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
