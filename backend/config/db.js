const path = require("path");
// Adjust path to root of backend folder where .env is located
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql");
const { AsyncLocalStorage } = require("async_hooks");

const tenancyContext = new AsyncLocalStorage();

const configuredDb = (process.env.DB_NAME || "UCSPONDY").trim();
// UNIPRO is the master lookup catalog containing BranchDatabaseMaster, NOT a restaurant POS database.
// If DB_NAME is set to UNIPRO or missing, the default fallback POS operational database is UCSPONDY.
const defaultPosDatabase = configuredDb.toUpperCase() === "UNIPRO" ? "UCSPONDY" : configuredDb;

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: defaultPosDatabase,
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
    max: 50,
    min: 0,
    idleTimeoutMillis: 30000 // 30s recycle for idle pool connections
  }
};

// Log configuration for debugging (mask password)
console.log("📋 Database Configuration:");
console.log(`   Server: ${dbConfig.server || "NOT SET"}`);
console.log(`   Port: ${dbConfig.port || "NOT SET"}`);
console.log(`   Default Database: ${dbConfig.database || "NOT SET"}`);
console.log(`   User: ${dbConfig.user || "NOT SET"}`);
console.log(`   Connection Timeout: ${dbConfig.connectionTimeout}ms`);

let defaultPoolInstance = null;
const pools = new Map(); // key: UPPERCASE dbName -> { pool, connectingPromise }

async function ensureEssentialSchema(pool, targetDatabase) {
  if (!pool || !pool.connected) return;
  const dbName = String(targetDatabase || "").trim().toUpperCase();
  if (!dbName || dbName === "UNIPRO") return;

  try {
    const stmts = [
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'start_date') ALTER TABLE [dbo].[SettlementHeader] ADD [start_date] DATE NULL",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'entry_status') ALTER TABLE [dbo].[SettlementHeader] ADD [entry_status] VARCHAR(50) NULL",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemQty') ALTER TABLE [dbo].[SettlementHeader] ADD [VoidItemQty] DECIMAL(18, 3) NULL DEFAULT 0",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemAmount') ALTER TABLE [dbo].[SettlementHeader] ADD [VoidItemAmount] DECIMAL(18, 2) NULL DEFAULT 0",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledByUserName') ALTER TABLE [dbo].[SettlementHeader] ADD [CancelledByUserName] NVARCHAR(100) NULL",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'Pax') ALTER TABLE [dbo].[SettlementHeader] ADD [Pax] INT NULL",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'GuestName') ALTER TABLE [dbo].[SettlementHeader] ADD [GuestName] NVARCHAR(100) NULL",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]') AND name = 'start_date') ALTER TABLE [dbo].[CustomerCreditTransactions] ADD [start_date] DATE NULL",
      "IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]') AND type in (N'U')) AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]') AND name = 'CustomerType') ALTER TABLE [dbo].[CustomerCreditTransactions] ADD [CustomerType] NVARCHAR(50) NULL DEFAULT 'CREDIT'",
      "IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DateEntry]') AND type in (N'U')) BEGIN CREATE TABLE [dbo].[DateEntry]([DateEntryId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(), [username] [varchar](30) NULL, [StartDate] [date] NOT NULL, [CreatedBy] [varchar](30) NULL, [CreatedDate] [datetime] DEFAULT GETDATE(), [UpdateBy] [varchar](30) NULL, [UpdateDate] [datetime] NULL) END",
      "IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BusinessDayLog]') AND type in (N'U')) BEGIN CREATE TABLE [dbo].[BusinessDayLog]([BusinessDate] [date] NOT NULL PRIMARY KEY, [StartedAt] [datetime] NULL, [StartedBy] [nvarchar](50) NULL, [EndedAt] [datetime] NULL, [EndedBy] [nvarchar](50) NULL) END"
    ];
    for (const stmt of stmts) {
      await pool.request().query(stmt);
    }
  } catch (err) {
    console.warn(`⚠️ [Database] Schema verify warning for "${targetDatabase}":`, err.message);
  }
}

/**
 * Connect to a specific database pool with retries.
 */
