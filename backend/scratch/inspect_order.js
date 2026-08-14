const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const guidOrderId = "469F7E72-825A-4CBD-8956-06408746D3FA";
    const billId = "C6A277B6-3246-4D64-BC08-CDABEBE66636";
    const intOrderId = 1662;

    const queries = {
      RestaurantOrderCur: `SELECT COUNT(*) as count FROM RestaurantOrderCur WHERE OrderId = '${guidOrderId}'`,
      RestaurantOrder: `SELECT COUNT(*) as count FROM RestaurantOrder WHERE OrderId = '${guidOrderId}'`,
      RestaurantOrderDetailCur: `SELECT COUNT(*) as count FROM RestaurantOrderDetailCur WHERE OrderId = '${guidOrderId}'`,
      RestaurantOrderDetail: `SELECT COUNT(*) as count FROM RestaurantOrderDetail WHERE OrderId = '${guidOrderId}'`,
      RestaurantInvoiceCur: `SELECT COUNT(*) as count FROM RestaurantInvoiceCur WHERE RestaurantBillId = '${billId}'`,
      RestaurantInvoice: `SELECT COUNT(*) as count FROM RestaurantInvoice WHERE RestaurantBillId = '${billId}'`,
      PaymentDetailCur: `SELECT COUNT(*) as count FROM PaymentDetailCur WHERE RestaurantBillId = '${billId}'`,
      PaymentDetail: `SELECT COUNT(*) as count FROM PaymentDetail WHERE RestaurantBillId = '${billId}'`,
      SettlementHeader: `SELECT COUNT(*) as count FROM SettlementHeader WHERE SettlementID = '${billId}'`,
      SettlementTotalSales: `SELECT COUNT(*) as count FROM SettlementTotalSales WHERE SettlementID = '${billId}'`,
      SettlementItemDetail: `SELECT COUNT(*) as count FROM SettlementItemDetail WHERE SettlementID = '${billId}'`,
      PaymentTransactionDetails: `SELECT COUNT(*) as count FROM PaymentTransactionDetails WHERE ReferenceId = '${billId}'`,
      RestaurantmodifierdetailCur: `SELECT COUNT(*) as count FROM RestaurantmodifierdetailCur WHERE OrderId = '${guidOrderId}'`,
      Restaurantmodifierdetail: `SELECT COUNT(*) as count FROM Restaurantmodifierdetail WHERE OrderId = '${guidOrderId}'`
    };

    for (const [table, query] of Object.entries(queries)) {
      const res = await pool.request().query(query);
      console.log(`${table}: ${res.recordset[0].count} rows`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
