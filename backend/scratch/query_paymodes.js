const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const res = await pool.request().query(
      "SELECT Position, PayMode, Description, Active FROM Paymode"
    );
    console.log("All Paymodes in DB:");
    console.log(res.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
