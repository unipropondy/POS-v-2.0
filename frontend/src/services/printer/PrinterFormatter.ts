import { PaperWidth, PrintOptions } from "./PrinterTypes";

// Standard ESC/POS Control Byte Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  public init(): EscPosBuilder {
    this.buffer.push(ESC, 0x40); // ESC @ Initialize
    return this;
  }

  public alignLeft(): EscPosBuilder {
    this.buffer.push(ESC, 0x61, 0x00);
    return this;
  }

  public alignCenter(): EscPosBuilder {
    this.buffer.push(ESC, 0x61, 0x01);
    return this;
  }

  public alignRight(): EscPosBuilder {
    this.buffer.push(ESC, 0x61, 0x02);
    return this;
  }

  public bold(enable: boolean = true): EscPosBuilder {
    this.buffer.push(ESC, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  public underline(enable: boolean = true): EscPosBuilder {
    this.buffer.push(ESC, 0x2d, enable ? 0x01 : 0x00);
    return this;
  }

  /**
   * Character size: normal (0x00), double-height (0x01), double-width (0x10), double-both (0x11)
   */
  public setTextSize(
    widthMul: number = 1,
    heightMul: number = 1,
  ): EscPosBuilder {
    const w = Math.max(1, Math.min(8, widthMul)) - 1;
    const h = Math.max(1, Math.min(8, heightMul)) - 1;
    const sizeByte = (w << 4) | h;
    this.buffer.push(GS, 0x21, sizeByte);
    return this;
  }

  public resetTextSize(): EscPosBuilder {
    this.buffer.push(GS, 0x21, 0x00);
    return this;
  }

  public text(str: string): EscPosBuilder {
    if (!str) return this;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 128) {
        this.buffer.push(code);
      } else {
        // Fallback or ASCII mapping for common symbols
        if (str[i] === "•")
          this.buffer.push(0x2d); // -
        else if (str[i] === "✓")
          this.buffer.push(0x76); // v
        else if (str[i] === "—" || str[i] === "–") this.buffer.push(0x2d);
        else if (str[i] === "©") {
          this.buffer.push(0x28, 0x63, 0x29); // (c)
        } else {
          this.buffer.push(0x20); // space for unsupported non-ascii
        }
      }
    }
    return this;
  }

  public textLine(str: string = ""): EscPosBuilder {
    this.text(str);
    this.buffer.push(LF);
    return this;
  }

  public lineFeed(count: number = 1): EscPosBuilder {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  public cut(partial: boolean = true): EscPosBuilder {
    this.lineFeed(4);
    // GS V 65 3 (0x1D 0x56 0x41 0x03) feeds and cuts paper cleanly on all ESC/POS thermal printers
    this.buffer.push(GS, 0x56, 0x41, 0x03);
    return this;
  }

  public openDrawer(): EscPosBuilder {
    // ESC p 0 25 250: pulse to cash drawer pin 2
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  public toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Common Layout Formatter for 58mm (32 chars) and 80mm (48 chars)
 */
export class PrinterFormatter {
  public static getLineWidth(paperWidth: PaperWidth): number {
    return paperWidth === "58mm" ? 32 : 48;
  }

  public static formatTwoCol(
    left: string,
    right: string,
    width: number,
  ): string {
    const l = String(left || "").trim();
    const r = String(right || "").trim();
    const spaceCount = width - l.length - r.length;
    if (spaceCount <= 0) {
      const avail = width - r.length - 1;
      return (avail > 0 ? l.slice(0, avail) : l) + " " + r;
    }
    return l + " ".repeat(spaceCount) + r;
  }

  public static formatItemRow(
    itemName: string,
    qtyNum: number,
    priceNum: number,
    totalNum: number,
    currency: string,
    width: number,
  ): string[] {
    const lines: string[] = [];
    const is58 = width <= 32;

    if (is58) {
      // 32-column format
      const qtyStr = `[${qtyNum}]`.padStart(4);
      const totalStr = `${currency}${totalNum.toFixed(2)}`.padStart(8);
      const rightPart = `${qtyStr} ${totalStr}`; // 13 chars
      const availName = width - rightPart.length; // 19 chars
      const truncatedName = itemName.length > availName ? itemName.substring(0, availName) : itemName.padEnd(availName);
      lines.push(`${truncatedName}${rightPart}`);
      if (itemName.length > availName) {
        lines.push(`   ${itemName}`);
      }
    } else {
      // 48-column format (Standard POS 80mm)
      // ITEM (26 chars), QTY [1] (5 chars), PRICE $X.XX (8 chars), TOTAL $X.XX (9 chars)
      const nameCol = itemName.substring(0, 26).padEnd(26);
      const qtyCol = `[${qtyNum}]`.padStart(5);
      const priceCol = `${currency}${priceNum.toFixed(2)}`.padStart(8);
      const totalCol = `${currency}${totalNum.toFixed(2)}`.padStart(9);
      lines.push(`${nameCol}${qtyCol}${priceCol}${totalCol}`);
      if (itemName.length > 26) {
        lines.push(`   ${itemName}`);
      }
    }

    return lines;
  }

  public static formatDivider(char: string = "-", width: number): string {
    return char.repeat(width);
  }

  /**
   * Build Full Customer Bill Receipt with native ESC/POS commands
   * Strictly matches the professional POS thermal receipt format
   */
  public static buildReceipt(
    saleData: any,
    company: any,
    paperWidth: PaperWidth = "80mm",
    options?: PrintOptions,
  ): Uint8Array {
    const width = this.getLineWidth(paperWidth);
    const is58 = width <= 32;
    const builder = new EscPosBuilder();

    const rawName = company?.CompanyName || company?.name;
    const companyName = rawName && String(rawName).trim() ? String(rawName).trim() : "POS SYSTEM";
    const address = company?.Address || company?.address ? String(company?.Address || company?.address).replace(/\r?\n/g, " ").trim() : "";
    const phone =
      company?.Phone || company?.phone
        ? `Tel: ${company?.Phone || company?.phone}`
        : "";
    const gstNo =
      company?.GSTNo || company?.gstNo
        ? `GST: ${company?.GSTNo || company?.gstNo}`
        : "";
    const currency = company?.CurrencySymbol || company?.currencySymbol || "$";

    const isCheckout = !!saleData?.isCheckout;
    const isReprint = !!options?.isReprint || !!saleData?.isReprint;

    const billNumber = String(
      saleData?.invoiceNumber ||
        saleData?.billNo ||
        saleData?.BillNo ||
        saleData?.id ||
        saleData?.orderNumber ||
        saleData?.orderNo ||
        saleData?.orderId ||
        "",
    );

    const isReceiptTW =
      saleData?.orderType === "TAKEAWAY" ||
      saleData?.isTakeaway ||
      saleData?.IsTakeaway ||
      String(saleData?.tableNo || "").toUpperCase().includes("TAKEAWAY") ||
      String(saleData?.tableNo || "").toUpperCase().startsWith("TW");

    const rawTable = saleData?.tableNo ? String(saleData.tableNo).trim() : "";
    const cleanTableNo = rawTable.replace(/\s*\(quick serve\)/gi, "").replace(/^table\s+/gi, "").trim();

    // ── Upside White Space & Header Border ──
    builder.lineFeed(1);
    builder.alignCenter();
    builder.textLine(this.formatDivider("=", width));

    if (isReprint) {
      builder.bold(true).textLine("*** OFFICIAL REPRINT ***").bold(false);
    }

    if (isCheckout) {
      builder.bold(true).setTextSize(1, 2).textLine("CHECKOUT BILL").resetTextSize();
      builder.bold(true).textLine("PAYMENT PENDING").bold(false);
    } else {
      builder.bold(true).setTextSize(1, 2).textLine("PAYMENT RECEIPT").resetTextSize();
    }
    builder.textLine(this.formatDivider("=", width));

    // ── Official Queue Ticket Banner for Kiosk Orders ──
    if (saleData?.isKiosk) {
      const cleanDigits = billNumber.replace(/\D/g, "");
      const queueSuffix = cleanDigits ? cleanDigits.slice(-4) : (billNumber.length >= 4 ? billNumber.slice(-4) : billNumber);
      builder.alignCenter();
      builder.bold(true).textLine("OFFICIAL QUEUE TICKET");
      builder.setTextSize(2, 2).textLine(`#${queueSuffix}`).resetTextSize();
      builder.textLine(this.formatDivider("=", width));
      builder.alignLeft();
    }

    // ── Company Header (Upper Case, Big Bold) ──
    builder.bold(true).setTextSize(1, 2).textLine(companyName.toUpperCase()).resetTextSize().bold(false);

    if (address) {
      builder.textLine(address);
    }
    if (phone) {
      builder.textLine(phone);
    }
    if (gstNo) {
      builder.textLine(gstNo);
    }
    builder.textLine(this.formatDivider("-", width));

    // ── Order Metadata ──
    builder.alignLeft();
    builder.bold(true);

    const isSelfCollect = saleData?.isSelfCollect === true;
    const isTent = saleData?.isTentNumber === true;
    const tableLabel = isTent ? "TENT NO" : "TABLE";

    if (isSelfCollect) {
      builder.textLine(`Bill No: ${billNumber}`);
    } else if (isReceiptTW) {
      const shortOrderNo = billNumber ? String(billNumber).slice(-4) : "";
      const twLabel = shortOrderNo ? `TW#${shortOrderNo}` : "TW";
      builder.textLine(this.formatTwoCol(`Bill No: ${billNumber}`, twLabel, width));
    } else if (cleanTableNo) {
      builder.textLine(this.formatTwoCol(`Bill No: ${billNumber}`, `${tableLabel}: ${cleanTableNo}`, width));
    } else {
      builder.textLine(`Bill No: ${billNumber}`);
    }

    const now = new Date();
    const dateFormatted = now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const timeFormatted = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).toUpperCase();

    builder.textLine(`Date: ${dateFormatted} ${timeFormatted}`);

    if (saleData?.waiterName && saleData.waiterName !== "Staff") {
      const displayWaiter = String(saleData.waiterName).replace(/\s*\(quick serve\)/gi, "").trim() || "Staff";
      builder.textLine(`Waiter: ${displayWaiter}`);
    }
    if (saleData?.mobileNo) {
      builder.textLine(`Member Phone: ${saleData.mobileNo}`);
    }
    builder.bold(false);
    builder.textLine(this.formatDivider("-", width));

    // ── Items Header ──
    builder.bold(true);
    if (is58) {
      builder.textLine(this.formatTwoCol("ITEM", "QTY   TOTAL", width));
    } else {
      // 48-char POS header: ITEM (26) QTY (5) PRICE (8) TOTAL (9)
      const hItem = "ITEM".padEnd(26);
      const hQty = "QTY".padStart(5);
      const hPrice = "PRICE".padStart(8);
      const hTotal = "TOTAL".padStart(9);
      builder.textLine(`${hItem}${hQty}${hPrice}${hTotal}`);
    }
    builder.bold(false);
    builder.textLine(this.formatDivider("-", width));

    // ── Items List ──
    const rawItems = saleData?.items || saleData?.cartItems || [];
    const printItems = rawItems.filter((i: any) => i.status !== "VOIDED" && i.statusCode !== 0);

    let grossTotal = 0;
    let totalItemDiscount = 0;

    printItems.forEach((item: any) => {
      const itemName = String(item.name || item.DishName || item.ProductName || item.Name || "Item");
      const qtyNum = parseInt(String(item.qty || item.quantity || item.Quantity || 1)) || 1;
      const priceNum = parseFloat(String(item.price || item.Price || item.Cost || item.PricePerUnit || 0)) || 0;
      const baseTotal = priceNum * qtyNum;

      // Item discount calculation
      let itemDiscount = 0;
      const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
      const discType = item.discountType || "percentage";
      if (discAmt > 0) {
        if (discType === "percentage") {
          itemDiscount = (priceNum * (discAmt / 100)) * qtyNum;
        } else if (discType === "FOC") {
          itemDiscount = baseTotal;
        } else {
          itemDiscount = Math.min(discAmt, priceNum) * qtyNum;
        }
      }

      grossTotal += baseTotal;
      totalItemDiscount += itemDiscount;

      // Render Item line
      const lines = this.formatItemRow(itemName, qtyNum, priceNum, baseTotal, currency, width);
      lines.forEach((line) => {
        builder.bold(true).textLine(line).bold(false);
      });

      // Song / special tags
      if (item.songName || item.SongName) {
        builder.textLine(`   ♪ ${item.songName || item.SongName}`);
      }

      // Modifiers
      if (item.modifiers && Array.isArray(item.modifiers)) {
        item.modifiers.forEach((m: any) => {
          const mName = (m.ModifierName || m.name || "").trim();
          if (mName) {
            builder.textLine(`   + ${mName}`);
          }
        });
      }

      // Combo choices
      const comboSels = item.comboSelections ||
        (typeof item.ComboDetailsJSON === "string" && item.ComboDetailsJSON
          ? (() => { try { const p = JSON.parse(item.ComboDetailsJSON); return Array.isArray(p) ? p : p.groups || p.items || []; } catch { return undefined; } })()
          : (Array.isArray(item.ComboDetailsJSON) ? item.ComboDetailsJSON : undefined)) || [];
      if (Array.isArray(comboSels) && comboSels.length > 0) {
        comboSels.forEach((group: any) => {
          const choices = group.items || group.dishes || (Array.isArray(group) ? group : [group]);
          if (Array.isArray(choices)) {
            choices.forEach((opt: any) => {
              const optName = opt.name || opt.DishName || opt.itemName || "";
              if (optName) {
                builder.textLine(`   - ${optName}`);
              }
            });
          }
        });
      }

      // Item Discount line
      if (discAmt > 0) {
        const discStr = discType === "FOC" ? "FOC" : discType === "percentage" ? `-${discAmt}%` : `-${currency}${itemDiscount.toFixed(2)}`;
        builder.textLine(`      Discount: ${discStr}`);
      }
    });

    builder.textLine(this.formatDivider("-", width));

    // ── Order Discount ──
    const discountInfo = saleData?.discount || null;
    let orderDiscount = 0;
    if (discountInfo && discountInfo.applied && discountInfo.amount > 0) {
      orderDiscount = Number(discountInfo.amount);
    } else if (saleData?.discountAmount && saleData.discountAmount > 0) {
      orderDiscount = Number(saleData.discountAmount);
    }

    const currentSubtotal = Math.max(0, grossTotal - totalItemDiscount - orderDiscount);

    // Subtotal
    builder.bold(true).textLine(this.formatTwoCol("Sub Total:", `${currency}${grossTotal.toFixed(2)}`, width)).bold(false);

    if (totalItemDiscount > 0) {
      builder.textLine(this.formatTwoCol("Item Discounts:", `-${currency}${totalItemDiscount.toFixed(2)}`, width));
    }

    if (orderDiscount > 0) {
      const discLabel = discountInfo?.type === "percentage" ? `Discount (${discountInfo.value}%):` : "Discount:";
      builder.textLine(this.formatTwoCol(discLabel, `-${currency}${orderDiscount.toFixed(2)}`, width));
    }

    if (totalItemDiscount > 0 || orderDiscount > 0) {
      builder.textLine(this.formatDivider("-", width));
      builder.bold(true).textLine(this.formatTwoCol("Net Amount:", `${currency}${currentSubtotal.toFixed(2)}`, width)).bold(false);
    }

    // Taxes & Charges
    const serviceCharge = Number(saleData?.serviceCharge || saleData?.serviceChargeAmount || 0);
    const takeawayCharge = Number(saleData?.takeawayCharge || saleData?.takeawayCharges || 0);
    const gstRate = Number(company?.gstPercentage ?? company?.GSTPercentage ?? 0);
    const gstAmount = Number(saleData?.gst || saleData?.gstAmount || (gstRate > 0 ? (currentSubtotal + serviceCharge + takeawayCharge) * (gstRate / 100) : 0));

    if (serviceCharge > 0) {
      builder.textLine(this.formatTwoCol("Service Charge:", `${currency}${serviceCharge.toFixed(2)}`, width));
    }

    if (takeawayCharge > 0) {
      builder.textLine(this.formatTwoCol("Takeaway Charges:", `${currency}${takeawayCharge.toFixed(2)}`, width));
    }

    if (gstAmount > 0) {
      builder.textLine(this.formatTwoCol(gstRate > 0 ? `GST (${gstRate}%):` : "GST:", `${currency}${gstAmount.toFixed(2)}`, width));
      builder.textLine(this.formatDivider("-", width));
    }

    // Final Total Calculation
    const calculatedTotal = currentSubtotal + serviceCharge + takeawayCharge + gstAmount;
    const finalTotal = Number(saleData?.total || saleData?.totalAmount || saleData?.grandTotal || calculatedTotal);

    const roundOff = saleData?.roundOff ? parseFloat(String(saleData.roundOff)) : 0;
    if (roundOff !== 0) {
      const roSign = roundOff > 0 ? "+" : "";
      builder.textLine(this.formatTwoCol("Round Off:", `${roSign}${currency}${roundOff.toFixed(2)}`, width));
      builder.textLine(this.formatDivider("-", width));
    }

    // ── Payment Details ──
    if (!isCheckout) {
      builder.textLine(this.formatDivider("-", width));
      if (saleData?.payments && Array.isArray(saleData.payments) && saleData.payments.length > 0) {
        saleData.payments.forEach((p: any) => {
          let modeText = String(p.payMode || p.payModeName || p.Remarks || "Payment");
          if (modeText.toUpperCase().trim() === "FOC") modeText = "FOC (Discount)";
          const amountVal = `${currency}${parseFloat(p.amount).toFixed(2)}`;
          builder.textLine(this.formatTwoCol(modeText, amountVal, width));
        });
      } else {
        const payMode = String(saleData?.paymentMode || saleData?.payMode || saleData?.PaymentMode || "CASH").toUpperCase();
        builder.textLine(this.formatTwoCol(payMode, `${currency}${finalTotal.toFixed(2)}`, width));
      }
      builder.textLine(this.formatDivider("-", width));
    }

    // ── Grand Total (Double Size, Bold) ──
    builder.bold(true).setTextSize(1, 2);
    // In double size (2x width), 48 columns becomes 24 characters.
    // To match POS layout with TOTAL: on left and amount on right:
    const totalCols = is58 ? 16 : 24;
    builder.textLine(this.formatTwoCol("TOTAL:", `${currency}${finalTotal.toFixed(2)}`, totalCols));
    builder.resetTextSize().bold(false);

    builder.textLine(this.formatDivider("=", width));

    // ── Reward Points (if any) ──
    if (parseFloat(saleData?.rewardPointsEarned || 0) > 0) {
      builder.textLine(`Reward Points Earned: +$${parseFloat(saleData.rewardPointsEarned).toFixed(2)}`);
    }
    if (parseFloat(saleData?.memberRewardBalance || 0) > 0) {
      builder.textLine(`Available Member Credit: $${parseFloat(saleData.memberRewardBalance).toFixed(2)}`);
      builder.textLine(this.formatDivider("-", width));
    }

    // ── Footer ──
    builder.alignCenter();
    builder.bold(true).textLine("THANK YOU! COME AGAIN!").bold(false);
    builder.textLine("SMART-CAFE BY UNIPROSG");

    // Auto Cut & Drawer
    if (options?.autoCut ?? true) {
      builder.cut(true);
    } else {
      builder.lineFeed(4);
    }

    if (options?.openDrawer) {
      builder.openDrawer();
    }

    return builder.toUint8Array();
  }

  /**
   * Diagnostic Test Print Page with Native ESC/POS
   */
  public static buildTestPrint(
    printerType: string,
    printerName: string,
    company: any,
    paperWidth: PaperWidth = "80mm",
  ): Uint8Array {
    const width = this.getLineWidth(paperWidth);
    const builder = new EscPosBuilder();

    const rawName = company?.CompanyName || company?.name;
    const companyName = rawName && String(rawName).trim() ? String(rawName).trim() : "POS SYSTEM";
    const address = company?.Address || company?.address ? String(company?.Address || company?.address).replace(/\r?\n/g, " ").trim() : "";

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    builder.alignCenter();
    builder.textLine(this.formatDivider("=", width));
    builder
      .bold(true)
      .setTextSize(1, 2)
      .textLine(companyName.toUpperCase())
      .resetTextSize()
      .bold(false);

    if (address) {
      builder.textLine(address);
    }
    builder.textLine(this.formatDivider("=", width));

    builder
      .bold(true)
      .setTextSize(1, 2)
      .textLine("KIOSK PRINTER TEST")
      .resetTextSize()
      .bold(false)
      .textLine(this.formatDivider("=", width));

    builder.alignLeft();
    builder.textLine(
      this.formatTwoCol("Device:", printerName.slice(0, 20), width),
    );
    builder.textLine(this.formatTwoCol("Type:", printerType, width));
    builder.textLine(
      this.formatTwoCol("Width:", `${paperWidth} (${width} cols)`, width),
    );
    builder.textLine(this.formatTwoCol("Status:", "ONLINE & READY", width));
    builder.textLine(
      this.formatTwoCol(`Date: ${dateStr}`, `Time: ${timeStr}`, width),
    );

    builder.textLine(this.formatDivider("-", width));

    builder.alignCenter();
    builder.bold(true).textLine("TEST PRINT COMPLETED").bold(false);
    builder.textLine("Thermal Printer & Auto-cut OK");

    builder.cut(true);

    return builder.toUint8Array();
  }
}
