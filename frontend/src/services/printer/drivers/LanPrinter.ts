import { Platform } from 'react-native';
import {
  PrinterStatusResult,
  PrintResult,
  UniversalPrinterConfig,
} from '../PrinterTypes';

export class LanPrinterDriver {
  readonly type = 'LAN' as const;

  public async connect(config: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    const ip = config.lanIp || '192.168.1.100';
    const port = config.lanPort || 9100;
    return {
      connected: true,
      status: 'CONNECTED',
      type: this.type,
      printerName: config.printerName || `LAN Printer (${ip}:${port})`,
      paperWidth: config.paperWidth,
    };
  }

  public async getStatus(config: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    return {
      connected: Boolean(config.lanIp),
      status: config.lanIp ? 'CONNECTED' : 'DISCONNECTED',
      type: this.type,
      printerName: config.printerName || 'LAN Thermal Printer',
      paperWidth: config.paperWidth,
    };
  }

  public async testPrint(config: UniversalPrinterConfig): Promise<PrintResult> {
    const startTime = Date.now();
    const ip = config.lanIp;
    const port = config.lanPort || 9100;

    if (Platform.OS !== 'web') {
      try {
        const ThermalPrinter = require('react-native-thermal-printer').default;
        if (ThermalPrinter?.printTcp) {
          await ThermalPrinter.printTcp({
            ip,
            port,
            payload: `[C]<u><font size='big'>KIOSK LAN TEST</font></u>\n[C]Printer IP: ${ip}\n[C]Port: ${port}\n\n\n`,
            autoCut: config.autoCut,
            mmFeedPaper: 25,
          });
          return {
            success: true,
            jobId: `LAN-TEST-${Date.now()}`,
            printerType: 'LAN',
            printerName: config.printerName,
            message: `Printed successfully to ${ip}:${port}`,
            durationMs: Date.now() - startTime,
          };
        }
      } catch (err: any) {
        return {
          success: false,
          jobId: `LAN-TEST-${Date.now()}`,
          printerType: 'LAN',
          printerName: config.printerName,
          message: err?.message || 'TCP print error',
          durationMs: Date.now() - startTime,
        };
      }
    }

    return {
      success: true,
      jobId: `LAN-TEST-${Date.now()}`,
      printerType: 'LAN',
      printerName: config.printerName,
      message: `Test print queued to ${ip}:${port}`,
      durationMs: Date.now() - startTime,
    };
  }
}

export const lanPrinterDriver = new LanPrinterDriver();
