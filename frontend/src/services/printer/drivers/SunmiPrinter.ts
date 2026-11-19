import { Platform } from 'react-native';
import {
  PrinterStatusResult,
  PrintResult,
  UniversalPrinterConfig,
} from '../PrinterTypes';

export class SunmiPrinterDriver {
  readonly type = 'SUNMI' as const;

  public async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const SunmiPrinterService = require('../../../components/SunmiPrinterService').default;
      return await SunmiPrinterService.init();
    } catch (_) {
      return false;
    }
  }

  public async connect(config: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    const isAvail = await this.isAvailable();
    return {
      connected: isAvail,
      status: isAvail ? 'CONNECTED' : 'OFFLINE',
      type: this.type,
      printerName: 'SUNMI Built-in Thermal Printer',
      paperWidth: config.paperWidth || '58mm',
      errorMessage: isAvail ? undefined : 'Not a SUNMI device or AIDL service unavailable.',
    };
  }

  public async getStatus(config: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    return this.connect(config);
  }

  public async testPrint(config: UniversalPrinterConfig): Promise<PrintResult> {
    const startTime = Date.now();
    try {
      const SunmiPrinterService = require('../../../components/SunmiPrinterService').default;
      if (SunmiPrinterService) {
        await SunmiPrinterService.init();
        await SunmiPrinterService.printRaw(
          `KIOSK SUNMI TEST\nTime: ${new Date().toLocaleTimeString()}\n\n\n\n`
        );
        return {
          success: true,
          jobId: `SUNMI-${Date.now()}`,
          printerType: 'SUNMI',
          printerName: 'SUNMI Built-in Printer',
          message: 'Printed successfully on SUNMI hardware',
          durationMs: Date.now() - startTime,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        jobId: `SUNMI-${Date.now()}`,
        printerType: 'SUNMI',
        printerName: 'SUNMI Built-in Printer',
        message: err?.message || 'SUNMI print failed',
        durationMs: Date.now() - startTime,
      };
    }
    return {
      success: false,
      jobId: `SUNMI-${Date.now()}`,
      printerType: 'SUNMI',
      printerName: 'SUNMI Built-in Printer',
      message: 'Sunmi service unavailable on this device',
      durationMs: Date.now() - startTime,
    };
  }
}

export const sunmiPrinterDriver = new SunmiPrinterDriver();
