const { poolPromise } = require("../config/db");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const result = await pool.request().query(`
      SELECT TOP 3 JobId, PrinterName, Status, Content, CreatedOn 
      FROM PrintJobQueue 
      ORDER BY CreatedOn DESC
    `);
    
    result.recordset.forEach(job => {
      console.log("=========================================");
      console.log(`JobId: ${job.JobId} | Printer: ${job.PrinterName} | Status: ${job.Status} | Created: ${job.CreatedOn}`);
      console.log("Content:");
      console.log(job.Content);
    });
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
