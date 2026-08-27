const mssql = require('mssql');
require('dotenv').config({ path: 'c:/Users/UNIPRO/Desktop/POS/backend/.env' });

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function test() {
  try {
    const pool = await mssql.connect(config);
    const res = await pool.request().query("SELECT TOP 10 SettlementID, BillNo, PayMode, MemberId FROM SettlementHeader ORDER BY CreatedDate DESC");
    console.log("SettlementHeader:", res.recordset);
  } catch (e) {
    console.error(e);
  }
}
test();
