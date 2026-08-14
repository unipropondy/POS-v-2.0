import { Platform, NativeModules } from 'react-native';
const { SunmiPrinterDetector } = NativeModules;
import ThermalPrinter from 'react-native-thermal-printer';
import { API_URL } from '../constants/Config';
import { useAuthStore } from '../stores/authStore';

export type DrawerActionType =
  | 'SALE' | 'CASH_IN' | 'CASH_OUT'
  | 'OPENING_FLOAT' | 'DRAWER_CHECK'
  | 'OTHER';

export interface CashDrawerLogPayload {
  outletId: number;
  terminalCode: string;
  actionType: DrawerActionType;
  amount?: number;
  tenderedAmount?: number;
  changeAmount?: number;
  orderId?: string | null;
  reason?: string | null;
  remark?: string | null;
  openedByUserId: string;
  approvedByUserId?: string | null;
  openSource: 'SALE' | 'MANUAL';
}

export default class CashDrawerService {
  static async getCashierPrinterIp(): Promise<string> {
    try {
      const res = await fetch(`${API_URL}/api/settings/kitchen-printers`);
      const printers = await res.json();
      if (Array.isArray(printers)) {
        const cashier = printers.find((p: any) => p.PrinterType === 1);
        return cashier?.PrinterPath?.trim() || '';
      }
    } catch (e) {
      console.warn('[CashDrawer] Failed to fetch printer IP:', e);
    }
    return '';
  }

  static async openCashDrawer(printerIp: string): Promise<boolean> {
    if (Platform.OS === 'web') {
      try {
        const storeId = "STORE_001";
        console.log(`📡 [Web CashDrawer] Sending open command via Print Bridge`);
        const response = await fetch(`${API_URL}/api/print-jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer unipro-pos-bridge-token-2026",
            "x-store-id": storeId
          },
          body: JSON.stringify({
            printerType: 1, // Cashier Printer
            content: "G3AAGRk=" // Base64 encoding of ESC p 0 25 25 (\x1B\x70\x00\x19\x19)
          })
        });
        const resData = await response.json();
        if (resData.success !== true || !resData.jobId) {
          return false;
        }

        // Poll for completion (up to 1.5 seconds)
        const jobId = resData.jobId;
        const start = Date.now();
        while (Date.now() - start < 1500) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          try {
            const statusRes = await fetch(`${API_URL}/api/print-jobs/status/${jobId}`);
            const statusData = await statusRes.json();
            if (statusData.success && statusData.status === 'COMPLETED') {
              console.log(`✅ [Web CashDrawer] Drawer opened successfully via Print Bridge`);
              return true;
            }
            if (statusData.success && statusData.status === 'FAILED') {
              console.warn('[Web CashDrawer] Bridge open command failed on bridge side:', statusData.error);
              return false;
            }
          } catch (err) {
            console.error('[Web CashDrawer] Status poll error:', err);
          }
        }
        console.warn('[Web CashDrawer] Bridge open command timed out (bridge offline/no printer)');
        return false;
      } catch (e) {
        console.error('[Web CashDrawer] Bridge open command failed:', e);
        return false;
      }
    }
    if (Platform.OS === 'android' && SunmiPrinterDetector) {
      try {
        console.log('🔌 [CashDrawer] Triggering built-in Sunmi Cash Drawer...');
        const success = await SunmiPrinterDetector.openCashDrawer();
        if (success) {
          console.log('✅ [CashDrawer] Sunmi Cash Drawer opened successfully');
          return true;
        }
      } catch (e) {
        console.warn('⚠️ [CashDrawer] Built-in Sunmi Cash Drawer trigger failed, falling back to TCP:', e);
      }
    }

    if (!printerIp || printerIp.trim() === '') {
      console.warn('[CashDrawer] No printer IP configured for TCP fallback');
      return false;
    }
    try {
      // RJ11 command via TCP
      await ThermalPrinter.printTcp({
        ip: printerIp.trim(),
        port: 9100,
        payload: '\x1B\x70\x00\x19\x19',
        openCashbox: true,
        mmFeedPaper: 0,
        autoCut: false,
      });
      console.log(`✅ [CashDrawer] Open command successfully pulsed to ${printerIp}`);
      return true;
    } catch (e) {
      console.error('[CashDrawer] Open command pulse failed:', e);
      return false;
    }
  }

  static async saveLog(payload: CashDrawerLogPayload, isSuccess: boolean): Promise<void> {
    try {
      const token = useAuthStore.getState().token;
      await fetch(`${API_URL}/api/cash-drawer/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, isSuccess }),
      });
    } catch (e) {
      console.warn('[CashDrawer] Failed to store activity log:', e);
    }
  }

  static async openAndLog(
    payload: CashDrawerLogPayload,
    printerIpOverride?: string
  ): Promise<boolean> {
    const ip = printerIpOverride || await this.getCashierPrinterIp();
    const success = await this.openCashDrawer(ip);
    await this.saveLog(payload, success);
    return success;
  }
}
