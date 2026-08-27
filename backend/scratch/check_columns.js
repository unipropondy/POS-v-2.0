const mssql = require('mssql');
require('dotenv').config({ path: 'c:/Users/UNIPRO/Desktop/POS/backend/.env' });

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  port: 9199,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function test() {
  try {
    const pool = await mssql.connect(config);
    const res = await pool.request().query("SELECT MemberId, Name, Balance, CurrentBalance, CreditLimit FROM MemberMaster WHERE MemberId = 'E52017BC-C6CF-45E3-A717-539E58125F3A'");
    console.log("Loki Balance Details:", res.recordset);
  } catch (e) {
    console.error(e);
  }
}
test();
