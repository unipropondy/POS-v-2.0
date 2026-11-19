export type PrinterType = 'SUNMI' | 'LAN' | 'USB';

/**
 * Identifies which subsystem is sending the print job:
 *  'POS'   — counter / cashier terminal
 *  'KIOSK' — self-service kiosk terminal
 */
export type PrinterContext = 'POS' | 'KIOSK';

export type PaperWidth = '58mm' | '80mm';

export type PrinterConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'OFFLINE';

export interface UsbDeviceInfo {
  deviceId: number;
  deviceName: string;
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
  hasPermission: boolean;
  isPrinter: boolean;
}

export interface UniversalPrinterConfig {
  type: PrinterType;
  printerName: string;
  paperWidth: PaperWidth;
  // LAN fields
  lanIp: string;
  lanPort: number;
  // USB fields
  usbDeviceId?: number;
  usbVendorId?: number;
  usbProductId?: number;
  usbDeviceName?: string;
  // Hardware options
  autoCut: boolean;
  openDrawer: boolean;
  copies: number;
  timeoutMs: number;
}

export interface PrinterStatusResult {
  connected: boolean;
  status: PrinterConnectionStatus;
  type: PrinterType;
  printerName: string;
  paperWidth: PaperWidth;
  errorMessage?: string;
  details?: any;
}

export interface PrintResult {
  success: boolean;
  jobId: string;
  printerType: PrinterType;
  printerName: string;
  message: string;
  durationMs?: number;
  offlineReason?: string;
}