async function createDatabasePool(targetDatabase, retries = 3, delay = 2000) {
  const cleanDb = String(targetDatabase || "").trim();
  if (!cleanDb || !/^[a-zA-Z0-9_#$]+$/.test(cleanDb)) {
    throw new Error(`Invalid database name identifier: "${cleanDb}"`);
  }

  const poolConfig = {
    ...dbConfig,
    database: cleanDb,
  };

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔌 [Database] Connecting to ${poolConfig.server}:${poolConfig.port}/${cleanDb}... (Attempt ${i + 1}/${retries})`);
      const pool = await new sql.ConnectionPool(poolConfig).connect();
      console.log(`✅ [Database] Connected to MSSQL database "${cleanDb}" successfully`);
      pool.on("error", (err) => {
        console.error(`⚠️ [Database Pool Error] (${cleanDb}):`, err.message);
        if (!pool.connected) {
          pools.delete(cleanDb.toUpperCase());
        }
      });
      await ensureEssentialSchema(pool, cleanDb);
      return pool;
    } catch (err) {
      console.error(`❌ [Database Connection Attempt ${i + 1} Failed for "${cleanDb}"]:`, err.message);
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Get or create a connection pool for a specific database.
 */
async function getPoolForDatabase(databaseName) {
  const dbName = (databaseName || dbConfig.database || "UCSPONDY").trim();
  const key = dbName.toUpperCase();

  const existing = pools.get(key);
  if (existing) {
    if (existing.pool && existing.pool.connected) {
      return existing.pool;
    }
    if (existing.connectingPromise) {
      try {
        return await existing.connectingPromise;
      } catch (err) {
        pools.delete(key);
      }
    }
  }

  const connectingPromise = createDatabasePool(dbName)
    .then((pool) => {
      pools.set(key, { pool, connectingPromise: null });
      if (key === (dbConfig.database || "UCSPONDY").toUpperCase()) {
        defaultPoolInstance = pool;
      }
      return pool;
    })
    .catch((err) => {
      pools.delete(key);
      throw err;
    });

  pools.set(key, { pool: null, connectingPromise });
  return await connectingPromise;
}

// Connect default pool on startup
const defaultPoolPromise = getPoolForDatabase(dbConfig.database).then((pool) => {
  defaultPoolInstance = pool;
  return pool;
}).catch((err) => {
  console.error("❌ Failed to connect default database on startup:", err.message);
  return null;
});

let branchListCache = null;
let branchListCacheTime = 0;
const BRANCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Single source of truth: Fetch all company codes from UNIPRO.dbo.BranchDatabaseMaster dynamically.
 */
async function getBranchDatabaseList(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && branchListCache && (now - branchListCacheTime < BRANCH_CACHE_TTL_MS)) {
    return branchListCache;
  }

  let masterPool = null;
  try {
    masterPool = await getPoolForDatabase("UNIPRO");
  } catch (err) {
    masterPool = defaultPoolInstance || (await defaultPoolPromise);
  }

  if (!masterPool) {
    throw new Error("Unable to obtain database connection for company lookup.");
  }

  const result = await masterPool.request().query(`
    SELECT 
      LTRIM(RTRIM(BranchCode)) AS BranchCode, 
      LTRIM(RTRIM(DatabaseName)) AS DatabaseName 
    FROM UNIPRO.dbo.BranchDatabaseMaster WITH (NOLOCK)
    WHERE BranchCode IS NOT NULL AND DatabaseName IS NOT NULL
    ORDER BY BranchCode ASC
  `);

  const list = (result.recordset || []).map((row) => ({
    branchCode: String(row.BranchCode || "").trim(),
    databaseName: String(row.DatabaseName || "").trim(),
  }));

  branchListCache = list;
  branchListCacheTime = now;
  return list;
}

/**
 * Validate a branch/company code and return its mapped database name.
 */
async function lookupBranchDatabase(branchCode) {
  if (!branchCode || typeof branchCode !== "string") return null;
  const cleanCode = branchCode.trim().toUpperCase();
  if (!cleanCode) return null;

  // 1. Check in-memory cached branch list first for ultra-fast lookup
  const list = await getBranchDatabaseList(false);
  const found = list.find((item) => item.branchCode.toUpperCase() === cleanCode);
  if (found) {
    return found;
  }

  // 2. If not found in cache, force refresh from UNIPRO.dbo.BranchDatabaseMaster
  const freshList = await getBranchDatabaseList(true);
  const freshFound = freshList.find((item) => item.branchCode.toUpperCase() === cleanCode);
  return freshFound || null;
}

function invalidateBranchDatabaseCache() {
  branchListCache = null;
  branchListCacheTime = 0;
}

/**
 * Transparent Thenable proxy for poolPromise.
 * Automatically resolves to the tenant pool for the current request context if available,
 * otherwise falls back to the default database pool.
 */
const poolPromise = {
  then(onFulfilled, onRejected) {
    const store = tenancyContext.getStore();
    if (store && store.poolPromise) {
      return store.poolPromise.then(onFulfilled, onRejected);
    }
    if (store && store.pool && store.pool.connected) {
      return Promise.resolve(store.pool).then(onFulfilled, onRejected);
    }
    return defaultPoolPromise.then(onFulfilled, onRejected);
  },
  catch(onRejected) {
    return this.then(null, onRejected);
  }
};

/**
 * Returns the currently active pool for the caller.
 */
function getPool(databaseName) {
  if (databaseName) {
    const key = String(databaseName).trim().toUpperCase();
    const entry = pools.get(key);
    return entry?.pool && entry.pool.connected ? entry.pool : null;
  }
  const store = tenancyContext.getStore();
  if (store && store.pool && store.pool.connected) {
    return store.pool;
  }
  return defaultPoolInstance;
}

module.exports = {
  sql,
  poolPromise,
  dbConfig,
  getPool,
  getPoolForDatabase,
  getBranchDatabaseList,
  lookupBranchDatabase,
  invalidateBranchDatabaseCache,
  tenancyContext,
  defaultPoolPromise,
};
