const sql = require("mssql");
const { poolPromise, tenancyContext } = require("../config/db");

const holdOvertimeCache = new Map(); // dbKey -> { value, time }
const companySettingsCache = new Map(); // dbKey -> { value, time }
const appSettingsCache = new Map(); // dbKey -> { value, time }
const CACHE_TTL_MS = 60000; // 60 seconds cache TTL

function getTenantDbKey(overrideDb) {
  if (overrideDb) return String(overrideDb).trim().toUpperCase();
  const store = tenancyContext.getStore();
  return (store?.databaseName || "DEFAULT").toUpperCase();
}

async function getHoldOvertimeMinutes(targetDb) {
  const dbKey = getTenantDbKey(targetDb);
  const now = Date.now();
  const cached = holdOvertimeCache.get(dbKey);
  if (cached && (now - cached.time < CACHE_TTL_MS)) {
    console.log(`⚡ [SettingsCache] Cache HIT (${dbKey}): HoldOvertimeMinutes`);
    return cached.value;
  }

  console.log(`⚡ [SettingsCache] Cache MISS (${dbKey}): HoldOvertimeMinutes`);
  let holdMinutes = 30;
  try {
    const pool = await poolPromise;
    if (pool && pool.connected) {
      const result = await pool.request().query("SELECT TOP 1 HoldOvertimeMinutes FROM CompanySettings WITH (NOLOCK)");
      if (result.recordset.length > 0) {
        holdMinutes = result.recordset[0].HoldOvertimeMinutes || 30;
      }
      holdOvertimeCache.set(dbKey, { value: holdMinutes, time: now });
    }
  } catch (err) {
    console.error(`⚠️ [SettingsCache] Error fetching HoldOvertimeMinutes for ${dbKey}:`, err.message);
    if (cached) return cached.value;
    return 30;
  }

  return holdMinutes;
}

async function getCompanySettings(targetDb) {
  const dbKey = getTenantDbKey(targetDb);
  const now = Date.now();
  const cached = companySettingsCache.get(dbKey);
  if (cached && (now - cached.time < CACHE_TTL_MS)) {
    console.log(`⚡ [SettingsCache] Cache HIT (${dbKey}): CompanySettings`);
    return cached.value;
  }

  console.log(`⚡ [SettingsCache] Cache MISS (${dbKey}): CompanySettings`);
  let settings = null;
  try {
    const pool = await poolPromise;
    if (pool && pool.connected) {
      // 1. Try to get specific Master Settings (ID 1)
      let result = await pool.request()
        .query("SELECT * FROM CompanySettings WHERE Id = '1'");
      
      // 2. Fallback: If not found OR if the found record has NO NAME (empty shell)
      if (result.recordset.length === 0 || !result.recordset[0].CompanyName || result.recordset[0].CompanyName.trim() === '') {
        const fallbackResult = await pool.request()
          .query("SELECT TOP 1 * FROM CompanySettings WHERE CompanyName IS NOT NULL AND CompanyName <> '' ORDER BY UpdatedOn DESC");
        
        if (fallbackResult.recordset.length > 0) {
          result = fallbackResult;
        }
      }

      if (result.recordset.length > 0) {
        settings = result.recordset[0];
        companySettingsCache.set(dbKey, { value: settings, time: now });
      }
    }
  } catch (err) {
    console.error(`⚠️ [SettingsCache] Error fetching CompanySettings for ${dbKey}:`, err.message);
    if (cached) return cached.value;
  }

  return settings;
}

async function getAppSettings(targetDb) {
  const dbKey = getTenantDbKey(targetDb);
  const now = Date.now();
  const cached = appSettingsCache.get(dbKey);
  if (cached && (now - cached.time < CACHE_TTL_MS)) {
    console.log(`⚡ [SettingsCache] Cache HIT (${dbKey}): AppSettings`);
    return cached.value;
  }

  console.log(`⚡ [SettingsCache] Cache MISS (${dbKey}): AppSettings`);
  let settings = {};
  try {
    const pool = await poolPromise;
    if (pool && pool.connected) {
      const result = await pool.request().query("SELECT TOP 1 * FROM AppSettings");
      if (result.recordset.length > 0) {
        settings = result.recordset[0];
      }
      appSettingsCache.set(dbKey, { value: settings, time: now });
    }
  } catch (err) {
    console.error(`⚠️ [SettingsCache] Error fetching AppSettings for ${dbKey}:`, err.message);
    if (cached) return cached.value;
  }

  return settings;
}

async function getBusinessTimezoneSettings(targetDb) {
  const companySettings = await getCompanySettings(targetDb);
  
  return {
    timezone: companySettings?.BusinessTimezone || 'Asia/Singapore',
    offsetMinutes: companySettings?.DayEndOffsetMinutes != null ? Number(companySettings.DayEndOffsetMinutes) : 0
  };
}

function invalidateCache(targetDb) {
  if (targetDb) {
    const dbKey = String(targetDb).trim().toUpperCase();
    console.log(`⚡ [SettingsCache] Cache INVALIDATION for ${dbKey}`);
    holdOvertimeCache.delete(dbKey);
    companySettingsCache.delete(dbKey);
    appSettingsCache.delete(dbKey);
  } else {
    console.log("⚡ [SettingsCache] Cache INVALIDATION: Clearing all settings cache");
    holdOvertimeCache.clear();
    companySettingsCache.clear();
    appSettingsCache.clear();
  }
}

module.exports = {
  getHoldOvertimeMinutes,
  getCompanySettings,
  getAppSettings,
  getBusinessTimezoneSettings,
  invalidateCache
};
