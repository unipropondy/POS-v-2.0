const { poolPromise } = require('./config/db');

async function run() {
  const pool = await poolPromise;
  const res = await pool.request().query(`
    SELECT TableId, TableNumber, DiningSection, Status, entry_status, PAYMENT_STATUS, CurrentOrderId, CustomerName, Pax, TotalAmount, ModifiedOn
    FROM TableMaster
    WHERE Status <> 0 OR TotalAmount <> 0 OR CurrentOrderId IS NOT NULL
  `);
  console.log("=== Active/Occupied Tables in TableMaster ===");
  console.table(res.recordset);

  console.log("=== Recent 10 Orders in RestaurantOrderCur ===");
  const orders = await pool.request().query(`
    SELECT TOP 10 OrderId, OrderNumber, Tableno, TotalAmount, isOrderClosed, CreatedOn, ModifiedOn
    FROM RestaurantOrderCur
    ORDER BY CreatedOn DESC
  `);
  console.table(orders.recordset);

  console.log("=== OrderMergeHistory check ===");
  const mergeHistory = await pool.request().query(`
    SELECT TOP 10 * FROM OrderMergeHistory ORDER BY CreatedOn DESC
  `);
  console.table(mergeHistory.recordset);

  process.exit(0);
}

run();
