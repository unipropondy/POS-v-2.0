import { useEffect, useRef } from "react";
import { Platform, Alert } from "react-native";
import { socket } from "../constants/socket";
import { useActiveOrdersStore } from "../stores/activeOrdersStore";
import { useCartStore } from "../stores/cartStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { API_URL } from "../constants/Config";
import UniversalPrinter from "../components/UniversalPrinter";
import { useNotificationStore } from "../stores/notificationStore";

/**
 * useGlobalSocketSync
 * 
 * Handles real-time synchronization for the entire app.
 * This should be used at the Root Layout level to ensure consistency across all screens.
 */
export function useGlobalSocketSync() {
  const { appendOrder, closeActiveOrder, markItemReady, markItemServed, markItemsSent, voidOrderItem } = useActiveOrdersStore.getState();
  const { fetchCartFromDB } = useCartStore.getState();
  const lastFetchRef = useRef<Record<string, number>>({});

  // 🚀 HIGH-SPEED FETCH: Faster refresh for the active table
  const throttledFetch = (tableId: string, delay = 500) => {
    const now = Date.now();
    const last = lastFetchRef.current[tableId] || 0;
    if (now - last > delay) {
      lastFetchRef.current[tableId] = now;
      fetchCartFromDB(tableId, true);
    }
  };

  useEffect(() => {
    // --- 0. RECONNECTION RE-SYNC ---
    const handleConnect = () => {
      if (__DEV__) {
        console.log(`🔌 [Socket-Global] CONNECTED: ${socket.id} | API: ${API_URL}`);
      }
      // Re-fetch all active kitchen orders on reconnect to recover any missed socket events
      useActiveOrdersStore.getState().fetchActiveKitchenOrders();
      
      // Immediately check for any print jobs on reconnect
      const isCustomer =
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window?.location &&
        (window.location.pathname?.includes("/customer") ||
          window.location.href?.includes("/customer"));
      if (!isCustomer) {
        UniversalPrinter.processPendingPrintJobs();
      }
    };

    // 🔄 BACKGROUND SAFETY SYNC: Poll every 60 seconds as a fallback.
    // Socket events are fire-and-forget — if an event was missed during a brief network blip
    // (without a full disconnect/reconnect), this ensures the POS screen catches up within 60s.
    const backgroundSyncInterval = setInterval(() => {
      if (__DEV__) {
        console.log('[BackgroundSync] Running periodic kitchen orders refresh...');
      }
      useActiveOrdersStore.getState().fetchActiveKitchenOrders();
    }, 60 * 1000); // every 60 seconds

    // 🏓 KEEP-ALIVE: Ping the server every 4 minutes to prevent Railway from sleeping.
    // Railway free tier sleeps after ~30 mins of inactivity causing cold-start timeouts.
    const keepAliveInterval = setInterval(async () => {
      try {
        await fetch(`${API_URL}/health`, { method: 'GET' });
        if (__DEV__) {
          console.log('[KeepAlive] Pinged server successfully.');
        }
      } catch {
        if (__DEV__) {
          console.warn('[KeepAlive] Ping failed — server may be sleeping.');
        }
      }
    }, 4 * 60 * 1000); // every 4 minutes
 
    // 🔄 PRINT QUEUE SAFETY SYNC: Poll every 20 seconds as a fallback for pending print jobs.
    const printQueueSyncInterval = setInterval(() => {
      const isCustomer =
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window?.location &&
        (window.location.pathname?.includes("/customer") ||
          window.location.href?.includes("/customer"));
      if (!isCustomer) {
        UniversalPrinter.processPendingPrintJobs();
      }
    }, 20 * 1000);

    const handleConnectError = (error: any) => {
      if (__DEV__) {
        console.error("🔌 [Socket-Global] CONNECTION ERROR:", error);
      }
    };

    // --- 1. NEW ORDERS ---
    const handleNewOrder = (payload: any) => {
      if (__DEV__) {
        console.log("📦 [Socket-Global] New order:", payload.orderId);
      }
      appendOrder(payload.orderId, payload.context, payload.items, payload.createdAt);
      markItemsSent(payload.orderId);

      // --- QR Auto-Print ---
      const isQrOrder =
        payload?.context?.entryStatus === "q" ||
        payload?.entryStatus === "q" ||
        payload?.context?.orderSource === "QR";

      // ✅ Notification for QR orders
      if (isQrOrder) {
        const tableLabel = payload.context?.orderType === "TAKEAWAY"
          ? `Takeaway ${payload.context.takeawayNo || ""}`
          : `${payload.context?.section || ""} • Table ${payload.context?.tableNo || ""}`;

        useNotificationStore.getState().addNotification({
          title: "New QR Order",
          message: `Order #${payload.orderId} submitted for ${tableLabel}`,
          type: "QR_ORDER",
          orderId: payload.orderId,
          tableNo: payload.context?.tableNo,
          section: payload.context?.section,
        });

      }

      // 🖨️ QR printing is handled via the PrintJobQueue system triggered by the print_jobs_available event.
    };

    // --- 2. TABLE STATUS ---
    const handleTableStatus = (data: any) => {
      const now = Date.now();
      const tableId = data.tableId || data.tableid;
      if (!tableId) return;

      if (__DEV__) {
        console.log(`[TRACE] [${now}] [SOCKET_RECEIVE] table_status_updated | Table: ${tableId} | Status: ${data.status}`);
      }

      const status = data.status !== undefined ? data.status : data.Status;
      const totalAmount = data.totalAmount !== undefined ? data.totalAmount : data.TotalAmount;
      const startTime = data.startTime || data.StartTime;
      const currentOrderId = data.currentOrderId || data.CurrentOrderId;
      const isHoldOvertime = data.isHoldOvertime !== undefined ? data.isHoldOvertime : data.IsHoldOvertime;
      const lockedByName = data.lockedByName;
      const entryStatus = data.entryStatus || data.EntryStatus;
      
      const customerName = data.customerName !== undefined ? data.customerName : data.CustomerName;
      const pax = data.pax !== undefined ? data.pax : data.Pax;
      
      const store = useTableStatusStore.getState();
      const cleanTableId = String(tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
      let existingTable = store.tables.find((t: any) => {
        const tId = String(t.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
        return tId === cleanTableId;
      });
      
      if (!existingTable && data.tableNo) {
        existingTable = store.tables.find((t: any) => 
          String(t.tableNo) === String(data.tableNo) && 
          String(t.section) === String(data.section)
        );
      }

      // 🚀 INSTANT SYNC: Apply the status update immediately
      if (existingTable || (data.tableNo && data.section)) {
        const sectionMap: Record<string, string> = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
        const rawSection = existingTable?.section || data.section;
        const normalizedSection = sectionMap[String(rawSection)] || rawSection;
        const cleanTableNo = existingTable?.tableNo || (data.tableNo ? String(data.tableNo).trim() : "");

        const computedStatus = (status === 5 ? "LOCKED" : (status === 1 || status === 4) ? "SENT" : status === 2 ? "BILL_REQUESTED" : status === 3 ? "HOLD" : "EMPTY");
        store.updateTableStatus(
          tableId,
          normalizedSection,
          cleanTableNo,
          currentOrderId || "SYNC",
          computedStatus as any,
          startTime,
          lockedByName,
          totalAmount,
          true, 
          isHoldOvertime,
          data.modifiedOn || data.ModifiedOn,
          entryStatus,
          customerName,
          pax
        );

        if (computedStatus === "EMPTY" && tableId) {
          useCartStore.getState().clearTableSession(tableId);
        }
      }

      // ⚡ Only refresh cart if the Order ID has changed or if we're missing items
      const currentOrder = useOrderContextStore.getState().currentOrder;
      const currentCartItems = useCartStore.getState().carts[useCartStore.getState().currentContextId || ""] || [];
      
      if (currentOrder && currentOrder.tableId === tableId) {
        const existingOrderId = useCartStore.getState().tableOrderIds[tableId];
        const orderIdChanged = !!currentOrderId && currentOrderId !== "SYNC" && currentOrderId !== existingOrderId;
        const isCartEmpty = currentCartItems.length === 0 && totalAmount > 0;
        
        if (orderIdChanged || isCartEmpty) {
          if (__DEV__) {
            console.log(`[TRACE] [${Date.now()}] [SOCKET_RECEIVE] Definitive Change. Refreshing cart...`);
          }
          throttledFetch(tableId, 100); // Fast refresh for critical changes
        } else {
          // Skip redundant fetch - rely on cart_change relay for item-level updates
          if (__DEV__) {
            console.log(`[TRACE] [${Date.now()}] [SOCKET_RECEIVE] Table ${tableId} total updated. Skipping redundant fetch.`);
          }
        }
      }
    };

    // --- 3. ITEM STATUS (READY/SERVED) ---
    const handleItemStatus = (payload: { orderId: string; lineItemId: string; status: string; tableId?: string }) => {
      const cleanLineItemId = String(payload.lineItemId || "").toLowerCase();
      if (__DEV__) {
        console.log(`✨ [Socket-Global] Item ${payload.status}:`, cleanLineItemId);
      }
      
      if (payload.status === "READY") {
        markItemReady(payload.orderId, cleanLineItemId, true);
      } else if (payload.status === "SERVED") {
        markItemServed(payload.orderId, cleanLineItemId, true);
      } else if (payload.status === "VOIDED") {
        voidOrderItem(payload.orderId, cleanLineItemId);
        useCartStore.getState().voidCartItem(cleanLineItemId);
      }

      const currentOrder = useOrderContextStore.getState().currentOrder;
      const targetTableId = payload.tableId; 
      
      if (targetTableId) {
        throttledFetch(targetTableId);
      } else if (currentOrder?.tableId) {
        throttledFetch(currentOrder.tableId);
      }
    };

    // --- 4. CART UPDATED ---
    const handleCartUpdated = (data: { tableId: string; source?: string }) => {
      const cleanTarget = String(data.tableId || "").replace(/^\{|\}$/g, "").trim().toLowerCase();
      if (__DEV__) {
        console.log("🛒 [Socket-Global] Cart updated (DB Sync) for Table:", cleanTarget);
      }
      // 🛡️ BACKEND SIDE SAFEGUARD: If update is from POS auto-save, ignore it to prevent vanishing items
      if (data.source === "pos_auto_save") {
        if (__DEV__) console.log("🛡️ [Socket-Global] Ignored POS auto-save cart sync to prevent vanishing items");
        return;
      }
      const currentOrder = useOrderContextStore.getState().currentOrder;
      if (cleanTarget && currentOrder?.tableId) {
        const cleanCurrent = String(currentOrder.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase();
        if (cleanTarget === cleanCurrent) {
          if (__DEV__) {
            console.log(`[Socket-Global] Active table cart updated on server. Forcing immediate fetch...`);
          }
          fetchCartFromDB(currentOrder.tableId, true);
        }
      }
    };

    // --- 5. ORDER STATUS (CLOSE/VOID) ---
    const handleOrderStatusUpdate = (payload: { orderId: string; action: "CLOSE" | "VOID"; lineItemId?: string }) => {
      if (__DEV__) {
        console.log(`🔄 [Socket-Global] Order ${payload.action}:`, payload.orderId);
      }
      if (payload.action === "CLOSE") {
        closeActiveOrder(payload.orderId);
      } else if (payload.action === "VOID" && payload.lineItemId) {
        voidOrderItem(payload.orderId, payload.lineItemId);
        useCartStore.getState().voidCartItem(payload.lineItemId);
      }
    };

    // --- 5.5 ORDER CLOSED (PAYMENT WIPE) ---
    const handleOrderClosed = (data: { tableId: string; tableNo: string; section: string }) => {
      const { tableId, tableNo, section } = data;
      if (__DEV__) {
        console.log(`🧹 [Socket-Global] Order Closed for Table: ${tableId} (${tableNo}). Wiping KDS...`);
      }
      const store = useActiveOrdersStore.getState();
      const activeOrders = store.activeOrders;
      
      const cleanTargetId = tableId ? String(tableId).replace(/^\{|\}$/g, "").trim().toLowerCase() : null;
      const cleanTargetNo = tableNo ? String(tableNo).trim().toLowerCase() : null;
      const cleanTargetSection = section ? String(section).trim().toLowerCase() : null;

      const filtered = activeOrders.filter(o => {
        if (cleanTargetId) {
          const oId = o.context?.tableId ? String(o.context.tableId).replace(/^\{|\}$/g, "").trim().toLowerCase() : null;
          if (oId === cleanTargetId) return false;
        }
        if (cleanTargetNo) {
          const oNo = o.context?.tableNo ? String(o.context.tableNo).trim().toLowerCase() : null;
          const oSec = o.context?.section ? String(o.context.section).trim().toLowerCase() : null;
          const matchNo = oNo === cleanTargetNo;
          const matchSec = !cleanTargetSection || !oSec || oSec === cleanTargetSection;
          if (matchNo && matchSec) return false;
        }
        return true;
      });
      useActiveOrdersStore.setState({ activeOrders: filtered });

      if (tableId) {
        useCartStore.getState().clearTableSession(tableId);
      }
    };

    // --- 5.6 QR PAYMENT CONFIRMED (AUTO RECEIPT PRINT via queue) ---
    const handleQrPaymentConfirmed = (data: { tableId: string; tableNo: string; orderId: string }) => {
      const isCustomer =
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window?.location &&
        (window.location.pathname?.includes("/customer") ||
          window.location.href?.includes("/customer"));
      if (isCustomer) return; // Do not auto-print receipts on the customer's device!

      if (__DEV__) {
        console.log(`💳 [Socket-Global] QR Payment confirmed for Order: ${data.orderId}. Triggering print queue process...`);
      }
      UniversalPrinter.processPendingPrintJobs();
    };

    // --- 6. INSTANT CART SYNC (Socket-First) ---
    const handleCartChange = (payload: { tableId: string; contextId: string; items: any[]; lastUpdate: number; version?: number }) => {
      const now = Date.now();
      if (__DEV__) {
        console.log(`[TRACE] [${now}] [${payload.contextId}] socket.on: cart_change | Items: ${payload.items.length} | PayloadVersion: ${payload.version || 'NONE'}`);
      }

      const store = useCartStore.getState();
      const currentLastUpdate = store.lastLocalUpdate[payload.contextId] || 0;

      // 🛡️ SYNC SHIELD: Only update if the socket data is NEWER than our last local edit
      if (payload.lastUpdate <= currentLastUpdate) {
        if (__DEV__) {
          console.log(`🛡️ [TRACE] [${now}] [${payload.contextId}] socket.on: cart_change | ABORTED (Stale: ${payload.lastUpdate} <= ${currentLastUpdate})`);
        }
        return;
      }

      if (__DEV__) {
        console.log(`⚡ [TRACE] [${now}] [${payload.contextId}] socket.on: cart_change | APPLYING`);
      }
      store.setCartItems(payload.contextId, payload.items, true, "SOCKET_CHANGE");
    };

    const handlePrintJobsAvailable = (payload: any) => {
      const isCustomer =
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window?.location &&
        (window.location.pathname?.includes("/customer") ||
          window.location.href?.includes("/customer"));
      if (isCustomer) return; // Do not process on customer device!

      if (__DEV__) {
        console.log("🖨️ [Socket-Global] Print jobs available! Processing queue...", payload);
      }
      UniversalPrinter.processPendingPrintJobs();
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("new_order", handleNewOrder);
    socket.on("table_status_updated", handleTableStatus);
    socket.on("item_status_updated", handleItemStatus);
    socket.on("cart_updated", handleCartUpdated);
    socket.on("order_status_update", handleOrderStatusUpdate);
    socket.on("order_closed", handleOrderClosed);
    socket.on("qr_payment_confirmed", handleQrPaymentConfirmed);
    socket.on("cart_change", handleCartChange);
    socket.on("print_jobs_available", handlePrintJobsAvailable);

    return () => {
      clearInterval(keepAliveInterval);
      clearInterval(backgroundSyncInterval);
      clearInterval(printQueueSyncInterval);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("new_order", handleNewOrder);
      socket.off("table_status_updated", handleTableStatus);
      socket.off("item_status_updated", handleItemStatus);
      socket.off("cart_updated", handleCartUpdated);
      socket.off("order_status_update", handleOrderStatusUpdate);
      socket.off("order_closed", handleOrderClosed);
      socket.off("qr_payment_confirmed", handleQrPaymentConfirmed);
      socket.off("cart_change", handleCartChange);
      socket.off("print_jobs_available", handlePrintJobsAvailable);
    };
  }, []);

  return socket;
}
