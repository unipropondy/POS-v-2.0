const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { getHoldOvertimeMinutes } = require("../utils/settingsCache");

// In-memory table locks
const tableLocks = new Map();

// Clear old locks every minute (older than 30 mins)
setInterval(() => {
  const now = Date.now();
  for (const [tableId, lock] of tableLocks.entries()) {
    if (now - lock.lockedAt > 30 * 60 * 1000) {
      tableLocks.delete(tableId);
    }
  }
}, 60 * 1000);

/* ================= IN-MEMORY LOCKS ================= */
router.post("/lock", (req, res) => {
  const { tableId, userId } = req.body;
  if (!tableId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const existingLock = tableLocks.get(tableId);
  if (existingLock && existingLock.lockedBy !== userId) {
    return res.status(409).json({
      success: false,
      message: "Table is heavily occupied by another user.",
      lockedBy: existingLock.lockedBy,
    });
  }

  tableLocks.set(tableId, { lockedBy: userId, lockedAt: Date.now() });
  res.json({ success: true });
});

router.post("/unlock", (req, res) => {
  const { tableId, userId } = req.body;
  const existingLock = tableLocks.get(tableId);
  if (existingLock && existingLock.lockedBy === userId) {
    tableLocks.delete(tableId);
  }
  res.json({ success: true });
});

router.get("/locks", (req, res) => {
  const locks = {};
  for (const [key, value] of tableLocks.entries()) {
    locks[key] = value.lockedBy;
  }
  res.json(locks);
});

/* ================= PERSISTENT TABLES ================= */
router.get("/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { section } = req.query;

    const SECTION_MAP = {
      SECTION_1: "1",
      SECTION_2: "2",
      SECTION_3: "3",
      TAKEAWAY: "4",
    };

    const holdMinutes = await getHoldOvertimeMinutes();
    let query = `
      SELECT TableId AS id, CAST(TableNumber AS VARCHAR(50)) AS label,
      CAST(DiningSection AS VARCHAR(10)) AS DiningSection, LockedByName as lockedByName,
      Status, CONVERT(VARCHAR, StartTime, 126) as StartTime, ISNULL(TotalAmount, 0) as totalAmount, CurrentOrderId as currentOrderId,
      entry_status AS entryStatus, ISNULL(PAYMENT_STATUS, 0) AS paymentStatus, CustomerName as customerName, Pax as pax,
      CASE 
        WHEN Status IN (1, 2, 3) AND StartTime IS NOT NULL AND StartTime > '2000-01-01' AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
        ELSE 0 
      END AS isOvertime,
      CASE 
        WHEN Status = 3 AND ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, ModifiedOn, GETDATE()) >= @holdMinutes THEN 1 
        ELSE 0 
      END AS isHoldOvertime,
      CONVERT(VARCHAR, ModifiedOn, 126) as ModifiedOn
      FROM TableMaster
    `;

    const request = pool.request().input("holdMinutes", sql.Int, holdMinutes);
    if (section && SECTION_MAP[section] !== undefined) {
      request.input("DiningSection", SECTION_MAP[section]);
      query += ` WHERE CAST(DiningSection AS VARCHAR(10)) = @DiningSection`;
    }
    query += ` ORDER BY SortCode`;

    const result = await request.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error("TABLES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/locked", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TableId as tableId, TableNumber as tableNumber, DiningSection, LockedByName as lockedByName, Status as status
      FROM TableMaster WHERE Status = 5
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/lock-persistent", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId, lockedByName } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const request = pool.request(); // ✅ Fixed: request was not defined
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("lockedByName", sql.NVarChar, lockedByName || null);
    request.input("ModifiedBy", sql.UniqueIdentifier, userId || null);

    const result = await request.query(`
      UPDATE TableMaster 
      SET Status = 5, LockedByName = @lockedByName, TotalAmount = 0, StartTime = NULL, ModifiedBy = @ModifiedBy, ModifiedOn = GETDATE(), CustomerName = NULL, Pax = NULL
      OUTPUT INSERTED.TableNumber, INSERTED.DiningSection, CONVERT(VARCHAR, INSERTED.ModifiedOn, 126) AS ModifiedOn
      WHERE TableId = @tableId
    `);

    // ✅ Clear CartItems for this table when locked
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      const row = result.recordset[0];
      const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: 5, 
        totalAmount: 0, 
        startTime: null,
        lockedByName: lockedByName || null,
        customerName: null,
        pax: null,
        tableNo: row?.TableNumber,
        section: sectionMap[String(row?.DiningSection)] || row?.DiningSection,
        modifiedOn: row?.ModifiedOn
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/unlock-persistent", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const result = await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
      .query(`
        UPDATE TableMaster 
        SET Status = 0, entry_status = NULL, LockedByName = NULL, TotalAmount = 0, StartTime = NULL, ModifiedBy = @ModifiedBy, ModifiedOn = GETDATE(), CustomerName = NULL, Pax = NULL
        OUTPUT INSERTED.TableNumber, INSERTED.DiningSection, CONVERT(VARCHAR, INSERTED.ModifiedOn, 126) AS ModifiedOn
        WHERE TableId = @tableId
      `);

    // ✅ Clear any items in CartItems for this table when unlocked
    await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");

    // 🔥 Emit socket event
    const io = req.app.get("io");
    if (io) {
      const row = result.recordset[0];
      const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: 0, 
        totalAmount: 0,
        startTime: null,
        lockedByName: null,
        customerName: null,
        pax: null,
        tableNo: row?.TableNumber,
        section: sectionMap[String(row?.DiningSection)] || row?.DiningSection,
        modifiedOn: row?.ModifiedOn
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ New route: POST /api/tables/save-guest
router.post("/save-guest", async (req, res) => {
  const { tableId, customerName, pax } = req.body;
  const userId = req.body.userId || req.body.UserId || req.body.USERID;

  try {
    const pool = await poolPromise;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const guestNameVal = customerName && customerName.trim() ? customerName.trim().substring(0, 9) : null;
    const paxVal = pax ? parseInt(pax) : null;

    const request = pool.request();
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("customerName", sql.NVarChar, guestNameVal);
    request.input("pax", sql.Int, paxVal);
    request.input("ModifiedBy", sql.UniqueIdentifier, userId || null);

    // Update TableMaster
    const updateTM = await request.query(`
      UPDATE TableMaster
      SET CustomerName = @customerName,
          Pax = @pax,
          Status = CASE WHEN Status = 0 THEN 1 ELSE Status END,
          StartTime = CASE WHEN StartTime IS NULL THEN GETDATE() ELSE StartTime END,
          entry_status = CASE WHEN entry_status IS NULL THEN 'q' ELSE entry_status END,
          ModifiedBy = @ModifiedBy,
          ModifiedOn = GETDATE()
      OUTPUT 
        INSERTED.TableNumber, 
        INSERTED.DiningSection, 
        INSERTED.Status,
        INSERTED.TotalAmount,
        CONVERT(VARCHAR, INSERTED.StartTime, 126) AS StartTime,
        CONVERT(VARCHAR, INSERTED.ModifiedOn, 126) AS ModifiedOn,
        INSERTED.entry_status AS entryStatus
      WHERE TableId = @tableId
    `);

    if (updateTM.recordset.length === 0) {
      return res.status(404).json({ error: "Table not found" });
    }

    const row = updateTM.recordset[0];

    // If there is an active order on RestaurantOrderCur for this table, update it as well
    await pool.request()
      .input("tableNo", sql.NVarChar, row.TableNumber)
      .input("customerName", sql.NVarChar, guestNameVal)
      .input("pax", sql.Int, paxVal)
      .query(`
        UPDATE RestaurantOrderCur
        SET CustomerName = @customerName, Pax = @pax
        WHERE Tableno = @tableNo AND isOrderClosed = 0
      `);

    // 🔥 Emit socket event with customerName and pax
    const io = req.app.get("io");
    if (io) {
      const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: row.Status,
        totalAmount: row.TotalAmount,
        startTime: row.StartTime,
        tableNo: row.TableNumber,
        section: sectionMap[String(row.DiningSection)] || row.DiningSection,
        modifiedOn: row.ModifiedOn,
        entryStatus: row.entryStatus || null,
        customerName: guestNameVal,
        pax: paxVal
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("SAVE GUEST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ New route to match user's snippet: PUT /api/tables/status
router.put("/status", async (req, res) => {
  const { tableId, status } = req.body;
  const userId = req.body.userId || req.body.UserId || req.body.USERID;

  try {
    const pool = await poolPromise;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });
    if (status === undefined) return res.status(400).json({ error: "status is required" });

    const holdMinutes = await getHoldOvertimeMinutes();
    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();
    const request = pool.request();
    request.input("tableId", sql.VarChar(50), cleanTableId);
    request.input("status", sql.Int, Number(status));
    request.input("ModifiedBy", sql.UniqueIdentifier, userId || null);
    request.input("holdMinutes", sql.Int, holdMinutes);

    const updateResult = await request.query(`
      UPDATE TableMaster 
      SET Status = @status,
          ModifiedBy = @ModifiedBy,
          entry_status = CASE WHEN @status = 0 OR @status = 5 THEN NULL ELSE entry_status END,
          StartTime = CASE 
            WHEN (@status = 1 OR @status = 2 OR @status = 3) AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE StartTime 
          END,
          TotalAmount = CASE 
            WHEN @status = 0 OR @status = 5 THEN 0 
            ELSE TotalAmount 
          END,
          CustomerName = CASE 
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE CustomerName 
          END,
          Pax = CASE 
            WHEN @status = 0 OR @status = 5 THEN NULL 
            ELSE Pax 
          END,
          ModifiedOn = GETDATE()
      OUTPUT 
        INSERTED.TotalAmount, 
        CONVERT(VARCHAR, INSERTED.StartTime, 126) AS StartTime,
        INSERTED.TableNumber,
        INSERTED.DiningSection,
        INSERTED.entry_status AS entryStatus,
        INSERTED.CustomerName AS customerName,
        INSERTED.Pax AS pax,
        CONVERT(VARCHAR, INSERTED.ModifiedOn, 126) AS ModifiedOn,
        CASE 
          WHEN INSERTED.Status IN (1, 2, 3) AND INSERTED.StartTime IS NOT NULL AND INSERTED.StartTime > '2000-01-01' AND DATEDIFF(MINUTE, INSERTED.StartTime, GETDATE()) >= 60 THEN 1 
          ELSE 0 
        END AS isOvertime,
        CASE 
          WHEN INSERTED.Status = 3 AND INSERTED.ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, INSERTED.ModifiedOn, GETDATE()) >= @holdMinutes THEN 1 
          ELSE 0 
        END AS isHoldOvertime
      WHERE TableId = @tableId
    `);
    
    const row = updateResult.recordset[0];

    // ✅ Clear CartItems if status is 0 (Available) or 5 (Locked)
    if (Number(status) === 0 || Number(status) === 5) {
      await pool.request()
        .input("tableId", sql.VarChar(50), cleanTableId)
        .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @tableId");
    }
    const currentTotal = row?.TotalAmount || 0;
    const currentStartTime = row?.StartTime || null;
    const currentIsOvertime = row?.isOvertime || 0;

    // 🔥 Emit socket event with TotalAmount, StartTime, customerName, pax and isOvertime
    const io = req.app.get("io");
    if (io) {
      const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
      io.emit("table_status_updated", { 
        tableId: cleanTableId, 
        status: Number(status),
        totalAmount: currentTotal,
        startTime: currentStartTime,
        tableNo: row?.TableNumber,
        section: sectionMap[String(row?.DiningSection)] || row?.DiningSection,
        modifiedOn: row?.ModifiedOn,
        isOvertime: currentIsOvertime,
        isHoldOvertime: row?.isHoldOvertime || 0,
        entryStatus: row?.entryStatus || null,
        customerName: row?.customerName || null,
        pax: row?.pax || null
      });
    }

    res.json({ success: true, totalAmount: currentTotal });
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    res.status(500).json({ error: "Error updating" });
  }
});

// Unused duplicate PUT /:tableId/status removed

// ✅ GET Single Table by ID
router.get("/:tableId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { tableId } = req.params;
    const cleanTableId = tableId.replace(/^\{|\}$/g, "").trim();

    const result = await pool.request()
      .input("tableId", sql.VarChar(50), cleanTableId)
      .query(`
        SELECT 
          TableId AS id, 
          TableNumber AS label,
          DiningSection, 
          Status, 
          CONVERT(VARCHAR, StartTime, 126) as StartTime, 
          ISNULL(TotalAmount, 0) as totalAmount, 
          CurrentOrderId as currentOrderId,
          LockedByName as lockedByName,
          entry_status AS entryStatus,
          CustomerName as customerName,
          Pax as pax
        FROM TableMaster
        WHERE TableId = @tableId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Table not found" });
    }

    res.json({ success: true, table: result.recordset[0] });
  } catch (err) {
    console.error("GET TABLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/diagnostic", async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT TOP 10 TableId, TableNumber, DiningSection, Status,
        CustomerName, Pax,
        CAST(TableId AS VARCHAR(50)) AS TableId_AsString
        FROM TableMaster
      `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

// ✅ POST /api/tables/move — Transfer cart + order from one table to another
router.post("/move", async (req, res) => {
  const { sourceTableId, destTableId } = req.body;
  const userId = req.body.userId || req.body.UserId || req.body.USERID;

  if (!sourceTableId || !destTableId) {
    return res.status(400).json({ error: "sourceTableId and destTableId are required" });
  }

  const cleanSource = String(sourceTableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
  const cleanDest   = String(destTableId).replace(/^\{|\}$/g, "").trim().toLowerCase();

  if (cleanSource === cleanDest) {
    return res.status(400).json({ error: "Source and destination tables must be different" });
  }

  try {
    const pool = await poolPromise;

    // ── 1. Fetch both table rows ──────────────────────────────────────────
    const tableRes = await pool.request()
      .input("src", sql.UniqueIdentifier, cleanSource)
      .input("dst", sql.UniqueIdentifier, cleanDest)
      .query(`
        SELECT
          TableId, TableNumber, DiningSection, Status,
          TotalAmount, CurrentOrderId, CustomerName, Pax, entry_status
        FROM TableMaster
        WHERE TableId IN (@src, @dst)
      `);

    const rows = tableRes.recordset;
    const srcRow = rows.find(r => String(r.TableId).toLowerCase() === cleanSource);
    const dstRow = rows.find(r => String(r.TableId).toLowerCase() === cleanDest);

    if (!srcRow) return res.status(404).json({ error: "Source table not found" });
    if (!dstRow) return res.status(404).json({ error: "Destination table not found" });

    // ── 2. Validate states ───────────────────────────────────────────────
    // Source must be occupied (1=Dining, 2=Checkout, 3=Hold)
    if (![1, 2, 3].includes(Number(srcRow.Status))) {
      return res.status(400).json({ error: `Source table is not occupied (status=${srcRow.Status})` });
    }
    // Destination must be available (0) or the same move attempt ignored
    if (Number(dstRow.Status) !== 0) {
      return res.status(400).json({ error: "Destination table is not available" });
    }

    const srcTableNo = srcRow.TableNumber;
    const dstTableNo = dstRow.TableNumber;

    // ── 3. Run atomic SQL transaction ────────────────────────────────────
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // A. Move CartItems: update CartId from source → dest
      await transaction.request()
        .input("src", sql.NVarChar(128), cleanSource)
        .input("dst", sql.NVarChar(128), cleanDest)
        .query("UPDATE [dbo].[CartItems] SET CartId = @dst WHERE CartId = @src");

      // B. Re-point RestaurantOrderCur to new table number
      await transaction.request()
        .input("srcOrderNo", sql.NVarChar(50), srcRow.CurrentOrderId || "")
        .input("dstTableNo", sql.VarChar(20), dstTableNo)
        .query(`
          UPDATE RestaurantOrderCur
          SET Tableno = @dstTableNo, ModifiedOn = GETDATE()
          WHERE OrderNumber = @srcOrderNo
            AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
        `);

      // Also handle any other open orders for this table number that aren't the CurrentOrderId
      await transaction.request()
        .input("srcTableNo", sql.VarChar(20), srcTableNo)
        .input("dstTableNo", sql.VarChar(20), dstTableNo)
        .query(`
          UPDATE RestaurantOrderCur
          SET Tableno = @dstTableNo, ModifiedOn = GETDATE()
          WHERE Tableno = @srcTableNo
            AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
        `);

      // C. Update destination TableMaster — copy source state directly in SQL
      //    (avoids JS Date round-trip which fails on some StartTime formats)
      await transaction.request()
        .input("src",   sql.UniqueIdentifier, cleanSource)
        .input("dst",   sql.UniqueIdentifier, cleanDest)
        .input("modBy", sql.UniqueIdentifier, userId || null)
        .query(`
          UPDATE dest
          SET dest.Status         = src.Status,
              dest.TotalAmount    = src.TotalAmount,
              dest.StartTime      = src.StartTime,
              dest.CurrentOrderId = src.CurrentOrderId,
              dest.CustomerName   = src.CustomerName,
              dest.Pax            = src.Pax,
              dest.entry_status   = src.entry_status,
              dest.LockedByName   = NULL,
              dest.ModifiedBy     = @modBy,
              dest.ModifiedOn     = GETDATE()
          FROM TableMaster AS dest
          INNER JOIN TableMaster AS src ON src.TableId = @src
          WHERE dest.TableId = @dst
        `);

      // D. Reset source TableMaster to Available
      await transaction.request()
        .input("src",   sql.UniqueIdentifier, cleanSource)
        .input("modBy", sql.UniqueIdentifier, userId || null)
        .query(`
          UPDATE TableMaster
          SET Status         = 0,
              TotalAmount    = 0,
              StartTime      = NULL,
              CurrentOrderId = NULL,
              CustomerName   = NULL,
              Pax            = NULL,
              entry_status   = NULL,
              LockedByName   = NULL,
              ModifiedBy     = @modBy,
              ModifiedOn     = GETDATE()
          WHERE TableId = @src
        `);

      await transaction.commit();
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }

    // ── 4. Emit socket events ────────────────────────────────────────────
    const io = req.app.get("io");
    const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };

    if (io) {
      // Source table → now Available
      io.emit("table_status_updated", {
        tableId:       cleanSource,
        status:        0,
        totalAmount:   0,
        startTime:     null,
        currentOrderId: null,
        tableNo:       srcTableNo,
        section:       sectionMap[String(srcRow.DiningSection)] || srcRow.DiningSection,
        customerName:  null,
        pax:           null,
        modifiedOn:    new Date().toISOString(),
      });

      // Destination table → now Dining (or whatever source status was)
      io.emit("table_status_updated", {
        tableId:       cleanDest,
        status:        Number(srcRow.Status),
        totalAmount:   Number(srcRow.TotalAmount) || 0,
        startTime:     null,   // frontend will get accurate value via fetchTables() refresh
        currentOrderId: srcRow.CurrentOrderId || null,
        tableNo:       dstTableNo,
        section:       sectionMap[String(dstRow.DiningSection)] || dstRow.DiningSection,
        customerName:  srcRow.CustomerName || null,
        pax:           srcRow.Pax || null,
        modifiedOn:    new Date().toISOString(),
      });

      // Refresh cart listeners for both tables
      io.emit("cart_updated", { tableId: cleanSource });
      io.emit("cart_updated", { tableId: cleanDest });
    }

    res.json({
      success:      true,
      sourceTableNo: srcTableNo,
      destTableNo:   dstTableNo,
      movedStatus:   Number(srcRow.Status),
      totalAmount:   Number(srcRow.TotalAmount) || 0,
    });

  } catch (err) {
    console.error("MOVE TABLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
