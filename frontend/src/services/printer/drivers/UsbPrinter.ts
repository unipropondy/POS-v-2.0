import { NativeModules, Platform } from 'react-native';
import {
  PrinterStatusResult,
  PrintResult,
  UniversalPrinterConfig,
  UsbDeviceInfo,
} from '../PrinterTypes';

const { UniversalPrinterModule } = NativeModules;

export class UsbPrinterDriver {
  readonly type = 'USB' as const;

  private resolveConfig(config?: UniversalPrinterConfig): UniversalPrinterConfig {
    return (
      config ?? {
        type: 'USB',
        printerName: 'USB Thermal Printer',
        paperWidth: '80mm',
        lanIp: '',
        lanPort: 9100,
        autoCut: true,
        openDrawer: false,
        copies: 1,
        timeoutMs: 4000,
      }
    );
  }

  /**
   * Enumerate connected USB devices and filter for printer interfaces dynamically.
   * If native USB module is available, fetches hardware VID, PID, and Product Name.
   * On Web/Desktop, queries the local POS print bridge.
   */
  public async listDevices(): Promise<UsbDeviceInfo[]> {
    // 1. Native Android USB Host module
    if (Platform.OS === 'android' && UniversalPrinterModule?.listUsbPrinters) {
      try {
        const devices = await UniversalPrinterModule.listUsbPrinters();
        if (Array.isArray(devices) && devices.length > 0) {
          return devices;
        }
      } catch (err) {
        console.warn('[UsbPrinterDriver] Native listUsbPrinters error:', err);
      }
    }

    // 2. Query Print Bridge (http://localhost:3050/api/printers) for dynamic connected USB devices
    try {
      const res = await fetch('http://localhost:3050/api/printers');
      const data = await res.json();
      if (data && data.success && Array.isArray(data.printers)) {
        return data.printers.map((p: any, idx: number) => ({
          deviceId: idx + 1,
          deviceName: p.name || 'USB Thermal Printer',
          vendorId: 0x04b8,
          productId: 0x0e15,
          productName: p.name || 'Thermal Receipt Printer',
          hasPermission: true,
          isPrinter: true,
        }));
      }
    } catch (_) {}

    // Return empty list if no USB printers are connected
    return [];
  }

  public async requestPermission(deviceId: number): Promise<boolean> {
    if (Platform.OS === 'android' && UniversalPrinterModule?.requestUsbPermission) {
      try {
        return await UniversalPrinterModule.requestUsbPermission(deviceId);
      } catch (err) {
        console.warn('[UsbPrinterDriver] requestPermission error:', err);
        return false;
      }
    }
    return true;
  }

  public async connect(config?: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    const cfg = this.resolveConfig(config);

    if (Platform.OS === 'android' && UniversalPrinterModule?.connectUsb) {
      try {
        let targetDeviceId = cfg.usbDeviceId;
        if (targetDeviceId == null) {
          const devices = await this.listDevices();
          const printerDev = devices.find((d) => d.isPrinter) || devices[0];
          if (!printerDev) {
            return {
              connected: false,
              status: 'DISCONNECTED',
              type: this.type,
              printerName: cfg.printerName,
              paperWidth: cfg.paperWidth,
              errorMessage: 'No USB printer detected. Please connect USB printer cable.',
            };
          }
          targetDeviceId = printerDev.deviceId;
        }

        await this.requestPermission(targetDeviceId);
        const res = await UniversalPrinterModule.connectUsb(targetDeviceId);

        return {
          connected: true,
          status: 'CONNECTED',
          type: this.type,
          printerName: res?.productName || cfg.usbDeviceName || cfg.printerName,
          paperWidth: cfg.paperWidth,
          details: res,
        };
      } catch (err: any) {
        return {
          connected: false,
          status: 'ERROR',
          type: this.type,
          printerName: cfg.printerName,
          paperWidth: cfg.paperWidth,
          errorMessage: err?.message || 'Failed to connect to USB printer',
        };
      }
    }

    // Fallback: check bridge or return connected state if device selected
    const devices = await this.listDevices();
    const hasDevice = devices.length > 0 || Boolean(cfg.usbDeviceName);
    return {
      connected: hasDevice,
      status: hasDevice ? 'CONNECTED' : 'DISCONNECTED',
      type: this.type,
      printerName: cfg.usbDeviceName || cfg.printerName || 'USB Thermal Printer',
      paperWidth: cfg.paperWidth,
      errorMessage: hasDevice ? undefined : 'No USB printer detected.',
    };
  }

