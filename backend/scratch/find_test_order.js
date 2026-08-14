const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");

    console.log("Searching in RestaurantOrderCur...");
    const resCur = await pool.request().query(
      `SELECT OrderId, OrderNumber, Tableno, TotalAmount, isOrderClosed FROM RestaurantOrderCur WHERE OrderNumber LIKE '%20260812-0004%'`
    );
    console.log("RestaurantOrderCur:", resCur.recordset);

    console.log("Searching in RestaurantOrder...");
    const resHist = await pool.request().query(
      `SELECT OrderId, OrderNumber, Tableno, TotalAmount FROM RestaurantOrder WHERE OrderNumber LIKE '%20260812-0004%'`
    );
    console.log("RestaurantOrder:", resHist.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
