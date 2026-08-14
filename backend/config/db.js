const path = require("path");
// Adjust path to root of backend folder where .env is located
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql"); 

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000, 
    requestTimeout: 30000,
    appName: "POS_System",
    keepAlive: true // Enable TCP keepAlive
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
  pool: {
    max: 100,
    min: 0,
    idleTimeoutMillis: 15000 // Lowered to 15s to recycle idle connections faster
  }
};

// Log configuration for debugging (mask password)
console.log("📋 Database Configuration:");
console.log(`   Server: ${dbConfig.server || "NOT SET"}`);
console.log(`   Port: ${dbConfig.port || "NOT SET"}`);
console.log(`   Database: ${dbConfig.database || "NOT SET"}`);
console.log(`   User: ${dbConfig.user || "NOT SET"}`);
console.log(`   Connection Timeout: ${dbConfig.connectionTimeout}ms`);

let poolInstance = null;

async function connectWithRetry(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔌 [Database] Connecting to ${dbConfig.server}:${dbConfig.port}... (Attempt ${i + 1}/${retries})`);
      const pool = await new sql.ConnectionPool(dbConfig).connect();
      console.log("✅ Connected to MSSQL Successfully");
      pool.on("error", (err) => {
        console.error("⚠️ [Database Pool Error] General pool connection error:", err.message);
      });
      poolInstance = pool;
      return pool;
    } catch (err) {
      console.error(`❌ [Database Connection Attempt ${i + 1} Failed]:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying database connection in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("❌ All database connection attempts failed.");
        console.error("   Please verify your .env file contains:");
        console.error("   - DB_SERVER: " + dbConfig.server);
        console.error("   - DB_PORT: " + dbConfig.port);
        console.error("   - DB_NAME: " + dbConfig.database);
        console.error("   - DB_USER: " + dbConfig.user);
        console.error("   - DB_PASSWORD: (hidden)");
        return null;
      }
    }
  }
  return null;
}

const poolPromise = connectWithRetry(5, 3000);

module.exports = { 
    sql, 
    poolPromise, 
    dbConfig,
    getPool: () => poolInstance 
};
