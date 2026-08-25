const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    try {
      const res = await pool.request().query("SELECT TOP 20 * FROM DateEntry");
      console.log("DateEntry entries:", res.recordset);
    } catch (e) {
      console.error("DateEntry query failed:", e.message);
    }

    try {
      const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
      console.log("Database tables:");
      console.log(tables.recordset.map(r => r.TABLE_NAME).join(", "));
    } catch (e) {
      console.error("Schema query failed:", e.message);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
