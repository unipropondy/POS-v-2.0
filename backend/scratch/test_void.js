const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB successfully.");

    // Find a recent order detail record to test voiding on
    const recentDetail = await pool.request().query(`
      SELECT TOP 1 d.OrderDetailId, d.OrderId, d.StatusCode, d.DishName, h.Tableno
      FROM RestaurantOrderDetailCur d
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
      WHERE d.StatusCode <> 0
      ORDER BY d.CreatedOn DESC
    `);

    if (recentDetail.recordset.length === 0) {
      console.log("No active order items found to test voiding.");
      process.exit(0);
    }

    const { OrderDetailId, OrderId, StatusCode, DishName, Tableno } = recentDetail.recordset[0];
    console.log(`Found item to test: "${DishName}" (DetailID: ${OrderDetailId}) on Table: ${Tableno} with StatusCode: ${StatusCode}`);

    console.log("Starting transaction for dry-run test...");
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Simulate void logic in transaction (same SQL as backend remove-item)
      const dbResult = await transaction
        .request()
        .input("itemId", sql.UniqueIdentifier, OrderDetailId)
        .input("userId", sql.UniqueIdentifier, "00000000-0000-0000-0000-000000000000")
        .input("reason", sql.NVarChar(255), "DRY-RUN TEST VOID")
        .query(`
          DECLARE @CurrentStatus INT;
          DECLARE @OrderId UNIQUEIDENTIFIER;
          SELECT @CurrentStatus = StatusCode, @OrderId = OrderId FROM RestaurantOrderDetailCur WHERE OrderDetailId = @itemId;

          IF @CurrentStatus = 1
          BEGIN
            -- Hard delete unsent items
            PRINT 'Hard deleting item...';
            DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @itemId;
            DELETE FROM RestaurantOrderDetailCur WHERE OrderDetailId = @itemId;
          END
          ELSE
          BEGIN
            -- Void sent items
            PRINT 'Voiding sent item (setting StatusCode = 0)...';
            UPDATE RestaurantOrderDetailCur 
            SET StatusCode = 0, ModifiedBy = @userId, ModifiedOn = GETDATE(), 
                Remarks = ISNULL(Remarks, '') + ' (VOID: ' + @reason + ')'
            WHERE OrderDetailId = @itemId;
          END

          SELECT @OrderId as OrderId;
        `);

      console.log("SQL executed successfully!");
      const returnedOrderId = dbResult.recordset[0]?.OrderId;
      console.log("Returned Order ID:", returnedOrderId);

      // Verify the item status inside the transaction block
      const verifyRes = await transaction.request()
        .input("itemId", sql.UniqueIdentifier, OrderDetailId)
        .query("SELECT StatusCode, Remarks FROM RestaurantOrderDetailCur WHERE OrderDetailId = @itemId");
      
      console.log("Status check after void in transaction:", verifyRes.recordset[0]);

      console.log("Rolling back transaction to preserve DB state...");
      await transaction.rollback();
      console.log("Transaction rolled back successfully. DB state unchanged.");
      console.log("Test Passed!");
      process.exit(0);
    } catch (err) {
      console.error("Error executing void SQL in transaction:", err);
      await transaction.rollback();
      process.exit(1);
    }
  } catch (err) {
    console.error("Test setup error:", err);
    process.exit(1);
  }
}

main();
