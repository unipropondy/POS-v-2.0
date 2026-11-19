import {
  PrinterContext,
  PrinterStatusResult,
  PrintResult,
  UniversalPrinterConfig,
} from './PrinterTypes';
import {
  posPrinterConfigManager,
  kioskPrinterConfigManager,
  PrinterConfigManager,
} from './PrinterConfig';
import { usbPrinterDriver } from './drivers/UsbPrinter';
import { lanPrinterDriver } from './drivers/LanPrinter';
import { sunmiPrinterDriver } from './drivers/SunmiPrinter';

export class UniversalPrinterService {
  public readonly context: PrinterContext;
  private readonly configManager: PrinterConfigManager;

  constructor(context: PrinterContext) {
    this.context = context;
    this.configManager =
      context === 'KIOSK' ? kioskPrinterConfigManager : posPrinterConfigManager;
  }

  public getConfigManager(): PrinterConfigManager {
    return this.configManager;
  }

  public async getStatus(configOverride?: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    const config = configOverride || (await this.configManager.loadConfig());
    if (config.type === 'SUNMI') {
      return await sunmiPrinterDriver.getStatus(config);
    }
    if (config.type === 'LAN') {
      return await lanPrinterDriver.getStatus(config);
    }
    return await usbPrinterDriver.getStatus(config);
  }

  public async connect(configOverride?: UniversalPrinterConfig): Promise<PrinterStatusResult> {
    const config = configOverride || (await this.configManager.loadConfig());
    if (config.type === 'SUNMI') {
      return await sunmiPrinterDriver.connect(config);
    }
    if (config.type === 'LAN') {
      return await lanPrinterDriver.connect(config);
    }
    return await usbPrinterDriver.connect(config);
  }

  public async disconnect(): Promise<boolean> {
    const config = this.configManager.getConfig();
    if (config.type === 'USB') {
      return await usbPrinterDriver.disconnect();
    }
    return true;
  }

  public async testPrint(configOverride?: UniversalPrinterConfig): Promise<PrintResult> {
    const config = configOverride || (await this.configManager.loadConfig());
    if (config.type === 'SUNMI') {
      return await sunmiPrinterDriver.testPrint(config);
    }
    if (config.type === 'LAN') {
      return await lanPrinterDriver.testPrint(config);
    }
    return await usbPrinterDriver.testPrint(config);
  }
}

export const posPrinter = new UniversalPrinterService('POS');
export const kioskPrinter = new UniversalPrinterService('KIOSK');
