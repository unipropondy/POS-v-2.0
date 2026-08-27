import CalendarPicker from "@/components/CalendarPicker";
import { socket } from "@/constants/socket";
import { Skeleton } from "@/components/ui/Skeleton";
import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
  Animated,
  Easing,
  ImageBackground,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useToast } from "../../components/Toast";
import WindowControls from "../../components/WindowControls";
import {
  formatToSingaporeTime,
  getSingaporeDateString,
  parseDatabaseDate,
} from "../../utils/timezoneHelper";

import AvatarPickerModal from "@/components/AvatarPickerModal";
import StoreSettingsModal from "@/components/payment/StoreSettingsModal";
import { getAvatarSource } from "@/constants/avatars";
import { useActiveOrdersStore } from "@/stores/activeOrdersStore";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchCartFromDBGlobal,
  getContextId,
  setCartItemsGlobal,
  setCurrentContext,
  useCartStore,
} from "@/stores/cartStore";
import { useGeneralSettingsStore } from "@/stores/generalSettingsStore";
import { getHeldOrders } from "@/stores/heldOrdersStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { clearOrderContext, OrderContext, setOrderContext } from "@/stores/orderContextStore";
import { usePaymentSettingsStore } from "@/stores/paymentSettingsStore";
import { Image } from "expo-image";
import {
  TableStatusType,
  useTableStatusStore,
} from "../../stores/tableStatusStore";
import { useTerminalPaymentStore } from "../../stores/terminalPaymentStore";

// --- MOBILE SOLID COLORS ---
const SOLID_LIGHT_GREEN = "#F0FDF4";

let lastTablesFetchTime = 0;
const SOLID_LIGHT_RED = "#FEF2F2";
const SOLID_LIGHT_BLUE = "#F0F9FF";
const SOLID_LIGHT_AMBER = "#FFFBEB";
const SOLID_LIGHT_VIOLET = "#F5F3FF";

const woodFloorTexture = require("../../assets/images/wood_floor_texture.jpg");

// --- CANVAS BACKGROUND COMPONENT ---
const CanvasBackground = ({ theme, children, style, isCategory = true }: { theme: string; children: React.ReactNode; style: any; isCategory?: boolean }) => {
  if (theme === "dark") {
    return (
      <LinearGradient colors={["#1E293B", "#0F172A"]} style={[{ backgroundColor: "#0F172A" }, style]}>
        {children}
      </LinearGradient>
    );
  }
  if (theme === "grey") {
    return (
      <LinearGradient colors={["#F1F5F9", "#E2E8F0"]} style={[{ backgroundColor: "#E2E8F0" }, style]}>
        {children}
      </LinearGradient>
    );
  }
  if (theme === "beige") {
    return (
      <LinearGradient colors={["#FAF7F2", "#EFEAE0"]} style={[{ backgroundColor: "#EFEAE0" }, style]}>
        {children}
      </LinearGradient>
    );
  }
  if (theme === "light") {
    return (
      <LinearGradient colors={["#FFFFFF", "#F8FAFC"]} style={[{ backgroundColor: "#FFFFFF" }, style]}>
        {children}
      </LinearGradient>
    );
  }
  if (theme === "emerald") {
    return (
      <LinearGradient colors={["#064E3B", "#022C22"]} style={[{ backgroundColor: "#022C22" }, style]}>
        {children}
      </LinearGradient>
    );
  }
  return (
    <ImageBackground
      source={woodFloorTexture}
      style={style}
      resizeMode="cover"
    >
      {children}
    </ImageBackground>
  );
};

const formatSectionGlobal = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  // Convert SECTION_1 -> Section 1 or "Section-1" -> Section 1
  return sec.replace("_", " ").replace("-", " ").replace("SECTION", "Section");
};

const getStatusUI = (status: number, diningSection?: number) => {
  const s = Number(status);
  switch (s) {
    case 1:
      if (diningSection === 4) {
        return { text: "PREPARING", color: "#22c55e", lightBg: "#F0FDF4" };
      }
      return { text: "DINING", color: "#22c55e", lightBg: "#F0FDF4" };
    case 2:
      return { text: "CHECKOUT", color: "#fd7e14", lightBg: "#FFF7ED" };
    case 3:
      return { text: "HOLD", color: "#3b82f6", lightBg: "#F0F9FF" };
    case 4:
      return { text: "OVERTIME", color: "#8b5cf6", lightBg: "#F5F3FF" };
    case 5:
      return { text: "RESERVED", color: "#ef4444", lightBg: "#FEF2F2" };
    case 0:
    default:
      return { text: "AVAILABLE", color: "#C2A580", lightBg: "#FAF6F0" }; // Tan/Beige
  }
};

// --- ROTATING SYNC ICON COMPONENT ---
const RotatingSyncIcon = ({ size = 16, color = "#3b82f6" }: { size?: number; color?: string }) => {
  const spinValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="sync" size={size} color={color} />
    </Animated.View>
  );
};

