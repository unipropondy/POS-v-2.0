// frontend/src/components/UniversalPrinter.ts - COMPLETE WITH DISCOUNT SUPPORT ✅

import { format } from "date-fns";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import ThermalPrinter from "react-native-thermal-printer";
import { API_URL } from "../constants/Config";
import { formatToSingaporeDate, formatToSingaporeTime, formatToSingaporeDateTime, parseDatabaseDate } from "../utils/timezoneHelper";
import BillPDFGenerator from "./BillPDFGenerator";
import { PrinterDetector } from "./PrinterDetector";
import SunmiPrinterService from "./SunmiPrinterService";
import { useCompanySettingsStore } from "../stores/companySettingsStore";

// Printer types
export type PrinterType =
  | "thermal"
  | "receipt"
  | "label"
  | "laser"
  | "bluetooth"
  | "network"
  | "usb"
  | "unknown";

interface PrinterInfo {
  type: PrinterType;
  name: string;
  address?: string;
  isDefault: boolean;
  paperSize?: "58mm" | "80mm" | "A4" | "label";
}

interface DiscountInfo {
  applied: boolean;
  type: "percentage" | "fixed";
  value: number;
  amount: number;
}

class UniversalPrinter {
  private static detectedPrinters: PrinterInfo[] = [];
  private static defaultPrinter: PrinterInfo | null = null;
  private static cachedPrinters: any = null;
  private static lastPrintersFetchTime: number = 0;

  // ==================== DEDUPLICATION CACHE ====================
  // Cache key = "orderId:itemFingerprint" so that a legitimate additional-round
  // KOT (same orderId, different new items) is never blocked.
  // Only a byte-identical replay of the same orderId + same item set is rejected.
  // Entries older than 15 minutes are evicted to bound memory usage.
  private static printedOrdersCache = new Map<string, number>();
  private static printedReceiptsCache = new Map<string, number>();

  /**
   * Builds a stable, order-independent fingerprint from the items array.
   * Uses the most-specific ID available per item, then sorts so the key is
   * the same regardless of the order items arrive in the payload.
   */
  private static buildItemFingerprint(items: any[]): string {
    return items
      .map(
        (i: any) =>
          String(
            i.lineItemId ??
            i.LineItemId ??
            i.dishId ??
            i.DishId ??
            i.id ??
            i.name ??
            "?"
          )
      )
      .sort()
      .join(",");
  }

  private static isDuplicatePrint(orderId: string, items: any[]): boolean {
    const now = Date.now();
    const TTL = 15 * 60 * 1000; // 15 minutes
    // Evict stale entries to prevent unbounded memory growth
    for (const [key, ts] of this.printedOrdersCache.entries()) {
      if (now - ts > TTL) this.printedOrdersCache.delete(key);
    }
    // Composite key: orderId + exact item set — allows additional KOTs for the same order
    const cacheKey = `${orderId}:${this.buildItemFingerprint(items)}`;
    if (this.printedOrdersCache.has(cacheKey)) {
      console.log(
        `🛡️ [UniversalPrinter] Duplicate print blocked | Order: ${orderId} | Items: ${items.length}`
      );
      return true;
    }
    this.printedOrdersCache.set(cacheKey, now);
    return false;
  }

  private static isDuplicateReceiptPrint(orderId: string): boolean {
    const now = Date.now();
    const TTL = 15 * 60 * 1000; // 15 minutes
    for (const [key, ts] of this.printedReceiptsCache.entries()) {
      if (now - ts > TTL) this.printedReceiptsCache.delete(key);
    }
    if (this.printedReceiptsCache.has(orderId)) {
      console.log(`🛡️ [UniversalPrinter] Duplicate receipt print blocked for Order: ${orderId}`);
      return true;
    }
    this.printedReceiptsCache.set(orderId, now);
    return false;
  }

  static async detectAllPrinters(): Promise<PrinterInfo[]> {
    const printers: PrinterInfo[] = [];
    if (Platform.OS !== "android") return printers;

    try {
      // Android Print Service
      try {
        const hasPrintService = await this.checkAndroidPrintService();
        if (hasPrintService) {
          printers.push({
            type: "laser",
            name: "Android Print Service",
            isDefault: false,
            paperSize: "A4",
          });
        }
      } catch (e) {}

      this.detectedPrinters = printers;
      this.defaultPrinter =
        printers.find((p) => p.type === "thermal") || printers[0] || null;
      return printers;
    } catch (error) {
      return [];
    }
  }

  static async openCashDrawer(printerIpOverride?: string): Promise<boolean> {
    try {
      const { default: CashDrawerService } = await import('../services/CashDrawerService');
      const ip = printerIpOverride || await CashDrawerService.getCashierPrinterIp();
      return await CashDrawerService.openCashDrawer(ip);
    } catch (e) {
      console.warn('[UniversalPrinter] Cash drawer open failed:', e);
      return false;
    }
  }

  private static getPrintWidth(printer: PrinterInfo): number {
    switch (printer.paperSize) {
      case "58mm":
        return 164;
      case "80mm":
        return 226;
      case "A4":
        return 612;
      case "label":
        return 300;
      default:
        return 226;
    }
  }

  private static async isIpReachable(ip: string, port: number = 80, timeoutMs: number = 600): Promise<boolean> {
    if (!ip || ip.trim() === "") return false;
    const cleanIp = ip.trim();
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cleanIp);
    if (!isIp) return false;

