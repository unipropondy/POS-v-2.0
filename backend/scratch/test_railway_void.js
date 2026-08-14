const { poolPromise } = require("../config/db");
const sql = require("mssql");
const jwt = require("jsonwebtoken");
const path = require("path");

// Load .env to get JWT_SECRET
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const JWT_SECRET = process.env.JWT_SECRET;

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB.");

    // Find a valid user to simulate login
    const userRes = await pool.request().query(`
      SELECT TOP 1 u.UserId, g.UserGroupCode as RoleCode
      FROM [dbo].[UserMaster] u
      JOIN [dbo].[UserGroupMaster] g ON u.UserGroupid = g.UserGroupId
      WHERE (u.IsDisabled IS NULL OR u.IsDisabled = 0) AND g.isActive = 1
    `);

    if (userRes.recordset.length === 0) {
      console.error("No valid users found in DB.");
      process.exit(1);
    }

    const dbUser = userRes.recordset[0];
    const userId = String(dbUser.UserId).trim();
    const roleCode = String(dbUser.RoleCode || "CASHIER").toUpperCase().trim();
    console.log(`Using User for test: ID=${userId}, Role=${roleCode}`);

    // Generate JWT token
    const token = jwt.sign(
      { userId, role: roleCode },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Find a real active order detail item to test voiding on
    const itemRes = await pool.request().query(`
      SELECT TOP 1 d.OrderDetailId, d.OrderId, d.StatusCode, h.Tableno
      FROM RestaurantOrderDetailCur d
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
      WHERE d.StatusCode <> 0
    `);

    if (itemRes.recordset.length === 0) {
      console.log("No active order details to test voiding.");
      process.exit(0);
    }

    const { OrderDetailId, StatusCode, Tableno } = itemRes.recordset[0];
    console.log(`Testing on existing item: DetailID=${OrderDetailId}, CurrentStatusCode=${StatusCode}, Table=${Tableno}`);

    // Run the HTTP POST call to Railway URL!
    const url = "https://pos-demo-11aug-production.up.railway.app/api/orders/remove-item";
    console.log(`Sending POST request to ${url}...`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        tableId: Tableno,
        itemId: OrderDetailId,
        qtyToVoid: 1,
        userId: userId,
        reason: "Integration Test Void"
      })
    });

    console.log("POST Response Status:", res.status);
    const data = await res.json();
    console.log("POST Response Body:", data);

    // Verify DB status after voiding
    const verifyRes = await pool.request()
      .input("id", sql.UniqueIdentifier, OrderDetailId)
      .query("SELECT StatusCode FROM RestaurantOrderDetailCur WHERE OrderDetailId = @id");
    
    const newStatus = verifyRes.recordset[0]?.StatusCode;
    console.log(`DB Status after void: ${newStatus}`);

    // RESTORE original status to preserve database data integrity
    await pool.request()
      .input("id", sql.UniqueIdentifier, OrderDetailId)
      .input("status", sql.Int, StatusCode)
      .query("UPDATE RestaurantOrderDetailCur SET StatusCode = @status WHERE OrderDetailId = @id");
    console.log(`Restored original StatusCode = ${StatusCode} successfully!`);

    if (res.status === 200 && data.success && newStatus === 0) {
      console.log("\n✅ RAILWAY TEST PASSED: Item voided successfully via Railway HTTP request!");
    } else {
      console.error("\n❌ RAILWAY TEST FAILED.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

main();
