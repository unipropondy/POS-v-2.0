const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const orderResult = await pool.request().query("SELECT OrderId, OrderNumber, Tableno, TotalAmount, entry_status FROM RestaurantOrderCur WHERE OrderNumber = '20260820-0001'");
    console.log("Order headers:");
    console.table(orderResult.recordset);
    
    if (orderResult.recordset.length > 0) {
      const orderId = orderResult.recordset[0].OrderId;
      const detailsResult = await pool.request().input("orderId", sql.UniqueIdentifier, orderId).query("SELECT OrderDetailId, OrderId, DishId, Quantity, Price, ActualAmount, StatusCode FROM RestaurantOrderDetailCur WHERE OrderId = @orderId");
      console.log("Order details:");
      console.table(detailsResult.recordset);
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
