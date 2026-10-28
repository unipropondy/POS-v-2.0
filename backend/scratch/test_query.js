const { getPoolForDatabase } = require('../config/db');

async function test() {
  console.time('UCS112 query');
  const pool = await getPoolForDatabase('UCSKOMBANNEW');
  const startDate = '2026-09-10';
  const endDate = '2026-09-10';
  const shWhere = `COALESCE(sh.start_date, CAST(sh.LastSettlementDate AS DATE)) >= '${startDate}' AND COALESCE(sh.start_date, CAST(sh.LastSettlementDate AS DATE)) <= '${endDate}'`;

  console.time('Step 1: Simple sh query');
  const res1 = await pool.request().query(`SELECT SettlementID, BillNo, LastSettlementDate, start_date FROM SettlementHeader sh WHERE ${shWhere}`);
  console.timeEnd('Step 1: Simple sh query');
  console.log('SH Count:', res1.recordset.length);

  console.time('Step 5: cct payment query');
  const cctWhere = `COALESCE(cct.start_date, CAST(cct.CreatedDate AS DATE)) >= '${startDate}' AND COALESCE(cct.start_date, CAST(cct.CreatedDate AS DATE)) <= '${endDate}'`;
  const res5 = await pool.request().query(`
    SELECT cct.TransactionId
    FROM CustomerCreditTransactions cct
    LEFT JOIN CreditCustomerMaster m ON cct.MemberId = m.CustomerId AND (cct.CustomerType = 'CREDIT' OR cct.CustomerType IS NULL)
    LEFT JOIN MemberMaster mm ON cct.MemberId = mm.MemberId AND (cct.CustomerType = 'MEMBER' OR (cct.CustomerType IS NULL AND m.CustomerId IS NULL))
    LEFT JOIN UserMaster um ON TRY_CAST(cct.CreatedBy AS UNIQUEIDENTIFIER) = um.UserId
    WHERE cct.TransactionType = 'PAYMENT' AND ${cctWhere}
  `);
  console.timeEnd('Step 5: cct payment query');
  console.log('Step 5 Count:', res5.recordset.length);
  process.exit(0);
}
test();

