import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  PaperWidth,
  PrinterConnectionStatus,
  PrinterContext,
  PrinterType,
  UniversalPrinterConfig,
  UsbDeviceInfo,
} from '../services/printer/PrinterTypes';
import {
  kioskPrinter,
  posPrinter,
  UniversalPrinterService,
} from '../services/printer/UniversalPrinter';
import {
  kioskPrinterConfigManager,
  posPrinterConfigManager,
  PrinterConfigManager,
} from '../services/printer/PrinterConfig';
import { usbPrinterDriver } from '../services/printer/drivers/UsbPrinter';
import { sunmiPrinterDriver } from '../services/printer/drivers/SunmiPrinter';

interface Props {
  printerContext?: PrinterContext;
  onClose?: () => void;
  onConfigSaved?: () => void;
}

export const KioskPrinterSettingsScreen: React.FC<Props> = ({
  printerContext = 'KIOSK',
  onClose,
  onConfigSaved,
}) => {
  const configManager: PrinterConfigManager =
    printerContext === 'KIOSK' ? kioskPrinterConfigManager : posPrinterConfigManager;
  const printerService: UniversalPrinterService =
    printerContext === 'KIOSK' ? kioskPrinter : posPrinter;

  const [config, setConfig] = useState<UniversalPrinterConfig>(configManager.getConfig());
  const [status, setStatus] = useState<PrinterConnectionStatus>('DISCONNECTED');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [usbDevices, setUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [loadingUsbList, setLoadingUsbList] = useState<boolean>(false);

  useEffect(() => {
    configManager.loadConfig().then((loaded) => {
      setConfig(loaded);
      checkLiveStatus(loaded);
    });

    if (config.type === 'USB') {
      scanUsbDevices();
    }
  }, [printerContext]);

  const checkLiveStatus = async (cfg?: UniversalPrinterConfig) => {
    try {
      const res = await printerService.getStatus(cfg || config);
      setStatus(res.status);
      if (res.errorMessage) {
        setStatusMessage(res.errorMessage);
      } else if (res.connected) {
        setStatusMessage(`Connected (${res.paperWidth})`);
      } else {
        setStatusMessage('Disconnected');
      }
    } catch (err: any) {
      setStatus('ERROR');
      setStatusMessage(err?.message || 'Error querying status');
    }
  };

  const scanUsbDevices = async () => {
    setLoadingUsbList(true);
    try {
      const list = await usbPrinterDriver.listDevices();
      setUsbDevices(list);
      if (list.length > 0 && !config.usbDeviceId) {
        const defaultDev = list.find((d) => d.isPrinter) || list[0];
        setConfig((prev) => ({
          ...prev,
          usbDeviceId: defaultDev.deviceId,
          usbVendorId: defaultDev.vendorId,
          usbProductId: defaultDev.productId,
          usbDeviceName: defaultDev.productName || defaultDev.deviceName,
        }));
      }
    } catch (err) {
      console.warn('scanUsbDevices error:', err);
    } finally {
      setLoadingUsbList(false);
    }
  };

  const handleTypeChange = async (type: PrinterType) => {
    const updated: UniversalPrinterConfig = { ...config, type };
    if (type === 'SUNMI') {
      updated.printerName = 'SUNMI Built-in Thermal Printer';
      updated.paperWidth = '58mm';
    } else if (type === 'LAN') {
      updated.printerName = 'Network Thermal Printer';
      if (!updated.lanIp) updated.lanIp = '192.168.1.100';
      if (!updated.lanPort) updated.lanPort = 9100;
    } else if (type === 'USB') {
      updated.printerName = 'USB Thermal Printer';
      scanUsbDevices();
    }

    setConfig(updated);
    await configManager.saveConfig(updated);
    setTimeout(() => checkLiveStatus(updated), 200);
  };

  const handleDetect = async () => {
    setIsDetecting(true);
    setStatusMessage('Detecting hardware...');
    try {
      if (config.type === 'USB') {
        await scanUsbDevices();
        const devices = await usbPrinterDriver.listDevices();
        if (devices.length > 0) {
          setStatus('CONNECTED');
          setStatusMessage(`Found ${devices.length} USB device(s)`);
        } else {
          setStatus('DISCONNECTED');
          setStatusMessage('No USB printers detected. Check OTG cable / USB port.');
        }
      } else if (config.type === 'SUNMI') {
        const isSunmi = await sunmiPrinterDriver.isAvailable();
        if (isSunmi) {
          setStatus('CONNECTED');
          setStatusMessage('SUNMI hardware ready');
        } else {
          setStatus('OFFLINE');
          setStatusMessage('Not a SUNMI device or AIDL service unavailable.');
        }
      } else {
        const res = await printerService.connect(config);
        setStatus(res.status);
        setStatusMessage(
          res.connected
            ? `LAN Printer Reached at ${config.lanIp}:${config.lanPort}`
            : res.errorMessage || 'LAN Printer Unreachable'
        );
      }
    } catch (err: any) {
      setStatus('ERROR');
      setStatusMessage(err?.message || 'Detection failed');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setStatusMessage('Connecting...');
    try {
      const res = await printerService.connect(config);
      setStatus(res.status);
      if (res.connected) {
        setStatusMessage(`Successfully connected to ${res.printerName}`);
      } else {
        setStatusMessage(res.errorMessage || 'Connection failed');
      }
    } catch (err: any) {
      setStatus('ERROR');
      setStatusMessage(err?.message || 'Connection error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await printerService.disconnect();
      setStatus('DISCONNECTED');
      setStatusMessage('Printer disconnected');
    } catch (err: any) {
      setStatusMessage(err?.message || 'Disconnect error');
    }
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    setStatusMessage('Printing test receipt...');
    try {
      const res = await printerService.testPrint(config);
      if (res.success) {
        setStatus('CONNECTED');
        setStatusMessage('Test ticket printed successfully!');
        if (Platform.OS === 'web') alert('✓ Test ticket printed successfully!');
        else Alert.alert('Test Print Successful', 'Test ticket printed successfully!');
      } else {
        setStatus('ERROR');
        setStatusMessage(res.message);
        if (Platform.OS === 'web') alert('✗ ' + res.message);
        else Alert.alert('Test Print Failed', res.message);
      }
    } catch (err: any) {
      setStatus('ERROR');
      setStatusMessage(err?.message || 'Print error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await configManager.saveConfig(config);
      if (onConfigSaved) onConfigSaved();
      if (Platform.OS === 'web') alert('Kiosk Printer Configuration Saved!');
      else Alert.alert('Success', 'Kiosk Printer Configuration Saved!');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const isKiosk = printerContext === 'KIOSK';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header Banner */}
      <View style={styles.cardHeaderBanner}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="print" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>
              {isKiosk ? 'Kiosk Thermal Printer' : 'POS Thermal Printer'}
            </Text>
            <Text style={styles.headerSubtitle}>
              SUNMI Built-in · LAN / Wi-Fi ESC/POS · USB Host Thermal
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            status === 'CONNECTED' ? styles.statusBadgeConnected : styles.statusBadgeOffline,
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              status === 'CONNECTED' ? styles.statusTextConnected : styles.statusTextOffline,
            ]}
          >
            ● {status === 'CONNECTED' ? 'CONNECTED' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Substatus line */}
      <View style={styles.statusInfoRow}>
        <Ionicons
          name={status === 'CONNECTED' ? 'checkmark-circle' : 'alert-circle'}
          size={16}
          color={status === 'CONNECTED' ? '#10B981' : '#F59E0B'}
        />
        <Text style={styles.statusInfoText}>
          {statusMessage || (status === 'CONNECTED' ? 'Connected' : 'Disconnected')}
        </Text>
      </View>

      {/* 1. SELECT PRINTER TYPE */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>1. SELECT {isKiosk ? 'KIOSK' : 'POS'} PRINTER TYPE</Text>
        <View style={styles.typeGrid}>
          <TouchableOpacity
            style={[styles.typeButton, config.type === 'SUNMI' && styles.typeButtonActive]}
            onPress={() => handleTypeChange('SUNMI')}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={24}
              color={config.type === 'SUNMI' ? '#fff' : '#64748B'}
            />
            <Text style={[styles.typeTitle, config.type === 'SUNMI' && styles.typeTitleActive]}>
              SUNMI
            </Text>
            <Text style={[styles.typeSub, config.type === 'SUNMI' && styles.typeSubActive]}>
              Built-in AIDL
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, config.type === 'LAN' && styles.typeButtonActive]}
            onPress={() => handleTypeChange('LAN')}
          >
            <Ionicons
              name="wifi-outline"
              size={24}
              color={config.type === 'LAN' ? '#fff' : '#64748B'}
            />
            <Text style={[styles.typeTitle, config.type === 'LAN' && styles.typeTitleActive]}>
              LAN / Wi-Fi
            </Text>
            <Text style={[styles.typeSub, config.type === 'LAN' && styles.typeSubActive]}>
              TCP Socket
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, config.type === 'USB' && styles.typeButtonActive]}
            onPress={() => handleTypeChange('USB')}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={24}
              color={config.type === 'USB' ? '#fff' : '#64748B'}
            />
            <Text style={[styles.typeTitle, config.type === 'USB' && styles.typeTitleActive]}>
              USB Host
            </Text>
            <Text style={[styles.typeSub, config.type === 'USB' && styles.typeSubActive]}>
              Direct OTG
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. HARDWARE CONFIGURATION */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>
          2. {isKiosk ? 'KIOSK' : 'POS'} PRINTER HARDWARE CONFIGURATION
        </Text>

        <Text style={styles.fieldLabel}>Printer Display Name</Text>
        <TextInput
          style={styles.textInput}
          value={config.printerName}
          onChangeText={(val) => setConfig({ ...config, printerName: val })}
          placeholder="e.g. Kiosk Thermal Printer"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.fieldLabel}>Thermal Paper Width</Text>
        <View style={styles.widthSwitchRow}>
          <TouchableOpacity
            style={[styles.widthBtn, config.paperWidth === '58mm' && styles.widthBtnActive]}
            onPress={() => setConfig({ ...config, paperWidth: '58mm' })}
          >
            <Text
              style={[styles.widthBtnText, config.paperWidth === '58mm' && styles.widthBtnTextActive]}
            >
              58mm (Receipt / Sunmi)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.widthBtn, config.paperWidth === '80mm' && styles.widthBtnActive]}
            onPress={() => setConfig({ ...config, paperWidth: '80mm' })}
          >
            <Text
              style={[styles.widthBtnText, config.paperWidth === '80mm' && styles.widthBtnTextActive]}
            >
              80mm (Standard POS / Kitchen)
            </Text>
          </TouchableOpacity>
        </View>

        {/* USB HOST SPECIFIC ENUMERATION */}
        {config.type === 'USB' && (
          <View style={styles.usbContainerBox}>
            <View style={styles.usbHeaderRow}>
              <Text style={styles.usbHeaderTitle}>Connected USB Thermal Printers</Text>
              <TouchableOpacity
                style={styles.refreshUsbBtn}
                onPress={scanUsbDevices}
                disabled={loadingUsbList}
              >
                {loadingUsbList ? (
                  <ActivityIndicator size="small" color="#6366F1" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color="#6366F1" />
                    <Text style={styles.refreshUsbText}>Refresh USB</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {usbDevices.length === 0 ? (
              <View style={styles.emptyUsbBox}>
                <Ionicons name="hardware-chip-outline" size={32} color="#94A3B8" />
                <Text style={styles.emptyUsbTitle}>No USB printers detected on this device.</Text>
                <Text style={styles.emptyUsbSub}>
                  Ensure your thermal printer is connected via OTG/USB cable and powered ON.
                </Text>
              </View>
            ) : (
              <View style={styles.usbListContainer}>
                {usbDevices.map((dev) => {
                  const isSelected =
                    config.usbDeviceId === dev.deviceId ||
                    config.usbDeviceName === (dev.productName || dev.deviceName);
                  const vidHex = '0x' + (dev.vendorId || 0).toString(16).toUpperCase();
                  const pidHex = '0x' + (dev.productId || 0).toString(16).toUpperCase();

                  return (
                    <TouchableOpacity
                      key={dev.deviceId}
                      style={[styles.usbDeviceCard, isSelected && styles.usbDeviceCardSelected]}
                      onPress={() => {
                        setConfig({
                          ...config,
                          usbDeviceId: dev.deviceId,
                          usbVendorId: dev.vendorId,
                          usbProductId: dev.productId,
                          usbDeviceName: dev.productName || dev.deviceName,
                        });
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Ionicons
                          name="print-outline"
                          size={20}
                          color={isSelected ? '#6366F1' : '#64748B'}
                        />
                        <View>
                          <Text
                            style={[
                              styles.usbDeviceName,
                              isSelected && { color: '#4338CA', fontWeight: '700' },
                            ]}
                          >
                            {dev.productName || dev.deviceName || 'USB Thermal Printer'}
                          </Text>
                          <Text style={styles.usbDeviceDetails}>
                            VID: {vidHex} · PID: {pidHex} · ID: {dev.deviceId}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.grantedBadge,
                          dev.hasPermission ? styles.badgeGranted : styles.badgePending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.grantedBadgeText,
                            dev.hasPermission ? styles.textGranted : styles.textPending,
                          ]}
                        >
                          {dev.hasPermission ? 'Granted' : 'Request'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* LAN SPECIFIC INPUTS */}
        {config.type === 'LAN' && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <Text style={styles.fieldLabel}>Printer IP Address</Text>
            <TextInput
              style={styles.textInput}
              value={config.lanIp}
              onChangeText={(val) => setConfig({ ...config, lanIp: val })}
              placeholder="e.g. 192.168.1.100"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
            <Text style={styles.fieldLabel}>Port</Text>
            <TextInput
              style={styles.textInput}
              value={String(config.lanPort || 9100)}
              onChangeText={(val) => setConfig({ ...config, lanPort: parseInt(val, 10) || 9100 })}
              placeholder="9100"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
          </View>
        )}

        {/* Preferences Toggles */}
        <View style={styles.togglesRow}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setConfig({ ...config, autoCut: !config.autoCut })}
          >
            <Ionicons
              name={config.autoCut ? 'checkbox' : 'square-outline'}
              size={20}
              color={config.autoCut ? '#6366F1' : '#94A3B8'}
            />
            <Text style={styles.checkboxLabel}>Auto Cut Paper</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setConfig({ ...config, openDrawer: !config.openDrawer })}
          >
            <Ionicons
              name={config.openDrawer ? 'checkbox' : 'square-outline'}
              size={20}
              color={config.openDrawer ? '#6366F1' : '#94A3B8'}
            />
            <Text style={styles.checkboxLabel}>Open Cash Drawer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. ACTIONS & TESTING */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeader}>3. ACTIONS & TESTING ({isKiosk ? 'Kiosk' : 'POS'})</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.btnDetect]}
            onPress={handleDetect}
            disabled={isDetecting}
          >
            <Ionicons name="search" size={16} color="#334155" />
            <Text style={styles.btnDetectText}>Detect</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.btnConnect]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            <Ionicons name="link" size={16} color="#fff" />
            <Text style={styles.btnWhiteText}>Connect</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.btnDisconnect]}
            onPress={handleDisconnect}
          >
            <Ionicons name="link-outline" size={16} color="#475569" />
            <Text style={styles.btnDisconnectText}>Disconnect</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.btnTest]}
            onPress={handleTestPrint}
            disabled={isTesting}
          >
            <Ionicons name="print" size={16} color="#fff" />
            <Text style={styles.btnWhiteText}>Test Print</Text>
          </TouchableOpacity>
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveConfigBtn, isSaving && { opacity: 0.7 }]}
          onPress={handleSaveConfig}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveConfigBtnText}>
                Save {isKiosk ? 'Kiosk' : 'POS'} Configuration
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
  },
  cardHeaderBanner: {
    backgroundColor: '#1E1B4B',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeConnected: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBadgeOffline: {
    backgroundColor: 'rgba(71, 85, 105, 0.3)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextConnected: {
    color: '#10B981',
  },
  statusTextOffline: {
    color: '#94A3B8',
  },
  statusInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  statusInfoText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#4F46E5',
  },
  typeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 6,
  },
  typeTitleActive: {
    color: '#fff',
  },
  typeSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  typeSubActive: {
    color: '#E0E7FF',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1E293B',
  },
  widthSwitchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  widthBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  widthBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  widthBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  widthBtnTextActive: {
    color: '#fff',
  },
  usbContainerBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#FAFAFA',
  },
  usbHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  usbHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  refreshUsbBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  refreshUsbText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
  },
  emptyUsbBox: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyUsbTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 8,
  },
  emptyUsbSub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  usbListContainer: {
    gap: 8,
  },
  usbDeviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  usbDeviceCardSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#F5F3FF',
  },
  usbDeviceName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  usbDeviceDetails: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  grantedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGranted: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  grantedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textGranted: {
    color: '#059669',
  },
  textPending: {
    color: '#D97706',
  },
  togglesRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkboxLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnDetect: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnDetectText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  btnConnect: {
    backgroundColor: '#0284C7',
  },
  btnDisconnect: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnDisconnectText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  btnTest: {
    backgroundColor: '#6366F1',
  },
  btnWhiteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  saveConfigBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveConfigBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default KioskPrinterSettingsScreen;
