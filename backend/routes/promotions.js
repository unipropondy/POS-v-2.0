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
    const result = await pool.request().query(`
      SELECT 
        PromotionId,
        PromotionName,
        PromotionDescription,
        PromotionImageUrl,
        PromotionType,
        PromotionAmount,
        DiscountValue,
        StartDate,
        EndDate,
        StartTime,
        EndTime,
        Status
      FROM PromotionMaster WITH (NOLOCK)
      WHERE Status = 1
    `);

    const rows = result.recordset || [];
    const now = new Date();

    // Local Singapore date: "YYYY-MM-DD"
    const localDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const curHour = parseInt(timeParts.find((p) => p.type === "hour")?.value || "0", 10);
    const curMin = parseInt(timeParts.find((p) => p.type === "minute")?.value || "0", 10);
    const currentMinutes = curHour * 60 + curMin;

    function parseTimeToMinutes(t) {
      if (!t) return null;
      if (t instanceof Date) {
        return t.getHours() * 60 + t.getMinutes();
      }
      const s = String(t).trim();
      if (!s) return null;
      const match = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
      if (!match) return null;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[4]?.toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + m;
    }

    function toDateStr(d) {
      if (!d) return null;
      if (d instanceof Date) {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Singapore",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      }
      const s = String(d).trim();
      const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    }

    const activePromotions = rows.filter((promo) => {
      // 1. Date Check: Current date between StartDate and EndDate
      const startStr = toDateStr(promo.StartDate);
      const endStr = toDateStr(promo.EndDate);

      if (startStr && localDateStr < startStr) return false;
      if (endStr && localDateStr > endStr) return false;

      // 2. Time Check:
      // If both StartTime and EndTime are NULL, consider available throughout configured dates
      const startMin = parseTimeToMinutes(promo.StartTime);
      const endMin = parseTimeToMinutes(promo.EndTime);

      if (startMin !== null && endMin !== null) {
        if (startMin <= endMin) {
          if (currentMinutes < startMin || currentMinutes > endMin) return false;
        } else {
          // Overnight promotion (e.g. 22:00 to 02:00)
          if (currentMinutes < startMin && currentMinutes > endMin) return false;
        }
      } else if (startMin !== null) {
        if (currentMinutes < startMin) return false;
      } else if (endMin !== null) {
        if (currentMinutes > endMin) return false;
      }

      return true;
    });

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