  public async disconnect(): Promise<boolean> {
    if (Platform.OS === 'android' && UniversalPrinterModule?.disconnectUsb) {
      try {
        return await UniversalPrinterModule.disconnectUsb();
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  public async getStatus(config?: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    const cfg = this.resolveConfig(config);

    if (Platform.OS === 'android' && UniversalPrinterModule?.getUsbStatus) {
      try {
        const res = await UniversalPrinterModule.getUsbStatus();
        const isConnected = !!res?.connected;
        return {
          connected: isConnected,
          status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
          type: this.type,
          printerName: res?.productName || cfg.usbDeviceName || cfg.printerName,
          paperWidth: cfg.paperWidth,
          details: res,
        };
      } catch (err: any) {
        return {
          connected: false,
          status: 'ERROR',
          type: this.type,
          printerName: cfg.printerName,
          paperWidth: cfg.paperWidth,
          errorMessage: err?.message,
        };
      }
    }

    const devices = await this.listDevices();
    const isConn = devices.length > 0 || Boolean(cfg.usbDeviceName);
    return {
      connected: isConn,
      status: isConn ? 'CONNECTED' : 'DISCONNECTED',
      type: this.type,
      printerName: cfg.usbDeviceName || cfg.printerName,
      paperWidth: cfg.paperWidth,
    };
  }

  public async printRaw(data: Uint8Array, config?: UniversalPrinterConfig): Promise<boolean> {
    if (Platform.OS === 'android' && UniversalPrinterModule?.printUsbRaw) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      const len = data.length;
      for (let i = 0; i < len; i += 3) {
        const b1 = data[i];
        const b2 = i + 1 < len ? data[i + 1] : 0;
        const b3 = i + 2 < len ? data[i + 2] : 0;
        const enc1 = b1 >> 2;
        const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
        const enc3 = i + 1 < len ? (((b2 & 15) << 2) | (b3 >> 6)) : 64;
        const enc4 = i + 2 < len ? b3 & 63 : 64;
        base64 += chars.charAt(enc1) + chars.charAt(enc2) + (enc3 === 64 ? '=' : chars.charAt(enc3)) + (enc4 === 64 ? '=' : chars.charAt(enc4));
      }
      return await UniversalPrinterModule.printUsbRaw(base64);
    }

    // Direct bridge print
    try {
      const cfg = this.resolveConfig(config);
      const text = new TextDecoder().decode(data);
      const res = await fetch('http://localhost:3050/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerName: cfg.usbDeviceName || cfg.printerName,
          text,
          cut: cfg.autoCut,
          openCashbox: cfg.openDrawer,
        }),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  public async testPrint(config?: UniversalPrinterConfig): Promise<PrintResult> {
    const startTime = Date.now();
    const cfg = this.resolveConfig(config);
    const ESC = '\x1b';
    const GS = '\x1d';
    const LF = '\x0a';

    let testSlip = ESC + '@'; // init
    testSlip += ESC + 'a' + '\x01'; // center
    testSlip += ESC + '!' + '\x38'; // double
    testSlip += 'KIOSK PRINTER TEST' + LF;
    testSlip += ESC + '!' + '\x00'; // normal
    testSlip += '================================' + LF;
    testSlip += `Device: ${cfg.usbDeviceName || cfg.printerName}` + LF;
    testSlip += `Type: USB Direct Host` + LF;
    testSlip += `Width: ${cfg.paperWidth}` + LF;
    testSlip += `Time: ${new Date().toLocaleTimeString()}` + LF;
    testSlip += '================================' + LF;
    testSlip += LF + LF + LF;
    if (cfg.autoCut) {
      testSlip += GS + 'V' + '\x41' + '\x00'; // cut
    }

    const encoder = new TextEncoder();
    const raw = encoder.encode(testSlip);
    const success = await this.printRaw(raw, cfg);

    return {
      success,
      jobId: `TEST-${Date.now()}`,
      printerType: 'USB',
      printerName: cfg.usbDeviceName || cfg.printerName,
      message: success ? 'Test ticket printed successfully' : 'Failed to send test ticket to USB printer',
      durationMs: Date.now() - startTime,
    };
  }
}

export const usbPrinterDriver = new UsbPrinterDriver();
