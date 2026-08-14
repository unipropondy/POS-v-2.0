const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");

    const res = await pool.request().query(
      `SELECT * FROM TableMaster WHERE TableNumber = '3'`
    );
    console.log("TableMaster for Table 3:", res.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
