const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");

    const orderId = '99D41163-C668-4108-BB68-3E4CF125280A';
    const billIds = [
      '878E3B2F-F518-4F5F-A596-1A049B0A8B9F',
      '8883E6E2-CCD9-47B2-BDD7-C73A1D4240DE'
    ];
    const orderNos = [
      '20260812-0004',
      '20260812-0004-S1'
    ];

    console.log("Starting deletion of test order '20260812-0004' and '20260812-0004-S1'...");

    // Deleting from detail/child tables first to avoid foreign key or logical dependency issues
    const deleteQueries = [
      {
        table: 'RestaurantOrderDetailCur',
        query: `DELETE FROM RestaurantOrderDetailCur WHERE OrderId = '${orderId}'`
      },
      {
        table: 'RestaurantOrderDetail',
        query: `DELETE FROM RestaurantOrderDetail WHERE OrderId = '${orderId}'`
      },
      {
        table: 'RestaurantmodifierdetailCur',
        query: `DELETE FROM RestaurantmodifierdetailCur WHERE OrderId = '${orderId}'`
      },
      {
        table: 'Restaurantmodifierdetail',
        query: `DELETE FROM Restaurantmodifierdetail WHERE OrderId = '${orderId}'`
      },
      {
        table: 'RestaurantInvoiceCur',
        query: `DELETE FROM RestaurantInvoiceCur WHERE OrderId = '${orderId}'`
      },
      {
        table: 'RestaurantInvoice',
        query: `DELETE FROM RestaurantInvoice WHERE OrderId = '${orderId}'`
      },
      {
        table: 'PaymentDetailCur',
        query: `DELETE FROM PaymentDetailCur WHERE OrderId = '${orderId}'`
      },
      {
        table: 'PaymentDetail',
        query: `DELETE FROM PaymentDetail WHERE OrderId = '${orderId}'`
      },
      {
        table: 'SettlementTotalSales',
        query: `DELETE FROM SettlementTotalSales WHERE SettlementID IN (${billIds.map(id => `'${id}'`).join(',')})`
      },
      {
        table: 'SettlementItemDetail',
        query: `DELETE FROM SettlementItemDetail WHERE SettlementID IN (${billIds.map(id => `'${id}'`).join(',')})`
      },
      {
        table: 'SettlementHeader',
        query: `DELETE FROM SettlementHeader WHERE SettlementID IN (${billIds.map(id => `'${id}'`).join(',')})`
      },
      {
        table: 'PaymentTransactionDetails',
        query: `DELETE FROM PaymentTransactionDetails WHERE ReferenceId IN (${billIds.map(id => `'${id}'`).join(',')})`
      },
      {
        table: 'PrintJobQueue',
        query: `DELETE FROM PrintJobQueue WHERE Content LIKE '%20260812-0004%'`
      },
      {
        table: 'RestaurantOrderCur',
        query: `DELETE FROM RestaurantOrderCur WHERE OrderId = '${orderId}'`
      },
      {
        table: 'RestaurantOrder',
        query: `DELETE FROM RestaurantOrder WHERE OrderId = '${orderId}'`
      }
    ];

    for (const q of deleteQueries) {
      try {
        const res = await pool.request().query(q.query);
        console.log(`Deleted from ${q.table}: ${res.rowsAffected[0]} row(s).`);
      } catch (err) {
        console.error(`Error deleting from ${q.table}: ${err.message}`);
      }
    }

    // Reset Table 3 in TableMaster if needed
    console.log("Ensuring Table 3 is released...");
    await pool.request().query(
      `UPDATE TableMaster SET CurrentOrderId = NULL, Status = 0, LockedByName = NULL, IsLocked = 0, TotalAmount = 0 WHERE TableNumber = '3'`
    );
    console.log("TableMaster updated successfully.");

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
