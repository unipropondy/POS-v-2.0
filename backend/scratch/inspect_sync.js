const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const tid = "4"; // Table 4
    
    const res = await pool.request().input("tid", sql.VarChar(50), tid)
      .query(`
      DECLARE @TableNo VARCHAR(50);
      DECLARE @TableId UNIQUEIDENTIFIER;
      DECLARE @CurrentOrderId NVARCHAR(50);

      SELECT TOP 1 @TableNo = TableNumber, @TableId = TableId, @CurrentOrderId = CurrentOrderId FROM TableMaster WHERE TableNumber = @tid;

      DECLARE @ActualOrderId UNIQUEIDENTIFIER, @ActualOrderNo NVARCHAR(50), @count INT, @total DECIMAL(18,2);

      SELECT TOP 1 @ActualOrderId = OrderId, @ActualOrderNo = OrderNumber
      FROM RestaurantOrderCur 
      WHERE (OrderId = (SELECT TOP 1 OrderId FROM RestaurantOrderCur h2 WHERE h2.OrderNumber = @CurrentOrderId AND h2.isOrderClosed = 0))
         OR ((RTRIM(LTRIM(Tableno)) = RTRIM(LTRIM(@TableNo)) OR RTRIM(LTRIM(Tableno)) = RTRIM(LTRIM(@tid))) AND (isOrderClosed = 0 OR isOrderClosed IS NULL))
      ORDER BY CASE WHEN OrderNumber = @CurrentOrderId THEN 0 ELSE 1 END, CreatedOn DESC;

      DECLARE @TakeawayOverride INT = 0;
      DECLARE @SCOverride INT = 0;

      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'RestaurantOrderCur' AND COLUMN_NAME = 'TakeawayChargeOverride'
      )
      BEGIN
        EXEC sp_executesql N'SELECT TOP 1 @out = ISNULL(TakeawayChargeOverride, 0) FROM RestaurantOrderCur WHERE OrderId = @OrderId', N'@OrderId UNIQUEIDENTIFIER, @out INT OUTPUT', @ActualOrderId, @TakeawayOverride OUTPUT;
      END

      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'RestaurantOrderCur' AND COLUMN_NAME = 'ServiceChargeOverride'
      )
      BEGIN
        EXEC sp_executesql N'SELECT TOP 1 @out = ISNULL(ServiceChargeOverride, 0) FROM RestaurantOrderCur WHERE OrderId = @OrderId', N'@OrderId UNIQUEIDENTIFIER, @out INT OUTPUT', @ActualOrderId, @SCOverride OUTPUT;
      END

      DECLARE @subtotal DECIMAL(18,2) = 0;
      DECLARE @serviceCharge DECIMAL(18,2) = 0;
      DECLARE @takeawayCharge DECIMAL(18,2) = 0;
      DECLARE @takeawayRate DECIMAL(18,2) = 0;
      DECLARE @gstRate DECIMAL(18,2) = 0.09; -- default 9%
      DECLARE @discountAmount DECIMAL(18,2) = 0;

      SELECT TOP 1 @takeawayRate = ISNULL(TakeawayCharges, 0) FROM CompanySettings;

      SELECT 
          @count = COUNT(*), 
          @subtotal = ISNULL(SUM(d.ActualAmount), 0),
          @serviceCharge = CASE WHEN @SCOverride = 1 THEN 0 ELSE ISNULL(SUM(d.ServiceCharge), 0) END,
          @takeawayCharge = CASE 
              WHEN @TakeawayOverride = 1 THEN 0 
              ELSE ISNULL(SUM(d.Quantity * CASE 
                  WHEN d.isTakeAway = 1 THEN 
                      CASE 
                          WHEN ISNULL(dish.TakeawayCharge, 0) > 0 THEN dish.TakeawayCharge 
                          ELSE @takeawayRate 
                      END
                  ELSE 0 
              END), 0) 
          END
      FROM RestaurantOrderDetailCur d
      LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
      WHERE d.OrderId = @ActualOrderId AND d.StatusCode <> 0;

      SELECT TOP 1 @discountAmount = ISNULL(DiscountAmount, 0) FROM RestaurantOrderCur WHERE OrderId = @ActualOrderId;

      SELECT TOP 1 @gstRate = ISNULL(GSTPercentage, 0) / 100.0 FROM CompanySettings;
      IF @gstRate IS NULL SET @gstRate = 0.09;

      DECLARE @taxableSubtotal DECIMAL(18,2) = @subtotal - @discountAmount;
      IF @taxableSubtotal < 0 SET @taxableSubtotal = 0;

      SET @total = ROUND(@taxableSubtotal + @serviceCharge + @takeawayCharge + ((@taxableSubtotal + @serviceCharge + @takeawayCharge) * @gstRate), 2);

      SELECT @TableNo as TableNo, @CurrentOrderId as CurrentOrderId, @ActualOrderId as ActualOrderId, @ActualOrderNo as ActualOrderNo, @count as Count, @subtotal as Subtotal, @total as Total;
      `);
      
    console.log("SQL Output details:");
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
