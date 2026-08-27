const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const res = await pool.request().query("SELECT TableId, TableNumber, DiningSection, XPos, YPos FROM TableMaster WHERE DiningSection = '1' ORDER BY SortCode");
    console.log("Section 1 tables in database:", res.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
