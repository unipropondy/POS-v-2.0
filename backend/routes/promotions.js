const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

// 🔹 GET Active Promotions for Kiosk (entry_status = 'K')
router.get("/active", async (req, res) => {
  try {
    const entryStatus = String(
      req.query.entry_status ||
      req.query.entryStatus ||
      req.headers["x-entry-status"] ||
      ""
    ).trim().toUpperCase();

    // Restrict strictly to Kiosk orders (entry_status = 'K')
    if (entryStatus !== "K") {
      return res.json({ success: true, promotions: [] });
    }

    const pool = await poolPromise;
    // Note: Table column in PromotionMaster is "Description" (not "PromotionDescription")
    const result = await pool.request().query(`
      SELECT 
        PromotionId,
        PromotionName,
        Description,
        Description AS PromotionDescription,
        PromotionImageUrl,
        PromotionType,
        PromotionAmount,
        MinPurchaseAmount,
        DiscountValue,
        CONVERT(varchar(10), StartDate, 120) AS StartDateStr,
        CONVERT(varchar(10), EndDate, 120) AS EndDateStr,
        CONVERT(varchar(8), StartTime, 108) AS StartTimeStr,
        CONVERT(varchar(8), EndTime, 108) AS EndTimeStr,
        Status
      FROM PromotionMaster WITH (NOLOCK)
      WHERE Status = 1
    `);

    const rows = result.recordset || [];
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;
    const curMinutes = now.getHours() * 60 + now.getMinutes();

    console.log(`[Promotions API] Today: ${todayStr}, CurMinutes: ${curMinutes} (${now.getHours()}:${now.getMinutes()}), Total records: ${rows.length}`);

    const activePromotions = rows.filter((promo) => {
      // 1. Date Check: Current date between StartDate and EndDate
      if (promo.StartDateStr && todayStr < promo.StartDateStr) {
        console.log(`[Promotions API] Promo ${promo.PromotionId} skipped: StartDate ${promo.StartDateStr} > ${todayStr}`);
        return false;
      }
      if (promo.EndDateStr && todayStr > promo.EndDateStr) {
        console.log(`[Promotions API] Promo ${promo.PromotionId} skipped: EndDate ${promo.EndDateStr} < ${todayStr}`);
        return false;
      }

      // 2. Time Check:
      // If both StartTime and EndTime are NULL, consider available throughout configured dates
      if (promo.StartTimeStr && promo.EndTimeStr) {
        const partsS = promo.StartTimeStr.split(":").map(Number);
        const partsE = promo.EndTimeStr.split(":").map(Number);
        const startMin = partsS[0] * 60 + partsS[1];
        const endMin = partsE[0] * 60 + partsE[1];

        if (startMin <= endMin) {
          if (curMinutes < startMin || curMinutes > endMin) {
            console.log(`[Promotions API] Promo ${promo.PromotionId} skipped: curMinutes ${curMinutes} outside ${startMin}-${endMin}`);
            return false;
          }
        } else {
          // Overnight promotion (e.g. 22:00 to 02:00)
          if (curMinutes < startMin && curMinutes > endMin) {
            console.log(`[Promotions API] Promo ${promo.PromotionId} skipped: overnight curMinutes ${curMinutes}`);
            return false;
          }
        }
      } else if (promo.StartTimeStr) {
        const partsS = promo.StartTimeStr.split(":").map(Number);
        const startMin = partsS[0] * 60 + partsS[1];
        if (curMinutes < startMin) return false;
      } else if (promo.EndTimeStr) {
        const partsE = promo.EndTimeStr.split(":").map(Number);
        const endMin = partsE[0] * 60 + partsE[1];
        if (curMinutes > endMin) return false;
      }

      return true;
    });

    console.log(`[Promotions API] Returning ${activePromotions.length} active promotions`);

    res.json({
      success: true,
      promotions: activePromotions,
    });
  } catch (err) {
    console.error("Error fetching active promotions:", err);
    res.status(500).json({ error: err.message, promotions: [] });
  }
});

module.exports = router;