// --- MEMOIZED TABLE COMPONENT ---
const TableItemComponent = React.memo(
  ({
    tableId,
    item,
    itemSize,
    activeTab,
    onPress,
    numberFont,
    smallFont,
    isTabletPortrait,
    isAbsoluteLayout,
    layoutScale = 1,
    backgroundTheme = "wood",
  }: {
    tableId: string;
    item: TableItem;
    itemSize: number;
    activeTab: string;
    onPress: (item: TableItem, tableData: any, isCheckout?: boolean) => void;
    numberFont: number;
    smallFont: number;
    isTabletPortrait?: boolean;
    isAbsoluteLayout?: boolean;
    layoutScale?: number;
    backgroundTheme?: string;
  }) => {
    // 🚀 O(1) Store Subscription: Only re-renders when THIS table changes
    const tableData = useTableStatusStore((state) => state.tableMap[tableId]);

    // Subscribe to terminal payment session — re-renders only when this table's session changes
    const terminalStatus = useTerminalPaymentStore(
      (state) => state.sessions[tableId]?.status
    );

    // 🚀 SYNC-FIRST: Prioritize real-time data from the global store
    const status = tableData
      ? tableData.status === "SENT"
        ? 1
        : tableData.status === "BILL_REQUESTED"
          ? 2
          : tableData.status === "HOLD"
            ? 3
            : tableData.status === "LOCKED"
              ? 5
              : 0
      : Number(item.Status);

    const billAmount =
      tableData?.totalAmount !== undefined
        ? tableData.totalAmount
        : Number(item.totalAmount) || 0;
    const rawStartTime =
      tableData?.startTime ||
      (item.StartTime
        ? typeof item.StartTime === "string"
          ? parseDatabaseDate(item.StartTime).getTime()
          : item.StartTime
        : 0);
    const isOvertime =
      status !== 0 &&
      (tableData?.isHoldOvertime ||
        Number(item.isOvertime) === 1 ||
        Number(item.isHoldOvertime) === 1);

    let ui = getStatusUI(status, item.DiningSection);

    // Dynamic Overtime: If occupied (Dining/Hold) and flagged as overtime, override UI
    if ((status === 1 || status === 3) && isOvertime) {
      ui = getStatusUI(4, item.DiningSection);
    }

    // 🌹 QR PAID: entryStatus='q' + paymentStatus=1 → Rose card + "Paid" label
    const rawEntryStatus =
      tableData?.entryStatus !== undefined
        ? tableData.entryStatus
        : item.entryStatus;
    const rawPaymentStatus =
      (tableData as any)?.paymentStatus !== undefined
        ? (tableData as any).paymentStatus
        : item.paymentStatus;
    const isPaid = rawEntryStatus === "q" && Number(rawPaymentStatus) === 1;

    if (isPaid) {
      ui = { text: "PAID", color: "#f43f5e", lightBg: "#fff1f2" };
    }

    let borderColor = status === 0 ? Theme.border : ui.color;
    let borderWidth = status !== 0 ? 2 : 1.5;

    if (terminalStatus === "processing") {
      borderColor = "#3b82f6";
      borderWidth = 3;
    } else if (terminalStatus === "failed" || terminalStatus === "cancelled") {
      borderColor = "#ef4444";
      borderWidth = 3;
    }




    let timeText = "";
    if (rawStartTime && status !== 0 && status !== 5) {
      timeText = formatToSingaporeTime(rawStartTime, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    // Shape logic
    const tableType = item.TableType ? String(item.TableType).trim().toLowerCase() : "rectangular";
    const seatsCount = item.Seats !== undefined && item.Seats !== null ? Number(item.Seats) : 4;
    const xSize = item.XSize !== undefined && item.XSize !== null && Number(item.XSize) > 0 ? Number(item.XSize) : 100;
    const ySize = item.YSize !== undefined && item.YSize !== null && Number(item.YSize) > 0 ? Number(item.YSize) : 80;

    // Outer table size calculations (leaving space for chairs)
    let tableW = 0;
    let tableH = 0;

    if (isAbsoluteLayout) {
      tableW = (xSize * 0.6) * layoutScale;
      tableH = (ySize * 0.6) * layoutScale;
    } else {
      // Standard grid view layout - scale to fit nicely in grid cell itemSize
      if (tableType === "round" || tableType === "square") {
        const size = itemSize * 0.52;
        tableW = size;
        tableH = size;
      } else {
        tableW = itemSize * 0.62;
        tableH = itemSize * 0.44;
      }
    }

    let borderRadius = 8; // rectangular default
    if (tableType === "square") {
      const size = Math.max(tableW, tableH);
      tableW = size;
      tableH = size;
      borderRadius = 8;
    } else if (tableType === "round") {
      const size = Math.max(tableW, tableH);
      tableW = size;
      tableH = size;
      borderRadius = size / 2;
    } else if (tableType === "oval") {
      borderRadius = Math.min(tableW, tableH) / 2;
    }

    // Centering coordinates
    const tx = isAbsoluteLayout ? 0 : (itemSize - tableW) / 2;
    const ty = isAbsoluteLayout ? 0 : (itemSize - tableH) / 2;
    const cx = isAbsoluteLayout ? tableW / 2 : itemSize / 2;
    const cy = isAbsoluteLayout ? tableH / 2 : itemSize / 2;

    // Chair dimensions
    let chairSize = isAbsoluteLayout ? Math.max(10, 90 * 0.12 * layoutScale) : Math.max(8, itemSize * 0.1);
    if (seatsCount > 10) {
      chairSize = Math.max(5, chairSize * (10 / seatsCount) * 1.5);
    }
    const chairW = chairSize * 1.35;
    const chairH = chairSize * 0.95;
    const offset = 3.5; // Gap between table and chairs

    // Colors matching the reference image
    // Solid white table bodies
    const gradientColors: [string, string] = ["#FFFFFF", "#FFFFFF"];
    const bgColor = "#FFFFFF";

    let activeColor = "#D2C8BC"; // Available/Empty light grey border
    let activeBg = "#FFFFFF";

    if (status !== 0) {
      const effectiveStatus = ((status === 1 || status === 3) && isOvertime) ? 4 : status;
      switch (effectiveStatus) {
        case 1: // Dining (Green)
          activeColor = "#2E7D32";
          break;
        case 2: // Checkout (Yellow/Orange)
          activeColor = "#F57C00";
          break;
        case 3: // Hold (Blue)
          activeColor = "#1565C0";
          break;
        case 4: // Overtime (Purple)
          activeColor = "#8E24AA";
          break;
        case 5: // Reserved (Red/Pink)
          activeColor = "#D81B60";
          break;
      }
    }

    const tableBorderColor = activeColor;
    const labelColor = "#1E293B"; // High contrast dark charcoal table numbers
    const textColor = activeColor; // Text color matching status

    // Chair placement
    const chairPositions: { x: number; y: number; rotate?: string; backrestStyle?: any }[] = [];
    if (seatsCount > 0) {
      if (tableType === "round" || tableType === "oval") {
        const rx = tableW / 2;
        const ry = tableH / 2;
        const radiusOffset = chairH / 2 + offset;
        for (let i = 0; i < seatsCount; i++) {
          const angle = (i * 2 * Math.PI) / seatsCount - Math.PI / 2;
          const x = cx + (rx + radiusOffset) * Math.cos(angle) - chairW / 2;
          const y = cy + (ry + radiusOffset) * Math.sin(angle) - chairH / 2;
          const rotationAngle = angle + Math.PI / 2;
          chairPositions.push({
            x,
            y,
            rotate: `${rotationAngle}rad`,
            backrestStyle: { top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 }
          });
        }
      } else {
        // Rectangular / Square layout (Top & Bottom only, matching reference image)
        const topCount = Math.ceil(seatsCount / 2);
        const bottomCount = Math.floor(seatsCount / 2);

        // Top chairs (backrest at top)
        for (let i = 0; i < topCount; i++) {
          const x = cx - tableW / 2 + (i + 0.5) * (tableW / topCount) - chairW / 2;
          const y = cy - tableH / 2 - chairH - offset;
          chairPositions.push({
            x,
            y,
            backrestStyle: { top: 0, left: 0, right: 0, height: 2.5, borderTopLeftRadius: 2, borderTopRightRadius: 2 }
          });
        }

        // Bottom chairs (backrest at bottom)
        for (let i = 0; i < bottomCount; i++) {
          const x = cx - tableW / 2 + (i + 0.5) * (tableW / bottomCount) - chairW / 2;
          const y = cy + tableH / 2 + offset;
          chairPositions.push({
            x,
            y,
            backrestStyle: { bottom: 0, left: 0, right: 0, height: 2.5, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }
          });
        }
      }
    }

    return (
      <TouchableOpacity
        activeOpacity={isPaid ? 1 : 0.8}
        disabled={isPaid}
        style={isAbsoluteLayout ? {
          width: tableW,
          height: tableH,
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
          borderColor: "transparent",
          borderWidth: 0,
          opacity: isPaid ? 0.92 : 1,
        } : {
          width: itemSize,
          height: itemSize,
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
          borderColor: "transparent",
          borderWidth: 0,
          opacity: isPaid ? 0.92 : 1,
        }}
        onPress={() => onPress(item, tableData)}
      >
        {/* Render Chairs */}
        {chairPositions.map((pos, idx) => {
          const transform = pos.rotate ? [{ rotate: pos.rotate }] : undefined;
          return (
            <View
              key={`chair-${idx}`}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: chairW,
                height: chairH,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: "#8C6239", // wood Outline
                backgroundColor: "#DFD0BC", // warm wood seat
                transform,
                overflow: "hidden",
              }}
            >
              {pos.backrestStyle && (
                <View style={[{
                  position: "absolute",
                  backgroundColor: "#8C6239",
                }, pos.backrestStyle]} />
              )}
            </View>
          );
        })}

        {/* Clock/Timer Overlay Badge */}
        {status > 0 && (
          <View style={{
            position: "absolute",
            top: ty - 6,
            left: tx + tableW / 2 - 7,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: "#FFFFFF",
            borderWidth: 1.2,
            borderColor: activeColor,
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.15,
            shadowRadius: 1.5,
            elevation: 3,
            zIndex: 99,
          }}>
            <Ionicons name="time" size={9} color={activeColor} />
          </View>
        )}

        {/* Render Table Body */}
        <View
          style={{
            position: "absolute",
            left: tx,
            top: ty,
            width: tableW,
            height: tableH,
            borderRadius,
            borderColor: tableBorderColor,
            borderWidth: 2.2,
            backgroundColor: "#FFFFFF",
            overflow: "hidden",
            justifyContent: "center",
            alignItems: "center",
            ...Platform.select({
              ios: { shadowColor: tableBorderColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 3 },
              android: { elevation: 2 },
              web: { boxShadow: `0 3px 6px ${tableBorderColor}24` } as any,
            }),
          }}
        >
          {/* Inner table margin line for craftsmanship style */}
          <View style={{
            flex: 1,
            width: "100%",
            height: "100%",
            borderRadius: Math.max(0, borderRadius - 2),
            borderWidth: 1,
            borderColor: status === 0 ? "rgba(210, 200, 188, 0.3)" : "rgba(255, 255, 255, 0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}>
            <Text
              style={[
                styles.tableNumber,
                { 
                  fontSize: Math.max(12, numberFont * (tableW / itemSize) * 0.9), 
                  color: labelColor, 
                  marginTop: 0, 
                  marginBottom: 0,
                  fontFamily: Fonts.black,
                  fontWeight: "900"
                },
              ]}
            >
              {item.label}
            </Text>

            {/* Status Badge Pill */}
            {status !== 0 && (
              <View style={{
                backgroundColor: activeColor, // Solid status color background
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 10,
                marginTop: 2,
                marginBottom: 1,
                maxWidth: tableW - 8,
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Text style={{
                  color: "#FFFFFF", // White text
                  fontFamily: Fonts.bold,
                  fontSize: Math.max(7, smallFont * (tableW / itemSize) * 0.8),
                  fontWeight: "bold",
                }} numberOfLines={1}>
                  {ui.text}
                </Text>
              </View>
            )}

            {/* Pax / Capacity label */}
            <Text style={{
              fontFamily: Fonts.medium,
              fontSize: Math.max(8, (smallFont - 1) * (tableW / itemSize) * 0.95),
              color: "#64748B", // Slate grey
              marginTop: 1,
            }}>
              {seatsCount} Pax
            </Text>

            {/* Time & Bill amount */}
            {status !== 0 && status !== 5 && (
              <View style={{ alignItems: "center", marginTop: 1 }}>
                {timeText ? (
                  <Text style={{
                    fontSize: Math.max(7, (smallFont - 1) * (tableW / itemSize) * 0.8),
                    color: textColor,
                    fontFamily: Fonts.medium,
                  }}>
                    <Ionicons name="time-outline" size={Math.max(7, (smallFont - 1) * (tableW / itemSize) * 0.8)} color={textColor} /> {timeText}
                  </Text>
                ) : null}
                {billAmount > 0 && (
                  <Text style={{
                    fontSize: Math.max(8, (smallFont + 1) * (tableW / itemSize) * 0.9),
                    color: textColor,
                    fontFamily: Fonts.black,
                    fontWeight: "900",
                    marginTop: 1,
                  }}>
                    ${billAmount.toFixed(2)}
                  </Text>
                )}
              </View>
            )}

            {status === 5 && (
              <View style={[styles.lockedOverlay, { marginTop: 1, gap: 1 }]}>
                <Ionicons
                  name="lock-closed"
                  size={Math.max(10, tableW * 0.15)}
                  color={ui.color}
                />
                {tableData?.lockedByName ? (
                  <View
                    style={{
                      backgroundColor: ui.color,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 3,
                      maxWidth: tableW - 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: Math.max(7, (smallFont - 2) * (tableW / itemSize)),
                        color: "#FFF",
                        fontWeight: "bold",
                      }}
                      numberOfLines={1}
                    >
                      {tableData.lockedByName}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>

        {/* 🚀 HOLD OVERTIME INDICATOR (H) */}
        {status === 3 && !!tableData?.isHoldOvertime && (
          <View style={styles.holdOvertimeBadge}>
            <MaterialCommunityIcons
              name="alpha-h-circle"
              size={Math.max(14, itemSize * 0.18)}
              color={Theme.primary}
            />
          </View>
        )}

        {/* 🚀 QR ORDER INDICATOR (QR badge) */}
        {(tableData?.entryStatus !== undefined
          ? tableData.entryStatus
          : item.entryStatus) === "q" &&
          status !== 0 && (
            <View style={styles.qrBadge}>
              <Ionicons
                name="qr-code"
                size={Math.max(14, itemSize * 0.18)}
                color={ui.color}
              />
            </View>
          )}
        {/* 🟢 LIVE TERMINAL INDICATOR: top-left spinner for processing, circular red error badge when cancelled/failed */}
        {terminalStatus && terminalStatus !== "idle" && (
          <TouchableOpacity
            style={[
              styles.terminalProcessingBadge,
              (terminalStatus === "cancelled" || terminalStatus === "failed") &&
                styles.terminalErrorBadge,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              useTerminalPaymentStore.getState().clearSession(tableId);
            }}
          >
            {terminalStatus === "processing" ? (
              <RotatingSyncIcon size={20} color="#3b82f6" />
            ) : (
              <Ionicons name="alert" size={16} color="#ffffff" />
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  },
);


const TableGridSkeleton = ({
  itemSize,
  columns,
  gap,
  padding,
  insets,
}: any) => {
  const items = Array.from({ length: columns * 5 });
  return (
    <View
      style={{
        paddingHorizontal: padding,
        paddingTop: padding,
        paddingLeft: padding + insets.left,
        paddingRight: padding + insets.right,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: gap,
      }}
    >
      {items.map((_, i) => (
        <Skeleton
          key={i}
          width={itemSize}
          height={itemSize}
          borderRadius={12}
        />
      ))}
    </View>
  );
};

type TableItem = {
  id: string;
  label: string;
  DiningSection: number;
  Status: number;
  StartTime?: string | number | Date;
  totalAmount?: number;
  currentOrderId?: string;
  lockedByName?: string;
  isOvertime?: number;
  isHoldOvertime?: number;
  entryStatus?: string;
  paymentStatus?: number;
  customerName?: string;
  pax?: number;
  TableType?: string;
  Seats?: number;
  XSize?: number;
  YSize?: number;
  XPos?: number;
  YPos?: number;
};

const SECTIONS = ["SECTION_1", "SECTION_2", "SECTION_3", "TAKEAWAY"];

const SECTION_LABELS: Record<string, string> = {
  SECTION_1: "Section 1",
  SECTION_2: "Section 2",
  SECTION_3: "Section 3",
  TAKEAWAY: "Takeaway",
};

const SECTION_SHORT: Record<string, string> = {
  SECTION_1: "S1",
  SECTION_2: "S2",
  SECTION_3: "S3",
  TAKEAWAY: "TW",
};

const SECTION_ICONS: Record<string, string> = {
  SECTION_1: "restaurant-outline",
  SECTION_2: "restaurant-outline",
  SECTION_3: "restaurant-outline",
  TAKEAWAY: "bag-handle-outline",
};

// Track the last table that was opened with guest details.
// If the user exits the menu without sending items, we clean this guest data.
let lastGuestOpenedTable: {
  tableId: string;
  customerName: string | null;
  pax: number | null;
} | null = null;

export default function Category() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const [availableWidth, setAvailableWidth] = useState(780);

  const onContainerLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setAvailableWidth(width - 32); // 16px padding on left/right
    }
  };

  const [backgroundTheme, setBackgroundTheme] = useState("wood");

  const [activeTab, setActiveTab] = useState<string>("SECTION_1");

  const getSectionNum = (tab: string) => {
    if (tab === "TAKEAWAY") return "4";
    if (tab === "SECTION_1") return "1";
    if (tab === "SECTION_2") return "2";
    if (tab === "SECTION_3") return "3";
    return "1";
  };

  const loadBackgroundTheme = async () => {
    try {
      const sectionNum = getSectionNum(activeTab);
      const savedTheme = await AsyncStorage.getItem(`layout_background_theme_${sectionNum}`);
      if (savedTheme) {
        setBackgroundTheme(savedTheme);
      } else {
        setBackgroundTheme("wood");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadBackgroundTheme();
  }, [activeTab]);

  const { showToast } = useToast();
  const { section: urlSection } = useLocalSearchParams<{ section?: string }>();
  const isWindows = Platform.OS === "windows" || (Platform.OS === "web" && typeof navigator !== "undefined" && /win/i.test(navigator.platform || navigator.userAgent));
  const [allTables, setAllTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAvatarModalVisible, setIsAvatarModalVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isTablesExpanded, setIsTablesExpanded] = useState(false);
  const [isTableMasterExpanded, setIsTableMasterExpanded] = useState(false);
  const [isStaffExpanded, setIsStaffExpanded] = useState(false);
  const [isCustomerExpanded, setIsCustomerExpanded] = useState(false);
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isQRModalVisible, setIsQRModalVisible] = useState(false);
  const sectionScrollRef = useRef<ScrollView>(null);

  // Customer guest name + pax modal states
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [pendingGuestItem, setPendingGuestItem] = useState<TableItem | null>(
    null,
  );
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestPaxInput, setGuestPaxInput] = useState("");
  const [isSavingGuest, setIsSavingGuest] = useState(false);
  const [selectedBusinessDate, setSelectedBusinessDate] = useState<
    string | null
  >(null);
  const [showBusinessCalendar, setShowBusinessCalendar] = useState(false);
  const [isDayStarted, setIsDayStarted] = useState(false);
  const [activeBusinessDay, setActiveBusinessDay] = useState<string | null>(
    null,
  );
  const [isStartingDay, setIsStartingDay] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/company-settings/1`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && data.settings) {
          setCompanyInfo(data.settings);
        }
      })
      .catch((err) => console.log("Error fetching company settings for license:", err));
  }, []);



  // ──── Move Table modal states ────────────────────────────────────────────
  const [isMoveTableVisible, setIsMoveTableVisible] = useState(false);
  const [moveSourceTable, setMoveSourceTable] = useState<TableItem | null>(
    null,
  );
  const [moveDestTable, setMoveDestTable] = useState<TableItem | null>(null);
  const [moveStep, setMoveStep] = useState<"source" | "dest">("source");
  const [moveSearchQuery, setMoveSearchQuery] = useState("");
  const [moveActiveSection, setMoveActiveSection] = useState("SECTION_1");
  const [isMovingTable, setIsMovingTable] = useState(false);

  const checkActiveBusinessDay = async () => {
    try {
      const res = await fetch(`${API_URL}/api/settlement/active-day`);
      const data = await res.json();
      if (data.success && data.active && data.startDate) {
        setIsDayStarted(true);
        setActiveBusinessDay(data.startDate);
        setSelectedBusinessDate(data.startDate);
        await AsyncStorage.setItem("selected_business_date", data.startDate);
      } else {
        setIsDayStarted(false);
        setActiveBusinessDay(null);
        setSelectedBusinessDate(null);
      }
    } catch (err) {
      console.error("Failed to check active business day:", err);
    }
  };

  useEffect(() => {
    checkActiveBusinessDay();
  }, []);

  const handleStartDay = async () => {
    if (!selectedBusinessDate) {
      showToast({
        type: "warning",
        message: "No Date Selected",
        subtitle: "Please select a date from the calendar first.",
      });
      return;
    }

    setIsStartingDay(true);
    try {
      const res = await fetch(`${API_URL}/api/settlement/day-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: selectedBusinessDate,
          username: user?.userName || user?.username || "admin",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await AsyncStorage.setItem(
          "selected_business_date",
          selectedBusinessDate,
        );
        setIsDayStarted(true);
        setActiveBusinessDay(selectedBusinessDate);
        showToast({
          type: "success",
          message: "Day Started",
          subtitle: `Business day successfully started for ${formatDateToDMY(selectedBusinessDate)}.`,
        });
      } else {
        showToast({
          type: "error",
          message: "Day Start Failed",
          subtitle: data.error || "Could not start business day.",
        });
      }
    } catch (err) {
      console.error("Failed to start day:", err);
      showToast({
        type: "error",
        message: "Network Error",
        subtitle: "Failed to connect to the server.",
      });
    } finally {
      setIsStartingDay(false);
    }
  };

  const formatDateToDMY = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Removed global 'tables' selector for performance
  const getLockedName = useTableStatusStore((s: any) => s.getLockedName);

  const insets = useSafeAreaInsets();
  const isTablet = Math.min(width, height) >= 500;
  const isLandscape = width > height;

  const { itemSize, numberFont, smallFont, columns, GAP, PADDING } =
    useMemo(() => {
      const insetsValue = insets; // Access insets from outside closure

      const gapVal = !isTablet && isLandscape ? 8 : 10;
      const paddingVal = isTablet ? 24 : isLandscape ? 12 : 16;
      const availableGridWidth =
        width - paddingVal * 2 - insetsValue.left - insetsValue.right - 2;

      let cols = 3;
      if (isTablet) {
        if (width < 768) cols = 4;
        else if (width < 1024) cols = 6;
        else if (width < 1280) cols = 8;
        else if (width < 1920) cols = 10;
        else cols = 12;
      } else {
        if (isLandscape) {
          cols = Math.max(5, Math.floor(availableGridWidth / 115));
        } else {
          cols = 3;
        }
      }

      const size = Math.floor(
        (availableGridWidth - gapVal * (cols - 1)) / cols,
      );
      const nFont = Math.max(12, Math.min(isTablet ? 24 : 20, size * 0.32));
      const sFont = Math.max(8, Math.min(isTablet ? 14 : 11, size * 0.18));

      return {
        itemSize: size,
        numberFont: nFont,
        smallFont: sFont,
        columns: cols,
        GAP: gapVal,
        PADDING: paddingVal,
      };
    }, [width, height, insets]);

  const user = useAuthStore((s: any) => s.user);
  const { notifications, unreadCount, markAllAsRead } = useNotificationStore();
  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  const logout = useAuthStore((s: any) => s.logout);
  const canAccessSalesReport = useAuthStore((s: any) => s.canAccessSalesReport);
  const canAccessMembers = useAuthStore((s: any) => s.canAccessMembers);
  const canAccessStaffAttendance = useAuthStore(
    (s: any) => s.canAccessStaffAttendance,
  );
  const canAccessLockTables = useAuthStore((s: any) => s.canAccessLockTables);
  const canAccessKDS = useAuthStore((s: any) => s.canAccessKDS);
  const canAccessDayEnd = useAuthStore((s: any) => s.canAccessDayEnd);
  const canAccessStoreSettings = useAuthStore(
    (s: any) => s.canAccessStoreSettings,
  );
  const canAccessReceiptSettings = useAuthStore(
    (s: any) => s.canAccessReceiptSettings,
  );
  const isWaiter = useAuthStore((s: any) => s.isWaiter);
  const enableKDS = useGeneralSettingsStore((s: any) => s.settings.enableKDS);
  const enableGuestDetailsPopup = useGeneralSettingsStore((s: any) =>
    s.settings.enableGuestDetailsPopup !== undefined
      ? s.settings.enableGuestDetailsPopup
      : true,
  );

  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);
  const readyItemsCount = useMemo(() => {
    let count = 0;
    const tableGroups: Record<string, any> = {};

    activeOrders.forEach((order) => {
      const { context } = order;
      const groupKey =
        context.orderType === "DINE_IN"
          ? `TABLE_${context.section}_${context.tableNo}`
          : `TAKEAWAY_${context.takeawayNo}`;

      if (!tableGroups[groupKey]) {
        tableGroups[groupKey] = {
          items: [],
        };
      }

      order.items.forEach((i: any) => {
        if (i.status === "READY") {
          const exists = tableGroups[groupKey].items.find(
            (ei: any) => ei.lineItemId === i.lineItemId,
          );
          if (!exists) {
            tableGroups[groupKey].items.push(i);
            count++;
          }
        }
      });
    });

    return count;
  }, [activeOrders]);

  // 🔔 Real-time sync now handled globally via useGlobalSocketSync

  // ——— Route guard: redirect to login if not authenticated ———
  useFocusEffect(
    React.useCallback(() => {
      checkActiveBusinessDay();
      const { user: currentUser, loginDate, logout } = useAuthStore.getState();
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      const currentDate = new Date().toISOString().split("T")[0];
      if (loginDate && currentDate !== loginDate) {
        logout();
        router.replace("/login");
        return;
      }

      // ✅ KDS Guard: Prevent KDS role from accessing table selection
      if (currentUser.role === "KDS") {
        router.replace("/kds" as any);
        return;
      }
    }, []),
  );

  useEffect(() => {
    const loadAvatar = async () => {
      if (user?.userId) {
        try {
          const savedAvatar = await AsyncStorage.getItem(`user_avatar_${user.userId}`);
          setAvatarUrl(savedAvatar);
        } catch (e) {
          console.error("Failed to load user avatar:", e);
        }
      } else {
        setAvatarUrl(null);
      }
    };
    loadAvatar();
  }, [user?.userId]);

  const handleSelectAvatar = async (url: string | null) => {
    setAvatarUrl(url);
    if (user?.userId) {
      try {
        if (url) {
          await AsyncStorage.setItem(`user_avatar_${user.userId}`, url);
        } else {
          await AsyncStorage.removeItem(`user_avatar_${user.userId}`);
        }
      } catch (e) {
        console.error("Failed to save user avatar:", e);
      }
    }
  };

  useEffect(() => {
    // Initial load
    fetchTables();

    // Only fetch settings if not already loaded
    usePaymentSettingsStore.getState().fetchSettings();
    import("@/stores/generalSettingsStore").then((m) =>
      m.useGeneralSettingsStore.getState().fetchSettings(),
    );
    import("@/stores/companySettingsStore").then((m) =>
      m.useCompanySettingsStore.getState().fetchSettings("1"),
    );
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // If the user previously entered guest details, but exited without placing an order (status is still EMPTY/0),
      // we clear those guest details.
      if (lastGuestOpenedTable) {
        const { tableId } = lastGuestOpenedTable;
        const store = useTableStatusStore.getState();
        const tableData = store.tableMap[tableId];
        const status = tableData
          ? tableData.status === "SENT"
            ? 1
            : tableData.status === "BILL_REQUESTED"
              ? 2
              : tableData.status === "HOLD"
                ? 3
                : tableData.status === "LOCKED"
                  ? 5
                  : 0
          : 0;

        if (status === 0) {
          console.log(
            `[Category] Table ${tableId} exited without adding items. Clearing guest data...`,
          );

          // Clear guest details in the database
          fetch(`${API_URL}/api/tables/save-guest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              customerName: null,
              pax: null,
              userId: useAuthStore.getState().user?.userId,
            }),
          }).catch((err) =>
            console.warn("Failed to clear guest details on exit:", err),
          );

          // Optimistically clear in the local state store
          const targetTable = store.tables.find((t) => t.tableId === tableId);
          const section = targetTable ? targetTable.section : "SECTION_1";
          const label = targetTable ? targetTable.tableNo : "";

          store.updateTableStatus(
            tableId,
            section,
            label,
            "EMPTY",
            "EMPTY",
            undefined,
            undefined,
            0,
            false,
            false,
            undefined,
            undefined,
            null as any, // clear customerName
            null as any, // clear pax
          );
        }

        // Clear the tracker
        lastGuestOpenedTable = null;
      }

      // Re-fetch only if data is likely stale (older than 30s)
      if (Date.now() - lastTablesFetchTime > 30000) {
        fetchTables();
      }
    }, []),
  );

  // --- Real-time Sync (Polling every 120s as backup) ---
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTables();
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    socket.on("table_config_updated", () => {
      fetchTables();
      loadBackgroundTheme();
    });
    return () => {
      socket.off("table_config_updated");
    };
  }, []);

  // fetchLockedTables consolidated into fetchTables

  const fetchTables = async () => {
    lastTablesFetchTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${API_URL}/api/tables/all`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data = await response.json();
      let tablesArray: any[] = [];
      if (Array.isArray(data)) tablesArray = data;
      else if (data?.data && Array.isArray(data.data)) tablesArray = data.data;
      else if (data?.recordset && Array.isArray(data.recordset))
        tablesArray = data.recordset;

      if (tablesArray.length > 0) {
        const convertedData: TableItem[] = tablesArray.map((item: any) => ({
          id: String(item.TableId || item.id || "")
            .replace(/^\{|\}$/g, "")
            .trim()
            .toLowerCase(),
          label: item.TableNumber || item.label,
          DiningSection: Number(item.DiningSection) || 1,
          Status: Number(item.Status) || 0,
          StartTime: item.StartTime,
          lockedByName: item.lockedByName,
          totalAmount: Number(item.totalAmount) || 0,
          currentOrderId: item.currentOrderId,
          isOvertime: Number(item.isOvertime) || 0,
          isHoldOvertime: Number(item.isHoldOvertime) || 0,
          lastModified: item.ModifiedOn,
          entryStatus: item.entryStatus || item.entry_status,
          paymentStatus: Number(item.paymentStatus) || 0,
          customerName: item.customerName || item.CustomerName || null,
          pax: item.pax || item.Pax || null,
          TableType: item.TableType,
          Seats: item.Seats !== undefined && item.Seats !== null ? Number(item.Seats) : undefined,
          XSize: item.XSize !== undefined && item.XSize !== null ? Number(item.XSize) : undefined,
          YSize: item.YSize !== undefined && item.YSize !== null ? Number(item.YSize) : undefined,
          XPos: item.XPos !== undefined && item.XPos !== null ? Number(item.XPos) : undefined,
          YPos: item.YPos !== undefined && item.YPos !== null ? Number(item.YPos) : undefined,
        }));

        const uniqueTables = convertedData.filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.id === item.id),
        );

        setAllTables((prev) => {
          if (prev.length !== uniqueTables.length) return uniqueTables;
          const isSame = prev.every(
            (t, i) =>
              t.id === uniqueTables[i].id &&
              t.label === uniqueTables[i].label &&
              t.XPos === uniqueTables[i].XPos &&
              t.YPos === uniqueTables[i].YPos &&
              t.XSize === uniqueTables[i].XSize &&
              t.YSize === uniqueTables[i].YSize &&
              t.TableType === uniqueTables[i].TableType &&
              t.Status === uniqueTables[i].Status &&
              t.Seats === uniqueTables[i].Seats &&
              t.totalAmount === uniqueTables[i].totalAmount
          );
          return isSame ? prev : uniqueTables;
        });

        // 🚀 BATCH SYNC to global store (MUCH FASTER)
        const updates = uniqueTables.map((t) => {
          let finalStartTime = 0;
          if (t.StartTime) {
            const parsed = parseDatabaseDate(t.StartTime).getTime();
            if (!isNaN(parsed)) finalStartTime = parsed;
          }

          return {
            tableId: t.id,
            section: getSectionFromDiningSection(t.DiningSection),
            tableNo: t.label,
            orderId: (t as any).currentOrderId || "EMPTY",
            status: (t.Status === 5
              ? "LOCKED"
              : t.Status === 1
                ? "SENT"
                : t.Status === 2
                  ? "BILL_REQUESTED"
                  : t.Status === 3
                    ? "HOLD"
                    : "EMPTY") as TableStatusType,
            startTime: finalStartTime,
            lockedByName: t.lockedByName,
            totalAmount: t.totalAmount,
            isHoldOvertime: t.isHoldOvertime === 1 || !!t.isHoldOvertime,
            lastModified: (t as any).lastModified,
            entryStatus: t.entryStatus ?? undefined,
            paymentStatus: t.paymentStatus ?? 0,
            customerName: t.customerName ?? undefined,
            pax: t.pax ?? undefined,
          };
        });

        useTableStatusStore.getState().batchUpdateTableStatus(updates);
      } else {
        throw new Error("No tables returned from API");
      }
    } catch (error) {
      Alert.alert(
        "Connection Error",
        `Failed to connect to server at ${API_URL}\n\nPlease ensure the backend server is running.`,
        [{ text: "OK" }],
      );
      setAllTables([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmUnlock = (tableId: string, tableLabel: string) => {
    Alert.alert(
      "Unlock Table",
      `Are you sure you want to unlock Table ${tableLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlock Now",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `${API_URL}/api/tables/unlock-persistent`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tableId, userId: user?.userId }),
                },
              );
              const data = await res.json();
              if (res.ok && data.success) {
                // Optimistic store update
                const targetTable = allTables.find((t) => t.id === tableId);
                if (targetTable) {
                  const section = getSectionFromDiningSection(
                    targetTable.DiningSection,
                  );
                  useTableStatusStore
                    .getState()
                    .updateTableStatus(
                      tableId,
                      section,
                      tableLabel,
                      "SYNC",
                      "EMPTY",
                      undefined,
                      undefined,
                      0,
                    );
                }
                fetchTables();
                Alert.alert("Success", `Table ${tableLabel} unlocked.`);
              } else {
                Alert.alert("Error", data.error || "Failed to unlock");
              }
            } catch (err) {
              Alert.alert("Error", "Network error while unlocking");
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (urlSection && SECTIONS.includes(urlSection)) {
      setActiveTab(urlSection);
    }
  }, [urlSection]);

  useEffect(() => {
    const index = SECTIONS.indexOf(activeTab);
    if (index !== -1 && sectionScrollRef.current) {
      sectionScrollRef.current.scrollTo({ x: index * 120, animated: true });
    }
  }, [activeTab]);

  // 🚀 PERFORMANCE FIX: Removed direct dependency on 'tables' array to prevent full screen re-renders.
  // Individual TableItemComponents now subscribe to their own status.

  const currentTables = useMemo(() => {
    const filtered = allTables.filter((table: TableItem) => {
      if (activeTab === "TAKEAWAY") return table.DiningSection === 4;
      else if (activeTab === "SECTION_1") return table.DiningSection === 1;
      else if (activeTab === "SECTION_2") return table.DiningSection === 2;
      else if (activeTab === "SECTION_3") return table.DiningSection === 3;
      return false;
    });

    return [...filtered].sort((a, b) => {
      const aLocked = a.Status === 5;
      const bLocked = b.Status === 5;
      if (aLocked && !bLocked) return -1;
      if (!aLocked && bLocked) return 1;

      return a.label.localeCompare(b.label, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [allTables, activeTab]);

  // Check if any table in the current section has saved layout positions (XPos > 0 or YPos > 0)
  const hasCustomLayout = useMemo(() => {
    return currentTables.some((t) => (t.XPos && t.XPos > 0) || (t.YPos && t.YPos > 0));
  }, [currentTables]);

  // Dynamic Canvas Height based on table positions in current section
  const canvasHeight = useMemo(() => {
    const maxY = currentTables.reduce((max, t) => Math.max(max, t.YPos || 0), 0);
    return Math.max(650, maxY + 140);
  }, [currentTables]);

  // 🚀 Optimized Occupied Count: Only re-renders when the count changes
  const occupiedCount = useTableStatusStore(
    (state) =>
      Object.values(state.tableMap).filter(
        (t) => t.status !== "EMPTY" && t.status !== 0,
      ).length,
  );

  const tableMap = useTableStatusStore((state) => state.tableMap);

  // ———— STATUS HANDLERS (OPTIMISTIC) ————
  const updateTableStatus = async (
    tableId: string,
    status: number,
    lockedByName?: string,
    totalAmount?: number,
  ): Promise<boolean> => {
    // 1. Optimistic UI update
    const previousTables = [...allTables];
    setAllTables((prev: TableItem[]) =>
      prev.map((t: TableItem) =>
        t.id === tableId ? { ...t, Status: status } : t,
      ),
    );

    // Update global store
    const table = allTables.find((t: TableItem) => t.id === tableId);
    if (table) {
      const statusStrMap: Record<number, TableStatusType> = {
        0: "EMPTY",
        1: "SENT",
        2: "BILL_REQUESTED",
        3: "HOLD",
        4: "SENT", // Overtime is technically still an active order (SENT)
        5: "LOCKED",
      };

      useTableStatusStore.getState().updateTableStatus(
        tableId,
        getSectionFromDiningSection(table.DiningSection),
        table.label,
        "SYNC", // Generic orderId
        statusStrMap[status],
        undefined,
        lockedByName,
        totalAmount,
      );
    }

    try {
      const res = await fetch(`${API_URL}/api/tables/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId,
          status,
          lockedByName,
          userId: user?.userId,
        }),
      });
      if (!res.ok) throw new Error("Failed to update status");

      // Successfully updated backend
      fetchTables(); // 🔥 refresh after update
      return true;
    } catch (err) {
      console.error("Status update failed:", err);
      Alert.alert(
        "Sync Error",
        "Could not sync status with server. Reverting UI.",
      );
      setAllTables(previousTables);
      return false;
    }
  };

  const getSectionFromDiningSection = (ds: number) => {
    if (ds === 1) return "SECTION_1";
    if (ds === 2) return "SECTION_2";
    if (ds === 3) return "SECTION_3";
    return "TAKEAWAY";
  };

  const handleDining = (id: string) => updateTableStatus(id, 1); // Dining
  const handleCheckout = async (id: string) => {
    if (isCheckingOut) return;

    const tableStatus = useTableStatusStore.getState().tableMap[id];
    const effectiveStatus = tableStatus
      ? tableStatus.status === "SENT"
        ? 1
        : tableStatus.status === "BILL_REQUESTED"
          ? 2
          : 1
      : 0;

    if (effectiveStatus === 0) return;

    const checkoutFlowEnabled =
      useGeneralSettingsStore.getState().settings.enableCheckoutFlow !== false;

    setIsCheckingOut(true);
    try {
      const res = await useCartStore.getState().checkoutOrder(id);
      if (res && res.success) {
        // Rely on socket sync for status updates
        // fetchTables();
        const targetTable = allTables.find((t) => t.id === id);
        if (targetTable) {
          const section = getSectionFromDiningSection(
            targetTable.DiningSection,
          );
          setOrderContext({
            orderType: "DINE_IN",
            section: section,
            tableNo: targetTable.label,
            tableId: id,
          });
          if (checkoutFlowEnabled) {
            clearOrderContext();
            router.replace("/(tabs)/category");
          } else {
            router.push("/payment");
          }
        }
      }
    } catch (err) {
      console.error("Checkout flow error:", err);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleCompleteOrder = async (id: string) => {
    if (isCompleting) return;

    const tableData = useTableStatusStore.getState().tableMap[id];
    const effectiveStatus =
      tableData && tableData.status !== "EMPTY"
        ? tableData.status === "SENT"
          ? 1
          : tableData.status === "BILL_REQUESTED"
            ? 2
            : tableData.status === "HOLD"
              ? 3
              : tableData.status === "LOCKED"
                ? 5
                : 1
        : 0;

    if (effectiveStatus !== 2) return;

    setIsCompleting(true);
    try {
      const res = await (useCartStore.getState() as any).completeOrder(id);
      if (res && res.success) {
        // Rely on socket sync for status updates
        // fetchTables();
        useActiveOrdersStore.getState().fetchActiveKitchenOrders();
        showToast({
          type: "success",
          message: "Completed",
          subtitle: "Table is now available.",
        });
      }
    } catch (err) {
      console.error("Complete flow error:", err);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleHold = (id: string) => updateTableStatus(id, 3); // Hold
  const handleReserved = (id: string, name: string) =>
    updateTableStatus(id, 5, name); // Reserved (Use 5 for red locked/reserved state)
  const handleComplete = (id: string) => updateTableStatus(id, 0); // Available

  const handleTablePress = React.useCallback(
    async (item: TableItem, tableData: any, isCheckoutAction?: boolean) => {
      // Check if user license is expired
      const userLicenseToDate = user?.licenseToDate || companyInfo?.LicenseToDate;
      if (userLicenseToDate) {
        const today = new Date();
        const licDate = new Date(userLicenseToDate);
        today.setHours(0, 0, 0, 0);
        licDate.setHours(0, 0, 0, 0);
        if (today > licDate) {
          showToast({
            type: "error",
            message: "License Expired",
            subtitle: "Your POS license has expired. Please contact administrator.",
          });
          return;
        }
      }

      if (!isDayStarted) {
        showToast({
          type: "warning",
          message: "Day Not Started",
          subtitle: "Please select a date and click Start Day first.",
        });
        return;
      }

      // 🌹 PAID QR TABLE: Block entry — table is paid and waiting for kitchen to serve
      const tablePaymentStatus =
        (tableData as any)?.paymentStatus !== undefined
          ? Number((tableData as any).paymentStatus)
          : Number(item.paymentStatus) || 0;
      const tableEntryStatus =
        tableData?.entryStatus !== undefined
          ? tableData.entryStatus
          : item.entryStatus;
      if (tableEntryStatus === "q" && tablePaymentStatus === 1) {
        Alert.alert(
          "Order Already Paid",
          `Table ${item.label} order has been paid. What would you like to do?`,
          [
            {
              text: "Clear Table (Reset)",
              style: "destructive",
              onPress: async () => {
                await updateTableStatus(item.id, 0);
                (useCartStore.getState() as any).clearTableSession(item.id);
                showToast({
                  type: "success",
                  message: "Table Cleared",
                  subtitle: `Table ${item.label} has been reset.`,
                });
              },
            },
            {
              text: "Go to KDS",
              onPress: () => {
                router.push("/kds" as any);
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
        return;
      }

      // 🚀 RESTORE FLOW: If there is a live terminal session for this table, bypass all
      // popups and route directly to /payment so staff can monitor the ongoing transaction.
      const activeTerminalSession = useTerminalPaymentStore.getState().getSession(item.id);
      // Only use the explicit toggle flag — NOT session.isSplit, which persists after terminal resolves
      const isSplitPersisted = useTerminalPaymentStore.getState().activeSplitTables[item.id] === true;
      if (
        (activeTerminalSession && (activeTerminalSession.status === "processing" || activeTerminalSession.status === "cancelled" || activeTerminalSession.status === "failed")) ||
        isSplitPersisted
      ) {
        const section = getSectionFromDiningSection(item.DiningSection);
        setOrderContext({
          orderType: "DINE_IN",
          section,
          tableNo: item.label,
          tableId: item.id,
        });
        router.push({
          pathname: "/payment",
          params: isSplitPersisted ? { isSplit: "true" } : {},
        });
        return;
      }

      const effectiveStatus =
        tableData && tableData.status !== "EMPTY"
          ? tableData.status === "SENT"
            ? 1
            : tableData.status === "BILL_REQUESTED"
              ? 2
              : tableData.status === "HOLD"
                ? 3
                : tableData.status === "LOCKED"
                  ? 5
                  : 1
          : Number(item.Status);

      if (isCheckoutAction) {
        if (effectiveStatus !== 2) {
          handleCheckout(item.id);
          return;
        }
        // For status 2 (Checkout), clicking "PAY" now follows the regular cart flow
      }

      const status = effectiveStatus;

      if (status === 1 || status === 2 || status === 3 || status === 4) {
        // For occupied tables, set context and go to summary/menu
        const section = getSectionFromDiningSection(item.DiningSection);
        const existingContext: OrderContext = {
          orderType: "DINE_IN",
          section: section,
          tableNo: item.label,
          tableId: item.id,
        };
        setOrderContext(existingContext);
        const contextId = getContextId(existingContext);
        if (contextId) {
          setCurrentContext(contextId);
        }
        try {
          await fetchCartFromDBGlobal(item.id, true);
        } catch (err) {
          console.error(
            "❌ [Category] Failed to fetch occupied table cart:",
            err,
          );
        }

        // Check if there is a saved screen for this table
        const { useTableNavigationStore } = require("../../stores/tableNavigationStore");
        const lastScreen = useTableNavigationStore.getState().tableScreens[item.id];
        if (lastScreen === "summary") {
          router.push("/summary");
        } else if (lastScreen === "payment") {
          router.push("/payment");
        } else {
          router.push("/menu/thai_kitchen");
        }
        return;
      }

      if (status === 5) {
        Alert.alert(
          "Table Locked",
          `Table ${item.label} is reserved. What would you like to do?`,
          [
            {
              text: "Unlock Table",
              style: "destructive",
              onPress: () => handleComplete(item.id),
            },
            {
              text: "Go to Lock Tables",
              onPress: () => router.push("/locked-tables"),
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }

      if (status === 0) {
        if (enableGuestDetailsPopup) {
          // Intercept empty table tap to show Guest Name & Pax popup
          setGuestNameInput("");
          setGuestPaxInput("");
          setPendingGuestItem(item);
          setGuestModalVisible(true);
          return;
        } else {
          // Skip the popup completely and go directly to the order screen when a table is selected.
          await proceedWithTable(item, tableData);
          return;
        }
      }

      await proceedWithTable(item, tableData);
    },
    [
      activeTab,
      router,
      isWaiter,
      enableGuestDetailsPopup,
      selectedBusinessDate,
      isDayStarted,
      companyInfo,
    ],
  );

  const proceedWithTable = async (item: TableItem, tableData: any) => {
    const effectiveStatus =
      tableData && tableData.status !== "EMPTY"
        ? tableData.status === "SENT"
          ? 1
          : tableData.status === "BILL_REQUESTED"
            ? 2
            : tableData.status === "HOLD"
              ? 3
              : tableData.status === "LOCKED"
                ? 5
                : 1
        : Number(item.Status);
    const status = effectiveStatus;

    let newContext: any;
    if (activeTab !== "TAKEAWAY") {
      newContext = {
        orderType: "DINE_IN" as const,
        section: activeTab,
        tableNo: item.label,
        tableId: item.id,
      };
    } else {
      newContext = {
        orderType: "TAKEAWAY" as const,
        takeawayNo: item.label,
        tableId: item.id,
      };
    }

    setOrderContext(newContext);
    const contextId = getContextId(newContext);
    if (contextId) {
      setCurrentContext(contextId);
      // 🚀 BUG FIX: If table is empty, clear local cart immediately to prevent "popping" stale data
      if (status === 0) {
        setCartItemsGlobal(contextId, [], true); // skipSync=true to avoid double sync
        try {
          const { useTableNavigationStore } = require("../../stores/tableNavigationStore");
          if (newContext.tableId) {
            useTableNavigationStore.getState().clearTableLastScreen(newContext.tableId);
          }
        } catch (err) {
          console.warn("Failed to clear table navigation state:", err);
        }
      }
    }

    if (newContext.tableId) {
      try {
        await fetchCartFromDBGlobal(newContext.tableId, true);
      } catch (err) {
        console.error("❌ [Category] Failed to fetch shared cart:", err);
      }
    } else if (tableData && tableData.status === "HOLD") {
      const helds = getHeldOrders();
      const held = helds.find((h: any) => h.orderId === tableData.orderId);
      if (held && contextId) {
        setCartItemsGlobal(contextId, held.cart);
      }
    }

    // Check if there is a saved screen for this table
    const { useTableNavigationStore } = require("../../stores/tableNavigationStore");
    const lastScreen = newContext.tableId ? useTableNavigationStore.getState().tableScreens[newContext.tableId] : null;
    if (lastScreen === "summary") {
      router.push("/summary");
    } else if (lastScreen === "payment") {
      router.push("/payment");
    } else {
      router.push("/menu/thai_kitchen");
    }
  };

  const handleGuestSubmit = async () => {
    if (!pendingGuestItem) return;
    setIsSavingGuest(true);
    try {
      const cleanName = guestNameInput.trim().substring(0, 9);
      const cleanPax = guestPaxInput.trim()
        ? parseInt(guestPaxInput.trim())
        : null;

      // Track this table for potential cleanup if user exits without adding items
      lastGuestOpenedTable = {
        tableId: pendingGuestItem.id,
        customerName: cleanName || null,
        pax: cleanPax || null,
      };

      const res = await fetch(`${API_URL}/api/tables/save-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: pendingGuestItem.id,
          customerName: cleanName || null,
          pax: cleanPax || null,
          userId: user?.userId,
        }),
      });

      if (res.ok) {
        // Optimistically update table status store
        const section = getSectionFromDiningSection(
          pendingGuestItem.DiningSection,
        );
        useTableStatusStore
          .getState()
          .updateTableStatus(
            pendingGuestItem.id,
            section,
            pendingGuestItem.label,
            "EMPTY",
            "EMPTY",
            undefined,
            undefined,
            0,
            false,
            false,
            undefined,
            undefined,
            cleanName || undefined,
            cleanPax || undefined,
          );
        fetchTables();
      } else {
        const errData = await res.json();
        console.warn("Error saving guest:", errData.error);
      }
    } catch (err) {
      console.warn("Network error saving guest:", err);
    } finally {
      setIsSavingGuest(false);
      setGuestModalVisible(false);
      const itemToOpen = pendingGuestItem;
      setPendingGuestItem(null);
      // Proceed to menu selection
      proceedWithTable(itemToOpen, null);
    }
  };

  // ──── Move Table handler ──────────────────────────────────────────────────
  const handleMoveTable = async () => {
    if (!moveSourceTable || !moveDestTable) return;
    if (isMovingTable) return;
    setIsMovingTable(true);
    try {
      const res = await fetch(`${API_URL}/api/tables/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTableId: moveSourceTable.id,
          destTableId: moveDestTable.id,
          userId: user?.userId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Optimistic: clear source cart context in store
        const srcSection = getSectionFromDiningSection(
          moveSourceTable.DiningSection,
        );
        const dstSection = getSectionFromDiningSection(
          moveDestTable.DiningSection,
        );

        // Update local state (allTables) optimistically
        setAllTables((prev: TableItem[]) =>
          prev.map((t: TableItem) => {
            if (t.id === moveSourceTable.id) {
              return {
                ...t,
                Status: 0,
                totalAmount: 0,
                currentOrderId: undefined,
                customerName: undefined,
                pax: undefined,
              };
            }
            if (t.id === moveDestTable.id) {
              return {
                ...t,
                Status: moveSourceTable.Status,
                totalAmount:
                  data.totalAmount || moveSourceTable.totalAmount || 0,
                currentOrderId: data.orderId || moveSourceTable.currentOrderId,
                customerName: moveSourceTable.customerName,
                pax: moveSourceTable.pax,
              };
            }
            return t;
          }),
        );

        // Update tableStatusStore for source → Available
        useTableStatusStore
          .getState()
          .updateTableStatus(
            moveSourceTable.id,
            srcSection,
            moveSourceTable.label,
            "SYNC",
            "EMPTY",
            undefined,
            undefined,
            0,
            false,
            false,
            undefined,
            undefined,
            null as any,
            null as any,
          );

        // Update tableStatusStore for destination → copy source status
        const srcStatusType: TableStatusType =
          moveSourceTable.Status === 5
            ? "LOCKED"
            : moveSourceTable.Status === 1
              ? "SENT"
              : moveSourceTable.Status === 2
                ? "BILL_REQUESTED"
                : moveSourceTable.Status === 3
                  ? "HOLD"
                  : "EMPTY";
        useTableStatusStore
          .getState()
          .updateTableStatus(
            moveDestTable.id,
            dstSection,
            moveDestTable.label,
            data.orderId || "SYNC",
            srcStatusType,
            undefined,
            undefined,
            data.totalAmount || moveSourceTable.totalAmount || 0,
          );

        // Clear cart store for source context
        const srcContext = {
          orderType: "DINE_IN" as const,
          section: srcSection,
          tableNo: moveSourceTable.label,
          tableId: moveSourceTable.id,
        };
        const srcContextId = getContextId(srcContext);
        if (srcContextId) setCartItemsGlobal(srcContextId, [], true);

        setIsMoveTableVisible(false);
        setMoveSourceTable(null);
        setMoveDestTable(null);
        setMoveStep("source");
        setMoveSearchQuery("");

        showToast({
          type: "success",
          message: "Table Moved",
          subtitle: `Table ${data.sourceTableNo} → Table ${data.destTableNo} ✓`,
        });
        fetchTables();
      } else {
        showToast({
          type: "error",
          message: "Move Failed",
          subtitle: data.error || "Could not move the table.",
        });
      }
    } catch (err) {
      showToast({
        type: "error",
        message: "Network Error",
        subtitle: "Failed to connect to server.",
      });
    } finally {
      setIsMovingTable(false);
    }
  };

  // 🚀 Memoized Render Function for Table Grid

  // 🚀 Memoized Render Function for Table Grid
  const renderItem = React.useCallback(
    ({ item }: { item: TableItem }) => {
      return (
        <TableItemComponent
          tableId={item.id}
          item={item}
          itemSize={itemSize}
          activeTab={activeTab}
          onPress={handleTablePress}
          numberFont={numberFont}
          smallFont={smallFont}
          isTabletPortrait={!isLandscape && isTablet}
          backgroundTheme={backgroundTheme}
        />
      );
    },
    [
      itemSize,
      activeTab,
      handleTablePress,
      numberFont,
      smallFont,
      width,
      height,
      backgroundTheme,
    ],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />
        {/* Placeholder Nav Bar */}
        <View style={styles.topNavContainer}>
          <Skeleton
            width={120}
            height={32}
            borderRadius={16}
            style={{ marginLeft: 20 }}
          />
          <View style={{ flex: 1 }} />
          <Skeleton
            width={40}
            height={40}
            borderRadius={20}
            style={{ marginRight: 20 }}
          />
        </View>
        <TableGridSkeleton
          itemSize={itemSize}
          columns={columns}
          gap={GAP}
          padding={PADDING}
          insets={insets}
        />
      </SafeAreaView>
    );
  }

  const renderLicenseView = (isFloating: boolean) => {
    if (!companyInfo) return null;

    const fromDate = (user?.licenseFromDate || companyInfo.LicenseFromDate)
      ? (user?.licenseFromDate || companyInfo.LicenseFromDate).split("T")[0]
      : "N/A";
    const toDate = (user?.licenseToDate || companyInfo.LicenseToDate)
      ? (user?.licenseToDate || companyInfo.LicenseToDate).split("T")[0]
      : "N/A";

    const hasLicense = (user?.licenseFromDate || user?.licenseToDate || companyInfo.LicenseFromDate || companyInfo.LicenseToDate);

    return (
      <View style={isFloating ? {
        position: "absolute",
        bottom: isWindows ? 16 : Math.max(insets.bottom, 16) + 24,
        left: Math.max(insets.left, 16) + 8,
        backgroundColor: "transparent",
        pointerEvents: "none",
        zIndex: 9999,
      } : {
        paddingHorizontal: PADDING,
        paddingTop: 16,
        paddingBottom: Math.max(insets.bottom + 24, 36),
        alignItems: "flex-start",
        justifyContent: "center",
        marginTop: 12,
      }}>
        <LinearGradient
          colors={["#FFFFFF", "#F8FAFC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 16,
            padding: 12,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            maxWidth: 380,
            width: isFloating ? 320 : "100%",
            gap: 12,
            shadowColor: "#6366F1",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 6,
            elevation: 1,
          }}
        >
          {companyInfo.CompanyLogoUrl ? (
            <View style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              padding: 2,
              backgroundColor: "#FFFFFF",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.03,
              shadowRadius: 1,
              elevation: 1,
            }}>
              <Image
                source={{ uri: companyInfo.CompanyLogoUrl }}
                style={{ width: 46, height: 46, borderRadius: 8 }}
                contentFit="contain"
              />
            </View>
          ) : (
            <LinearGradient
              colors={["#EEF2FF", "#E0E7FF"]}
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#E0E7FF",
              }}
            >
              <Ionicons name="storefront" size={22} color="#4F46E5" />
            </LinearGradient>
          )}

          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <Text style={{
                fontFamily: Fonts.bold,
                fontSize: 14,
                color: "#1E293B",
                letterSpacing: 0.1,
              }}>
                {companyInfo.CompanyName || "Smart POS"}
              </Text>

              {hasLicense && (
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#DCFCE7",
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderRadius: 8,
                  gap: 3,
                }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#15803D" }} />
                  <Text style={{
                    fontFamily: Fonts.bold,
                    fontSize: 10,
                    color: "#166534",
                    textTransform: "uppercase",
                    letterSpacing: 0.2,
                  }}>
                    Active
                  </Text>
                </View>
              )}
            </View>

            {companyInfo.Address ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="location-outline" size={12} color="#64748B" />
                <Text style={{
                  fontFamily: Fonts.medium,
                  fontSize: 11.5,
                  color: "#64748B",
                  flex: 1,
                }} numberOfLines={1}>
                  {companyInfo.Address}
                </Text>
              </View>
            ) : null}

            {hasLicense ? (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 2,
                backgroundColor: "#F1F5F9",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                alignSelf: "flex-start"
              }}>
                <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                <Text style={{
                  fontFamily: Fonts.semiBold,
                  fontSize: 10.5,
                  color: "#475569",
                }}>
                  Valid: <Text style={{ color: "#0F172A", fontFamily: Fonts.bold }}>{fromDate}</Text> to <Text style={{ color: "#0F172A", fontFamily: Fonts.bold }}>{toDate}</Text>
                </Text>
              </View>
            ) : null}

            <Text style={{
              fontFamily: Fonts.medium,
              fontSize: 9.5,
              color: "#94A3B8",
              marginTop: 2,
            }}>
              © 2026 UNIPRO. All rights reserved.
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />

      {/* 〰〰〰〰〰〰〰〰〰〰〰 TOP NAV BAR 〰〰〰〰〰〰〰〰〰〰〰 */}
      {!isTablet ? (
        // --- MOBILE HEADER (TWO ROWS) ---
        <View
          style={{
            backgroundColor: Theme.bgNav,
            borderBottomWidth: 1,
            borderBottomColor: Theme.border,
            paddingBottom: 6,
          }}
        >
          {/* Row 1: Section Tabs & Menu Button */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 6,
              gap: 8,
            }}
          >
            <ScrollView
              ref={sectionScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: "center" }}
              style={{ flex: 1 }}
            >
              <View style={[styles.tabsWrapper, { gap: 6 }]}>
                {SECTIONS.map((section) => {
                  const isActive = activeTab === section;
                  const sectionTables = allTables.filter((t: TableItem) => {
                    if (section === "TAKEAWAY") return t.DiningSection === 4;
                    if (section === "SECTION_1") return t.DiningSection === 1;
                    if (section === "SECTION_2") return t.DiningSection === 2;
                    if (section === "SECTION_3") return t.DiningSection === 3;
                    return false;
                  });
                  const occupied = sectionTables.filter((t: TableItem) => {
                    const tableData = tableMap[t.id];
                    const status = tableData
                      ? (tableData.status === "SENT"
                        ? 1
                        : tableData.status === "BILL_REQUESTED"
                          ? 2
                          : tableData.status === "HOLD"
                            ? 3
                            : tableData.status === "LOCKED"
                              ? 5
                              : 0)
                      : Number(t.Status);
                    return status !== 0;
                  }).length;

                  return (
                    <TouchableOpacity
                      key={section}
                      onPress={() => setActiveTab(section)}
                      activeOpacity={0.75}
                      style={[
                        styles.tabBtn,
                        isActive && styles.activeTabBtn,
                        { paddingVertical: 6, paddingHorizontal: 12 },
                      ]}
                    >
                      <Ionicons
                        name={SECTION_ICONS[section] as any}
                        size={12}
                        color={isActive ? "#fff" : Theme.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.tabText,
                          isActive && styles.activeTabText,
                          { fontSize: 12 },
                        ]}
                      >
                        {formatSectionGlobal(SECTION_LABELS[section]).replace(
                          "Section ",
                          "Sec-",
                        )}
                      </Text>
                      {occupied > 0 && (
                        <View
                          style={[
                            styles.tabBadge,
                            isActive && styles.activeTabBadge,
                            { marginLeft: 4, height: 16, minWidth: 16 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.tabBadgeText,
                              isActive && styles.activeTabBadgeText,
                              { fontSize: 9 },
                            ]}
                          >
                            {occupied}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Row 2: Date Picker, Day Start, and Status Buttons */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 12,
              paddingTop: 4,
            }}
          >
            {/* Date & Day Start */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#f5eee6",
                  borderWidth: 1,
                  borderColor: "#e5dec9",
                  borderRadius: 16,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  gap: 6,
                  opacity: isDayStarted ? 0.7 : 1,
                }}
                disabled={isDayStarted}
                onPress={() => setShowBusinessCalendar(true)}
              >
                <Text
                  style={{
                    fontFamily: Fonts.bold,
                    fontSize: 12,
                    color: "#1c2d42",
                  }}
                >
                  {selectedBusinessDate
                    ? formatDateToDMY(selectedBusinessDate)
                    : "dd-mm-yyyy"}
                </Text>
                <Ionicons name="calendar-outline" size={14} color="#556e8a" />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: isDayStarted
                    ? "#22c55e"
                    : Theme.primary || "#fd7e14",
                  borderRadius: 16,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: isStartingDay ? 0.7 : 1,
                }}
                disabled={isDayStarted || isStartingDay}
                onPress={handleStartDay}
              >
                <Text
                  style={{
                    fontFamily: Fonts.bold,
                    fontSize: 11,
                    color: "#fff",
                  }}
                >
                  {isDayStarted ? "Day Started" : "Start Day"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Right side status icons */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              {enableKDS && (
                <TouchableOpacity
                  style={[
                    styles.headerActionBtn,
                    {
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      position: "relative",
                    },
                  ]}
                  onPress={() => router.push("/kitchen-status")}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={18}
                    color={Theme.success}
                  />
                  {readyItemsCount > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        backgroundColor: Theme.danger || "#ef4444",
                        borderRadius: 8,
                        minWidth: 16,
                        height: 16,
                        justifyContent: "center",
                        alignItems: "center",
                        paddingHorizontal: 3,
                        borderWidth: 1,
                        borderColor: "#FFF",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 8,
                          fontFamily: Fonts.black || "System",
                          lineHeight: 10,
                          textAlign: "center",
                        }}
                      >
                        {readyItemsCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {canAccessKDS() && enableKDS && (
                <TouchableOpacity
                  style={[
                    styles.headerActionBtn,
                    { paddingHorizontal: 10, paddingVertical: 6 },
                  ]}
                  onPress={() => router.push("/kds" as any)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="tv-outline" size={18} color={Theme.info} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.headerActionBtn,
                  { paddingHorizontal: 10, paddingVertical: 6 },
                ]}
                onPress={() => setIsNotifModalVisible(true)}
                activeOpacity={0.75}
              >
                <View style={{ position: "relative" }}>
                  <Ionicons name="notifications-outline" size={18} color={Theme.primary} />
                  {unreadCount > 0 && (
                    <View style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      backgroundColor: Theme.danger || "#ef4444",
                      borderRadius: 7,
                      minWidth: 14,
                      height: 14,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: "#FFF",
                    }}>
                      <Text style={{ color: "#fff", fontSize: 8, fontFamily: Fonts.bold }}>
                        {unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <WindowControls buttonStyle={{ height: 32, width: 32, borderRadius: 8 }} iconSize={16} hideHome={true} />

              <TouchableOpacity
                style={[
                  styles.headerActionBtn,
                  {
                    backgroundColor: Theme.primaryLight,
                    borderColor: Theme.primaryBorder,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  },
                ]}
                onPress={() => setIsMenuVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="menu-outline" size={20} color={Theme.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : width < 1024 ? (
        // --- TABLET HEADER (TWO ROWS FOR SPACING) ---
        <View style={{ backgroundColor: Theme.bgNav, borderBottomWidth: 1, borderBottomColor: Theme.border, ...Theme.shadowSm }}>
          <View
            style={[
              styles.topNavContainer,
              { paddingHorizontal: isTablet ? 20 : 12, borderBottomWidth: 0, shadowColor: 'transparent', elevation: 0 },
              !isTablet &&
              isLandscape && { height: 42, paddingVertical: 2, gap: 8 },
            ]}
          >
            {/* CENTER — Section Tabs */}
            <ScrollView
              ref={sectionScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsScrollContent}
              style={styles.tabsScrollView}
            >
              <View style={[styles.tabsWrapper, { gap: isTablet ? 8 : 6 }]}>
                {SECTIONS.map((section) => {
                  const isActive = activeTab === section;
                  const sectionTables = allTables.filter((t: TableItem) => {
                    if (section === "TAKEAWAY") return t.DiningSection === 4;
                    if (section === "SECTION_1") return t.DiningSection === 1;
                    if (section === "SECTION_2") return t.DiningSection === 2;
                    if (section === "SECTION_3") return t.DiningSection === 3;
                    return false;
                  });
                  const occupied = sectionTables.filter((t: TableItem) => {
                    const tableData = tableMap[t.id];
                    const status = tableData
                      ? (tableData.status === "SENT"
                        ? 1
                        : tableData.status === "BILL_REQUESTED"
                          ? 2
                          : tableData.status === "HOLD"
                            ? 3
                            : tableData.status === "LOCKED"
                              ? 5
                              : 0)
                      : Number(t.Status);
                    return status !== 0;
                  }).length;

                  return (
                    <TouchableOpacity
                      key={section}
                      onPress={() => setActiveTab(section)}
                      activeOpacity={0.75}
                      style={[
                        styles.tabBtn,
                        isActive && styles.activeTabBtn,
                        !isTablet &&
                        isLandscape && {
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                        },
                      ]}
                    >
                      <Ionicons
                        name={SECTION_ICONS[section] as any}
                        size={14}
                        color={isActive ? "#fff" : Theme.textSecondary}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          styles.tabText,
                          isActive && styles.activeTabText,
                          { fontSize: isTablet ? 16 : 13 },
                        ]}
                      >
                        {!isTablet && !isLandscape
                          ? formatSectionGlobal(SECTION_LABELS[section]).replace(
                            "Section ",
                            "Sec-",
                          )
                          : formatSectionGlobal(SECTION_LABELS[section])}
                      </Text>
                      {occupied > 0 && (
                        <View
                          style={[
                            styles.tabBadge,
                            isActive && styles.activeTabBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.tabBadgeText,
                              isActive && styles.activeTabBadgeText,
                            ]}
                          >
                            {occupied}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* RIGHT — Action Buttons */}
            <View style={[styles.navRightGroup, { gap: isTablet ? 8 : 6, flexDirection: "row", alignItems: "center" }]}>
              {/* Kitchen Status */}
              {enableKDS && (
                <TouchableOpacity
                  style={[styles.headerActionBtn, { position: "relative" }]}
                  onPress={() => router.push("/kitchen-status")}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="restaurant-outline"
                    size={20}
                    color={Theme.success}
                  />
                  {isTablet && isLandscape && (
                    <Text
                      style={[styles.headerActionText, { color: Theme.success }]}
                    >
                      Status
                    </Text>
                  )}
                  {readyItemsCount > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        backgroundColor: Theme.danger || "#ef4444",
                        borderRadius: 9,
                        minWidth: 18,
                        height: 18,
                        justifyContent: "center",
                        alignItems: "center",
                        paddingHorizontal: 4,
                        borderWidth: 1.5,
                        borderColor: "#FFF",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 9,
                          fontFamily: Fonts.black || "System",
                          lineHeight: 11,
                          textAlign: "center",
                        }}
                      >
                        {readyItemsCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* KDS */}
              {canAccessKDS() && enableKDS && (
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => router.push("/kds" as any)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="tv-outline" size={20} color={Theme.info} />
                  {isTablet && isLandscape && (
                    <Text
                      style={[styles.headerActionText, { color: Theme.info }]}
                    >
                      KDS
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Alerts/Notifications */}
              <TouchableOpacity
                style={[styles.headerActionBtn, { width: 40, height: 40, justifyContent: "center", paddingHorizontal: 0 }]}
                onPress={() => setIsNotifModalVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="notifications-outline" size={20} color={Theme.primary} />
                {unreadCount > 0 && (
                  <View style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    backgroundColor: Theme.danger || "#ef4444",
                    borderRadius: 6,
                    minWidth: 12,
                    height: 12,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#FFF",
                  }} />
                )}
              </TouchableOpacity>

              <WindowControls buttonStyle={[styles.headerActionBtn, { width: 40, height: 40, justifyContent: "center", paddingHorizontal: 0 }]} iconSize={20} hideHome={true} />

              {/* Menu */}
              <TouchableOpacity
                style={[
                  styles.headerActionBtn,
                  {
                    backgroundColor: Theme.primaryLight,
                    borderColor: Theme.primaryBorder,
                  },
                ]}
                onPress={() => setIsMenuVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="menu-outline" size={24} color={Theme.primary} />
                {isTablet && (
                  <Text
                    style={[styles.headerActionText, { color: Theme.primary }]}
                  >
                    Menu
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ROW 2 — Date & Day Start Buttons */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: isTablet ? 20 : 12,
              paddingBottom: 12,
              gap: 8,
              marginTop: -2,
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f5eee6",
                borderWidth: 1,
                borderColor: "#e5dec9",
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 7,
                gap: 10,
                opacity: isDayStarted ? 0.7 : 1,
              }}
              disabled={isDayStarted}
              onPress={() => setShowBusinessCalendar(true)}
            >
              <Text
                style={{
                  fontFamily: Fonts.bold,
                  fontSize: 15,
                  color: "#1c2d42",
                }}
              >
                {selectedBusinessDate
                  ? formatDateToDMY(selectedBusinessDate)
                  : "dd-mm-yyyy"}
              </Text>
              <Ionicons name="calendar-outline" size={18} color="#556e8a" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: isDayStarted
                  ? "#22c55e"
                  : Theme.primary || "#fd7e14",
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 7,
                justifyContent: "center",
                alignItems: "center",
                opacity: isStartingDay ? 0.7 : 1,
              }}
              disabled={isDayStarted || isStartingDay}
              onPress={handleStartDay}
            >
              <Text
                style={{ fontFamily: Fonts.bold, fontSize: 14, color: "#fff" }}
              >
                {isDayStarted ? "Day Started" : "Start Day"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // --- LAPTOP/WINDOWS HEADER (SINGLE ROW) ---
        <View
          style={[
            styles.topNavContainer,
            { paddingHorizontal: isTablet ? 20 : 12 },
            !isTablet &&
            isLandscape && { height: 42, paddingVertical: 2, gap: 8 },
          ]}
        >
          {/* CENTER — Section Tabs */}
          <ScrollView
            ref={sectionScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
            style={styles.tabsScrollView}
          >
            <View style={[styles.tabsWrapper, { gap: isTablet ? 8 : 6 }]}>
              {SECTIONS.map((section) => {
                const isActive = activeTab === section;
                const sectionTables = allTables.filter((t: TableItem) => {
                  if (section === "TAKEAWAY") return t.DiningSection === 4;
                  if (section === "SECTION_1") return t.DiningSection === 1;
                  if (section === "SECTION_2") return t.DiningSection === 2;
                  if (section === "SECTION_3") return t.DiningSection === 3;
                  return false;
                });
                const occupied = sectionTables.filter((t: TableItem) => {
                  const tableData = tableMap[t.id];
                  const status = tableData
                    ? (tableData.status === "SENT"
                      ? 1
                      : tableData.status === "BILL_REQUESTED"
                        ? 2
                        : tableData.status === "HOLD"
                          ? 3
                          : tableData.status === "LOCKED"
                            ? 5
                            : 0)
                    : Number(t.Status);
                  return status !== 0;
                }).length;

                return (
                  <TouchableOpacity
                    key={section}
                    onPress={() => setActiveTab(section)}
                    activeOpacity={0.75}
                    style={[
                      styles.tabBtn,
                      isActive && styles.activeTabBtn,
                      !isTablet &&
                      isLandscape && {
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                      },
                    ]}
                  >
                    <Ionicons
                      name={SECTION_ICONS[section] as any}
                      size={14}
                      color={isActive ? "#fff" : Theme.textSecondary}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        isActive && styles.activeTabText,
                        { fontSize: isTablet ? 16 : 13 },
                      ]}
                    >
                      {!isTablet && !isLandscape
                        ? formatSectionGlobal(SECTION_LABELS[section]).replace(
                          "Section ",
                          "Sec-",
                        )
                        : formatSectionGlobal(SECTION_LABELS[section])}
                    </Text>
                    {occupied > 0 && (
                      <View
                        style={[
                          styles.tabBadge,
                          isActive && styles.activeTabBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabBadgeText,
                            isActive && styles.activeTabBadgeText,
                          ]}
                        >
                          {occupied}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* DATE PICKER & DAY START BUTTON */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginHorizontal: 8,
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f5eee6",
                borderWidth: 1,
                borderColor: "#e5dec9",
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 7,
                gap: 10,
                opacity: isDayStarted ? 0.7 : 1,
              }}
              disabled={isDayStarted}
              onPress={() => setShowBusinessCalendar(true)}
            >
              <Text
                style={{
                  fontFamily: Fonts.bold,
                  fontSize: 15,
                  color: "#1c2d42",
                }}
              >
                {selectedBusinessDate
                  ? formatDateToDMY(selectedBusinessDate)
                  : "dd-mm-yyyy"}
              </Text>
              <Ionicons name="calendar-outline" size={18} color="#556e8a" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: isDayStarted
                  ? "#22c55e"
                  : Theme.primary || "#fd7e14",
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 7,
                justifyContent: "center",
                alignItems: "center",
                opacity: isStartingDay ? 0.7 : 1,
              }}
              disabled={isDayStarted || isStartingDay}
              onPress={handleStartDay}
            >
              <Text
                style={{ fontFamily: Fonts.bold, fontSize: 14, color: "#fff" }}
              >
                {isDayStarted ? "Day Started" : "Start Day"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* RIGHT — Action Buttons */}
          <View style={[styles.navRightGroup, { gap: isTablet ? 8 : 6 }]}>
            {/* Kitchen Status — moved from menu */}
            {enableKDS && (
              <TouchableOpacity
                style={[styles.headerActionBtn, { position: "relative" }]}
                onPress={() => router.push("/kitchen-status")}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="restaurant-outline"
                  size={20}
                  color={Theme.success}
                />
                {isTablet && isLandscape && (
                  <Text
                    style={[styles.headerActionText, { color: Theme.success }]}
                  >
                    Status
                  </Text>
                )}
                {readyItemsCount > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      backgroundColor: Theme.danger || "#ef4444",
                      borderRadius: 9,
                      minWidth: 18,
                      height: 18,
                      justifyContent: "center",
                      alignItems: "center",
                      paddingHorizontal: 4,
                      borderWidth: 1.5,
                      borderColor: "#FFF",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.2,
                      shadowRadius: 1,
                      elevation: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 9,
                        fontFamily: Fonts.black || "System",
                        lineHeight: 11,
                        textAlign: "center",
                      }}
                    >
                      {readyItemsCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* KDS — gated by OPRSTK and General Settings */}
            {canAccessKDS() && enableKDS && (
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={() => router.push("/kds" as any)}
                activeOpacity={0.75}
              >
                <Ionicons name="tv-outline" size={20} color={Theme.info} />
                {isTablet && isLandscape && (
                  <Text
                    style={[styles.headerActionText, { color: Theme.info }]}
                  >
                    KDS
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Alerts/Notifications Button */}
            <TouchableOpacity
              style={[styles.headerActionBtn, { width: 40, height: 40, justifyContent: "center", paddingHorizontal: 0 }]}
              onPress={() => setIsNotifModalVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="notifications-outline" size={20} color={Theme.primary} />
              {unreadCount > 0 && (
                <View style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  backgroundColor: Theme.danger || "#ef4444",
                  borderRadius: 6,
                  minWidth: 12,
                  height: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#FFF",
                }} />
              )}
            </TouchableOpacity>

            <WindowControls buttonStyle={[styles.headerActionBtn, { width: 40, height: 40, justifyContent: "center", paddingHorizontal: 0 }]} iconSize={20} hideHome={true} />

            {/* NEW CONSOLIDATED MENU BUTTON */}
            <TouchableOpacity
              style={[
                styles.headerActionBtn,
                {
                  backgroundColor: Theme.primaryLight,
                  borderColor: Theme.primaryBorder,
                },
              ]}
              onPress={() => setIsMenuVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="menu-outline" size={24} color={Theme.primary} />
              {isTablet && (
                <Text
                  style={[styles.headerActionText, { color: Theme.primary }]}
                >
                  Menu
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 〰〰〰〰〰〰〰〰〰〰〰 QR ORDER MODAL 〰〰〰〰〰〰〰〰〰〰〰 */}
      <Modal
        visible={isQRModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsQRModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setIsQRModalVisible(false)}
        >
          <View
            style={[
              {
                backgroundColor: Theme.bgCard,
                padding: 32,
                borderRadius: Theme.radiusLg,
                alignItems: "center",
                justifyContent: "center",
                elevation: 10,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "bold",
                color: Theme.textPrimary,
                marginBottom: 8,
              }}
            >
              QR Order
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: Theme.textSecondary,
                marginBottom: 24,
                textAlign: "center",
              }}
            >
              Scan this code to view the menu and place orders.
            </Text>
            <View
              style={{ padding: 16, backgroundColor: "#fff", borderRadius: 8 }}
            >
              <QRCode
                value="https://example.com/menu"
                size={200}
                color="black"
                backgroundColor="white"
              />
            </View>
            <TouchableOpacity
              style={{
                marginTop: 24,
                paddingVertical: 12,
                paddingHorizontal: 24,
                backgroundColor: Theme.primary,
                borderRadius: Theme.radiusMd,
                width: "100%",
                alignItems: "center",
              }}
              onPress={() => setIsQRModalVisible(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 〰〰〰〰〰〰〰〰〰〰〰 MORE MENU MODAL 〰〰〰〰〰〰〰〰〰〰〰 */}
      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setIsMenuVisible(false)}
        >
          <View
            style={[
              styles.menuContent,
              isTablet && { width: 300, right: 20 },
              { maxHeight: height * 0.8 },
            ]}
          >
            {/* User Info Header */}
            {user && (
              <LinearGradient
                colors={[Theme.primary, "#E05A10"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.menuUserSectionGradient}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setIsAvatarModalVisible(true)}
                  style={[styles.menuAvatarPremium, { overflow: "hidden" }]}
                >
                  {avatarUrl ? (
                    <Image
                      source={getAvatarSource(avatarUrl)}
                      style={{ width: "100%", height: "100%" }}
                      placeholder={require("../../assets/images/logo_pos.png")}
                    />
                  ) : (
                    <Ionicons name="person" size={20} color="#9CA3AF" />
                  )}
                </TouchableOpacity>
                <View>
                  <Text style={styles.menuUserNamePremium}>{user.fullName}</Text>
                  <Text style={styles.menuUserRolePremium}>{user.roleName}</Text>
                </View>
              </LinearGradient>
            )}

            <View style={styles.menuDivider} />

            {/* Menu Options */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 1. Tables Dropdown */}
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.menuItem,
                  isTablesExpanded && {
                    backgroundColor: "#F3F4F6",
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    borderBottomWidth: 0,
                  },
                ]}
                onPress={() => setIsTablesExpanded(!isTablesExpanded)}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.primary + "10" },
                  ]}
                >
                  <Ionicons
                    name="grid-outline"
                    size={18}
                    color={Theme.primary}
                  />
                </View>
                <Text style={[styles.menuItemText, { flex: 1 }]}>
                  Tables
                </Text>
                <Ionicons
                  name={
                    isTablesExpanded ? "chevron-down" : "chevron-forward"
                  }
                  size={18}
                  color={Theme.textSecondary}
                />
              </TouchableOpacity>

              {isTablesExpanded && (
                <View style={styles.subMenuContainer}>
                  {canAccessLockTables() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/locked-tables");
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.warning + "10" },
                        ]}
                      >
                        <Ionicons
                          name="lock-closed-outline"
                          size={18}
                          color={Theme.warning}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>Locked Tables</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      // Auto-select source step; pre-pick source if only one occupied table exists
                      const statusMap: Record<string, number> = {
                        EMPTY: 0,
                        SENT: 1,
                        BILL_REQUESTED: 2,
                        HOLD: 3,
                        LOCKED: 5,
                      };
                      const occupied = allTables
                        .map((t) => {
                          const sd = useTableStatusStore.getState().tableMap[t.id];
                          const freshStatus = sd ? statusMap[sd.status] : t.Status;
                          return {
                            ...t,
                            Status:
                              freshStatus !== undefined ? freshStatus : t.Status,
                          };
                        })
                        .filter((t) => [1, 2, 3].includes(Number(t.Status)));

                      if (occupied.length === 1) {
                        setMoveSourceTable(occupied[0]);
                        setMoveStep("dest");
                        setMoveActiveSection(
                          getSectionFromDiningSection(occupied[0].DiningSection),
                        );
                      } else {
                        setMoveSourceTable(null);
                        setMoveStep("source");
                      }
                      setMoveDestTable(null);
                      setMoveSearchQuery("");
                      setIsMoveTableVisible(true);
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primaryLight },
                      ]}
                    >
                      <Ionicons
                        name="swap-horizontal-outline"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={styles.subMenuItemText}>Transfer Table</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/table-master");
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primary + "10" },
                      ]}
                    >
                      <Ionicons
                        name="create-outline"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={styles.subMenuItemText}>Table Master</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 2. Staff Dropdown */}
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.menuItem,
                  isStaffExpanded && {
                    backgroundColor: "#F3F4F6",
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    borderBottomWidth: 0,
                  },
                ]}
                onPress={() => setIsStaffExpanded(!isStaffExpanded)}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.primary + "10" },
                  ]}
                >
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={Theme.primary}
                  />
                </View>
                <Text style={[styles.menuItemText, { flex: 1 }]}>
                  Staff
                </Text>
                <Ionicons
                  name={
                    isStaffExpanded ? "chevron-down" : "chevron-forward"
                  }
                  size={18}
                  color={Theme.textSecondary}
                />
              </TouchableOpacity>

              {isStaffExpanded && (
                <View style={styles.subMenuContainer}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/waiters");
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primary + "10" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="account-group"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={styles.subMenuItemText}>Waiters</Text>
                  </TouchableOpacity>

                  {canAccessStaffAttendance() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/StaffAttendance");
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.primary + "10" },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="calendar-clock"
                          size={18}
                          color={Theme.primary}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>Staff Attendance</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 3. Customer Dropdown */}
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.menuItem,
                  isCustomerExpanded && {
                    backgroundColor: "#F3F4F6",
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    borderBottomWidth: 0,
                  },
                ]}
                onPress={() => setIsCustomerExpanded(!isCustomerExpanded)}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.primary + "10" },
                  ]}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color={Theme.primary}
                  />
                </View>
                <Text style={[styles.menuItemText, { flex: 1 }]}>
                  Customer
                </Text>
                <Ionicons
                  name={
                    isCustomerExpanded ? "chevron-down" : "chevron-forward"
                  }
                  size={18}
                  color={Theme.textSecondary}
                />
              </TouchableOpacity>

              {isCustomerExpanded && (
                <View style={styles.subMenuContainer}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/loyalty");
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primary + "10" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="card-outline"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={styles.subMenuItemText}>Loyalty</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/menu/rewardMaster");
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primary + "10" },
                      ]}
                    >
                      <Ionicons
                        name="gift-outline"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={styles.subMenuItemText}>Reward Points Master</Text>
                  </TouchableOpacity>

                  {canAccessMembers() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/members");
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.info + "10" },
                        ]}
                      >
                        <Ionicons
                          name="people-outline"
                          size={18}
                          color={Theme.info}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>Members</Text>
                    </TouchableOpacity>
                  )}

                  {canAccessMembers() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/receivables");
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.primary + "10" },
                        ]}
                      >
                        <Ionicons
                          name="wallet-outline"
                          size={18}
                          color={Theme.primary}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>Receivables</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 4. Settlement */}
              {canAccessDayEnd() && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    router.push("/menu/settlement");
                  }}
                >
                  <View
                    style={[
                      styles.menuIconContainer,
                      { backgroundColor: Theme.primary + "10" },
                    ]}
                  >
                    <Ionicons
                      name="calculator-outline"
                      size={18}
                      color={Theme.primary}
                    />
                  </View>
                  <Text style={styles.menuItemText}>Settlement</Text>
                </TouchableOpacity>
              )}

              {/* 5. Reports Dropdown */}
              {(canAccessSalesReport() || canAccessDayEnd()) && (
                <>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[
                      styles.menuItem,
                      isReportsExpanded && {
                        backgroundColor: "#F3F4F6",
                        borderBottomLeftRadius: 0,
                        borderBottomRightRadius: 0,
                        borderBottomWidth: 0,
                      },
                    ]}
                    onPress={() => setIsReportsExpanded(!isReportsExpanded)}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primary + "10" },
                      ]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={[styles.menuItemText, { flex: 1 }]}>
                      Reports
                    </Text>
                    <Ionicons
                      name={
                        isReportsExpanded ? "chevron-down" : "chevron-forward"
                      }
                      size={18}
                      color={Theme.textSecondary}
                    />
                  </TouchableOpacity>

                  {isReportsExpanded && (
                    <View style={styles.subMenuContainer}>
                      {canAccessSalesReport() && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.subMenuItem}
                          onPress={() => {
                            setIsMenuVisible(false);
                            router.push("/sales-report");
                          }}
                        >
                          <View
                            style={[
                              styles.menuIconContainer,
                              { backgroundColor: Theme.primary + "10" },
                            ]}
                          >
                            <Ionicons
                              name="bar-chart-outline"
                              size={18}
                              color={Theme.primary}
                            />
                          </View>
                          <Text style={styles.subMenuItemText}>Sales Report</Text>
                        </TouchableOpacity>
                      )}

                      {canAccessDayEnd() && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={styles.subMenuItem}
                          onPress={() => {
                            setIsMenuVisible(false);
                            router.push("/day-end");
                          }}
                        >
                          <View
                            style={[
                              styles.menuIconContainer,
                              { backgroundColor: Theme.warning + "10" },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name="calendar-clock"
                              size={18}
                              color={Theme.warning}
                            />
                          </View>
                          <Text style={styles.subMenuItemText}>Day End Report</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* 6. Settings Dropdown */}
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.menuItem,
                  isSettingsExpanded && {
                    backgroundColor: "#F3F4F6",
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    borderBottomWidth: 0,
                  },
                ]}
                onPress={() => setIsSettingsExpanded(!isSettingsExpanded)}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.textSecondary + "10" },
                  ]}
                >
                  <Ionicons
                    name="settings-outline"
                    size={18}
                    color={Theme.textSecondary}
                  />
                </View>
                <Text style={[styles.menuItemText, { flex: 1 }]}>
                  Settings
                </Text>
                <Ionicons
                  name={
                    isSettingsExpanded ? "chevron-down" : "chevron-forward"
                  }
                  size={18}
                  color={Theme.textSecondary}
                />
              </TouchableOpacity>

              {isSettingsExpanded && (
                <View style={styles.subMenuContainer}>
                  {canAccessStoreSettings() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        setIsSettingsVisible(true);
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.textSecondary + "10" },
                        ]}
                      >
                        <Ionicons
                          name="storefront-outline"
                          size={18}
                          color={Theme.textSecondary}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>
                        Store Settings
                      </Text>
                    </TouchableOpacity>
                  )}

                  {canAccessStoreSettings() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/general-settings" as any);
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.primary + "10" },
                        ]}
                      >
                        <Ionicons
                          name="options-outline"
                          size={18}
                          color={Theme.primary}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>
                        General Settings
                      </Text>
                    </TouchableOpacity>
                  )}

                  {canAccessReceiptSettings() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/company-settings" as any);
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.primary + "10" },
                        ]}
                      >
                        <Ionicons
                          name="receipt-outline"
                          size={18}
                          color={Theme.primary}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>
                        Receipt Settings
                      </Text>
                    </TouchableOpacity>
                  )}

                  {canAccessStoreSettings() && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.subMenuItem}
                      onPress={() => {
                        setIsMenuVisible(false);
                        router.push("/terminal-settings" as any);
                      }}
                    >
                      <View
                        style={[
                          styles.menuIconContainer,
                          { backgroundColor: Theme.primary + "10" },
                        ]}
                      >
                        <Ionicons
                          name="hardware-chip-outline"
                          size={18}
                          color={Theme.primary}
                        />
                      </View>
                      <Text style={styles.subMenuItemText}>
                        Terminal Management
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/cash-drawer" as any);
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: "#16A34A10" },
                      ]}
                    >
                      <Ionicons name="cash-outline" size={18} color="#16A34A" />
                    </View>
                    <Text style={styles.subMenuItemText}>Cash Drawer</Text>
                  </TouchableOpacity>

                  {/* Table QR Codes */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/qr-generator" as any);
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: "#f97316" + "15" },
                      ]}
                    >
                      <Ionicons name="qr-code-outline" size={18} color="#f97316" />
                    </View>
                    <Text style={styles.subMenuItemText}>Table QR Codes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.subMenuItem}
                    onPress={() => {
                      setIsMenuVisible(false);
                      router.push("/customer-display" as any);
                    }}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: Theme.primary + "10" },
                      ]}
                    >
                      <Ionicons
                        name="desktop-outline"
                        size={18}
                        color={Theme.primary}
                      />
                    </View>
                    <Text style={styles.subMenuItemText}>Customer Display</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Legend in Menu for Mobile */}
              {!isTablet && (
                <>
                  <View style={styles.menuDivider} />
                  <View style={{ padding: 12 }}>
                    <Text
                      style={[
                        styles.menuUserRolePremium,
                        { marginBottom: 10, color: Theme.textPrimary },
                      ]}
                    >
                      Table Legend
                    </Text>
                    <View style={{ gap: 8 }}>
                      {[
                        { color: "#81C995", label: "Dining" },
                        { color: "#93C5FD", label: "Hold" },
                        { color: "#FCD34D", label: "Checkout" },
                        { color: "#FCA5A5", label: "Reserved" },
                        { color: "#C084FC", label: "Overtime" },
                      ].map((item) => (
                        <View key={item.label} style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              {
                                backgroundColor: item.color,
                                width: 10,
                                height: 10,
                              },
                            ]}
                          />
                          <Text style={[styles.legendText, { fontSize: 12 }]}>
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}

              <View style={styles.menuDivider} />

              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.menuItem, styles.logoutMenuItem]}
                onPress={() => {
                  setIsMenuVisible(false);
                  logout();
                  router.replace("/login");
                }}
              >
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: Theme.danger + "10" },
                  ]}
                >
                  <Ionicons
                    name="log-out-outline"
                    size={18}
                    color={Theme.danger}
                  />
                </View>
                <Text style={[styles.menuItemText, { color: Theme.danger }]}>
                  Logout
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Avatar Picker Modal */}
      <AvatarPickerModal
        visible={isAvatarModalVisible}
        onClose={() => setIsAvatarModalVisible(false)}
        onSelect={handleSelectAvatar}
        currentAvatarUrl={avatarUrl}
      />

      {/* 〰〰 Section Header Row (Hidden on Mobile Landscape) 〰〰 */}
      {(!isLandscape || isTablet) && (
        <View
          style={[
            styles.sectionHeader,
            !isTablet &&
            isLandscape && { paddingVertical: 4, paddingHorizontal: 14 },
          ]}
        >
          <View style={styles.sectionHeaderLeft}>
            <View
              style={[
                styles.sectionAccentBar,
                !isTablet && isLandscape && { height: 14 },
              ]}
            />
            <Text
              style={[
                styles.sectionHeaderTitle,
                !isTablet && isLandscape && { fontSize: 13 },
              ]}
            >
              {SECTION_LABELS[activeTab]}
            </Text>
            <View
              style={[
                styles.sectionCountBadge,
                !isTablet && isLandscape && { paddingVertical: 1 },
              ]}
            >
              <Text style={styles.sectionCountText}>
                {currentTables.length} tables
              </Text>
            </View>
            {occupiedCount > 0 && (
              <View
                style={[
                  styles.occupiedBadge,
                  !isTablet && isLandscape && { paddingVertical: 1 },
                ]}
              >
                <View style={styles.occupiedDot} />
                <Text style={styles.occupiedText}>
                  {occupiedCount} occupied
                </Text>
              </View>
            )}
          </View>

          {/* Legend - Only show on tablets directly on screen */}
          {isTablet && (
            <View style={styles.legend}>
              {[
                { color: "#81C995", label: "Dining" },
                { color: "#93C5FD", label: "Hold" },
                { color: "#FCD34D", label: "Checkout" },
                { color: "#FCA5A5", label: "Reserved" },
                { color: "#C084FC", label: "Overtime" },
              ].map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â• TABLE GRID â•â•â•â•â•â•â•â•â•â•â• */}
      {/* ═════════════ TABLE VISUAL FLOOR MAP ═════════════ */}
      {/* ═════════════ TABLE LAYOUT RENDERER ═════════════ */}
      {!hasCustomLayout ? (
        <FlatList
          data={currentTables}
          key={columns}
          numColumns={columns}
          keyExtractor={(item: TableItem) => item.id}
          renderItem={renderItem}
          columnWrapperStyle={{ gap: GAP }}
          getItemLayout={(data, index) => ({
            length: itemSize + GAP,
            offset: (itemSize + GAP) * Math.floor(index / columns),
            index,
          })}
          removeClippedSubviews={Platform.OS !== "web"}
          maxToRenderPerBatch={isTablet ? 20 : 10}
          windowSize={3}
          initialNumToRender={isTablet ? 30 : 15}
          contentContainerStyle={{
            gap: GAP,
            paddingHorizontal: PADDING,
            paddingBottom: isTablet ? 160 : 100,
            paddingTop: 8,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="grid-outline" size={48} color={Theme.border} />
              <Text style={styles.emptyText}>No tables found</Text>
              <TouchableOpacity onPress={fetchTables} style={styles.retryBtn}>
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={Theme.primary}
                />
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
        />
      ) : (
        <View style={{ flex: 1 }}>
          {currentTables.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="grid-outline" size={48} color={Theme.border} />
              <Text style={styles.emptyText}>No tables found</Text>
              <TouchableOpacity onPress={fetchTables} style={styles.retryBtn}>
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={Theme.primary}
                />
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1 }} onLayout={onContainerLayout}>
              <ScrollView 
                contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
              >
                <CanvasBackground
                  theme={backgroundTheme}
                  style={{
                    width: availableWidth,
                    height: canvasHeight * (availableWidth / 780),
                    borderRadius: 16,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  isCategory={true}
                >
                  {/* Subtle floor grid lines to align layout */}
                  {(() => {
                    let gridLineColor = "rgba(232, 224, 213, 0.4)";
                    if (backgroundTheme === "dark") gridLineColor = "rgba(255, 255, 255, 0.04)";
                    if (backgroundTheme === "emerald") gridLineColor = "rgba(255, 255, 255, 0.05)";
                    if (backgroundTheme === "grey") gridLineColor = "rgba(0, 0, 0, 0.06)";
                    if (backgroundTheme === "wood") gridLineColor = "rgba(255, 255, 255, 0.07)";
                    if (backgroundTheme === "light") gridLineColor = "rgba(0, 0, 0, 0.04)";

                    return (
                      <View style={{
                        position: "absolute",
                        top: 0, left: 0, right: 0, bottom: 0,
                      }} pointerEvents="none">
                        {Array.from({ length: 25 }).map((_, i) => (
                          <View key={`grid-h-${i}`} style={{
                            position: "absolute",
                            left: 0, right: 0, height: 1,
                            backgroundColor: gridLineColor,
                            top: (i + 1) * 30 * (availableWidth / 780)
                          }} />
                        ))}
                        {Array.from({ length: 32 }).map((_, i) => (
                          <View key={`grid-v-${i}`} style={{
                            position: "absolute",
                            top: 0, bottom: 0, width: 1,
                            backgroundColor: gridLineColor,
                            left: (i + 1) * 30 * (availableWidth / 780)
                          }} />
                        ))}
                      </View>
                    );
                  })()}

                  {/* Render each Table component placed absolute */}
                  {(() => {
                    const layoutScale = availableWidth / 780;

                    return currentTables.map((item, index) => {
                      const defaultX = (item.XPos || 30 + (index % 4) * 170) * layoutScale;
                      const defaultY = (item.YPos || 30 + Math.floor(index / 4) * 130) * layoutScale;

                      return (
                        <View
                          key={item.id}
                          style={{
                            position: "absolute",
                            left: defaultX,
                            top: defaultY,
                          }}
                        >
                          <TableItemComponent
                            tableId={item.id}
                            item={item}
                            itemSize={90}
                            activeTab={activeTab}
                            onPress={handleTablePress}
                            numberFont={numberFont}
                            smallFont={smallFont}
                            isTabletPortrait={!isLandscape && isTablet}
                            isAbsoluteLayout={true}
                            layoutScale={layoutScale}
                            backgroundTheme={backgroundTheme}
                          />
                        </View>
                      );
                    });
                  })()}
                </CanvasBackground>
              </ScrollView>
            </View>
        )}
      </View>
    )}
      {/* 〰〰〰〰〰〰〰〰〰〰〰 CUSTOMER GUEST & PAX MODAL 〰〰〰〰〰〰〰〰〰〰〰 */}
      <Modal
        visible={guestModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setGuestModalVisible(false);
          setPendingGuestItem(null);
        }}
      >
        <TouchableOpacity
          style={styles.centerOverlay}
          activeOpacity={1}
          onPress={() => {
            setGuestModalVisible(false);
            setPendingGuestItem(null);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => { }} // Stop propagation
            style={{
              backgroundColor: Theme.bgCard,
              padding: 24,
              borderRadius: Theme.radiusLg,
              width: isTablet ? 350 : "80%",
              elevation: 10,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontFamily: Fonts.bold,
                color: Theme.textPrimary,
                marginBottom: 16,
              }}
            >
              Table {pendingGuestItem?.label} details
            </Text>

            <Text
              style={{
                fontSize: 13,
                fontFamily: Fonts.semiBold,
                color: Theme.textSecondary,
                marginBottom: 6,
              }}
            >
              Enter Name (Optional - Max 9 chars)
            </Text>
            <TextInput
              style={{
                borderWidth: 1.5,
                borderColor: Theme.border,
                borderRadius: Theme.radiusMd,
                padding: 10,
                fontSize: 14,
                fontFamily: Fonts.regular,
                color: Theme.textPrimary,
                marginBottom: 16,
                backgroundColor: Theme.bgInput,
                outlineStyle: "none",
              } as any}
              placeholder="Guest Name"
              placeholderTextColor={Theme.textMuted}
              value={guestNameInput}
              onChangeText={setGuestNameInput}
              maxLength={9}
            />

            <Text
              style={{
                fontSize: 13,
                fontFamily: Fonts.semiBold,
                color: Theme.textSecondary,
                marginBottom: 6,
              }}
            >
              Pax / Persons (Optional)
            </Text>
            <TextInput
              style={{
                borderWidth: 1.5,
                borderColor: Theme.border,
                borderRadius: Theme.radiusMd,
                padding: 10,
                fontSize: 14,
                fontFamily: Fonts.regular,
                color: Theme.textPrimary,
                marginBottom: 24,
                backgroundColor: Theme.bgInput,
                outlineStyle: "none",
              } as any}
              placeholder="Number of persons"
              placeholderTextColor={Theme.textMuted}
              value={guestPaxInput}
              onChangeText={(text) =>
                setGuestPaxInput(text.replace(/[^0-9]/g, ""))
              }
              keyboardType="numeric"
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 12,
              }}
            >
              <TouchableOpacity
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: Theme.radiusMd,
                  borderWidth: 1.5,
                  borderColor: Theme.border,
                }}
                disabled={isSavingGuest}
                onPress={() => {
                  setGuestModalVisible(false);
                  if (pendingGuestItem) {
                    lastGuestOpenedTable = null;
                    proceedWithTable(pendingGuestItem, null);
                    setPendingGuestItem(null);
                  }
                }}
              >
                <Text
                  style={{
                    color: Theme.textSecondary,
                    fontFamily: Fonts.semiBold,
                    fontSize: 14,
                  }}
                >
                  Skip
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  backgroundColor: Theme.primary,
                  borderRadius: Theme.radiusMd,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                disabled={isSavingGuest}
                onPress={handleGuestSubmit}
              >
                <Text
                  style={{
                    color: "#FFF",
                    fontFamily: Fonts.bold,
                    fontSize: 14,
                  }}
                >
                  {isSavingGuest ? "Saving..." : "Enter"}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
           MOVE TABLE MODAL
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isMoveTableVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!isMovingTable) {
            setIsMoveTableVisible(false);
            setMoveSourceTable(null);
            setMoveDestTable(null);
            setMoveStep("source");
            setMoveSearchQuery("");
          }
        }}
      >
        <View style={styles.moveModalRoot}>
          {/* ── Header ── */}
          <View style={styles.moveModalHeader}>
            <TouchableOpacity
              style={styles.moveModalBackBtn}
              onPress={() => {
                if (
                  moveStep === "dest" &&
                  allTables.filter((t) => [1, 2, 3].includes(Number(t.Status)))
                    .length > 1
                ) {
                  setMoveStep("source");
                  setMoveDestTable(null);
                } else {
                  setIsMoveTableVisible(false);
                  setMoveSourceTable(null);
                  setMoveDestTable(null);
                  setMoveStep("source");
                  setMoveSearchQuery("");
                }
              }}
              disabled={isMovingTable}
            >
              <Ionicons name="arrow-back" size={22} color={Theme.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.moveModalTitle}>
                {moveStep === "source"
                  ? "Select Source Table"
                  : "Select Destination"}
              </Text>
              <Text style={styles.moveModalSubtitle}>
                {moveStep === "source"
                  ? "Which table are you moving FROM?"
                  : "Which table are you moving TO?"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.moveModalBackBtn}
              onPress={() => {
                setIsMoveTableVisible(false);
                setMoveSourceTable(null);
                setMoveDestTable(null);
                setMoveStep("source");
                setMoveSearchQuery("");
              }}
              disabled={isMovingTable}
            >
              <Ionicons name="close" size={22} color={Theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Source chip (shown in dest step) ── */}
          {moveStep === "dest" && moveSourceTable && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.moveSourceChip}
              onPress={() => {
                // Tap the FROM chip to go back and change source table
                if (!isMovingTable) {
                  setMoveStep("source");
                  setMoveDestTable(null);
                  setMoveSearchQuery("");
                }
              }}
            >
              <View style={styles.moveSourceChipInner}>
                <Ionicons
                  name="swap-horizontal-outline"
                  size={15}
                  color="#fff"
                />
                <Text style={styles.moveSourceChipLabel}>FROM</Text>
                <Text style={styles.moveSourceChipTable}>
                  Table {moveSourceTable.label}
                </Text>
                {moveSourceTable.totalAmount ? (
                  <Text style={styles.moveSourceChipAmt}>
                    ${Number(moveSourceTable.totalAmount).toFixed(2)}
                  </Text>
                ) : null}
                <Ionicons
                  name="chevron-down"
                  size={13}
                  color="rgba(255,255,255,0.75)"
                />
              </View>
              {moveDestTable && (
                <View style={styles.moveDestChipInner}>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={Theme.primary}
                  />
                  <Text style={styles.moveDestChipLabel}>TO</Text>
                  <Text style={styles.moveDestChipTable}>
                    Table {moveDestTable.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* ── Search bar ── */}
          <View style={styles.moveSearchBar}>
            <Ionicons name="search-outline" size={18} color={Theme.textMuted} />
            <TextInput
              style={styles.moveSearchInput}
              placeholder={
                moveStep === "source"
                  ? "Search occupied table..."
                  : "Search available table..."
              }
              placeholderTextColor={Theme.textMuted}
              value={moveSearchQuery}
              onChangeText={setMoveSearchQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {moveSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setMoveSearchQuery("")}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Theme.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Section tabs (only shown in dest step) ── */}
          {moveStep === "dest" && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moveSectionTabsContent}
              style={styles.moveSectionTabsRow}
            >
              {SECTIONS.map((sec) => {
                const isAct = moveActiveSection === sec;
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[
                      styles.moveSectionTab,
                      isAct && styles.moveSectionTabActive,
                    ]}
                    onPress={() => {
                      setMoveActiveSection(sec);
                      setMoveSearchQuery("");
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={SECTION_ICONS[sec] as any}
                      size={13}
                      color={isAct ? "#fff" : Theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.moveSectionTabText,
                        isAct && styles.moveSectionTabTextActive,
                      ]}
                    >
                      {SECTION_SHORT[sec]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* ── Table grid ── */}
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={styles.moveTableGrid}
            numColumns={columns}
            key={
              moveStep === "source"
                ? `src-${columns}`
                : `dst-${moveActiveSection}-${columns}`
            }
            data={(() => {
              const q = moveSearchQuery.toLowerCase().trim();

              // Helper to get fresh data from our global reactive store for the modal list
              const getRealTimeTable = (t: TableItem): TableItem => {
                const tableData = useTableStatusStore.getState().tableMap[t.id];
                if (!tableData) return t;
                const statusMap: Record<string, number> = {
                  EMPTY: 0,
                  SENT: 1,
                  BILL_REQUESTED: 2,
                  HOLD: 3,
                  LOCKED: 5,
                };
                return {
                  ...t,
                  Status:
                    statusMap[tableData.status] !== undefined
                      ? statusMap[tableData.status]
                      : t.Status,
                  totalAmount:
                    tableData.totalAmount !== undefined
                      ? tableData.totalAmount
                      : t.totalAmount,
                  customerName:
                    tableData.customerName !== undefined
                      ? tableData.customerName
                      : t.customerName,
                  pax: tableData.pax !== undefined ? tableData.pax : t.pax,
                  currentOrderId:
                    tableData.orderId !== "EMPTY" &&
                      tableData.orderId !== "SYNC"
                      ? tableData.orderId
                      : t.currentOrderId,
                };
              };

              const realTimeTables = allTables.map(getRealTimeTable);

              if (moveStep === "source") {
                // Show only occupied tables (1=Dining, 2=Checkout, 3=Hold)
                let list = realTimeTables.filter((t) =>
                  [1, 2, 3].includes(Number(t.Status)),
                );
                if (q)
                  list = list.filter((t) => t.label.toLowerCase().includes(q));
                return list.sort((a, b) =>
                  a.label.localeCompare(b.label, undefined, { numeric: true }),
                );
              } else {
                // Show only available tables in selected section
                const secNum =
                  moveActiveSection === "TAKEAWAY"
                    ? 4
                    : moveActiveSection === "SECTION_1"
                      ? 1
                      : moveActiveSection === "SECTION_2"
                        ? 2
                        : 3;
                let list = realTimeTables.filter(
                  (t) =>
                    t.DiningSection === secNum &&
                    Number(t.Status) === 0 &&
                    t.id !== moveSourceTable?.id,
                );
                if (q)
                  list = list.filter((t) => t.label.toLowerCase().includes(q));
                return list.sort((a, b) =>
                  a.label.localeCompare(b.label, undefined, { numeric: true }),
                );
              }
            })()}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.moveEmptyState}>
                <Ionicons
                  name={
                    moveStep === "source"
                      ? "restaurant-outline"
                      : "checkmark-circle-outline"
                  }
                  size={44}
                  color={Theme.textMuted}
                />
                <Text style={styles.moveEmptyText}>
                  {moveStep === "source"
                    ? "No occupied tables found"
                    : "No available tables in this section"}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelectedSrc = item.id === moveSourceTable?.id;
              const isSelectedDst = item.id === moveDestTable?.id;
              const occupied = moveStep === "source";
              const statusUi = getStatusUI(Number(item.Status), item.DiningSection);

              return (
                <TouchableOpacity
                  activeOpacity={0.75}
                  style={[
                    styles.moveTableCard,
                    occupied && {
                      borderColor: statusUi.color,
                      borderWidth: 2,
                      backgroundColor: statusUi.lightBg,
                    },
                    isSelectedSrc && styles.moveTableCardSelectedSrc,
                    isSelectedDst && styles.moveTableCardSelectedDst,
                  ]}
                  onPress={() => {
                    if (moveStep === "source") {
                      // Toggle: tap same card to deselect, tap another to select & advance
                      if (isSelectedSrc) {
                        setMoveSourceTable(null);
                      } else {
                        setMoveSourceTable(item);
                        setMoveStep("dest");
                        setMoveDestTable(null);
                        setMoveSearchQuery("");
                        setMoveActiveSection(
                          getSectionFromDiningSection(item.DiningSection),
                        );
                      }
                    } else {
                      setMoveDestTable(isSelectedDst ? null : item);
                    }
                  }}
                >
                  {/* Selection ring */}
                  {(isSelectedSrc || isSelectedDst) && (
                    <View
                      style={[
                        styles.moveTableCheckBadge,
                        isSelectedDst && { backgroundColor: Theme.primary },
                      ]}
                    >
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}

                  <Text
                    style={[
                      styles.moveTableCardNumber,
                      occupied && { color: statusUi.color },
                      isSelectedDst && { color: Theme.primary },
                    ]}
                  >
                    {item.label}
                  </Text>

                  {/* Status chip (source step) */}
                  {occupied && (
                    <View
                      style={[
                        styles.moveTableStatusChip,
                        { borderColor: statusUi.color },
                      ]}
                    >
                      <Text
                        style={[
                          styles.moveTableStatusText,
                          { color: statusUi.color },
                        ]}
                      >
                        {statusUi.text}
                      </Text>
                    </View>
                  )}

                  {/* Amount (source step) */}
                  {occupied && Number(item.totalAmount) > 0 && (
                    <Text
                      style={[styles.moveTableAmt, { color: statusUi.color }]}
                    >
                      ${Number(item.totalAmount).toFixed(2)}
                    </Text>
                  )}

                  {/* Available indicator (dest step) */}
                  {!occupied && <View style={styles.moveAvailDot} />}

                  {/* Section label (source step — cross-section visibility) */}
                  {occupied && (
                    <Text style={styles.moveTableSection}>
                      {
                        SECTION_SHORT[
                        getSectionFromDiningSection(item.DiningSection)
                        ]
                      }
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />

          {/* ── Bottom confirm bar ── */}
          {moveStep === "dest" && moveDestTable && (
            <View style={styles.moveConfirmBar}>
              <View style={styles.moveConfirmInfo}>
                <Text style={styles.moveConfirmLabel}>Transfer</Text>
                <View style={styles.moveConfirmRoute}>
                  <View style={styles.moveConfirmTableChip}>
                    <Ionicons
                      name="grid-outline"
                      size={13}
                      color={Theme.primary}
                    />
                    <Text style={styles.moveConfirmTableNo}>
                      Table {moveSourceTable?.label}
                    </Text>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={Theme.textMuted}
                  />
                  <View
                    style={[
                      styles.moveConfirmTableChip,
                      {
                        backgroundColor: Theme.primaryLight,
                        borderColor: Theme.primaryBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name="grid-outline"
                      size={13}
                      color={Theme.primary}
                    />
                    <Text
                      style={[
                        styles.moveConfirmTableNo,
                        { color: Theme.primary },
                      ]}
                    >
                      Table {moveDestTable.label}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.moveConfirmBtn,
                  isMovingTable && { opacity: 0.65 },
                ]}
                disabled={isMovingTable}
                onPress={handleMoveTable}
                activeOpacity={0.8}
              >
                {isMovingTable ? (
                  <Text style={styles.moveConfirmBtnText}>Transferring...</Text>
                ) : (
                  <>
                    <Text style={styles.moveConfirmBtnText}>Transfer Now</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <StoreSettingsModal
        visible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
      />

      {/* Notifications Modal */}
      <Modal
        visible={isNotifModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          useNotificationStore.getState().clearNotifications();
          setIsNotifModalVisible(false);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          useNotificationStore.getState().clearNotifications();
          setIsNotifModalVisible(false);
        }}>
          <View style={{
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.3)",
            justifyContent: "flex-start",
            alignItems: isTablet ? "flex-end" : "center",
            paddingTop: isTablet ? 70 : 100,
            paddingRight: isTablet ? 24 : 0,
          }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                width: isTablet ? 380 : "90%",
                maxHeight: 500,
                elevation: 10,
                shadowColor: "#0F172A",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                overflow: "hidden",
              }}>
                {/* Modal Header */}
                <View style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F1F5F9",
                  backgroundColor: "#F8FAFC",
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="notifications-outline" size={20} color={Theme.primary} />
                    <Text style={{ fontSize: 16, fontFamily: Fonts.bold, color: "#0F172A" }}>
                      Notifications
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {unreadCount > 0 && (
                      <TouchableOpacity onPress={() => {
                        markAllAsRead();
                        showToast({ type: "success", message: "All Read", subtitle: "Notifications marked as read." });
                      }}>
                        <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Theme.primary }}>
                          Read All
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => {
                      useNotificationStore.getState().clearNotifications();
                      setIsNotifModalVisible(false);
                    }}>
                      <Ionicons name="close" size={22} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Modal Content */}
                <ScrollView
                  contentContainerStyle={{ padding: 16, gap: 10 }}
                  showsVerticalScrollIndicator={false}
                >
                  {notifications.length === 0 ? (
                    <View style={{
                      paddingVertical: 40,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}>
                      <View style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: "#F1F5F9",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        <Ionicons name="notifications-off-outline" size={26} color="#94A3B8" />
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: "#64748B" }}>
                        No new notifications
                      </Text>
                    </View>
                  ) : (
                    notifications.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        onPress={() => {
                          // If it is a QR order, we can close modal and help them locate the table
                          setIsNotifModalVisible(false);
                          if (item.tableNo && item.section) {
                            const sectionMap: Record<string, string> = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
                            const normalizedSection = sectionMap[String(item.section)] || item.section;
                            setActiveTab(normalizedSection);
                            showToast({
                              type: "info",
                              message: item.title,
                              subtitle: `Viewing ${normalizedSection.replace("_", " ")} Table ${item.tableNo}`,
                            });
                          }
                        }}
                        activeOpacity={0.8}
                        style={{
                          backgroundColor: item.read ? "#F8FAFC" : "#FFF7ED",
                          borderWidth: 1.2,
                          borderColor: item.read ? "#E2E8F0" : "#FED7AA",
                          borderRadius: 12,
                          padding: 12,
                          flexDirection: "row",
                          gap: 10,
                        }}
                      >
                        <View style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: item.read ? "#F1F5F9" : "#FFEDD5",
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <Ionicons
                            name={item.type === "QR_ORDER" ? "qr-code-outline" : "information-circle-outline"}
                            size={18}
                            color={item.read ? "#64748B" : Theme.primary}
                          />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: "#0F172A" }}>
                              {item.title}
                            </Text>
                            <Text style={{ fontSize: 10, fontFamily: Fonts.medium, color: "#94A3B8" }}>
                              {item.time}
                            </Text>
                          </View>
                          {item.type === "QR_ORDER" ? (
                            <View style={{ gap: 4, marginTop: 2, alignItems: "flex-start" }}>
                              <Text style={{ fontSize: 11, fontFamily: Fonts.medium, color: "#64748B" }}>
                                Order #{item.orderId ? item.orderId.split("-").pop() : "Order"}
                              </Text>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontFamily: Fonts.bold,
                                  color: Theme.primary,
                                  backgroundColor: "#FFF7ED",
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: "#FFEDD5",
                                }}>
                                  {item.tableNo ? `${item.section || "DINING"} • Table ${item.tableNo}` : item.message.split("submitted for")[1]?.trim() || item.message}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 11, fontFamily: Fonts.medium, color: "#475569" }} numberOfLines={2}>
                              {item.message}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            useNotificationStore.getState().removeNotification(item.id);
                          }}
                          style={{
                            padding: 4,
                            alignSelf: "flex-start",
                          }}
                        >
                          <Ionicons name="close" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>

                {/* Modal Footer */}
                {notifications.length > 0 && (
                  <View style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderTopWidth: 1,
                    borderTopColor: "#F1F5F9",
                    backgroundColor: "#F8FAFC",
                    alignItems: "center",
                  }}>
                    <TouchableOpacity
                      onPress={() => {
                        useNotificationStore.getState().clearNotifications();
                        showToast({ type: "success", message: "Cleared", subtitle: "All notifications cleared." });
                      }}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        backgroundColor: "#F1F5F9",
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: "#ef4444" }}>
                        Clear All
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* General Settings Modal */}

      {/* Floating AI Chat Assistant Button */}
      {user?.role === "ADMIN" && (
        <TouchableOpacity
          style={[
            styles.floatingAiBtn,
            {
              bottom: Math.max(insets.bottom, 16) + 16,
              right: Math.max(insets.right, 16) + 16,
            },
          ]}
          onPress={() => router.push("/ai-chat")}
          activeOpacity={0.8}
        >
          <Ionicons name="sparkles" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Calendar Modal for Business Date */}
      <Modal
        visible={showBusinessCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBusinessCalendar(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setShowBusinessCalendar(false)}
        >
          <View style={styles.centerOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={{
                  backgroundColor: Theme.bgCard,
                  padding: 20,
                  borderRadius: Theme.radiusLg,
                  width: 350,
                  elevation: 10,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 15,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontFamily: Fonts.bold,
                      color: Theme.textPrimary,
                    }}
                  >
                    Select Business Date
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowBusinessCalendar(false)}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
                <CalendarPicker
                  selectedDate={
                    selectedBusinessDate || getSingaporeDateString()
                  }
                  onDateChange={async (date) => {
                    setSelectedBusinessDate(date);
                    setShowBusinessCalendar(false);
                    try {
                      await AsyncStorage.setItem(
                        "selected_business_date",
                        date,
                      );
                      showToast({
                        type: "success",
                        message: "Date Saved",
                        subtitle: `Business date set to ${formatDateToDMY(date)}.`,
                      });
                    } catch (err) {
                      console.error("Failed to auto-save date:", err);
                    }
                  }}
                  onlyAllowToday={true}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {renderLicenseView(true)}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Theme.bgMain },
  floatingAiBtn: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 9999,
  },

  /* â”€â”€ Loading â”€â”€ */
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.bgMain,
  },
  loadingText: {
    color: Theme.textSecondary,
    marginTop: 12,
    fontFamily: Fonts.medium,
    fontSize: 15,
  },

  /* â”€â”€ Top Nav â”€â”€ */
  topNavContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: Theme.bgNav,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 12,
    ...Theme.shadowSm,
  },

  /* Tabs */
  tabsScrollView: { flex: 1, minWidth: 180 },
  tabsScrollContent: { alignItems: "center", paddingLeft: 20, paddingRight: 12 },
  tabsWrapper: { flexDirection: "row", alignItems: "center" },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Theme.radiusFull,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
    flexShrink: 0,
  },
  activeTabBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  tabText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.2,
  },
  activeTabText: { color: "#fff", fontFamily: Fonts.extraBold },

  tabBadge: {
    marginLeft: 6,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  activeTabBadge: { backgroundColor: "rgba(255,255,255,0.3)" },
  tabBadgeText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  activeTabBadgeText: { color: "#fff" },

  /* Right Action Buttons */
  navRightGroup: { flexDirection: "row", alignItems: "center" },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: Theme.radiusMd,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  salesBtn: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primaryBorder,
  },
  logoutBtn: {
    backgroundColor: Theme.dangerBg,
    borderColor: Theme.dangerBorder,
  },
  headerActionText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.extraBold,
    fontSize: 14,
  },

  /* â”€â”€ Section Header Row â”€â”€ */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Theme.bgMain,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionAccentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: Theme.primary,
  },
  sectionHeaderTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.extraBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  sectionCountBadge: {
    backgroundColor: Theme.bgMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  sectionCountText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
  },
  occupiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.successBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Theme.successBorder,
  },
  occupiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.success,
  },
  occupiedText: { color: "#15803D", fontFamily: Fonts.semiBold, fontSize: 11 },

  /* Legend */
  legend: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    color: Theme.textMuted,
    fontSize: 10,
    fontFamily: Fonts.medium,
  },

  /* â”€â”€ Table Card â”€â”€ */
  tableBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: "hidden",
    position: "relative",
    ...Theme.shadowSm,
  },
  tableContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  tableNumber: {
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginTop: 4,
    marginBottom: 2,
  },
  tableInfo: { alignItems: "center", gap: 2 },
  statusChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 1,
  },
  statusChipText: { fontFamily: Fonts.bold, letterSpacing: 0.3 },
  tableStats: { alignItems: "center", gap: 1 },
  timeText: { color: Theme.textSecondary, fontFamily: Fonts.medium },
  orderText: { color: Theme.textMuted, fontFamily: Fonts.regular },
  billText: { fontFamily: Fonts.black },
  lockedOverlay: { alignItems: "center", gap: 3, marginTop: 4 },
  lockedNameText: {
    color: "#B91C1C",
    fontFamily: Fonts.bold,
    marginTop: 1,
    textAlign: "center",
  },

  /* â”€â”€ Empty State â”€â”€ */
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 50,
    gap: 12,
  },
  emptyText: {
    color: Theme.textSecondary,
    fontSize: 16,
    marginBottom: 4,
    fontFamily: Fonts.medium,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primaryLight,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  retryText: { color: Theme.primary, fontFamily: Fonts.bold, fontSize: 14 },

  /* â”€â”€ User Chip â”€â”€ */
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.primaryLight,
    borderRadius: Theme.radiusMd,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 2,
  },
  userChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  userChipName: {
    color: Theme.primary,
    fontFamily: Fonts.bold,
    fontSize: 12,
    maxWidth: 100,
  },
  userChipRole: {
    color: Theme.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  /* ———— More Menu Modal ———— */
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 20,
  },
  centerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContent: {
    width: 260,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 10,
    ...Theme.shadowLg,
  },
  menuUserSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  menuUserSectionGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    margin: 4,
  },
  menuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  menuAvatarPremium: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF",
    borderWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowMd,
  },
  menuUserName: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  menuUserNamePremium: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: "#FFF",
  },
  menuUserRole: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  menuUserRolePremium: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "rgba(255, 255, 255, 0.8)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  subMenuContainer: {
    paddingLeft: 12,
    borderLeftWidth: 1.5,
    borderLeftColor: Theme.border,
    marginLeft: 26,
    marginVertical: 4,
    gap: 2,
  },
  subMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  subMenuItemText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Theme.textSecondary,
  },
  logoutMenuItem: {
    marginTop: 4,
  },
  inlineCheckoutBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "#fd7e14",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    ...Theme.shadowSm,
  },
  inlineCheckoutText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  holdOvertimeBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    padding: 2,
    zIndex: 10,
    ...Theme.shadowSm,
  },
  qrBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    padding: 2,
    zIndex: 10,
    ...Theme.shadowSm,
  },
  terminalProcessingBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 11,
  },
  terminalErrorBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },

  /* ──────────────────────────────────────────────────────────────────
   *  MOVE TABLE MODAL STYLES
   * ────────────────────────────────────────────────────────────────── */
  moveModalRoot: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  moveModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Theme.bgNav,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 8,
  },
  moveModalBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  moveModalTitle: {
    fontSize: 17,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  moveModalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    textAlign: "center",
    marginTop: 1,
  },

  /* Source chip banner */
  moveSourceChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Theme.bgNav,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 10,
    flexWrap: "wrap",
  },
  moveSourceChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  moveSourceChipLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.8,
  },
  moveSourceChipTable: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: "#fff",
  },
  moveSourceChipAmt: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "rgba(255,255,255,0.85)",
  },
  moveDestChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: Theme.primaryBorder,
  },
  moveDestChipLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.primary,
    letterSpacing: 0.8,
  },
  moveDestChipTable: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },

  /* Search bar */
  moveSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: Theme.bgNav,
    borderRadius: 14,

    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Theme.shadowSm,
  },
  moveSearchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Theme.textPrimary,
    padding: 0,
    outlineStyle: "none",
  } as any,

  /* Section tabs */
  moveSectionTabsRow: {
    flexGrow: 0,
    marginBottom: 4,
  },
  moveSectionTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  moveSectionTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  moveSectionTabActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  moveSectionTabText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  moveSectionTabTextActive: {
    color: "#fff",
  },

  /* Table grid */
  moveTableGrid: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 10,
  },
  moveTableCard: {
    flex: 1,
    margin: 4,
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    position: "relative",
    ...Theme.shadowSm,
  },
  moveTableCardSelectedSrc: {
    borderColor: Theme.primary,
    borderWidth: 2,
    backgroundColor: "#FFEFE2", // Solid light orange to fix Android elevation bug
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  moveTableCardSelectedDst: {
    borderColor: Theme.primary,
    borderWidth: 2.2,
    backgroundColor: "#FFF2E6", // Solid light orange to fix Android elevation bug
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  moveTableCheckBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.success,
    justifyContent: "center",
    alignItems: "center",
  },
  moveTableCardNumber: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  moveTableStatusChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 2,
  },
  moveTableStatusText: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    letterSpacing: 0.4,
  },
  moveTableAmt: {
    fontSize: 11,
    fontFamily: Fonts.black,
    marginTop: 2,
  },
  moveTableSection: {
    fontSize: 9,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  moveAvailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.success,
    marginTop: 3,
  },

  /* Empty state */
  moveEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  moveEmptyText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    textAlign: "center",
  },

  /* Confirm bottom bar */
  moveConfirmBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    backgroundColor: Theme.bgNav,
    borderTopWidth: 1.5,
    borderTopColor: Theme.border,
    gap: 14,
    ...Theme.shadowLg,
  },
  moveConfirmInfo: {
    flex: 1,
    gap: 4,
  },
  moveConfirmLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  moveConfirmRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  moveConfirmTableChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  moveConfirmTableNo: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  moveConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.primary,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: Theme.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  moveConfirmBtnText: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: "#fff",
    letterSpacing: 0.3,
  },
});
