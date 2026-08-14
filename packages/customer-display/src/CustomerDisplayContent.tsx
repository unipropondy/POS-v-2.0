/**
 * CustomerDisplayContent — Shared UI Package
 *
 * This is the single source of truth for the customer display UI.
 * It renders identically on:
 *   - Android (Sunmi D3) via the native React Native renderer
 *   - Windows (Electron BrowserWindow) via React Native Web
 *
 * All future UI changes (layout, colors, animations, branding, new fields)
 * should be made here ONLY — they will automatically apply to both platforms.
 *
 * Platform-specific isolation:
 *   - expo-router (Back button): guarded with Platform.OS !== 'web' check
 *   - State updates from Electron: received via window.postMessage (web only)
 *   - State updates from POS: received via socket.on('customer_display_sync') (all platforms)
 *   - Zustand persistence: AsyncStorage on Android, localStorage on web/Electron
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { API_URL, setApiUrl } from "./constants/Config";
import { Fonts } from "./constants/Fonts";
import { socket } from "./constants/socket";
import { Theme } from "./constants/theme";
import { useCompanySettingsStore } from "./stores/companySettingsStore";
import { usePaymentSettingsStore } from "./stores/paymentSettingsStore";
import { useTerminalStore, Terminal } from "./stores/terminalStore";
import { DisplayState, DEFAULT_STATE } from "./types/DisplayState";


const getLogoUri = (logo: string) => {
  if (!logo) return "";
  if (logo.startsWith("data:image")) return logo;
  if (logo.startsWith("http")) return logo;
  return `${API_URL}${logo.startsWith("/") ? "" : "/"}${logo}`;
};

export default function CustomerDisplayContent() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const companySettings = useCompanySettingsStore((s: any) => s.settings);
  const paymentSettings = usePaymentSettingsStore((s: any) => s.settings);

  // Change 4 (part a): Back button uses expo-router which is not available in
  // Electron. We lazy-require it so the package does not crash on web.
  // On web the button returns null (not needed on the secondary monitor display).
  const renderBackButton = () => {
    if (Platform.OS === 'web') {
      return (
        <TouchableOpacity
          style={styles.floatingBackBtn}
          onPress={() => {
            if (typeof window !== 'undefined' && window.history) {
              window.history.back();
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color="#ef4444" />
          <Text style={{ color: '#ef4444', fontFamily: Fonts.bold, fontSize: 13 }}>
            Back
          </Text>
        </TouchableOpacity>
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useRouter } = require('expo-router');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter();
    return (
      <TouchableOpacity
        style={styles.floatingBackBtn}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/category');
          }
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={18} color="#ef4444" />
        <Text style={{ color: '#ef4444', fontFamily: Fonts.bold, fontSize: 13 }}>
          Back
        </Text>
      </TouchableOpacity>
    );
  };

  const [displayState, setDisplayState] = useState<DisplayState>(DEFAULT_STATE);
  const [floatingFoods, setFloatingFoods] = useState<any[]>([]);

  // â”€â”€â”€ TERMINAL PAIRING STATE â”€â”€â”€
  const terminalCode = useTerminalStore((s: any) => s.terminalCode);
  const terminalName = useTerminalStore((s: any) => s.terminalName);
  const isTerminalConfigured = useTerminalStore((s: any) => s.isConfigured);
  const [showTerminalModal, setShowTerminalModal] = useState(!isTerminalConfigured);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalsLoading, setTerminalsLoading] = useState(false);
  const [selectedTerminalCode, setSelectedTerminalCode] = useState<string | null>(null);

  // Animation value for success screen fade/scale
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // 1. Initialize settings, socket listener & terminal room join
  useEffect(() => {
    // Inject custom fonts and vector icon font-faces on Web/Electron
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'customer-display-fonts-and-icons';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.appendChild(document.createTextNode(`
          @font-face {
            font-family: 'Ionicons';
            src: url('https://unpkg.com/react-native-vector-icons@10.0.0/Fonts/Ionicons.ttf') format('truetype');
          }

          @font-face {
            font-family: 'Inter_400Regular';
            src: url('https://unpkg.com/@fontsource/inter@5.0.1/files/inter-latin-400-normal.woff2') format('woff2');
          }
          @font-face {
            font-family: 'Inter_500Medium';
            src: url('https://unpkg.com/@fontsource/inter@5.0.1/files/inter-latin-500-normal.woff2') format('woff2');
          }
          @font-face {
            font-family: 'Inter_600SemiBold';
            src: url('https://unpkg.com/@fontsource/inter@5.0.1/files/inter-latin-600-normal.woff2') format('woff2');
          }
          @font-face {
            font-family: 'Inter_700Bold';
            src: url('https://unpkg.com/@fontsource/inter@5.0.1/files/inter-latin-700-normal.woff2') format('woff2');
          }
          @font-face {
            font-family: 'Inter_800ExtraBold';
            src: url('https://unpkg.com/@fontsource/inter@5.0.1/files/inter-latin-800-normal.woff2') format('woff2');
          }
          @font-face {
            font-family: 'Inter_900Black';
            src: url('https://unpkg.com/@fontsource/inter@5.0.1/files/inter-latin-900-normal.woff2') format('woff2');
          }
        `));
        document.head.appendChild(style);
      }
    }

    const initSettings = () => {
      usePaymentSettingsStore.getState().fetchSettings();
      useCompanySettingsStore.getState().fetchSettings("1");
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      fetch('/api/config')
        .then((r) => r.json())
        .then((data) => {
          const activeBackend = data?.backends?.find((b: any) => b.enabled);
          if (activeBackend && activeBackend.url) {
            console.log(`🖥️ [CustomerDisplay] Dynamically setting API_URL from print bridge config: ${activeBackend.url}`);
            setApiUrl(activeBackend.url);
          }
          initSettings();
        })
        .catch((err) => {
          console.warn('🖥️ [CustomerDisplay] Failed to fetch print bridge config, using default API_URL', err);
          initSettings();
        });
    } else {
      initSettings();
    }

    const handleSync = (data: any) => {
      console.log(
        "🖥️ [CustomerDisplay] Received sync event:",
        data.paymentSuccess ? "SUCCESS" : data.active ? "CART" : "IDLE",
      );
      setDisplayState(data);
    };

    socket.on("customer_display_sync", handleSync);

    // Auto-rejoin terminal room on every socket connect/reconnect
    const handleConnect = () => {
      useTerminalStore.getState().joinSocketRoom();
    };
    socket.on("connect", handleConnect);
    // Also join immediately if already connected
    if (socket.connected) {
      useTerminalStore.getState().joinSocketRoom();
    }

    return () => {
      socket.off("customer_display_sync", handleSync);
      socket.off("connect", handleConnect);
    };
  }, []);

  // Change 4 (part b): Electron IPC channel — web only.
  // The Print Bridge pushes state via Electron's executeJavaScript → window.postMessage.
  // This is a LOCAL fast-path that bypasses the Railway Socket.io round-trip.
  // On Android this effect is a no-op (Platform.OS !== 'web').
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.__source !== 'electron-print-bridge') return;

      console.log(
        '🖥️ [CustomerDisplay] Received Electron IPC state:',
        event.data.payload?.paymentSuccess ? 'SUCCESS'
          : event.data.payload?.active ? 'CART' : 'IDLE',
      );
      
      setDisplayState(event.data.payload);

      // Auto-detect and configure terminal code if pushed locally by the POS
      const payload = event.data.payload;
      if (payload && payload.terminalCode) {
        const currentCode = useTerminalStore.getState().terminalCode;
        if (currentCode !== payload.terminalCode) {
          console.log(`🖥️ [CustomerDisplay] Auto-detecting and setting terminal from Electron payload: ${payload.terminalCode}`);
          useTerminalStore.getState().setTerminal(payload.terminalCode, payload.terminalCode);
          setShowTerminalModal(false);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Fetch terminals when the modal opens
  useEffect(() => {
    if (!showTerminalModal) return;
    setTerminalsLoading(true);
    fetch(`${API_URL}/api/terminal`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTerminals(data);
        } else if (Array.isArray(data?.data)) {
          setTerminals(data.data);
        } else {
          setTerminals([]);
        }
      })
      .catch(() => setTerminals([]))
      .finally(() => setTerminalsLoading(false));
  }, [showTerminalModal]);


  // 2. Success screen trigger
  useEffect(() => {
    if (displayState.paymentSuccess) {
      // Animate success screen entrance
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          tension: 40,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      successScale.setValue(0);
      successOpacity.setValue(0);
    }
  }, [displayState.paymentSuccess]);

  // 3. Spawning popping food animations for Attract Loop
  useEffect(() => {
    if (displayState.active) {
      setFloatingFoods([]);
      return;
    }

    const icons = [
      "pizza-outline",
      "cafe-outline",
      "ice-cream-outline",
      "restaurant-outline",
      "beer-outline",
      "fast-food-outline",
    ];

    const interval = setInterval(() => {
      const id = Math.random().toString();
      const icon = icons[Math.floor(Math.random() * icons.length)];
      // Spawn coordinates (percentage of screen viewport)
      const x = Math.random() * 80 + 10;
      const y = Math.random() * 70 + 15;

      const scale = new Animated.Value(0);
      const translateY = new Animated.Value(0);
      const opacity = new Animated.Value(1);

      const newItem = { id, icon, x, y, scale, translateY, opacity };
      setFloatingFoods((prev) => [...prev, newItem].slice(-15)); // Keep max 15 on screen

      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.3,
          tension: 30,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -80 - Math.random() * 50,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          delay: 2200,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Clean up from state once finished
        setFloatingFoods((prev) => prev.filter((item) => item.id !== id));
      });
    }, 900);

    return () => clearInterval(interval);
  }, [displayState.active]);

  // 4. Generate UPI QR URL
  const upiUrl = (() => {
    if (!paymentSettings.upiId) return "";
    const cleanUpiId = paymentSettings.upiId.trim();
    const cleanShopName = paymentSettings.shopName.replace(/[&?=]/g, "").trim();
    return `upi://pay?pa=${cleanUpiId}&pn=${encodeURIComponent(cleanShopName)}&am=${(displayState.netTotal || 0).toFixed(2)}&cu=INR`;
  })();

  // â”€â”€â”€ RENDERS â”€â”€â”€

  // â”€â”€ Terminal Setup Modal helper â”€â”€
  const renderTerminalModal = () => (
    <Modal
      visible={showTerminalModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (isTerminalConfigured) setShowTerminalModal(false);
      }}
    >
      <View style={styles.terminalModalOverlay}>
        <View style={styles.terminalModalCard}>
          {/* Header */}
          <View style={styles.terminalModalHeader}>
            <Ionicons name="tv-outline" size={32} color={Theme.primary} />
            <Text style={styles.terminalModalTitle}>Customer Display Setup</Text>
            <Text style={styles.terminalModalSubtitle}>
              Select the counter this screen is paired with.{"\n"}
              The POS at that counter will sync to this display.
            </Text>
          </View>

          {/* Terminal List */}
          {terminalsLoading ? (
            <ActivityIndicator
              color={Theme.primary}
              size="large"
              style={{ marginVertical: 32 }}
            />
          ) : terminals.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Ionicons name="alert-circle-outline" size={40} color={Theme.textMuted} />
              <Text style={styles.terminalModalEmpty}>
                No terminals found.{"\n"}Please configure terminals in the backoffice.
              </Text>
            </View>
          ) : (
            <FlatList
              data={terminals}
              keyExtractor={(item) => item.TerminalCode}
              style={styles.terminalList}
              renderItem={({ item }) => {
                const isSelected = selectedTerminalCode === item.TerminalCode;
                return (
                  <TouchableOpacity
                    style={[
                      styles.terminalItem,
                      isSelected && styles.terminalItemSelected,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => setSelectedTerminalCode(item.TerminalCode)}
                  >
                    <Ionicons
                      name={isSelected ? "radio-button-on" : "radio-button-off"}
                      size={22}
                      color={isSelected ? Theme.primary : Theme.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.terminalItemCode, isSelected && { color: Theme.primary }]}>
                        {item.TerminalCode}
                      </Text>
                      {item.TerminalName ? (
                        <Text style={styles.terminalItemName}>{item.TerminalName}</Text>
                      ) : null}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={Theme.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Action Buttons */}
          <View style={styles.terminalModalActions}>
            {isTerminalConfigured && (
              <TouchableOpacity
                style={styles.terminalModalBtnCancel}
                onPress={() => setShowTerminalModal(false)}
              >
                <Text style={styles.terminalModalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.terminalModalBtnConfirm,
                !selectedTerminalCode && { opacity: 0.4 },
              ]}
              disabled={!selectedTerminalCode}
              onPress={() => {
                if (!selectedTerminalCode) return;
                const found = terminals.find((t) => t.TerminalCode === selectedTerminalCode);
                useTerminalStore
                  .getState()
                  .setTerminal(selectedTerminalCode, found?.TerminalName || selectedTerminalCode);
                setShowTerminalModal(false);
              }}
            >
              <Ionicons name="link-outline" size={18} color="#fff" />
              <Text style={styles.terminalModalBtnConfirmText}>Pair Display</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Success view
  if (displayState.paymentSuccess && paymentSettings.customerSideDisplay) {
    return (
      <View style={styles.successContainer}>
        {renderTerminalModal()}
        {renderBackButton()}

        <View style={styles.successMainContent}>
          <Animated.View
            style={[
              styles.successCard,
              {
                transform: [{ scale: successScale }],
                opacity: successOpacity,
              },
            ]}
          >
            <View style={styles.successIconWrapper}>
              <Ionicons
                name="checkmark-circle"
                size={100}
                color={Theme.success}
              />
            </View>
            <Text style={styles.successTitle}>Payment Successful</Text>
            <Text style={styles.successOrderText}>
              Order #{displayState.orderId}
            </Text>

            <View style={styles.dashedDivider} />

            <View style={styles.successDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Settlement Mode</Text>
                <Text style={styles.detailValue}>
                  {displayState.paymentMethod || "CARD/UPI"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Amount Paid</Text>
                <Text style={[styles.detailValue, { color: Theme.primary }]}>
                  {companySettings.currencySymbol || "$"}
                  {displayState.paid?.toFixed(2) ||
                    (displayState.netTotal || 0).toFixed(2)}
                </Text>
              </View>
              {displayState.change && displayState.change > 0 ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Change Given</Text>
                  <Text style={styles.detailValue}>
                    {companySettings.currencySymbol || "$"}
                    {(displayState.change || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.successFooter}>Thank you! Visit us again.</Text>
          </Animated.View>
        </View>

        {/* Unipro Footer on Success Screen */}
        <View style={[styles.idleUniproFooter, { marginTop: 24, transform: [{ scale: 0.85 }] }]}>
          <Image
            source={require("./assets/images/unipro_logo.png")}
            style={styles.uniproLogoImage}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  // Active checkout view
  if (displayState.active) {
    const pm = (displayState.paymentMethod || '').toUpperCase().trim();
    const isYeahPayPayNow = pm === 'YEAHPAY_PAYNOW';
    const isUPI =
      /UPI|GPAY|PHONE|PAYTM/i.test(pm) ||
      (displayState.paymentMethod === undefined && paymentSettings.upiId);
    // Regular PayNow (not YeahPay) with a static QR configured
    const isRegularPayNow =
      !isYeahPayPayNow &&
      (/^(PAYNOW|PAY-NOW|QR)$/i.test(pm) ||
        (displayState.paymentMethod === undefined && paymentSettings.payNowQrUrl));

    const activeItems = displayState.items || [];
    const allItemsHaveSC = activeItems.length > 0 && activeItems.every((item: any) => Number(item.isServiceCharge) === 1 || item.isServiceCharge === true);

    return (
      <View style={styles.checkoutContainer}>
        {renderTerminalModal()}
        {renderBackButton()}
        {/* Change Terminal pill */}
        {terminalCode ? (
          <TouchableOpacity
            style={styles.terminalPill}
            onPress={() => {
              setSelectedTerminalCode(terminalCode);
              setShowTerminalModal(true);
            }}
          >
            <Ionicons name="tv-outline" size={12} color={Theme.primary} />
            <Text style={styles.terminalPillText}>{terminalName || terminalCode}</Text>
          </TouchableOpacity>
        ) : null}
        {/* Top Header Banner */}
        <View style={styles.topHeaderBanner}>
          <Text style={styles.topHeaderText} numberOfLines={1}>
            {companySettings.name || paymentSettings.shopName || ""}
          </Text>
          {displayState.section || displayState.tableNo ? (
            <View style={styles.headerInfoContainer}>
              {displayState.section ? (
                <Text style={styles.headerSectionText}>
                  {displayState.section}
                </Text>
              ) : null}
              {displayState.tableNo ? (
                <View style={styles.headerTableBadge}>
                  <Text style={styles.headerTableText}>
                    {displayState.tableNo}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.checkoutLayout,
            isLandscape && styles.checkoutLayoutLandscape,
          ]}
        >
          {/* Left Pane: Payment QR / Restaurant Logo & Branding Footer */}
          <View style={styles.leftPane}>
            <View style={styles.leftMainContent}>
              {displayState.isSplit ? (
                <View style={styles.splitCard}>
                  <View style={styles.splitHeader}>
                    <Ionicons name="git-compare-outline" size={24} color={Theme.primary} />
                    <Text style={styles.splitTitle}>Split Payments</Text>
                  </View>
                  <ScrollView style={styles.splitScroll} showsVerticalScrollIndicator={false}>
                    {displayState.splitPayments && displayState.splitPayments.map((p, idx) => {
                      const isPaid = p.status === "Paid";
                      const isCancelled = p.status === "Cancelled";
                      return (
                        <View key={idx} style={styles.splitRow}>
                          <View style={styles.splitRowLeft}>
                            <View style={[styles.splitIndicator, { backgroundColor: isPaid ? Theme.success : isCancelled ? Theme.danger : Theme.warning }]} />
                            <Text style={styles.splitPaymodeText}>{p.payMode.toUpperCase()}</Text>
                          </View>
                          <Text style={styles.splitAmountText}>
                            {companySettings.currencySymbol || "$"}
                            {p.amount.toFixed(2)}
                          </Text>
                          <View style={[
                            styles.splitStatusBadge,
                            { backgroundColor: isPaid ? Theme.success + "15" : isCancelled ? Theme.danger + "15" : Theme.warning + "15" }
                          ]}>
                            <Text style={[
                              styles.splitStatusText,
                              { color: isPaid ? Theme.success : isCancelled ? Theme.danger : Theme.warning }
                            ]}>
                              {p.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.splitFooter}>
                    <Text style={styles.splitFooterLabel}>Total Due</Text>
                    <Text style={styles.splitFooterValue}>
                      {companySettings.currencySymbol || "$"}
                      {(displayState.netTotal || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ) : displayState.paymentMethod && isUPI && paymentSettings.upiId ? (
                <View style={styles.qrCard}>
                  <Text style={styles.qrTitle}>Scan to Pay via UPI</Text>
                  <View style={styles.qrImageContainer}>
                    {Platform.OS === "web" ? (
                      <Image
                        source={{
                          uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`,
                        }}
                        style={styles.webQrImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <QRCode
                        value={upiUrl}
                        size={200}
                        color="#000"
                        backgroundColor="#fff"
                      />
                    )}
                  </View>
                  <Text style={styles.qrSubtitle}>
                    GPay, PhonePe, Paytm, BHIM
                  </Text>
                </View>
              ) : displayState.paymentMethod &&
                isRegularPayNow &&
                paymentSettings.payNowQrUrl ? (
                <View style={styles.qrCard}>
                  <Text style={styles.qrTitle}>Scan to Pay via PayNow</Text>
                  <View style={styles.qrImageContainer}>
                    <Image
                      source={{
                        uri: paymentSettings.payNowQrUrl.startsWith("data:")
                          ? paymentSettings.payNowQrUrl
                          : `${API_URL}${paymentSettings.payNowQrUrl}`,
                      }}
                      style={styles.payNowQrImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.qrSubtitle}>
                    Scan QR code with your mobile banking app
                  </Text>
                </View>
              ) : displayState.paymentMethod ? (
                (() => {
                  const m = pm;
                  const isMemberPayMode = /^(MEMBER|CREDIT)$/i.test(m);
                  const isYeahPayPayNowMode = m === 'YEAHPAY_PAYNOW';

                  let info: { label: string; icon: string; color: string; subLabel?: string } = {
                    label: m,
                    icon: "wallet-outline",
                    color: Theme.primary,
                  };
                  if (/^(CAS|CASH)$/i.test(m)) {
                    info = { label: "CASH", icon: "cash-outline", color: "#10B981" };
                  } else if (m === 'YEAHPAY_CARD') {
                    info = { label: "YEAHPAY (CARD)", icon: "card-outline", color: "#0284C7" };
                  } else if (/CARD/i.test(m)) {
                    info = { label: "CARD PAYMENT", icon: "card-outline", color: "#3B82F6" };
                  } else if (/^(UPI|GPAY|PHONEPE|PAYTM|BHIM)$/i.test(m)) {
                    info = { label: "UPI", icon: "qr-code-outline", color: "#8B5CF6" };
                  } else if (isYeahPayPayNowMode) {
                    info = { label: "YEAHPAY (PAYNOW)", icon: "phone-portrait-outline", color: "#06B6D4" };
                  } else if (/^(PAYNOW|PAY-NOW)$/i.test(m)) {
                    info = { label: "PAYNOW", icon: "qr-code-outline", color: "#EC4899" };
                  } else if (/^(NET|NETS)$/i.test(m)) {
                    info = { label: "NETS", icon: "wallet-outline", color: "#F59E0B" };
                  } else if (isMemberPayMode) {
                    info = {
                      label: m === 'CREDIT' ? 'CREDIT PAYMENT' : 'MEMBER CREDIT',
                      icon: "person-circle-outline",
                      color: "#7C3AED",
                      subLabel: displayState.memberName || '',
                    };
                  }

                  return (
                    <View style={styles.paymodeSelectedCard}>
                      <View style={[styles.paymodeIconContainer, { backgroundColor: info.color + "12" }]}>
                        <Ionicons name={info.icon as any} size={50} color={info.color} />
                      </View>
                      <Text style={styles.paymodeTitle}>Selected Payment Mode</Text>
                      <Text style={[styles.paymodeLabel, { color: info.color }]}>{info.label}</Text>

                      {/* Member name displayed prominently below mode label */}
                      {info.subLabel ? (
                        <View style={styles.memberNameBadge}>
                          <Ionicons name="person" size={14} color={info.color} />
                          <Text style={[styles.memberNameText, { color: info.color }]}>
                            {info.subLabel}
                          </Text>
                        </View>
                      ) : null}

                      <View style={styles.paymodeAmountBox}>
                        <Text style={styles.paymodeAmountLabel}>Amount Due</Text>
                        <Text style={styles.paymodeAmountValue}>
                          {companySettings.currencySymbol || "$"}
                          {(displayState.netTotal || 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  );
                })()
              ) : (
                <View style={styles.logoCard}>
                  {companySettings.companyLogo ? (
                    <View style={styles.logoCircle}>
                      <Image
                        source={{
                          uri: getLogoUri(companySettings.companyLogo),
                        }}
                        style={styles.largeRestaurantLogo}
                        resizeMode="contain"
                      />
                    </View>
                  ) : (
                    <View style={styles.logoCircleFallback}>
                      <Ionicons name="restaurant" size={80} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.logoShopName}>
                    {companySettings.name || paymentSettings.shopName || ""}
                  </Text>
                </View>

              )}
            </View>

            {/* Mandatory Unipro Branding Footer (Always present on left column) */}
            <View style={styles.uniproFooterContainer}>
              <Image
                source={require('./assets/images/unipro_logo.png')}
                style={styles.uniproLogoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Right Pane: Cart & Totals Summary */}
          <View style={styles.rightPane}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.cellDesc]}>
                Description
              </Text>
              <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qty</Text>
              <Text
                style={[styles.tableHeaderCell, styles.tableHeaderCellTotal]}
              >
                Total
              </Text>
            </View>

            {/* Itemized List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.receiptItemsScroll}
            >
              {displayState.items.map((item, idx) => {
                const allItemsHaveSC = displayState.items.every(i => (Number(i.isServiceCharge) === 1 || i.isServiceCharge === true));
                return (
                  <View
                    key={`${item.lineItemId}-${idx}`}
                    style={[
                      styles.receiptItemRow,
                      item.isVoided && styles.voidedRow,
                    ]}
                  >
                    <View style={styles.cellDesc}>
                      <Text
                        style={[
                          styles.receiptItemName,
                          item.isVoided && styles.voidedText,
                        ]}
                      >
                        {item.name}
                        {(Number(item.isServiceCharge) === 1 || item.isServiceCharge === true) && " *"}
                        {item.isVoided && " (VOIDED)"}
                      </Text>
                      {(Number(item.isServiceCharge) === 1 || item.isServiceCharge === true) && !item.isVoided ? (
                        <Text style={[styles.receiptItemModifier, { color: Theme.danger, fontSize: 11 }]}>
                          * Subject to Service Charge
                        </Text>
                      ) : null}
                      {item.discountAmount > 0 && !item.isVoided ? (
                        <Text style={styles.receiptItemDiscount}>
                          ðŸ ·ï¸  Discount: -{companySettings.currencySymbol || "$"}
                          {item.discountAmount.toFixed(2)}
                          {item.discountPercent > 0
                            ? ` (${item.discountPercent}%)`
                            : ""}
                        </Text>
                      ) : null}
                      {item.note ? (
                        <Text style={styles.receiptItemNote}>ðŸ“  {item.note}</Text>
                      ) : null}
                      {item.modifiers &&
                        item.modifiers.map((m: any, mIdx: number) => {
                          const price = Number(m.Price || m.price || m.Amount || m.amount || 0);
                          const symbol = companySettings.currencySymbol || "$";
                          return (
                            <Text key={mIdx} style={styles.receiptItemModifier}>
                              + {m.ModifierName}
                              {price > 0 ? ` (+${symbol}${price.toFixed(2)})` : ""}
                            </Text>
                          );
                        })}
                    </View>
                    <Text
                      style={[
                        styles.receiptItemQty,
                        styles.cellQty,
                        item.isVoided && styles.voidedText,
                      ]}
                    >
                      {(item.qty || 0).toFixed(2)}
                    </Text>
                    <View style={styles.cellTotal}>
                      {item.discountAmount > 0 && !item.isVoided ? (
                        <Text style={styles.receiptItemOriginalPrice}>
                          {companySettings.currencySymbol || "$"}
                          {(item.originalPrice || 0).toFixed(2)}
                        </Text>
                      ) : null}
                      <Text
                        style={[
                          styles.receiptItemTotal,
                          item.isVoided && styles.voidedText,
                        ]}
                      >
                        {companySettings.currencySymbol || "$"}
                        {(item.finalPrice || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Summary details */}
            <View style={styles.receiptSummaryContainer}>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Sub Total</Text>
                  <Text style={styles.breakdownValue}>
                    {companySettings.currencySymbol || "$"}
                    {(displayState.subTotal || 0).toFixed(2)}
                  </Text>
                </View>

                {(displayState.itemDiscounts || 0) +
                  (displayState.orderDiscountAmount || 0) >
                0 ? (
                  <View style={styles.breakdownItem}>
                    <Text
                      style={[styles.breakdownLabel, { color: Theme.danger }]}
                    >
                      Discount
                    </Text>
                    <Text
                      style={[styles.breakdownValue, { color: Theme.danger }]}
                    >
                      {companySettings.currencySymbol || "$"}
                      {(
                        (displayState.itemDiscounts || 0) +
                        (displayState.orderDiscountAmount || 0)
                      ).toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                {displayState.gstAmount > 0 ? (
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>GST</Text>
                    <Text style={styles.breakdownValue}>
                      {companySettings.currencySymbol || "$"}
                      {(displayState.gstAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                {displayState.serviceChargeAmount && displayState.serviceChargeAmount > 0 ? (
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>
                      {displayState.items.every(i => (Number(i.isServiceCharge) === 1 || i.isServiceCharge === true)) ? "Service Charge" : "Item Service Charge"} ({displayState.serviceChargePercentage || 0}%)
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {companySettings.currencySymbol || "$"}
                      {displayState.serviceChargeAmount.toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                {displayState.roundOff !== 0 ? (
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>RoundOff</Text>
                    <Text style={styles.breakdownValue}>
                      {displayState.roundOff > 0 ? "+" : ""}
                      {companySettings.currencySymbol || "$"}
                      {(displayState.roundOff || 0).toFixed(2)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Net Total High-Contrast Box */}
              <View style={styles.netTotalHighlightBox}>
                <Text style={styles.netTotalLabel}>Net Total</Text>
                <Text style={styles.netTotalValue}>
                  {companySettings.currencySymbol || "$"}
                  {(displayState.netTotal || 0).toFixed(2)}
                </Text>
              </View>
            </View>

            {displayState.waiterName ? (
              <View style={styles.waiterFooter}>
                <Ionicons
                  name="person-circle-outline"
                  size={16}
                  color={Theme.textSecondary}
                />
                <Text style={styles.waiterText}>
                  Served by: {displayState.waiterName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // Idle attract loop view
  return (
    <View style={styles.idleContainer}>
      {renderTerminalModal()}
      {renderBackButton()}
      {/* Change Terminal pill */}
      {terminalCode ? (
        <TouchableOpacity
          style={styles.terminalPill}
          onPress={() => {
            setSelectedTerminalCode(terminalCode);
            setShowTerminalModal(true);
          }}
        >
          <Ionicons name="tv-outline" size={12} color={Theme.primary} />
          <Text style={styles.terminalPillText}>{terminalName || terminalCode}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.terminalPill, { borderColor: "#ef444440" }]}
          onPress={() => setShowTerminalModal(true)}
        >
          <Ionicons name="tv-outline" size={12} color="#ef4444" />
          <Text style={[styles.terminalPillText, { color: "#ef4444" }]}>Set Terminal</Text>
        </TouchableOpacity>
      )}
      {/* Floating popping food animations */}
      {floatingFoods.map((item) => (
        <Animated.View
          key={item.id}
          style={[
            styles.floatingFood,
            {
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: [
                { scale: item.scale },
                { translateY: item.translateY },
              ],
              opacity: item.opacity,
            },
          ]}
        >
          <Ionicons name={item.icon} size={48} color={Theme.primary + "30"} />
        </Animated.View>
      ))}

      <View style={styles.idleMainContent}>
        {/* Main Branding Card */}
        <View style={styles.brandingCard}>
          {companySettings.companyLogo ? (
            <Image
              source={{ uri: getLogoUri(companySettings.companyLogo) }}
              style={styles.logoImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.fallbackLogoContainer}>
              <Ionicons name="restaurant" size={60} color="#fff" />
            </View>
          )}

          <Text style={styles.welcomeTitle}>
            {companySettings.name || "Welcome to our Restaurant!"}
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Order details will appear here during checkout.
          </Text>

          <View style={styles.halalContainer}>
            {companySettings.showHalalLogo && companySettings.halalLogo ? (
              <Image
                source={{ uri: getLogoUri(companySettings.halalLogo) }}
                style={styles.halalImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </View>

      {/* Unipro Footer on Idle Screen */}
      <View style={styles.idleUniproFooter}>
        <Image
          source={require("./assets/images/unipro_logo.png")}
          style={styles.uniproLogoImage}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  idleContainer: {
    flex: 1,
    backgroundColor: Theme.bgMain,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 32,
    position: "relative",
    overflow: "hidden",
  },
  idleMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  floatingFood: {
    position: "absolute",
    zIndex: 1,
  },
  brandingCard: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 30,
    alignItems: "center",
    maxWidth: 550,
    width: "90%",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: Theme.border,
  },
  logoImage: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  fallbackLogoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  welcomeSubtitle: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  halalContainer: {
    marginTop: 20,
    height: 50,
  },
  halalImage: {
    width: 80,
    height: 50,
  },

  // Checkout layout
  checkoutContainer: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  topHeaderBanner: {
    backgroundColor: "#FEF9E7",
    paddingVertical: 10,
    paddingLeft: 110,
    paddingRight: 24,
    borderBottomWidth: 1.5,
    borderBottomColor: "#F5CBA7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topHeaderText: {
    fontSize: 24,
    fontFamily: Fonts.black,
    color: "#4A2711",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  headerInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerSectionText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#7E5109",
    textTransform: "uppercase",
    backgroundColor: "#FFF9E6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F5CBA7",
  },
  headerTableBadge: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  headerTableText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: "#fff",
    textTransform: "uppercase",
  },
  checkoutLayout: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  checkoutLayoutLandscape: {
    flexDirection: "row",
  },

  // Left column
  leftPane: {
    flex: 0.85,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: Theme.border,
    justifyContent: "space-between",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  leftMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  logoCircleFallback: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  largeRestaurantLogo: {
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  logoShopName: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: "#374151",
    marginTop: 20,
    textAlign: "center",
  },

  // QR Code views
  qrCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  qrTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: "#1F2937",
    marginBottom: 16,
  },
  qrImageContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  webQrImage: {
    width: 220,
    height: 220,
  },
  payNowQrImage: {
    width: 220,
    height: 220,
  },
  qrSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#4B5563",
    marginTop: 16,
    textAlign: "center",
  },

  // Unipro Footers
  uniproFooterContainer: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  uniproLogoImage: {
    width: 280,
    height: 80,
  },
  idleUniproFooter: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },

  // Right column
  rightPane: {
    flex: 1.4,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Theme.border,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: "#E5E7EB",
  },
  tableHeaderCell: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: "#4B5563",
  },
  cellDesc: {
    flex: 1.6,
  },
  cellQty: {
    width: 70,
    textAlign: "center",
  },
  cellTotal: {
    width: 100,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tableHeaderCellTotal: {
    width: 100,
    textAlign: "right",
  },
  receiptItemOriginalPrice: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  receiptItemDiscount: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.danger || "#EF4444",
    marginTop: 2,
  },

  receiptItemsScroll: {
    flex: 1,
  },
  receiptItemRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    alignItems: "center",
  },
  voidedRow: {
    backgroundColor: "#FEF2F2",
    opacity: 0.6,
  },
  receiptItemName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#1F2937",
  },
  voidedText: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
  },
  receiptItemNote: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  receiptItemModifier: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    marginTop: 2,
    paddingLeft: 6,
  },
  receiptItemQty: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#374151",
  },
  receiptItemTotal: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: "#1F2937",
  },

  receiptSummaryContainer: {
    borderTopWidth: 1.5,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    padding: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 12,
  },
  breakdownItem: {
    alignItems: "center",
    flex: 1,
    minWidth: 70,
  },
  breakdownLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#6B7280",
    marginBottom: 2,
  },
  breakdownValue: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#374151",
  },

  netTotalHighlightBox: {
    backgroundColor: "#16A34A",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  netTotalLabel: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  netTotalValue: {
    fontSize: 32,
    fontFamily: Fonts.black,
    color: "#fff",
  },

  waiterFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 6,
  },
  waiterText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },

  // Success Container
  successContainer: {
    flex: 1,
    backgroundColor: Theme.bgMain,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    position: "relative",
  },
  successMainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  successCard: {
    backgroundColor: "#fff",
    borderRadius: 32,
    padding: 24,
    width: "90%",
    maxWidth: 450,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.border,
  },
  successIconWrapper: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 26,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  successOrderText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.success,
    marginTop: 5,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: Theme.border,
    borderStyle: "dashed",
    width: "100%",
    marginVertical: 20,
  },
  successDetails: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  detailValue: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  successFooter: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginTop: 10,
    textAlign: "center",
  },
  floatingBackBtn: {
    position: "absolute",
    top: 10,
    left: 20,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  terminalPill: {
    position: "absolute",
    bottom: 16,
    left: 16,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: Theme.primary + "30",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  terminalPillText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.primary,
  },
  // â”€â”€â”€ Terminal setup modal â”€â”€â”€
  terminalModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  terminalModalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    width: 380,
    maxWidth: "90%",
    maxHeight: "80%",
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  terminalModalHeader: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  terminalModalTitle: {
    fontSize: 22,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
    marginTop: 8,
  },
  terminalModalSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  terminalList: {
    maxHeight: 280,
  },
  terminalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.border,
    marginBottom: 10,
    backgroundColor: "#fafafa",
  },
  terminalItemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary + "08",
  },
  terminalItemCode: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  terminalItemName: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  terminalModalEmpty: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  terminalModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  terminalModalBtnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  terminalModalBtnCancelText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  terminalModalBtnConfirm: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Theme.primary,
  },
  terminalModalBtnConfirmText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: "#fff",
  },
  paymodeSelectedCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    width: "95%",
    maxWidth: 440,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  paymodeIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  paymodeTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  paymodeLabel: {
    fontSize: 24,
    fontFamily: Fonts.black,
    textAlign: "center",
    marginBottom: 16,
  },
  paymodeAmountBox: {
    width: "100%",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  paymodeAmountLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  paymodeAmountValue: {
    fontSize: 32,
    fontFamily: Fonts.black,
    color: "#111827",
  },
  memberNameBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  memberNameText: {
    fontSize: 14,
    fontFamily: Fonts.black,
  },
  splitCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    width: "95%",
    maxWidth: 440,
    maxHeight: 460,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  splitHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 12,
  },
  splitTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  splitScroll: {
    flexGrow: 0,
    maxHeight: 250,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  splitRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  splitIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  splitPaymodeText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  splitAmountText: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginRight: 12,
  },
  splitStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
  },
  splitStatusText: {
    fontSize: 11,
    fontFamily: Fonts.black,
  },
  splitFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 16,
  },
  splitFooterLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  splitFooterValue: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
});

