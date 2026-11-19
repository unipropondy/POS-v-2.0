import AsyncStorage from '@react-native-async-storage/async-storage';
import { UniversalPrinterConfig } from './PrinterTypes';

export const POS_CONFIG_STORAGE_KEY = 'pos_printer_config_pos_v1';
export const KIOSK_CONFIG_STORAGE_KEY = 'kiosk_printer_config_kiosk_v1';

export const DEFAULT_PRINTER_CONFIG: UniversalPrinterConfig = {
  type: 'USB',
  printerName: 'USB Thermal Printer',
  paperWidth: '80mm',
  lanIp: '192.168.1.100',
  lanPort: 9100,
  usbDeviceId: undefined,
  usbVendorId: undefined,
  usbProductId: undefined,
  usbDeviceName: undefined,
  autoCut: true,
  openDrawer: false,
  copies: 1,
  timeoutMs: 4000,
};

type ConfigChangeListener = (config: UniversalPrinterConfig) => void;

export class PrinterConfigManager {
  private currentConfig: UniversalPrinterConfig = { ...DEFAULT_PRINTER_CONFIG };
  private listeners: Set<ConfigChangeListener> = new Set();
  private isLoaded: boolean = false;
  private loadPromise: Promise<UniversalPrinterConfig> | null = null;
  private readonly storageKey: string;
  private readonly label: string;

  constructor(storageKey: string, label: string) {
    this.storageKey = storageKey;
    this.label = label;
  }

  public getConfig(): UniversalPrinterConfig {
    return { ...this.currentConfig };
  }

  public async loadConfig(): Promise<UniversalPrinterConfig> {
    if (this.isLoaded) {
      return { ...this.currentConfig };
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(this.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.currentConfig = {
            ...DEFAULT_PRINTER_CONFIG,
            ...parsed,
          };
        } else if (typeof window !== 'undefined' && window.localStorage) {
          const localVal = window.localStorage.getItem(this.storageKey);
          if (localVal) {
            this.currentConfig = {
              ...DEFAULT_PRINTER_CONFIG,
              ...JSON.parse(localVal),
            };
          }
        }
      } catch (e) {
        console.warn(`[PrinterConfigManager:${this.label}] Failed to load config:`, e);
      } finally {
        this.isLoaded = true;
        this.loadPromise = null;
      }
      return { ...this.currentConfig };
    })();

    return this.loadPromise;
  }

  public async saveConfig(newConfig: Partial<UniversalPrinterConfig>): Promise<UniversalPrinterConfig> {
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
    };

    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.currentConfig));
    } catch (e) {
      console.warn(`[PrinterConfigManager:${this.label}] AsyncStorage save failed:`, e);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.currentConfig));
      } catch (_) {}
    }

    this.notifyListeners();
    return { ...this.currentConfig };
  }

  public subscribe(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.currentConfig });
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const copy = { ...this.currentConfig };
    this.listeners.forEach((fn) => {
      try {
        fn(copy);
      } catch (e) {
        console.error(`[PrinterConfigManager:${this.label}] Listener error:`, e);
      }
    });
  }
}

export const posPrinterConfigManager = new PrinterConfigManager(POS_CONFIG_STORAGE_KEY, 'POS');
export const kioskPrinterConfigManager = new PrinterConfigManager(KIOSK_CONFIG_STORAGE_KEY, 'KIOSK');
