const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function main() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB");
    
    const jobsResult = await pool.request().query("SELECT JobId, PrinterName, PrinterIp, PrinterPort, Status, Attempts, CreatedOn, ProcessedOn, CompletedOn, ErrorMessage FROM PrintJobQueue ORDER BY CreatedOn DESC");
    console.log("Print Jobs in Queue:");
    console.table(jobsResult.recordset);
    
    const settingsResult = await pool.request().query("SELECT LastBridgeHeartbeat, DATEDIFF(second, LastBridgeHeartbeat, GETDATE()) as SecondsSinceHeartbeat FROM CompanySettings");
    console.log("Company Settings (Bridge Heartbeat):");
    console.table(settingsResult.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
