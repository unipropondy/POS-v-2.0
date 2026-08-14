const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");

    const orderId = '99D41163-C668-4108-BB68-3E4CF125280A';
    const orderNo1 = '20260812-0004';
    const orderNo2 = '20260812-0004-S1';

    // List of tables to inspect (from inspect_order.js and general ones)
    const tables = [
      'RestaurantOrderCur',
      'RestaurantOrder',
      'RestaurantOrderDetailCur',
      'RestaurantOrderDetail',
      'RestaurantInvoiceCur',
      'RestaurantInvoice',
      'PaymentDetailCur',
      'PaymentDetail',
      'SettlementHeader',
      'SettlementTotalSales',
      'SettlementItemDetail',
      'PaymentTransactionDetails',
      'RestaurantmodifierdetailCur',
      'Restaurantmodifierdetail',
      'PrintJobQueue',
      'OrderMergeSplitHeader',
      'OrderMergeSplitDetail',
      'SplitBillHeader',
      'SplitBillDetails'
    ];

    console.log("Inspecting tables for references...");

    for (const table of tables) {
      try {
        // Find columns in this table
        const colsRes = await pool.request().query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`
        );
        if (colsRes.recordset.length === 0) continue;

        const cols = colsRes.recordset.map(r => r.COLUMN_NAME);

        // Build a query checking if any column contains our search terms
        const conditions = [];
        for (const col of cols) {
          conditions.push(`CAST(${col} AS NVARCHAR(MAX)) = '${orderId}'`);
          conditions.push(`CAST(${col} AS NVARCHAR(MAX)) = '${orderNo1}'`);
          conditions.push(`CAST(${col} AS NVARCHAR(MAX)) = '${orderNo2}'`);
        }

        const query = `SELECT COUNT(*) as count FROM ${table} WHERE ${conditions.join(" OR ")}`;
        const countRes = await pool.request().query(query);
        const count = countRes.recordset[0].count;
        if (count > 0) {
          console.log(`Table ${table} has ${count} matching row(s).`);
          
          // Print the matching rows (first few)
          const rowsRes = await pool.request().query(
            `SELECT TOP 5 * FROM ${table} WHERE ${conditions.join(" OR ")}`
          );
          console.log(rowsRes.recordset);
        }
      } catch (err) {
        // Column type incompatibilities or table doesn't exist
        // console.log(`Skipping table ${table} due to error: ${err.message}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
