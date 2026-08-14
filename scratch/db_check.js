const { poolPromise } = require("c:/Users/UNIPRO/Desktop/POS/backend/config/db.js");

async function check() {
  const pool = await poolPromise;
  const res = await pool.request().query("SELECT start_date, Remarks, SUM(Amount) as TotalAmount FROM PaymentDetailCur GROUP BY start_date, Remarks ORDER BY start_date DESC, Remarks ASC");
  console.log("Groups in PaymentDetailCur:", res.recordset);
  process.exit(0);
}

check();
