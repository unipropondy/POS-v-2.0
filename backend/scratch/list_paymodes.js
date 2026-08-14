const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT Position, PayMode, Description, Active FROM [dbo].[Paymode]");
    console.log("Paymode records in database:", JSON.stringify(result.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
