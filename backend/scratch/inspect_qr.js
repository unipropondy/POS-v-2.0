const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const qrTables = await pool.request().query("SELECT TableId, TableNumber, Status, TotalAmount, CurrentOrderId, entry_status, PAYMENT_STATUS FROM TableMaster WHERE entry_status = 'q'");
    console.log("QR tables in TableMaster:");
    console.table(qrTables.recordset);
    
    const qrOrders = await pool.request().query("SELECT OrderId, OrderNumber, Tableno, TotalAmount, entry_status, PAYMENT_STATUS FROM RestaurantOrderCur WHERE entry_status = 'q'");
    console.log("QR orders in RestaurantOrderCur:");
    console.table(qrOrders.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
