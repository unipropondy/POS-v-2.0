import { PaperWidth, PrintOptions } from './PrinterTypes';

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
  public setTextSize(widthMul: number = 1, heightMul: number = 1): EscPosBuilder {
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
        if (str[i] === '•') this.buffer.push(0x2d); // -
        else if (str[i] === '✓') this.buffer.push(0x76); // v
        else if (str[i] === '—' || str[i] === '–') this.buffer.push(0x2d);
        else if (str[i] === '©') {
          this.buffer.push(0x28, 0x63, 0x29); // (c)
        } else {
          this.buffer.push(0x20); // space for unsupported non-ascii
        }
      }
    }
    return this;
  }

  public textLine(str: string = ''): EscPosBuilder {
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
    return paperWidth === '58mm' ? 32 : 48;
  }

  public static formatTwoCol(left: string, right: string, width: number): string {
    const l = String(left || '').trim();
    const r = String(right || '').trim();
    const spaceCount = width - l.length - r.length;
    if (spaceCount <= 0) {
      const avail = width - r.length - 1;
      return (avail > 0 ? l.slice(0, avail) : l) + ' ' + r;
    }
    return l + ' '.repeat(spaceCount) + r;
  }

  public static formatThreeCol(left: string, mid: string, right: string, width: number): string {
    const r = String(right || '').trim();
    const m = String(mid || '').trim();
    const rightPart = `${m.padStart(4)} ${r.padStart(9)}`;
    const availLeft = width - rightPart.length;
    let l = String(left || '').trim();
    if (l.length > availLeft) {
      l = l.slice(0, availLeft);
    } else {
      l = l.padEnd(availLeft);
    }
    return l + rightPart;
  }

  public static formatDivider(char: string = '-', width: number): string {
    return char.repeat(width);
  }

  /**
   * Build Full Customer Bill Receipt with native ESC/POS commands
   */
  public static buildReceipt(
    saleData: any,
    company: any,
    paperWidth: PaperWidth = '80mm',
    options?: PrintOptions
  ): Uint8Array {
    const width = this.getLineWidth(paperWidth);
    const builder = new EscPosBuilder();

    const companyName = (company?.CompanyName || company?.name || 'Smart Dining Cafe & Restaurant').trim();
    const address = (company?.Address || company?.address || '').replace(/\r?\n/g, ' ').trim();
    const phone = company?.Phone || company?.phone ? `Tel: ${company?.Phone || company?.phone}` : '';
    const gstNo = company?.GSTNo || company?.gstNo ? `GST: ${company?.GSTNo || company?.gstNo}` : '';
    const currency = company?.CurrencySymbol || company?.currencySymbol || '$';

    const orderNo = String(saleData?.orderNo || saleData?.orderId || saleData?.id || saleData?.billNumber || 'RECEIPT');
    const tableNo = saleData?.tableNo ? String(saleData.tableNo).trim() : '';
    const total = Number(saleData?.total || saleData?.totalAmount || saleData?.grandTotal || 0);
    const subtotal = Number(saleData?.subtotal || total);
    const serviceCharge = Number(saleData?.serviceCharge || saleData?.serviceChargeAmount || 0);
    const gst = Number(saleData?.gst || saleData?.gstAmount || 0);

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 1. REPRINT WATERMARK
    if (options?.isReprint) {
      builder
        .alignCenter()
        .bold(true)
        .textLine('*** OFFICIAL REPRINT ***')
        .bold(false);
    }

    // 2. COMPANY HEADER (Centered, Bold, Double Width/Height)
    builder
      .alignCenter()
      .bold(true)
      .setTextSize(1, 2)
      .textLine(companyName)
      .resetTextSize()
      .bold(false);

    if (address) {
      builder.textLine(address);
    }

    const contactParts = [phone, gstNo].filter(Boolean);
    if (contactParts.length > 0) {
      builder.textLine(contactParts.join(' | '));
    }

    builder.textLine(this.formatTwoCol(`Date: ${dateStr}`, `Time: ${timeStr}`, width));
    builder.textLine(this.formatDivider('=', width));

    // 3. TICKET / ORDER INFO
    if (tableNo) {
      builder
        .alignCenter()
        .bold(true)
        .setTextSize(1, 1)
        .textLine(`ORDER #: ${orderNo}  (${tableNo})`)
        .resetTextSize()
        .bold(false);
      builder.textLine(this.formatDivider('=', width));
    } else {
      builder
        .alignCenter()
        .bold(true)
        .textLine(`ORDER #: ${orderNo}`)
        .bold(false);
      builder.textLine(this.formatDivider('=', width));
    }

    // 4. ITEMS HEADER
    builder.alignLeft();
    builder.bold(true);
    builder.textLine(this.formatThreeCol('ITEM', 'QTY', `TOTAL(${currency})`, width));
    builder.bold(false);
    builder.textLine(this.formatDivider('-', width));

    // 5. ITEMS LIST
    const items = saleData?.items || saleData?.cartItems || [];
    items.forEach((item: any) => {
      const itemName = String(item.name || item.Name || item.DishName || item.ProductName || 'Item');
      const qty = String(item.quantity || item.qty || 1);
      const price = (Number(item.price || item.Price || 0)) * Number(qty);
      const priceStr = `${currency}${price.toFixed(2)}`;

      builder.textLine(this.formatThreeCol(itemName, qty, priceStr, width));

      if (item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) {
        item.modifiers.forEach((m: any) => {
          builder.textLine(`  + ${m.name || m.ModifierName}`);
        });
      }
    });

    builder.textLine(this.formatDivider('-', width));

    // 6. TOTALS BREAKDOWN (Clean aligned columns)
    builder.textLine(this.formatTwoCol('Subtotal:', `${currency}${subtotal.toFixed(2)}`, width));

    if (saleData?.discount && saleData.discount.applied && saleData.discount.amount > 0) {
      const discLabel = saleData.discount.type === 'percentage'
        ? `Discount (${saleData.discount.value}%):`
        : 'Discount:';
      builder.textLine(this.formatTwoCol(discLabel, `-${currency}${Number(saleData.discount.amount).toFixed(2)}`, width));
    }

    if (serviceCharge > 0) {
      builder.textLine(this.formatTwoCol('Service Charge:', `${currency}${serviceCharge.toFixed(2)}`, width));
    }

    if (gst > 0) {
      builder.textLine(this.formatTwoCol('GST:', `${currency}${gst.toFixed(2)}`, width));
    }

    builder.textLine(this.formatDivider('=', width));

    // TOTAL AMOUNT (Large & Bold)
    builder
      .bold(true)
      .setTextSize(1, 2)
      .textLine(this.formatTwoCol('TOTAL:', `${currency}${total.toFixed(2)}`, paperWidth === '58mm' ? 24 : 36))
      .resetTextSize()
      .bold(false);

    builder.textLine(this.formatDivider('=', width));

    // 7. PAYMENT DETAILS
    const payMode = String(saleData?.paymentMode || saleData?.payMode || saleData?.PaymentMode || 'CASH').toUpperCase();
    const paid = Number(saleData?.amountPaid || saleData?.paidAmount || total);
    const change = Number(saleData?.change || saleData?.changeAmount || Math.max(0, paid - total));

    builder.textLine(this.formatTwoCol('Payment Mode:', payMode, width));
    builder.textLine(this.formatTwoCol('Amount Paid:', `${currency}${paid.toFixed(2)}`, width));
    if (change > 0) {
      builder.textLine(this.formatTwoCol('Change:', `${currency}${change.toFixed(2)}`, width));
    }

    builder.textLine(this.formatDivider('-', width));

    // 8. FOOTER (Centered)
    builder.alignCenter();
    builder.bold(true).textLine('Thank you for your visit!').bold(false);
    builder.textLine(`(c) ${new Date().getFullYear()} UNIPRO SOFTWARES SG PTE LTD`);

    // AUTO CUT
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
    paperWidth: PaperWidth = '80mm'
  ): Uint8Array {
    const width = this.getLineWidth(paperWidth);
    const builder = new EscPosBuilder();

    const companyName = (company?.CompanyName || company?.name || 'Smart Dining Cafe & Restaurant').trim();
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    builder
      .alignCenter()
      .bold(true)
      .setTextSize(1, 2)
      .textLine(companyName)
      .resetTextSize()
      .textLine(this.formatDivider('=', width))
      .bold(true)
      .setTextSize(1, 2)
      .textLine('KIOSK PRINTER TEST')
      .resetTextSize()
      .bold(false)
      .textLine(this.formatDivider('=', width));

    builder.alignLeft();
    builder.textLine(this.formatTwoCol('Device:', printerName.slice(0, 20), width));
    builder.textLine(this.formatTwoCol('Type:', printerType, width));
    builder.textLine(this.formatTwoCol('Width:', `${paperWidth} (${width} cols)`, width));
    builder.textLine(this.formatTwoCol('Status:', 'ONLINE & READY', width));
    builder.textLine(this.formatTwoCol(`Date: ${dateStr}`, `Time: ${timeStr}`, width));

    builder.textLine(this.formatDivider('-', width));

    builder.alignCenter();
    builder.bold(true).textLine('TEST PRINT COMPLETED').bold(false);
    builder.textLine('Thermal Printer & Auto-cut OK');

    builder.cut(true);

    return builder.toUint8Array();
  }
}