    // Avoid HTTP requests to raw TCP port 9100 as the printer will print the HTTP headers!
    if (port === 9100) {
      return true;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await fetch(`http://${cleanIp}:${port}`, {
        method: "GET",
        signal: controller.signal,
        mode: "no-cors",
        headers: { "Cache-Control": "no-cache" }
      });
      clearTimeout(timer);
      console.log(`🔌 [isIpReachable] Connected/Alive: ${cleanIp}`);
      return true;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        console.log(`🔌 [isIpReachable] Offline/Timeout on ${cleanIp}`);
        return false;
      }
      console.log(`🔌 [isIpReachable] Host responded (alive): ${cleanIp}`);
      return true;
    }
  }

  // ==================== SALES REPORT ====================
  static async printSalesReport(
    reportData: any,
    userId?: string | number,
    t?: any,
  ): Promise<boolean> {
    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = this.generateSalesReportHTML(reportData, company);

      // ✅ Save as PDF (no preview)
      const { uri } = await Print.printToFileAsync({ html });
      console.log("📄 Sales report saved at:", uri);

      // ✅ Optionally share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }

      return true;
    } catch (error) {
      console.log("Sales report error:", error);
      return false;
    }
  }
  private static generateSalesReportHTML(data: any, company: any): string {
    const symbol = company.currencySymbol || "$";
    return `<!DOCTYPE html><html><head><style>
      body { font-family: monospace; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
      .company-name { font-size: 24px; font-weight: bold; }
      .report-title { font-size: 20px; font-weight: bold; margin: 15px 0; text-align: center; }
      .section-title { font-size: 16px; font-weight: bold; margin: 15px 0 10px; background: #f0f0f0; padding: 5px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
      .amount { text-align: right; }
      .summary-box { display: inline-block; width: 30%; padding: 10px; margin: 5px; background: #f9f9f9; text-align: center; border-radius: 5px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || "POS SYSTEM"}</div><div>${company.address || ""}</div><div>GST: ${company.gstNo || "N/A"}</div><div class="report-title">SALES REPORT</div><div>Period: ${data.period || "Today"}</div></div>
      <div style="text-align:center"><div class="summary-box"><div>Total Sales</div><div style="font-size:24px">${data.summary?.totalSales || 0}</div></div>
      <div class="summary-box"><div>Total Items</div><div style="font-size:24px">${data.summary?.totalItems || 0}</div></div>
      <div class="summary-box"><div>Total Revenue</div><div style="font-size:24px">${symbol}${(data.summary?.totalRevenue || 0).toFixed(2)}</div></div></div>
      <div class="section-title">💳 PAYMENT BREAKDOWN</div>${this.generateTableFromObject(data.paymentBreakdown || {}, symbol)}</div>
      ${data.items && data.items.length > 0 ? `<div class="section-title">📋 ITEM WISE SALES</div>${this.generateItemsTable(data.items, symbol)}` : ""}
      <div class="footer"><p>© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD</p></div>
    </body></html>`;
  }

  // ==================== CATEGORY REPORT ====================
  static async printCategoryReport(
    categories: any[],
    selectedCategory: string | null,
    categoryItems: any[],
    categoryTransactions: any[],
    userId?: string | number,
    t?: any,
    options?: any,
  ): Promise<boolean> {
    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = selectedCategory
        ? this.generateCategoryDetailHTML(
            selectedCategory,
            categoryItems,
            categoryTransactions,
            company,
            options,
          )
        : this.generateAllCategoriesHTML(categories, company, options);

      // ✅ Save as PDF (no preview)
      const { uri } = await Print.printToFileAsync({ html });
      console.log("📄 Category report saved at:", uri);

      // ✅ Optionally share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }

      return true;
    } catch (error) {
      console.log("Category report error:", error);
      return false;
    }
  }
  private static generateCategoryDetailHTML(
    categoryName: string,
    items: any[],
    transactions: any[],
    company: any,
    options?: any,
  ): string {
    const symbol = company.currencySymbol || "$";
    const groupTransactions = (tx: any[]) => {
      const grouped: any = {};
      tx.forEach((t) => {
        if (!grouped[t.saleId])
          grouped[t.saleId] = {
            id: t.saleId,
            date: t.saleDate,
            items: [],
            total: 0,
          };
        grouped[t.saleId].items.push({
          name: t.name,
          quantity: t.quantity,
          price: t.price,
        });
        grouped[t.saleId].total += t.price * t.quantity;
      });
      return Object.values(grouped).sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    };
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
      .category-title { font-size: 22px; font-weight: bold; text-align: center; margin: 20px 0; }
      .section-title { font-size: 18px; font-weight: bold; margin: 20px 0 10px; background: #f0f0f0; padding: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
      .amount { text-align: right; }
      .transaction-card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; margin-bottom: 15px; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || "Store"}</div><div>${company.address || ""}</div><div>GST: ${company.gstNo || "N/A"}</div></div>
      <div class="category-title">📦 ${categoryName}</div>
      <div style="display:flex;justify-content:space-around;margin:20px 0;padding:15px;background:#f9f9f9;border-radius:5px">
        <div><div>Total Items</div><div style="font-size:18px;font-weight:bold">${items.length}</div></div>
        <div><div>Quantity Sold</div><div style="font-size:18px;font-weight:bold">${items.reduce((s, i) => s + (i.quantity || 0), 0)}</div></div>
        <div><div>Total Revenue</div><div style="font-size:18px;font-weight:bold">${symbol}${items.reduce((s, i) => s + (i.revenue || 0), 0).toFixed(2)}</div></div>
      </div>
      <div class="section-title">📋 Items Sold</div>${this.generateItemsTable(items, symbol)}
      <div class="section-title">📄 Transaction History</div>${
        transactions.length
          ? groupTransactions(transactions)
              .map(
                (sale: any) =>
                  `<div class="transaction-card"><div><strong>#${sale.id}</strong> - ${symbol}${sale.total.toFixed(2)}</div><div>${formatToSingaporeDateTime(sale.date)}</div>${sale.items.map((item: any) => `<div>• ${item.name} x${item.quantity} - ${symbol}${(item.price * item.quantity).toFixed(2)}</div>`).join("")}</div>`,
              )
              .join("")
          : "<p>No transactions</p>"
      }
      <div class="footer"><p>End of Report</p></div>
    </body></html>`;
  }

  private static generateAllCategoriesHTML(
    categories: any[],
    company: any,
    options?: any,
  ): string {
    const symbol = company.currencySymbol || "$";
    const summary = options?.summary || {
      totalSales: 0,
      totalItems: 0,
      totalRevenue: 0,
      paymentBreakdown: {},
    };
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; padding: 20px; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; }
      .summary-section { display: flex; justify-content: space-between; margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
      .category-card { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 5px; padding: 15px; }
      .category-name { font-size: 18px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
      .amount { text-align: right; }
      .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
      <div class="header"><div class="company-name">${company.name || "Store"}</div><div>${company.address || ""}</div><div>GST: ${company.gstNo || "N/A"}</div><div class="report-title">📊 CATEGORY WISE SALES</div></div>
      <div class="summary-section"><div><div>Total Sales</div><div>${summary.totalSales}</div></div><div><div>Total Items</div><div>${summary.totalItems}</div></div><div><div>Total Revenue</div><div>${symbol}${summary.totalRevenue.toFixed(2)}</div></div></div>
      <div><h3>💳 PAYMENT BREAKDOWN</h3>${Object.entries(
        summary.paymentBreakdown,
      )
        .map(
          ([m, a]) => `<div>${m}: ${symbol}${(a as number).toFixed(2)}</div>`,
        )
        .join("")}</div>
      ${categories.map((cat) => `<div class="category-card"><div class="category-name">${cat.name}</div><div>Revenue: ${symbol}${(cat.totalRevenue || 0).toFixed(2)} | Items: ${cat.totalQuantity || 0}</div>${this.generateItemsTable(cat.items || [], symbol)}</div>`).join("")}
      <div class="footer"><p>© ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD</p></div>
    </body></html>`;
  }

  private static generateItemsTable(items: any[], symbol: string): string {
    if (!items.length) return "<p>No items</p>";
    return `<table><thead><tr><th>Item</th><th class="amount">Qty</th><th class="amount">Price</th><th class="amount">Total</th></tr></thead><tbody>${items.map((i) => `<tr><td>${i.name}</td><td class="amount">${i.quantity || 0}</td><td class="amount">${symbol}${(i.price || 0).toFixed(2)}</td><td class="amount">${symbol}${(i.revenue || 0).toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
  }

  private static generateTableFromObject(
    obj: Record<string, any>,
    symbol: string,
  ): string {
    const entries = Object.entries(obj);
    if (!entries.length) return "<p>No data</p>";
    return `<table><tbody>${entries.map(([k, v]) => `<tr><td>${k}</td><td class="amount">${symbol}${(v as number).toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
  }

  private static async isBridgeOnline(): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/api/print-jobs/bridge-status`);
      const data = await response.json();
      return !!(data && data.success && data.online);
    } catch (e) {
      console.warn("[UniversalPrinter] Failed to check print bridge status:", e);
      return false;
    }
  }

  private static async queuePrintJob(
    printerType: number,
    kitchenTypeValue: string | number | undefined,
    content: string
  ): Promise<boolean> {
    try {
      const storeId = "STORE_001";
      const response = await fetch(`${API_URL}/api/print-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer unipro-pos-bridge-token-2026",
          "x-store-id": storeId
        },
        body: JSON.stringify({
          printerType,
          kitchenTypeValue: kitchenTypeValue !== undefined ? String(kitchenTypeValue) : undefined,
          content
        })
      });
      const data = await response.json();
      if (data.success !== true || !data.jobId) {
        return false;
      }

      // Poll for bridge completion (up to 8.0 seconds)
      const jobId = data.jobId;
      const start = Date.now();
      while (Date.now() - start < 8000) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          const statusRes = await fetch(`${API_URL}/api/print-jobs/status/${jobId}`);
          const statusData = await statusRes.json();
          if (statusData.success && statusData.status === 'COMPLETED') {
            console.log(`✅ [UniversalPrinter] Print job ${jobId} completed successfully on bridge`);
            return true;
          }
          if (statusData.success && statusData.status === 'FAILED') {
            console.warn(`❌ [UniversalPrinter] Print job ${jobId} failed on bridge side:`, statusData.error);
            return false;
          }
        } catch (err) {
          console.error("[UniversalPrinter] Status poll error:", err);
        }
      }
      console.warn(`[UniversalPrinter] Print job ${jobId} timed out (bridge offline/no printer)`);
      return false;
    } catch (e) {
      console.warn("[UniversalPrinter] Failed to queue print job:", e);
      return false;
    }
  }

  // ==================== KOT PRINTING (80mm) ====================
  private static async logPrintJob(
    orderId: string,
    orderNo: string,
    type: "NEW" | "ADDITIONAL" | "REPRINT" | "KDS_PRINT"
  ): Promise<void> {
    try {
      const baseUrl = API_URL;
      await fetch(`${baseUrl}/api/orders/log-print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderId && orderId.length > 30 ? orderId : null,
          orderNumber: orderNo,
          printType: 1, // KOT
          isEdit: type === "ADDITIONAL",
          isReprint: type === "REPRINT",
          isHold: false,
        }),
      });
      console.log("📝 Print job logged to PrintReport");
    } catch (logErr) {
      console.warn("Failed to log print to DB:", logErr);
    }
  }

  static async printKDSOrder(
    orderData: any,
    userId?: string | number,
    kdsPrinterIp?: string,
  ): Promise<boolean> {
    if (Platform.OS === "web") {
      try {
        const isOnline = await this.isBridgeOnline();
        if (!isOnline) {
          console.log("📡 [Web Print Bridge] Bridge is OFFLINE. Direct fallback to preview.");
          const html = this.generateKOTHTML(orderData, "KDS_PRINT");
          let frame = document.getElementById("kot-print-iframe") as HTMLIFrameElement;
          if (!frame) {
            frame = document.createElement("iframe");
            frame.id = "kot-print-iframe";
            frame.style.display = "none";
            document.body.appendChild(frame);
          }

          const doc = frame.contentWindow?.document || frame.contentDocument;
          if (doc) {
            doc.open();
            doc.write(html);
            doc.close();

            const triggerPrint = () => {
              frame.contentWindow?.focus();
              frame.contentWindow?.print();
            };

            frame.contentWindow?.addEventListener("load", triggerPrint);
            setTimeout(triggerPrint, 50);
          }
          await this.logPrintJob(orderData.orderId, orderData.orderNo, "REPRINT");
          return true;
        }

        const text = this.formatKOTThermalText(orderData, "KDS_PRINT");
        console.log(`📡 [Web Print Bridge] Queueing KDS print`);
        const success = await this.queuePrintJob(4, undefined, text);
        if (success) {
          await this.logPrintJob(orderData.orderId, orderData.orderNo, "REPRINT");
          return true;
        }

        // Web Fallback: If Print Bridge failed, trigger iframe preview
        console.log("⚠️ [Web KDS Print] Print Bridge queue failed. Falling back to iframe print preview.");
        const html = this.generateKOTHTML(orderData, "KDS_PRINT");
        let frame = document.getElementById("kot-print-iframe") as HTMLIFrameElement;
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "kot-print-iframe";
          frame.style.display = "none";
          document.body.appendChild(frame);
        }

        const doc = frame.contentWindow?.document || frame.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          const triggerPrint = () => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          };

          frame.contentWindow?.addEventListener("load", triggerPrint);
          setTimeout(triggerPrint, 800);
        }
        await this.logPrintJob(orderData.orderId, orderData.orderNo, "REPRINT");
        return true;
      } catch (err) {
        console.warn("[Web Print Bridge] KDS Print failed, falling back to iframe print preview:", err);
        try {
          const html = this.generateKOTHTML(orderData, "KDS_PRINT");
          let frame = document.getElementById("kot-print-iframe") as HTMLIFrameElement;
          if (!frame) {
            frame = document.createElement("iframe");
            frame.id = "kot-print-iframe";
            frame.style.display = "none";
            document.body.appendChild(frame);
          }

          const doc = frame.contentWindow?.document || frame.contentDocument;
          if (doc) {
            doc.open();
            doc.write(html);
            doc.close();

            const triggerPrint = () => {
              frame.contentWindow?.focus();
              frame.contentWindow?.print();
            };

            frame.contentWindow?.addEventListener("load", triggerPrint);
            setTimeout(triggerPrint, 800);
          }
          await this.logPrintJob(orderData.orderId, orderData.orderNo, "REPRINT");
          return true;
        } catch (fallbackErr) {
          console.error("Web KDS print fallback failed:", fallbackErr);
          return false;
        }
      }
    }

    // Mobile/Native
    return this.printKOT(orderData, userId, "KDS_PRINT", kdsPrinterIp);
  }

  static async printKOT(
    orderData: any,
    userId?: string | number,
    type: "NEW" | "ADDITIONAL" | "REPRINT" | "KDS_PRINT" = "NEW",
    printerIpOverride?: string,
  ): Promise<boolean> {
    if (type !== "KDS_PRINT" && (!printerIpOverride || String(printerIpOverride).trim() === "")) {
      console.log(`🖨️ [UniversalPrinter] Skipping KOT print for "${orderData.kitchenName || 'Unknown Kitchen'}" - IP is empty/disabled.`);
      return true;
    }

    if (Platform.OS === "web") {
      try {
        const isOnline = await this.isBridgeOnline();
        if (!isOnline) {
          console.log("📡 [Web Print Bridge] Bridge is OFFLINE. Direct fallback to preview.");
          const html = this.generateKOTHTML(orderData, type);
          let frame = document.getElementById("kot-print-iframe") as HTMLIFrameElement;
          if (!frame) {
            frame = document.createElement("iframe");
            frame.id = "kot-print-iframe";
            frame.style.display = "none";
            document.body.appendChild(frame);
          }

          const doc = frame.contentWindow?.document || frame.contentDocument;
          if (doc) {
            doc.open();
            doc.write(html);
            doc.close();

            let printed = false;
            const triggerPrint = () => {
              if (printed) return;
              printed = true;
              frame.contentWindow?.focus();
              frame.contentWindow?.print();
            };

            frame.contentWindow?.addEventListener("load", triggerPrint);
            setTimeout(triggerPrint, 50);
          }
          await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
          return true;
        }

        const text = this.formatKOTThermalText(orderData, type);
        // Map kitchenCode or kitchenTypeValue
        const kitchenTypeValue = orderData.kitchenCode || orderData.KitchenCode || orderData.kitchenTypeValue || orderData.KitchenTypeValue || "0";
        console.log(`📡 [Web Print Bridge] Queueing KOT to Kitchen type: ${kitchenTypeValue}`);
        const success = await this.queuePrintJob(2, kitchenTypeValue, text);
        if (success) {
          await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
          return true;
        }

        // 🚀 Fallback: If Print Bridge failed or printer not detected on web, trigger iframe print preview immediately
        console.log("⚠️ [Web KOT Print] Print Bridge queue failed. Falling back to iframe print preview.");
        const html = this.generateKOTHTML(orderData, type);
        let frame = document.getElementById("kot-print-iframe") as HTMLIFrameElement;
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "kot-print-iframe";
          frame.style.display = "none";
          document.body.appendChild(frame);
        }

        const doc = frame.contentWindow?.document || frame.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          let printed = false;
          const triggerPrint = () => {
            if (printed) return;
            printed = true;
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          };

          frame.contentWindow?.addEventListener("load", triggerPrint);
          setTimeout(triggerPrint, 800);
        }
        await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
        return true;
      } catch (err) {
        console.warn("[Web Print Bridge] KOT Queue failed, falling back to iframe print preview:", err);
        try {
          const html = this.generateKOTHTML(orderData, type);
          let frame = document.getElementById("kot-print-iframe") as HTMLIFrameElement;
          if (!frame) {
            frame = document.createElement("iframe");
            frame.id = "kot-print-iframe";
            frame.style.display = "none";
            document.body.appendChild(frame);
          }

          const doc = frame.contentWindow?.document || frame.contentDocument;
          if (doc) {
            doc.open();
            doc.write(html);
            doc.close();

            let printed = false;
            const triggerPrint = () => {
              if (printed) return;
              printed = true;
              frame.contentWindow?.focus();
              frame.contentWindow?.print();
            };

            frame.contentWindow?.addEventListener("load", triggerPrint);
            setTimeout(triggerPrint, 800);
          }
          await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
          return true;
        } catch (fallbackErr) {
          console.error("Web KOT print fallback failed:", fallbackErr);
          return false;
        }
      }
    }

    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = this.generateKOTHTML(orderData, type);
      
      let targetIp: string = printerIpOverride || "";
      if (!targetIp) {
        if (type === "KDS_PRINT") {
          try {
            const res = await fetch(`${API_URL}/api/settings/kitchen-printers`);
            const printers = await res.json();
            const kdsPrinter = printers.find((p: any) => p.PrinterType === 4);
            targetIp = kdsPrinter?.PrinterIP || "";
          } catch (err) {
            console.warn("Failed to fetch KDS printer IP:", err);
          }
        }
        if (!targetIp) {
          targetIp = company.printerIp || "";
        }
      }

      // ✅ 1. Try Hardware Printer (WiFi or Bluetooth)
      const hasConfiguredIp = targetIp && targetIp.trim().length > 0;
      if (hasConfiguredIp) {
        let isReachable = false;
        const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetIp.trim());
        if (isIp) {
          isReachable = await this.isIpReachable(targetIp, 9100);
        } else {
          isReachable = true;
        }

        if (isReachable) {
          try {
            const text = this.formatKOTThermalText(orderData, type);

            if (isIp) {
              console.log(`🌐 KOT WiFi print to: ${targetIp}`);
              const printPromise = ThermalPrinter.printTcp({
                ip: targetIp,
                port: 9100,
                payload: text,
                mmFeedPaper: 25,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("WiFi Timeout")), 1500),
              );
              await Promise.race([printPromise, timeoutPromise]);
            } else {
              console.log(`🔵 KOT Bluetooth print to: ${targetIp}`);
              const printPromise = ThermalPrinter.printBluetooth({
                macAddress: targetIp,
                payload: text,
                mmFeedPaper: 25,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("BT Timeout")), 3000),
              );
              await Promise.race([printPromise, timeoutPromise]);
            }
            await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
            return true;
          } catch (printError) {
            console.warn("❌ Hardware KOT failed/timeout, falling back directly to PDF...");
          }
        } else {
          console.warn(`❌ configured printer IP ${targetIp} not reachable, falling back directly to PDF...`);
        }
      } else {
        // ✅ 2. Try Sunmi direct print (Silent) (Only if IP is NOT entered)
        const sunmiReady = await SunmiPrinterService.init().catch(() => false);
        if (sunmiReady) {
          try {
            const printPromise = SunmiPrinterService.printKOT(orderData, type);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Sunmi Timeout")), 2000),
            );
            const printed = await Promise.race([printPromise, timeoutPromise]);

            if (printed) {
              console.log("✅ KOT Printed with Sunmi - NO PREVIEW");
              await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
              return true;
            }
          } catch (sunmiErr) {
            console.warn("❌ Sunmi KOT failed/timeout:", sunmiErr);
          }
        }
      }

      // ✅ 3. Mobile Fallback (Android/iOS)
      const { uri } = await Print.printToFileAsync({
        html,
        width: 302, // 80mm at 96dpi (80 × 3.7795 ≈ 302px)
      });

      if (Platform.OS === "android" || Platform.OS === "ios") {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      }

      // ✅ 4. LOG TO DATABASE (Audit Trail)
      await this.logPrintJob(orderData.orderId, orderData.orderNo, type);
      return true;
    } catch (error) {
      console.log("KOT Print Error:", error);
      return false;
    }
  }

  private static generateKOTHTML(data: any, type: string): string {
    let title =
      type === "KDS_PRINT"
        ? "KDS PRINT"
        : type === "REPRINT"
          ? "REPRINT"
          : type === "ADDITIONAL"
            ? "ADDITIONAL"
            : "NEW ORDER";
    title = title.replace(/\s*KOT\s*/gi, "").trim();

    const items = (data.items || []).filter((item: any) => (item.status || item.Status || "").toUpperCase() !== "VOIDED");
    const tableNo = data.tableNo || "N/A";
    const deviceNo = data.deviceNo || "1";
    const orderNo = data.orderNo || data.orderId || "N/A";
    const waiter = data.waiterName || "Staff";
    const kotDateStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    const kotTimeStr = formatToSingaporeTime(new Date(), { hour: '2-digit', minute: '2-digit', hour12: false });
    const timestamp = `${kotDateStr} ${kotTimeStr}`;
    const kitchenName = data.kitchenName || "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @page { 
            size: 80mm auto; 
            margin: 0; 
          }
          body { 
            font-family: 'Arial', sans-serif; 
            width: 80mm; 
            padding: 0; 
            margin: 0; 
            color: #000; 
            background: #fff;
          }
          .kot-container { 
            padding: 1mm 2mm; 
            width: 76mm;
          }
          
          .header-box { 
            background: #000 !important; 
            color: #fff !important; 
            padding: 5px 8px; 
            text-align: center; 
            font-weight: bold; 
            font-size: 32px; 
            display: block;
            margin-bottom: 4px;
            text-transform: uppercase;
            -webkit-print-color-adjust: exact;
          }
          
          .timestamp {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
            text-align: center;
          }
          
          .table-info {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px dashed #000;
            padding: 3px 0;
            margin-bottom: 6px;
            font-size: 28px;
            font-weight: 900;
          }
          
          .headers {
            display: flex;
            border-bottom: 1.5px dashed #000;
            padding: 3px 0;
            font-size: 22px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .qty-head { width: 50px; margin-right: 8px; }
          
          .item-row {
            border-bottom: 1.5px solid #000;
            padding: 8px 0;
          }
          
          .item-main {
            display: flex;
            align-items: flex-start;
          }
          
          .item-qty {
            font-size: 32px;
            font-weight: 900;
            width: 50px;
            line-height: 1;
            margin-right: 8px;
          }
          
          .item-name {
            font-size: 30px;
            font-weight: 900;
            flex: 1;
            line-height: 1.1;
          }
          
          .modifier-list {
            margin-left: 58px;
            margin-top: 3px;
          }
          
          .modifier-item {
            font-size: 26px;
            font-weight: 900;
            color: #000;
            display: block;
          }
          
          .remarks {
            margin-left: 58px;
            font-size: 26px;
            font-weight: 900;
            margin-top: 4px;
          }
          
          .footer {
            margin-top: 10px;
            font-size: 18px;
            font-weight: bold;
            font-family: monospace;
          }
          
          .kitchen-name {
            text-align: center;
            font-size: 32px;
            font-weight: bold;
            margin-top: 16px;
            text-transform: uppercase;
            border-top: 2px dashed #000;
            border-bottom: 2px dashed #000;
            padding: 8px 0;
          }
          
          @media print {
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body { width: 80mm; }
            .header-box { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="kot-container">
          <div class="header-box">${title}</div>
          <div class="timestamp">${timestamp}</div>
          
          <div class="table-info">
            <span>Table:${tableNo}</span>
          </div>
          
          <div class="headers">
            <div class="qty-head">Qty</div>
            <div>Item</div>
          </div>

          <div class="item-list">
            ${(() => {
              if (type === "KDS_PRINT") {
                const kitchenGroups: Record<string, any[]> = {};
                items.forEach((item: any) => {
                  const kName = (item.KitchenTypeName || item.kitchenTypeName || item.dishGroupName || item.categoryName || "KITCHEN").toUpperCase().trim();
                  if (!kitchenGroups[kName]) kitchenGroups[kName] = [];
                  kitchenGroups[kName].push(item);
                });

                return Object.entries(kitchenGroups).map(([kName, groupItems]) => {
                  return `
                    <div style="font-size: 24px; font-weight: bold; margin-top: 15px; border-bottom: 2px solid #000; padding-bottom: 3px; text-transform: uppercase;">
                      <b>${kName}</b>
                    </div>
                    ${groupItems.map((item: any) => {
                      const noteText = item.note || item.notes || item.Remarks || item.remarks;
                      const comboSels = item.comboSelections || 
                        (typeof item.ComboDetailsJSON === 'string' && item.ComboDetailsJSON 
                          ? (() => { try { const p = JSON.parse(item.ComboDetailsJSON); return Array.isArray(p) ? p : p.groups; } catch { return undefined; } })() 
                          : (Array.isArray(item.ComboDetailsJSON) ? item.ComboDetailsJSON : undefined)) || [];
                      const hasCombo = Array.isArray(comboSels) && comboSels.length > 0;

                      return `
                        <div class="item-row">
                          <div class="item-main">
                            <div class="item-qty">${item.quantity || item.qty || 1}</div>
                            <div class="item-name">
                              ${(item.name || "").replace(/\n/g, '<br/>')}
                              ${item.songName || item.SongName ? `<div style="font-size: 26px; font-weight: normal; color: #555; margin-top: 4px;">🎵 ${item.songName || item.SongName}</div>` : ''}
                            </div>
                          </div>
                          ${
                            item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway
                              ? `<div class="modifier-list"><span class="modifier-item">- Takeaway</span></div>`
                              : ""
                          }
                          ${
                            item.modifiers && item.modifiers.length > 0
                              ? `<div class="modifier-list">${item.modifiers.map((m: any) => `<span class="modifier-item">+ ${m.name || m.ModifierName}</span>`).join("")}</div>`
                              : ""
                          }
                          ${
                            hasCombo
                              ? `<div class="modifier-list">${comboSels.map((g: any) => {
                                  const choices = g.items || g.dishes || (Array.isArray(g) ? g : [g]);
                                  if (Array.isArray(choices)) {
                                    return choices.map((opt: any) => `<span class="modifier-item">- ${opt.name}</span>`).join("");
                                  }
                                  return "";
                                }).join("")}</div>`
                              : ""
                          }
                          ${noteText ? `<div class="remarks">* ${noteText}</div>` : ""}
                        </div>
                      `;
                    }).join("")}
                  `;
                }).join("");
              }

              return items.map((item: any) => {
                const noteText = item.note || item.notes || item.Remarks || item.remarks;
                const comboSels = item.comboSelections || 
                  (typeof item.ComboDetailsJSON === 'string' && item.ComboDetailsJSON 
                    ? (() => { try { const p = JSON.parse(item.ComboDetailsJSON); return Array.isArray(p) ? p : p.groups; } catch { return undefined; } })() 
                    : (Array.isArray(item.ComboDetailsJSON) ? item.ComboDetailsJSON : undefined)) || [];
                const hasCombo = Array.isArray(comboSels) && comboSels.length > 0;

                return `
                  <div class="item-row">
                    <div class="item-main">
                      <div class="item-qty">${item.quantity || item.qty || 1}</div>
                      <div class="item-name">
                        ${(item.name || "").replace(/\n/g, '<br/>')}
                        ${item.songName || item.SongName ? `<div style="font-size: 26px; font-weight: normal; color: #555; margin-top: 4px;">🎵 ${item.songName || item.SongName}</div>` : ''}
                      </div>
                    </div>
                    ${
                      item.isTakeaway ||
                      item.IsTakeaway ||
                      item.isTakeAway ||
                      item.IsTakeAway
                        ? `
                      <div class="modifier-list">
                        <span class="modifier-item">- Takeaway</span>
                      </div>
                    `
                        : ""
                    }
                    ${
                      item.modifiers && item.modifiers.length > 0
                        ? `
                      <div class="modifier-list">
                        ${item.modifiers
                          .map(
                            (m: any) => `
                          <span class="modifier-item">+ ${m.name || m.ModifierName}</span>
                        `,
                          )
                          .join("")}
                      </div>
                    `
                        : ""
                    }
                    ${
                      hasCombo
                        ? `
                      <div class="modifier-list">
                        ${comboSels
                          .map((g: any) => {
                            const choices = g.items || g.dishes || (Array.isArray(g) ? g : [g]);
                            if (Array.isArray(choices)) {
                              return choices.map((opt: any) => `<span class="modifier-item">- ${opt.name}</span>`).join("");
                            }
                            return "";
                          })
                          .join("")}
                      </div>
                    `
                        : ""
                    }
                    ${
                      noteText
                        ? `
                      <div class="remarks">
                        * ${noteText}
                      </div>
                    `
                        : ""
                    }
                  </div>
                `;
              }).join("");
            })()}
          </div>

          <div class="footer">
            Order By : ${waiter} #OR-${orderNo}
          </div>

          ${kitchenName && kitchenName !== "KDS" ? `<div class="kitchen-name">${kitchenName.toUpperCase()}${tableNo && tableNo !== "N/A" ? `  /  T.NO: ${tableNo}` : ""}</div>` : ""}
        </div>
      </body>
      </html>
    `;
  }

  private static formatKOTThermalText(data: any, type: string = "NEW"): string {
    const title =
      type === "KDS_PRINT"    ? "KDS PRINT"
      : type === "REPRINT"    ? "REPRINT"
      : type === "ADDITIONAL" ? "ADDITIONAL ORDER"
      : "NEW ORDER";

    const items       = (data.items || []).filter((i: any) => (i.status || i.Status || "").toUpperCase() !== "VOIDED");
    const tableNo     = data.tableNo || "N/A";
    const waiter      = data.waiterName || "Staff";
    const orderNo     = data.orderNo || data.orderId || "";
    const kitchenName = data.kitchenName || "";

    const kotDateStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date());
    const kotTimeStr = formatToSingaporeTime(new Date(), { hour: "2-digit", minute: "2-digit", hour12: false });

    const DIV = "[L]------------------------------------------------\n";

    // Item wrapping constants (ESC/POS width alignments)
    const DISH_WRAP = 20;
    const BIG_MOD_WRAP = 20;   // big-font chars available for modifiers

    // ── Helper: wrap text ─────────────────────────────────────────────
    const wrapText = (str: string, maxChars: number): string[] => {
      const words = String(str || "").split(" ");
      const result: string[] = [];
      let current = "";
      for (const word of words) {
        if (!word) continue;
        if (!current) {
          current = word;
        } else if ((current + " " + word).length <= maxChars) {
          current += " " + word;
        } else {
          result.push(current);
          current = word;
        }
      }
      if (current) result.push(current);
      return result.length ? result : [""];
    };

    // ── Helper: format one item ───────────────────────────────────────
    const formatItem = (item: any): string => {
      let t = "";
      const qtyNum   = item.quantity || item.qty || 1;
      const itemName = item.name || item.DishName || "";

      // Item name: big font (double height + width), wrapped at 20 chars
      wrapText(itemName.replace(/\n/g, " "), DISH_WRAP).forEach((chunk: string, idx: number) => {
        if (idx === 0) t += `[L]<font size='big'><B>[${qtyNum}] ${chunk}</B></font>\n`;
        else           t += `[L]<font size='big'><B>    ${chunk}</B></font>\n`;
      });

      // Song name
      const songName = item.songName || item.SongName || "";
      if (songName) t += `[L]<font size='big'><B>  ♪ ${songName}</B></font>\n`;

      // Takeaway flag
      const isTw = !!(item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway);
      if (isTw) t += `[L]<font size='big'><B>  >> TAKEAWAY <<</B></font>\n`;

      // Modifiers: big font, wraps at 20 chars
      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach((m: any) => {
          const modName = m.ModifierName || m.modifierName || m.name || m.ModifierNameEn || "";
          if (modName) {
            wrapText(modName, BIG_MOD_WRAP).forEach((chunk: string, idx: number) => {
              t += idx === 0 ? `[L]<font size='big'><B>  + ${chunk}</B></font>\n` : `[L]<font size='big'><B>    ${chunk}</B></font>\n`;
            });
          }
        });
      }

      // Combo selections: big font, wrap at 20 chars
      let comboSels = item.comboSelections;
      if (!comboSels || (Array.isArray(comboSels) && comboSels.length === 0)) {
        const rawCombo = item.ComboDetailsJSON || item.comboDetailsJSON || item.ComboDetails || item.comboDetails;
        if (rawCombo) {
          if (typeof rawCombo === 'string') {
            try {
              const parsed = JSON.parse(rawCombo);
              comboSels = Array.isArray(parsed) ? parsed : (parsed.groups || parsed.items || []);
            } catch (e) {
              comboSels = [];
            }
          } else if (Array.isArray(rawCombo)) {
            comboSels = rawCombo;
          } else if (typeof rawCombo === 'object') {
            comboSels = rawCombo.groups || rawCombo.items || [];
          }
        }
      }

      if (Array.isArray(comboSels) && comboSels.length > 0) {
        comboSels.forEach((g: any) => {
          const choices = g.items || g.dishes || (Array.isArray(g) ? g : [g]);
          if (Array.isArray(choices)) {
            choices.forEach((opt: any) => {
              const optName = opt.name || opt.DishName || opt.itemName || "";
              if (optName) {
                wrapText(optName, BIG_MOD_WRAP).forEach((chunk: string, idx: number) => {
                  t += idx === 0 ? `[L]<font size='big'><B>  - ${chunk}</B></font>\n` : `[L]<font size='big'><B>    ${chunk}</B></font>\n`;
                });
              }
            });
          }
        });
      }

      // Note / Remarks: big font, wrap at 20 chars
      const noteText = item.note || item.notes || item.Remarks || item.remarks;
      if (noteText) {
        wrapText(noteText, BIG_MOD_WRAP).forEach((chunk: string, idx: number) => {
          t += idx === 0 ? `[L]<font size='big'><B>  * ${chunk}</B></font>\n` : `[L]<font size='big'><B>    ${chunk}</B></font>\n`;
        });
      }

      return t;
    };

    // ── HEADER ────────────────────────────────────────────────────────
    let text = "";
    // 25mm top side white space (approx 6 empty lines)
    text += "[L]\n".repeat(6);
    text += `[C]<font size='big'><B>${title}</B></font>\n`;
    text += `[C]<font size='big'><B>${kotDateStr}  ${kotTimeStr}</B></font>\n`;
    text += DIV;

    // TABLE visible at top for both KOT and KDS
    if (type === "KDS_PRINT") {
      text += `[C]<font size='big'><B>TABLE NO : ${tableNo}</B></font>\n`;
      text += DIV;
    } else {
      text += `[C]<font size='big'><B>TABLE : ${tableNo}</B></font>\n`;
      text += DIV;
    }

    text += "[L]<font size='big'><B>QTY  ITEM</B></font>\n";
    text += DIV;

    // ── ITEMS ─────────────────────────────────────────────────────────
    if (type === "KDS_PRINT") {
      // KDS: group by kitchen section
      const groups: Record<string, any[]> = {};
      items.forEach((item: any) => {
        const k = (item.KitchenTypeName || item.kitchenTypeName || item.dishGroupName || item.categoryName || "KITCHEN").toUpperCase().trim();
        if (!groups[k]) groups[k] = [];
        groups[k].push(item);
      });

      for (const [kName, groupItems] of Object.entries(groups)) {
        text += `[C]<font size='big'><B>--- ${kName} ---</B></font>\n`;
        text += DIV;
        groupItems.forEach((item: any, idx: number) => {
          text += formatItem(item);
          if (idx < groupItems.length - 1) text += "[L]\n"; // blank line between items
        });
        text += DIV;
      }
    } else {
      // KOT: group by kitchen section (same as KDS, for alignment)
      const kotGroups: Record<string, any[]> = {};
      items.forEach((item: any) => {
        const k = (item.KitchenTypeName || item.kitchenTypeName || item.dishGroupName || item.categoryName || "KITCHEN").toUpperCase().trim();
        if (!kotGroups[k]) kotGroups[k] = [];
        kotGroups[k].push(item);
      });

      const kotGroupEntries = Object.entries(kotGroups);
      kotGroupEntries.forEach(([kName, groupItems]: [string, any[]], gIdx: number) => {
        // Only show section header if there are multiple kitchens
        if (kotGroupEntries.length > 1) {
          text += `[C]<font size='big'><B>--- ${kName} ---</B></font>\n`;
          text += DIV;
        }
        groupItems.forEach((item: any, idx: number) => {
          text += formatItem(item);
          if (idx < groupItems.length - 1) text += "[L]\n";
        });
        text += DIV;
      });
    }

    // ── FOOTER ────────────────────────────────────────────────────────
    text += `[L]<font size='big'><B>Order By : ${waiter}</B></font>\n`;
    text += `[L]<font size='big'><B>Order No : ${orderNo}</B></font>\n`;

    if (type !== "KDS_PRINT") {
      // KOT: Kitchen Name + Table Number always at the very bottom
      const kotLabel = kitchenName && kitchenName !== "KDS"
        ? (tableNo && tableNo !== "N/A"
            ? `${kitchenName.toUpperCase()}  /  T.NO : ${tableNo}`
            : kitchenName.toUpperCase())
        : (tableNo && tableNo !== "N/A"
            ? `T.NO : ${tableNo}`
            : "");
      if (kotLabel) {
        text += DIV;
        text += `[C]<font size='big'><B>${kotLabel}</B></font>\n`;
        text += DIV;
      }
    }

    // ── FEED LINES at end to prevent last line being cut ──────────────
    text += "[L]\n".repeat(6);

    return text;
  }

  // ==================== MAIN SMART PRINT WITH DISCOUNT ====================
  static async smartPrint(
    saleData: any,
    outletId?: string | number,
    t?: any,
    discountInfo?: DiscountInfo,
    preferredType?: PrinterType,
    isReprint: boolean = false,
  ): Promise<boolean> {
    if (Platform.OS === "web") {
      try {
        const isOnline = await this.isBridgeOnline();
        if (!isOnline) {
          console.log("📡 [Web Print Bridge] Bridge is OFFLINE. Direct fallback to preview.");
          return await this.offerPDFFallback(saleData, outletId, t, discountInfo);
        }

        const company = await BillPDFGenerator.loadSettings(outletId);
        const text = this.formatThermalTextWithDiscount(
          saleData,
          company,
          discountInfo,
        );
        const isTakeaway =
          !saleData.tableNo ||
          String(saleData.tableNo).trim() === "" ||
          String(saleData.tableNo).toUpperCase().startsWith("TW") ||
          String(saleData.tableNo).toUpperCase() === "TAKEAWAY" ||
          String(saleData.tableNo).toUpperCase() === "TAKE AWAY";

        const pType = isTakeaway ? 3 : 1;
        console.log(`📡 [Web Print Bridge] Queueing receipt to printer type: ${pType}`);
        const success = await this.queuePrintJob(pType, undefined, text);
        if (success) return true;

        // 🚀 Fallback: If Print Bridge failed or printer not detected on web, trigger iframe print preview immediately
        console.log("⚠️ [Web Receipt Print] Print Bridge queue failed. Falling back to iframe print preview.");
        return await this.offerPDFFallback(saleData, outletId, t, discountInfo);
      } catch (err) {
        console.warn("[Web Print Bridge] Receipt Queue failed, falling back to iframe print preview:", err);
        return await this.offerPDFFallback(saleData, outletId, t, discountInfo);
      }
    }

    // 🚀 NON-BLOCKING BACKGROUND EXECUTION: Run printing in the background to prevent UI lag on APK
    (async () => {
      try {
        const company = await BillPDFGenerator.loadSettings(outletId);

        // Load printer IPs dynamically from PrintMaster with caching
        let cashierIp = "";
        let takeawayIp = "";
        try {
          const now = Date.now();
          let printers = this.cachedPrinters;
          if (!printers || (now - this.lastPrintersFetchTime > 30000)) {
            const response = await fetch(
              `${API_URL}/api/settings/kitchen-printers`,
            );
            printers = await response.json();
            this.cachedPrinters = printers;
            this.lastPrintersFetchTime = now;
          }
          if (Array.isArray(printers)) {
            const cashierPrinter = printers.find((p) => p.PrinterType === 1);
            const takeawayPrinter = printers.find((p) => p.PrinterType === 3);
            cashierIp = cashierPrinter?.PrinterPath || "";
            takeawayIp = takeawayPrinter?.PrinterPath || "";
          }
        } catch (err) {
          console.warn("Failed to fetch printer IPs from PrintMaster:", err);
        }

        // Determine target printer IP based on order type (Dine-in vs Takeaway)
        const isTakeaway =
          !saleData.tableNo ||
          String(saleData.tableNo).trim() === "" ||
          String(saleData.tableNo).toUpperCase().startsWith("TW") ||
          String(saleData.tableNo).toUpperCase() === "TAKEAWAY" ||
          String(saleData.tableNo).toUpperCase() === "TAKE AWAY";

        let targetIp = "";
        if (isTakeaway) {
          targetIp = takeawayIp || cashierIp || company.printerIp || "";
        } else {
          targetIp = cashierIp || company.printerIp || "";
        }

        const hasConfiguredIp = targetIp && targetIp.trim().length > 0;

        if (hasConfiguredIp) {
          console.log(`🌐 Trying configured printer: ${targetIp}`);
          const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetIp.trim());
          let isReachable = false;
          if (isIp) {
            isReachable = await this.isIpReachable(targetIp, 9100);
          } else {
            isReachable = true; // For Bluetooth MAC addresses etc.
          }

          if (isReachable) {
            try {
              const printPromise = this.printNetwork(
                saleData,
                outletId,
                {
                  type: isIp ? "network" : "bluetooth",
                  address: targetIp,
                } as any,
                discountInfo,
              );

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("WiFi Timeout")), 3000),
              );
              const printed = await Promise.race([printPromise, timeoutPromise]);

              if (printed) return;
            } catch (err) {
              console.log("WiFi failed/timeout:", err);
            }
          }
          Alert.alert(
            "Printer Connection Error",
            `Could not connect to the configured LAN/Wi-Fi printer at ${targetIp}. Opening print preview...`,
          );
          await this.offerPDFFallback(saleData, outletId, t, discountInfo);
          return;
        }

        // If no IP is configured, print using the Sunmi built-in printer
        console.log("🖨️ No printer IP configured. Printing to Sunmi built-in printer.");
        try {
          const printed = await this.printThermalReceipt(
            saleData,
            outletId,
            undefined,
            discountInfo,
          );
          if (printed) return;
        } catch (e) {
          console.log("Sunmi failed/timeout", e);
        }

        // Fallback to PDF/Web (Guaranteed)
        console.log("🔄 Fallback to PDF Preview");
        await this.offerPDFFallback(saleData, outletId, t, discountInfo);
      } catch (error) {
        console.log("SmartPrint error:", error);
        await this.offerPDFFallback(saleData, outletId, t, discountInfo);
      }
    })();

    return true;
  }

  /**
   * Print Checkout Bill (Guest Check)
   * Uses the same branding as the receipt but shows 'PAYMENT PENDING'
   */
  static async printCheckoutBill(
    saleData: any,
    outletId?: string | number,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    try {
      // ✅ FIX: Match the logic in PaymentSuccess by ensuring we have a valid ID
      const targetUserId = outletId || "1";
      const company = await BillPDFGenerator.loadSettings(targetUserId);

      // Set checkout flag for the template
      const enhancedSaleData = {
        ...saleData,
        isCheckout: true,
        // Ensure branding is present for the template
        shopName: company.name,
        shopAddress: company.address,
        shopPhone: company.phone,
        shopEmail: company.email,
        shopGst: company.gstNo,
      };

      // Use the standard smartPrint logic but with the checkout flag
      return await this.smartPrint(
        enhancedSaleData,
        targetUserId,
        undefined,
        discountInfo,
      );
    } catch (error: any) {
      console.error("❌ Checkout Print Error:", error);
      return false;
    }
  }

  // ==================== THERMAL PRINTING WITH DISCOUNT ====================
  private static async printThermalReceipt(
    saleData: any,
    userId?: string | number,
    printer?: PrinterInfo,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    try {
      // ✅ STEP 1: Try Sunmi direct print (NO preview)
      const sunmiReady = await SunmiPrinterService.init();
      if (sunmiReady) {
        const company = await BillPDFGenerator.loadSettings(userId);

        // ✅ Pass discount to saleData for Sunmi printer
        const enhancedSaleData = { ...saleData };
        if (discountInfo?.applied && discountInfo.amount > 0) {
          enhancedSaleData.discountAmount = discountInfo.amount;
          enhancedSaleData.discountType = discountInfo.type;
          enhancedSaleData.discountValue = discountInfo.value;
          enhancedSaleData.originalTotal = saleData.total + discountInfo.amount;
        }

        const printed = await SunmiPrinterService.printReceipt(
          enhancedSaleData,
          company,
        );
        if (printed) {
          console.log("✅ Printed with Sunmi printer - NO PREVIEW");
          return true;
        }
      }

      // ✅ STEP 2: If Sunmi fails, return false so smartPrint falls back to PDF dialog/share
      return false;
    } catch (error: any) {
      console.log("Thermal print error:", error);
      return false;
    }
  }
  private static async getBase64LogoStr(logoUrl: string): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      let url = logoUrl;
      if (url && !url.startsWith("http") && !url.startsWith("data:")) {
        url = url.startsWith("/") ? `${API_URL}${url}` : `${API_URL}/${url}`;
      }
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        const FileSystem = require('expo-file-system');
        const filename = 'temp_logo_thermal_' + Date.now() + '.png';
        const fileUri = FileSystem.cacheDirectory + filename;
        const downloadRes = await FileSystem.downloadAsync(url, fileUri);
        const base64 = await FileSystem.readAsStringAsync(downloadRes.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (_) {}
        return base64;
      }
    } catch (e) {
      console.warn("Failed to convert logo to base64 for thermal printer:", e);
    }
    return null;
  }

  // ==================== NETWORK PRINTING ====================
  private static async printNetwork(
    saleData: any,
    userId?: string | number,
    printer?: PrinterInfo,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    try {
      const company = await BillPDFGenerator.loadSettings(userId);
      let text = this.formatThermalTextWithDiscount(
        saleData,
        company,
        discountInfo,
      );

      // Prepend company logo if configured and visible
      if (company.showCompanyLogo && company.companyLogo) {
        const base64Logo = await this.getBase64LogoStr(company.companyLogo);
        if (base64Logo) {
          text = `[C]<img>${base64Logo}</img>\n\n` + text;
        }
      }

      // Append halal logo at the end if configured and visible
      if (company.showHalalLogo && company.halalLogo) {
        const base64Halal = await this.getBase64LogoStr(company.halalLogo);
        if (base64Halal) {
          text = text + `\n\n[C]<img>${base64Halal}</img>\n`;
        }
      }

      const targetAddress = printer?.address || company.printerIp || "";

      if (!targetAddress) return false;

      const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetAddress);

      if (isIp) {
        await ThermalPrinter.printTcp({
          ip: targetAddress,
          port: 9100,
          payload: text,
          mmFeedPaper: 25,
        });
      } else {
        await ThermalPrinter.printBluetooth({
          macAddress: targetAddress,
          payload: text,
          mmFeedPaper: 25,
        });
      }
      return true;
    } catch (error: any) {
      console.log("❌ Network print error:", error);
      return false;
    }
  }

  private static formatTwoCols48(left: any, right: any): string {
    const cleanLeft = String(left || "");
    const cleanRight = String(right || "");
    const totalWidth = 48;
    const spaceCount = totalWidth - cleanLeft.length - cleanRight.length;
    if (spaceCount > 0) {
      return `[L]${cleanLeft}${" ".repeat(spaceCount)}${cleanRight}\n`;
    } else {
      return `[L]${cleanLeft}\n[L]${cleanRight.padStart(totalWidth, " ")}\n`;
    }
  }

  private static formatThermalTextWithDiscount(
    saleData: any,
    company: any,
    discountInfo?: DiscountInfo,
  ): string {
    const symbol = company.currencySymbol || "$";
    const isCheckout = !!saleData.isCheckout;

    // 📏 80mm standard is ~48 characters
    let text = "[C]================================================\n";
    if (isCheckout) {
      text += "[C]<font size='big'><B>CHECKOUT BILL</B></font>\n";
      text += "[C]<B>PAYMENT PENDING</B>\n";
    } else {
      text += "[C]<font size='big'><B>PAYMENT RECEIPT</B></font>\n";
    }
    text += "[C]================================================\n";

    // Header Info
    text += `[C]<font size='big'><B>${(company.name || "YOUR STORE").toUpperCase()}</B></font>\n`;
    if (company.address) text += `[C]${company.address}\n`;
    if (company.phone) text += `[C]Tel: ${company.phone}\n`;
    if (company.email) text += `[C]Email: ${company.email}\n`;
    text += "[C]------------------------------------------------\n";

    const saleDate = saleData.originalDate ? parseDatabaseDate(saleData.originalDate) : 
                     saleData.date ? parseDatabaseDate(saleData.date) : 
                     new Date();

    text += `[L]Bill No: ${saleData.invoiceNumber || saleData.id || ""}\n`;
    if (saleData.tableNo) {
      text += `[L]<font size=\'big\'><B>TABLE: ${saleData.tableNo}</B></font>\n`;
    }
    const dateFormatted = formatToSingaporeDate(saleDate, { day: '2-digit', month: '2-digit', year: 'numeric' });
    text += `[L]Date: ${dateFormatted} ${formatToSingaporeTime(saleDate)}\n`;
    if (saleData.waiterName && saleData.waiterName !== "Staff") {
      text += `[L]Waiter: ${saleData.waiterName}\n`;
    }
    // 🏆 Print Member Mobile Number on receipt
    if (saleData.mobileNo) {
      text += `[L]Member Phone: ${saleData.mobileNo}\n`;
    }
    text += "[L]------------------------------------------------\n";

    // Items Header
    text += "[L]ITEM                        QTY   PRICE    TOTAL\n";
    text += "[L]------------------------------------------------\n";

    const printItems = (saleData.items || []).filter(
      (i: any) => i.status !== "VOIDED",
    );
    const activeItems = (saleData.items || []).filter((i: any) => i.status !== "VOIDED" && i.statusCode !== 0);
    const allItemsHaveSC = activeItems.length > 0 && activeItems.every((item: any) => {
      const isTakeawayItem = item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway;
      return !isTakeawayItem && (Number(item.isServiceCharge) === 1 || item.isServiceCharge === true);
    });

    printItems.forEach((item: any) => {
      // 🛡️ Robust field mapping
      const name = (item.name || item.DishName || item.ProductName || "")
        .substring(0, 26)
        .padEnd(26);
      const qtyNum =
        parseInt(String(item.qty || item.quantity || item.Quantity || 1)) || 1;
      const qty = `[${qtyNum}]`.padStart(5);

      const priceNum =
        parseFloat(String(item.price || item.Price || item.Cost || 0)) || 0;
      const price = `${symbol}${priceNum.toFixed(2)}`.padStart(8);

      const totalNum = priceNum * qtyNum;
      const total = `${symbol}${totalNum.toFixed(2)}`.padStart(9);

      text += `[L]${name}${qty}${price}${total}\n`;

      const songName = item.songName || item.SongName || "";
      if (songName) {
        text += `[L]   🎵 ${songName}\n`;
      }

      // If name was truncated, print full name on next line
      if ((item.name || "").length > 26) {
        text += `[L]   ${item.name}\n`;
      }

      // Modifiers
      if (item.modifiers && Array.isArray(item.modifiers)) {
        item.modifiers.forEach((m: any) => {
          const mName = (m.ModifierName || m.name || "").trim();
          if (mName) {
            text += `[L]   + ${mName}\n`;
          }
        });
      }

      // Item Discount
      const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
      if (discAmt > 0) {
        const discType = item.discountType || "percentage";
        const isCombo = item.isCombo === true || String(item.isCombo) === "1" || item.isCombo === 1;
        const discountBasis = isCombo ? (item.basePrice ?? item.price ?? 0) : (item.price ?? 0);
        const effectiveDisc = discType === "percentage" ? discAmt : Math.min(discAmt, discountBasis);
        const discStr =
          discType === "percentage"
            ? `-${discAmt}%`
            : `-${symbol}${effectiveDisc.toFixed(2)}`;
        text += `[L]      Discount: ${discStr}\n`;
      }
    });

    text += "[L]------------------------------------------------\n";

    // Totals
    // Calculate item-level discounts and gross total
    let grossTotal = 0;
    let totalItemDiscount = 0;
    (saleData.items || []).forEach((item: any) => {
      if (item.status === "VOIDED") return;
      const qtyNum = parseInt(String(item.qty || item.quantity || 1)) || 1;
      const isCombo = item.isCombo === true || String(item.isCombo) === "1" || item.isCombo === 1;
      const discountBasis = isCombo ? (item.basePrice ?? item.price ?? 0) : (item.price ?? 0);
      const baseTotal = (item.price || 0) * qtyNum;
      let itemDiscount = 0;
      const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
      const discType = item.discountType || "percentage";
      if (discAmt > 0) {
        if (discType === "percentage") {
          itemDiscount = (discountBasis * (discAmt / 100)) * qtyNum;
        } else {
          itemDiscount = Math.min(discAmt, discountBasis) * qtyNum;
        }
      }
      grossTotal += baseTotal;
      totalItemDiscount += itemDiscount;
    });

    const finalDiscountInfo =
      discountInfo ||
      (saleData.discount
        ? {
            applied: true,
            type: saleData.discount.type || "percentage",
            value: saleData.discount.value || 0,
            amount: saleData.discount.amount || 0,
          }
        : saleData.discountAmount && saleData.discountAmount > 0
          ? {
              applied: true,
              type: saleData.discountType || "percentage",
              value: saleData.discountValue || 0,
              amount: saleData.discountAmount,
            }
          : null);

    const orderDiscount = finalDiscountInfo?.amount || 0;
    const hasAnyDiscount = totalItemDiscount > 0 || orderDiscount > 0;
    let currentSubtotal = grossTotal;

    text += this.formatTwoCols48("Sub Total:", `${symbol}${grossTotal.toFixed(2)}`);

    if (totalItemDiscount > 0) {
      text += this.formatTwoCols48("Item Discounts:", `-${symbol}${totalItemDiscount.toFixed(2)}`);
      currentSubtotal -= totalItemDiscount;
    }

    if (orderDiscount > 0) {
      const discLabel =
        finalDiscountInfo?.type === "percentage"
          ? `Discount (${finalDiscountInfo.value}%):`
          : "Discount:";
      text += this.formatTwoCols48(discLabel, `-${symbol}${orderDiscount.toFixed(2)}`);
      currentSubtotal -= orderDiscount;
    }

    if (hasAnyDiscount) {
      text += "[L]------------------------------------------------\n";
      const netLabel = "Net Amount:";
      text += this.formatTwoCols48(netLabel, `${symbol}${currentSubtotal.toFixed(2)}`);
    }

    let finalTotal = saleData.total || saleData.totalAmount || currentSubtotal;
    const hasGST = (company.gstPercentage || 0) > 0;
    const gstRate = company.gstPercentage || 0;
    const scPercentage = company.serviceChargePercentage || 0;
    // For reprints, use stored SC amount; otherwise calculate fresh
    const savedSC = saleData.serviceCharge != null ? parseFloat(String(saleData.serviceCharge)) : null;
    
    let serviceChargeAmount = 0;
    if (savedSC !== null) {
      serviceChargeAmount = savedSC;
    } else {
      let scEligibleSubtotal = 0;
      (saleData.items || []).forEach((item: any) => {
        if (item.status === "VOIDED") return;
        const qtyNum = parseInt(String(item.qty || item.quantity || 1)) || 1;
        const isCombo = item.isCombo === true || String(item.isCombo) === "1" || item.isCombo === 1;
        const discountBasis = isCombo ? (item.basePrice ?? item.price ?? 0) : (item.price ?? 0);
        const baseTotal = (item.price || 0) * qtyNum;
        let itemDiscount = 0;
        const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
        const discType = item.discountType || "percentage";
        if (discAmt > 0) {
          if (discType === "percentage") {
            itemDiscount = (discountBasis * (discAmt / 100)) * qtyNum;
          } else {
            itemDiscount = Math.min(discAmt, discountBasis) * qtyNum;
          }
        }
        const itemSubtotal = baseTotal - itemDiscount;
        const isTakeawayItem = item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway;
        const isSC = !isTakeawayItem && (Number(item.isServiceCharge) === 1 || item.isServiceCharge === true);
        if (isSC) {
          scEligibleSubtotal += itemSubtotal;
        }
      });
      let scEligibleNet = scEligibleSubtotal;
      if (grossTotal > 0 && orderDiscount > 0) {
        const subtotalPostItemDisc = grossTotal - totalItemDiscount;
        if (subtotalPostItemDisc > 0) {
          const proportion = scEligibleSubtotal / subtotalPostItemDisc;
          scEligibleNet = Math.max(0, scEligibleSubtotal - proportion * orderDiscount);
        }
      }
      serviceChargeAmount = scEligibleNet * (scPercentage / 100);
    }

    const hasSC = serviceChargeAmount > 0;
    const effectiveSCPercentage = serviceChargeAmount > 0 && currentSubtotal > 0
      ? Math.round((serviceChargeAmount / currentSubtotal) * 100)
      : scPercentage;

    const companySettings = useCompanySettingsStore.getState().settings;
    const takeawayRateFromSettings = companySettings?.takeawayCharges || 0;
    let takeawayCharge = saleData.takeawayCharge !== undefined ? parseFloat(String(saleData.takeawayCharge)) : 0;
    let takeawayQty = (saleData.items || []).reduce((sum: number, item: any) => {
      const isTW = item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway;
      const isVoided = item.status === "VOIDED" || item.StatusCode === 0;
      if (isTW && !isVoided) {
        return sum + (item.qty || item.quantity || 1);
      }
      return sum;
    }, 0);

    if (takeawayQty === 0 && takeawayCharge > 0) {
      const effectiveRate = takeawayRateFromSettings > 0 ? takeawayRateFromSettings : takeawayCharge;
      takeawayQty = Math.round(takeawayCharge / effectiveRate) || 1;
    } else if (takeawayQty > 0 && takeawayCharge === 0) {
      takeawayCharge = takeawayQty * takeawayRateFromSettings;
    }
    const takeawayRate = takeawayQty > 0 ? (takeawayCharge / takeawayQty) : takeawayRateFromSettings;
    const taxableAmount = currentSubtotal + serviceChargeAmount + takeawayCharge;
    const gstAmountRaw = hasGST ? taxableAmount * (gstRate / 100) : 0;
    const gstAmount = Math.round(gstAmountRaw * 100) / 100;
    
    if (finalTotal === 0 || isCheckout) {
      finalTotal = taxableAmount + gstAmount;
    }
    
    const printedRoundOff = saleData.roundOff && saleData.roundOff !== 0
      ? parseFloat((finalTotal - (taxableAmount + gstAmount)).toFixed(2))
      : 0;


    if (hasSC) {
      text += this.formatTwoCols48(allItemsHaveSC ? "Service Charge:" : "Item Service Charge:", `${symbol}${serviceChargeAmount.toFixed(2)}`);
    }

    if (takeawayCharge > 0) {
      text += this.formatTwoCols48(`Takeaway Charges (${symbol}${takeawayRate.toFixed(2)}*${takeawayQty}):`, `${symbol}${takeawayCharge.toFixed(2)}`);
    }

    if (hasGST && gstAmount > 0) {
      text += this.formatTwoCols48(`GST (${gstRate}%):`, `${symbol}${gstAmount.toFixed(2)}`);
      text += "[L]------------------------------------------------\n";
    }

    if (printedRoundOff && printedRoundOff !== 0) {
      const roSign = printedRoundOff > 0 ? "+" : "";
      text += this.formatTwoCols48("Round Off:", `${roSign}${symbol}${printedRoundOff.toFixed(2)}`);
      text += "[L]------------------------------------------------\n";
    }

    // Payment Details (only print on settled receipts, hide on checkout bills)
    if (!isCheckout) {
      if (saleData.payments && Array.isArray(saleData.payments) && saleData.payments.length > 0) {
        text += "[L]Payment Details:\n";
        saleData.payments.forEach((p: any) => {
          const modeLabel = `  ${String(p.payMode || p.payModeName || p.Remarks || "Payment")}`;
          const amountVal = `${symbol}${parseFloat(p.amount).toFixed(2)}`;
          text += this.formatTwoCols48(modeLabel, amountVal);
        });
        text += "[L]------------------------------------------------\n";
      } else {
        const methodLabel = `  ${String(saleData.paymentMethod || "Payment")}`;
        const amountVal = `${symbol}${parseFloat(finalTotal).toFixed(2)}`;
        text += this.formatTwoCols48(methodLabel, amountVal);
        text += "[L]------------------------------------------------\n";
      }
    }

    text += `[R]<font size=\'big\'><B>TOTAL: ${symbol}${finalTotal.toFixed(2)}</B></font>\n`;
    text += "[C]================================================\n";

    // 🏆 Print Reward point transaction stats
    if (parseFloat(saleData.rewardPointsEarned) > 0) {
      text += `[L]Reward Points Earned: +$${parseFloat(saleData.rewardPointsEarned).toFixed(2)}\n`;
    }
    if (parseFloat(saleData.memberRewardBalance) > 0) {
      text += `[L]Available Member Credit: $${parseFloat(saleData.memberRewardBalance).toFixed(2)}\n`;
      text += "[C]------------------------------------------------\n";
    }

    text += "[C]<B>THANK YOU! COME AGAIN!</B>\n";
    text += "[C]SMART-POS BY UNIPROSG\n\n\n\n";

    return text;
  }

  // ==================== PDF FALLBACK WITH DISCOUNT ====================
  static async offerPDFFallback(
    saleData: any,
    userId?: string | number,
    t?: any,
    discountInfo?: DiscountInfo,
  ): Promise<boolean> {
    if (Platform.OS === "web") {
      // ✅ WEB: Fail-proof Iframe printing
      try {
        const company = await BillPDFGenerator.loadSettings(userId);
        const html = await BillPDFGenerator.generateHTML(
          saleData,
          userId,
          discountInfo,
          company,
        );
        const invoiceName = `Invoice_${saleData.invoiceNumber || saleData.id}`;

        // ✅ CRITICAL: Temporarily change main document title for the browser's Save dialog
        const originalTitle = document.title;
        document.title = invoiceName;

        let frame = document.getElementById(
          "print-iframe",
        ) as HTMLIFrameElement;
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "print-iframe";
          frame.style.display = "none";
          document.body.appendChild(frame);
        }

        const doc = frame.contentWindow?.document || frame.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          let printed = false;
          const triggerPrint = () => {
            if (printed) return;
            printed = true;
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            setTimeout(() => {
              document.title = originalTitle;
            }, 1000);
          };

          // Wait for images to load in the iframe
          frame.contentWindow?.addEventListener("load", triggerPrint);

          // Fallback if load event doesn't fire
          setTimeout(triggerPrint, 1000);
        }
        return true;
      } catch (err) {
        console.error("Web print error:", err);
        return false;
      }
    }

    // Native Silent PDF Fallback without Alert prompt
    try {
      console.log("Generating PDF fallback silently...");
      const company = await BillPDFGenerator.loadSettings(userId);
      const html = await BillPDFGenerator.generateHTML(
        saleData,
        userId,
        discountInfo,
        company,
      );

      if (Platform.OS === "ios") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({
          html,
          width: 302, // 80mm at 96dpi
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      }
      return true;
    } catch (error) {
      console.error("PDF Fallback Error:", error);
      return false;
    }
  }

  // ==================== UTILITIES ====================
  private static async checkAndroidPrintService(): Promise<boolean> {
    return Platform.OS === "android";
  }

  static async routeAndPrintOrderKOT(
    orderId: string,
    orderContext: { orderType?: string; tableNo?: string; takeawayNo?: string; section?: string },
    items: any[],
    isAdditional: boolean = false,
    waiterName: string = "Staff",
    skipDuplicateGuard: boolean = false,
    isReprint: boolean = false
  ): Promise<boolean> {
    try {
      // 1. Duplicate-print guard (QR socket path only; cashier path passes skipDuplicateGuard=true)
      // Pass the raw items (pre-expansion) so the fingerprint reflects what the backend sent.
      if (!isReprint && !skipDuplicateGuard && this.isDuplicatePrint(orderId, items)) {
        return false;
      }

      // 2. Check enableKOT setting (same setting the cashier flow checks)
      const { useGeneralSettingsStore } = await import("../stores/generalSettingsStore");
      const { enableKOT, enableKDSPrint, enableComboPrint } = useGeneralSettingsStore.getState().settings;
      if (!isReprint && !enableKOT) {
        if (__DEV__) console.log("🖨️ [UniversalPrinter] KOT printing is disabled in General Settings.");
        return false;
      }

      // 3. Expand combo sub-items that belong to a different kitchen
      const expandedItems: any[] = [];
      items.forEach((item: any) => {
        expandedItems.push(item);
        if (!enableComboPrint && item.comboSelections && item.comboSelections.length > 0) {
          item.comboSelections.forEach((g: any) => {
            if (Array.isArray(g.items)) {
              g.items.forEach((opt: any) => {
                const optKitchenCode =
                  opt.KitchenTypeCode || opt.kitchenCode || opt.kitchenTypeCode;
                const parentKitchenCode =
                  item.KitchenTypeCode || item.kitchenCode || item.kitchenTypeCode || "0";
                if (optKitchenCode && optKitchenCode !== parentKitchenCode) {
                  expandedItems.push({
                    ...opt,
                    id: opt.dishId,
                    qty: item.quantity || item.qty || 1,
                    price: 0,
                    name: `${opt.name} (Combo: ${item.name})`,
                    KitchenTypeCode: optKitchenCode,
                    KitchenTypeName: opt.KitchenTypeName || opt.kitchenTypeName,
                    PrinterIP: opt.PrinterIP || opt.printerIp,
                  });
                }
              });
            }
          });
        }
      });

      // 4. Group by KitchenTypeCode → one KOT per kitchen
      const kitchenGroups: Record<string, any[]> = {};
      expandedItems.forEach((item: any) => {
        const kCode = item.KitchenTypeCode || "0";
        if (!kitchenGroups[kCode]) kitchenGroups[kCode] = [];
        kitchenGroups[kCode].push(item);
      });

      // 5. Print one KOT per kitchen group
      const tableNo =
        orderContext.orderType === "DINE_IN"
          ? orderContext.tableNo
          : `TW-${orderContext.takeawayNo}`;

      for (const [kCode, groupItems] of Object.entries(kitchenGroups)) {
        const printerIp = groupItems[0].PrinterIP;
        if (!printerIp || String(printerIp).trim() === "") {
          console.log(`🖨️ [UniversalPrinter] Skipping routing KOT for kitchen "${groupItems[0].KitchenTypeName || kCode}" - IP is empty/disabled.`);
          continue;
        }
        const kotData = {
          orderId,
          orderNo: orderId,
          tableNo,
          waiterName,
          items: groupItems,
          kitchenName:
            groupItems[0].KitchenTypeName || (kCode === "0" ? "KITCHEN" : kCode),
        };
        try {
          console.log(`🖨️ [UniversalPrinter] Printing KOT for kitchen ${kotData.kitchenName} to ${printerIp}`);
          await this.printKOT(
            kotData,
            "SYSTEM",
            isReprint ? "REPRINT" : (isAdditional ? "ADDITIONAL" : "NEW"),
            printerIp
          );
        } catch (grpErr: any) {
          console.error(`❌ [UniversalPrinter] KOT print failed for kitchen group ${kCode} (${kotData.kitchenName}):`, grpErr.message);
        }
      }

      // 6. KDS backup copy (respects enableKDSPrint setting)
      if (isReprint || enableKDSPrint !== false) {
        try {
          const kdsData = {
            orderId,
            orderNo: orderId,
            tableNo,
            waiterName,
            items,
            kitchenName: "KDS",
          };
          await this.printKDSOrder(kdsData, "SYSTEM");
        } catch (kdsErr) {
          console.error("[UniversalPrinter] KDS backup print failed:", kdsErr);
        }
      }

      return true;
    } catch (err) {
      console.error("[UniversalPrinter] routeAndPrintOrderKOT error:", err);
      return false;
    }
  }

  static async printReceiptAuto(settlementData: any): Promise<boolean> {
    try {
      const header = settlementData?.header || {};
      const orderId = header.OrderId || header.SettlementID || "";
      if (orderId && this.isDuplicateReceiptPrint(orderId)) {
        return false;
      }

      const items = settlementData?.items || [];
      const payments = settlementData?.payments || [];

      const isPercentage = header.DiscountType === "percentage";
      const discountValue = isPercentage
        ? Number(header.DiscountPercentage ?? 0)
        : Number(header.DiscountAmount ?? 0);

      const discountInfo: DiscountInfo = {
        applied: Number(header.DiscountAmount ?? 0) > 0,
        type: (header.DiscountType || "fixed") as "fixed" | "percentage",
        value: discountValue,
        amount: Number(header.DiscountAmount ?? 0),
      };

      const saleData = {
        invoiceNumber: header.BillNo || header.SettlementID,
        tableNo: header.TableNo || "TAKEAWAY",
        total: Number(header.SysAmount ?? 0),
        paymentMethod: header.PayMode || "CASH",
        cashPaid: Number(header.SysAmount ?? 0),
        change: 0,
        items: items.map((i: any) => ({
          name: i.DishName || i.Description,
          price: Number(i.Price || i.PricePerUnit || 0),
          qty: Number(i.Qty || i.Quantity || 1),
          status: i.Status || "NORMAL",
          discountAmount: Number(i.DiscountAmount || 0),
          discountType: i.DiscountType || "fixed",
          modifiers: i.modifiers || [],
        })),
        payments: payments.map((p: any) => ({
          payMode: p.PayModeName || p.Remarks || "CASH",
          payModeName: p.PayModeName || p.Remarks || "CASH",
          amount: Number(p.Amount ?? 0),
          referenceNo: p.ReferenceNo || ""
        })),
        roundOff: Number(header.RoundedBy ?? 0),
        date: header.LastSettlementDate || new Date(),
        discountAmount: Number(header.DiscountAmount ?? 0),
        discountType: header.DiscountType || null,
        discountValue: discountValue,
        subTotal: Number(header.SubTotal ?? 0),
        serviceCharge: Number(header.ServiceCharge ?? 0),
        takeawayCharge: Number(header.TakeawayCharge ?? 0),
      };

      return await this.smartPrint(saleData, "1", {}, discountInfo);
    } catch (err) {
      console.error("[UniversalPrinter] printReceiptAuto failed:", err);
      return false;
    }
  }

  static async processPendingPrintJobs(): Promise<void> {
    // Web clients must never pull and process the print job queue.
    // The print queue is meant for native apps or a desktop print bridge daemon.
    if ((Platform.OS as string) === "web") return;

    try {
      const { useAuthStore } = require("../stores/authStore");
      const role = useAuthStore.getState().user?.role;
      const allowedRoles = ["ADMIN", "MANAGER", "CASHIER", "SUPERVISOR"];
      if (role && !allowedRoles.includes(role)) {
        return; // Only ADMIN, MANAGER, CASHIER, SUPERVISOR devices process the print queue
      }
    } catch (authErr) {
      console.warn("[UniversalPrinter] Could not check auth state for print queue:", authErr);
    }


    try {
      const storeId = "STORE_001";
      const headers = {
        "Authorization": "Bearer unipro-pos-bridge-token-2026",
        "x-store-id": storeId,
        "Content-Type": "application/json"
      };

      // 1. Fetch pending print jobs from backend
      const response = await fetch(`${API_URL}/api/print-jobs/pending`, {
        method: "GET",
        headers
      });
      const data = await response.json();
      if (!data.success || !Array.isArray(data.data)) {
        return;
      }

      const jobs = data.data;
      if (jobs.length === 0) return;

      // Group jobs by target Printer IP to process different printers in parallel
      const jobsByPrinter = new Map<string, any[]>();
      for (const job of jobs) {
        const printerKey = `${job.PrinterIp || ""}:${job.PrinterPort || 9100}`;
        if (!jobsByPrinter.has(printerKey)) {
          jobsByPrinter.set(printerKey, []);
        }
        jobsByPrinter.get(printerKey)!.push(job);
      }

      // Process each printer's queue sequentially, but run different printers in parallel
      const printerPromises = Array.from(jobsByPrinter.values()).map(async (printerJobs) => {
        for (const job of printerJobs) {
          const { JobId, PrinterIp, PrinterPort, Content } = job;
          if (!Content || !PrinterIp) {
            await fetch(`${API_URL}/api/print-jobs/${JobId}/failed`, {
              method: "POST",
              headers,
              body: JSON.stringify({ errorMessage: "Missing Printer IP or Content" })
            });
            continue;
          }

          try {
            const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(PrinterIp.trim());
            let printSuccess = false;

            if ((Platform.OS as string) === "web") {
              // Web fallback: cashier web client shouldn't process directly if daemon is used.
              // For now, let the desktop print bridge process it.
              continue;
            }

            console.log(`[PrintQueue] Printer connection started: PrinterIp=${PrinterIp}, Port=${PrinterPort || 9100}, JobId=${JobId}`);

            if (isIp) {
              console.log(`🌐 [UniversalPrinter] WiFi print to: ${PrinterIp}`);
              const printPromise = ThermalPrinter.printTcp({
                ip: PrinterIp,
                port: PrinterPort || 9100,
                payload: Content,
                mmFeedPaper: 25,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Connection to printer timed out")), 5000)
              );
              await Promise.race([printPromise, timeoutPromise]);
              printSuccess = true;
            } else {
              console.log(`🔵 [UniversalPrinter] Bluetooth print to: ${PrinterIp}`);
              const printPromise = ThermalPrinter.printBluetooth({
                macAddress: PrinterIp,
                payload: Content,
                mmFeedPaper: 25,
              });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Connection to printer timed out")), 5000)
              );
              await Promise.race([printPromise, timeoutPromise]);
              printSuccess = true;
            }

            if (printSuccess) {
              console.log(`[PrintQueue] Print successful: JobId=${JobId}`);
              await fetch(`${API_URL}/api/print-jobs/${JobId}/complete`, {
                method: "POST",
                headers
              });
              console.log(`✅ [UniversalPrinter] Print job ${JobId} completed successfully`);
            }
          } catch (printErr: any) {
            const errorMsg = printErr.message || "Hardware print error";
            console.log(`[PrintQueue] Printer connection failed: ${errorMsg}. JobId=${JobId}`);
            console.error(`❌ [UniversalPrinter] Failed to print job ${JobId}:`, printErr);
            await fetch(`${API_URL}/api/print-jobs/${JobId}/failed`, {
              method: "POST",
              headers,
              body: JSON.stringify({ errorMessage: errorMsg })
            });
          }
        }
      });

      await Promise.all(printerPromises);

    } catch (err: any) {
      console.error("[UniversalPrinter] processPendingPrintJobs error:", err.message);
    }
  }

  static async printQRDirect(
    tableLabel: string,
    sectionName: string,
    qrUrl: string,
    outletId?: string | number
  ): Promise<boolean> {
    const payload = `\n[C]================================================\n[C]<font size='big'><B>TABLE QR CODE</B></font>\n[C]================================================\n[C]<font size='big'><B>Table ${tableLabel}</B></font>\n[C]${sectionName}\n[C]\n[C]<qrcode size='15'>${qrUrl}</qrcode>\n[C]\n[C]<font size='normal'><B>Scan to Order</B></font>\n[C]${qrUrl}\n[C]================================================\n\n\n\n`;

    if (Platform.OS === "web") {
      try {
        const isOnline = await this.isBridgeOnline();
        if (!isOnline) return false;
        return await this.queuePrintJob(1, undefined, payload);
      } catch {
        return false;
      }
    }

    // Native/Mobile (Android APK/iOS)
    try {
      const company = await BillPDFGenerator.loadSettings(outletId);
      let cashierIp = "";
      try {
        const response = await fetch(`${API_URL}/api/settings/kitchen-printers`);
        const printers = await response.json();
        if (Array.isArray(printers)) {
          const cashierPrinter = printers.find((p) => p.PrinterType === 1);
          cashierIp = cashierPrinter?.PrinterPath || "";
        }
      } catch (err) {
        console.warn("Failed to fetch printer IPs from PrintMaster:", err);
      }

      const targetIp = cashierIp || company.printerIp || "";
      if (!targetIp || targetIp.trim().length === 0) {
        return false;
      }

      const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetIp.trim());
      if (isIp) {
        await ThermalPrinter.printTcp({
          ip: targetIp.trim(),
          port: 9100,
          payload,
          mmFeedPaper: 25,
        });
      } else {
        await ThermalPrinter.printBluetooth({
          macAddress: targetIp.trim(),
          payload,
          mmFeedPaper: 25,
        });
      }
      return true;
    } catch (e) {
      console.warn("Native printQRDirect failed:", e);
      return false;
    }
  }

  static async testAllPrinters(): Promise<void> {
    const printers = await this.detectAllPrinters();
    let message = `📋 Found ${printers.length} printer(s):\n\n`;
    printers.forEach((p, i) => {
      message += `${i + 1}. ${p.name}\n   Type: ${p.type}\n   Paper: ${p.paperSize || "Unknown"}\n   Default: ${p.isDefault ? "✅" : "❌"}\n\n`;
    });
    Alert.alert("Printer Detection", message);
  }
}

export default UniversalPrinter;
