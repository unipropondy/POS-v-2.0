const { poolPromise, tenancyContext } = require("../config/db");

const orgCache = new Map(); // dbKey -> org

/**
 * Dynamically retrieves the active organization details from the database and caches them.
 * If the database connection fails or no organization exists, it falls back to a resilient default.
 */
async function getActiveOrganization(targetDb) {
  const store = tenancyContext.getStore();
  const dbKey = (targetDb || store?.databaseName || "DEFAULT").toUpperCase();

  if (orgCache.has(dbKey)) return orgCache.get(dbKey);

  try {
    const pool = await poolPromise;
    if (!pool) throw new Error("Database pool not available");

    const result = await pool.request().query(`
      SELECT TOP 1 
        BusinessUnitId, 
        BusinessUnitCode, 
        Name 
      FROM [dbo].[vw_Organization]
    `);

    if (result.recordset.length > 0) {
      const org = {
        businessUnitId: String(result.recordset[0].BusinessUnitId).toUpperCase(),
        businessUnitCode: String(result.recordset[0].BusinessUnitCode || "UPS").toUpperCase(),
        name: result.recordset[0].Name,
      };
      orgCache.set(dbKey, org);
      console.log(`📡 [OrgHelper] Loaded active organization config for ${dbKey}: ${org.name} (${org.businessUnitCode})`);
      return org;
    }
  } catch (err) {
    console.error(`🔥 [Critical] Error loading organization configuration for ${dbKey}:`, err.message);
  }

  // Resilient multi-branch fail-safe fallback
  return {
    businessUnitId: "00000000-0000-0000-0000-000000000000",
    businessUnitCode: "DEFAULT",
    name: "Default POS Branch",
  };
}

function invalidateOrgCache(targetDb) {
  if (targetDb) {
    orgCache.delete(String(targetDb).toUpperCase());
  } else {
    orgCache.clear();
  }
}

module.exports = { getActiveOrganization, invalidateOrgCache };
