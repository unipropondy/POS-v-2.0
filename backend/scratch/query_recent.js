const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const res = await pool.request().query(
      "SELECT TOP 5 SettlementID, LastSettlementDate, CreatedOn, BillNo, SysAmount, IsCancelled FROM SettlementHeader ORDER BY CreatedOn DESC"
    );
    console.log("Recent Settlements:");
    console.log(JSON.stringify(res.recordset, null, 2));

    const res2 = await pool.request().query(
      "SELECT GETDATE() as sqlLocalTime, GETUTCDATE() as sqlUtcTime"
    );
    console.log("SQL Times:");
    console.log(res2.recordset[0]);

    console.log("JS Node process time:", new Date().toString());
    console.log("JS Node ISO string:", new Date().toISOString());

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
