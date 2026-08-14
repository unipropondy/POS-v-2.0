const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");

    const orderNo = '20260808-0069';

    // Search in RestaurantOrder (history or other tables)
    const historyOrder = await pool.request().query(
      `SELECT * FROM RestaurantOrder WHERE OrderNumber = '${orderNo}'`
    );
    console.log("RestaurantOrder (History) count:", historyOrder.recordset.length);
    if (historyOrder.recordset.length > 0) {
      console.log(historyOrder.recordset[0]);
      const orderId = historyOrder.recordset[0].OrderId;
      const historyDetails = await pool.request().query(
        `SELECT * FROM RestaurantOrderDetail WHERE OrderId = '${orderId}'`
      );
      console.log("RestaurantOrderDetail (History) count:", historyDetails.recordset.length);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
