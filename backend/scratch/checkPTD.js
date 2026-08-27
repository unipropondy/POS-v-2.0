require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { poolPromise } = require("../config/db");
poolPromise.then(async pool => {
  const r = await pool.request().query("SELECT TOP 1 * FROM PaymentDetailCur");
  console.log("PaymentDetailCur columns:", Object.keys(r.recordset[0] || {}));
  const r2 = await pool.request().query("SELECT TOP 1 * FROM PaymentDetail");
  console.log("PaymentDetail columns:", Object.keys(r2.recordset[0] || {}));
  const r3 = await pool.request().query("SELECT TOP 1 * FROM RestaurantInvoiceCur");
  console.log("RestaurantInvoiceCur columns:", Object.keys(r3.recordset[0] || {}));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
