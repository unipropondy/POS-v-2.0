import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import { io, Socket } from "socket.io-client";
import { API, BASE_URL } from "@/config";
import BillPDFGenerator from "../components/BillPDFGenerator";
import BillPrompt from "../components/BillPrompt";
import UniversalPrinter from "../components/UniversalPrinter";

const thankyouFoodImg = require("../assets/images/thankyou_food.png");

// Scalloped checkmark badge with radiating rays matching reference design
function ScallopedCheckBadge() {
  return (
    <View style={styles.badgeWrapper}>
      <Svg width={140} height={56} viewBox="0 0 140 56">
        {/* Left radiating rays */}
        <Line x1="16" y1="17" x2="32" y2="23" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <Line x1="10" y1="30" x2="28" y2="30" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <Line x1="16" y1="43" x2="32" y2="37" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />

        {/* Center 12-scallop rosette badge */}
        <G transform="translate(45, 3)">
          <Path
            d="M 25.0 -0.5 Q 25.0 -0.5 27.6 2.4 Q 30.3 5.2 34.0 4.0 Q 37.8 2.9 38.6 6.7 Q 39.5 10.5 43.3 11.3 Q 47.1 12.2 46.0 15.9 Q 44.8 19.7 47.6 22.4 Q 50.5 25.0 47.6 27.6 Q 44.8 30.3 46.0 34.0 Q 47.1 37.7 43.3 38.6 Q 39.5 39.5 38.6 43.3 Q 37.8 47.1 34.0 46.0 Q 30.3 44.8 27.6 47.6 Q 25.0 50.5 22.4 47.6 Q 19.7 44.8 16.0 46.0 Q 12.3 47.1 11.4 43.3 Q 10.5 39.5 6.7 38.6 Q 2.9 37.8 4.0 34.0 Q 5.2 30.3 2.4 27.6 Q -0.5 25.0 2.4 22.4 Q 5.2 19.7 4.0 15.9 Q 2.9 12.2 6.7 11.3 Q 10.5 10.5 11.3 6.7 Q 12.2 2.9 15.9 4.0 Q 19.7 5.2 22.4 2.4 Z"
            fill="#ffffff"
          />
          {/* Checkmark */}
          <Path
            d="M 17 25 L 23 31 L 33 19"
            stroke="#ea580c"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>

        {/* Right radiating rays */}
        <Line x1="124" y1="17" x2="108" y2="23" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <Line x1="130" y1="30" x2="112" y2="30" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <Line x1="124" y1="43" x2="108" y2="37" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

// Orange ticket icon with cloche dome inside matching reference model
function TicketClocheIcon() {
  return (
    <Svg width={66} height={66} viewBox="0 0 64 64" fill="none">
      {/* Ticket outline with top notch and zigzag bottom */}
      <Path
        d="M 12 12 H 27 M 37 12 H 52 V 48 L 47 43 L 42 48 L 37 43 L 32 48 L 27 43 L 22 48 L 17 43 L 12 48 Z"
        stroke="#ea580c"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Top alignment dots */}
      <Circle cx={21} cy={18} r={1.5} fill="#ea580c" />
      <Circle cx={43} cy={18} r={1.5} fill="#ea580c" />
      {/* Cloche handle */}
      <Circle cx={32} cy={23} r={2.5} fill="#ea580c" />
      {/* Cloche dome cover */}
      <Path
        d="M 21 34 C 21 26 43 26 43 34 Z"
        stroke="#ea580c"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cloche tray plate */}
      <Line
        x1={18}
        y1={37.5}
        x2={46}
        y2={37.5}
        stroke="#ea580c"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

type Props = {
  orderId?: string | null;
  tableNo?: string;
  tableId?: string;
  isKiosk?: boolean;
  showActionButtons?: boolean;
  extraCharge?: number;
  initialItems?: any[];
  subtotal?: number;
  serviceCharge?: number;
  takeawayCharge?: number;
  gst?: number;
  total?: number;
  isSelfCollect?: boolean;
  isTentNumber?: boolean;
  onReturnToOrder?: () => void;
};

// Status definitions exactly matching React web SettlementSuccess.js
const STATUS_STEPS = [
  {
    code: 2,
    label: "Order Preparing",
    message: "Your order is being prepared and will be ready soon.",
    emoji: "🍲",
    color: "#f97316",
  },
  {
    code: 3,
    label: "Order Ready",
    message: "Your order is ready. Please collect it.",
    emoji: "✅",
    color: "#22c55e",
  },
  {
    code: 4,
    label: "Completed",
    message: "Thank you! Your order has been completed.",
    emoji: "✔️",
    color: "#6366f1",
  },
];

function getActiveStep(statusCode: number) {
  const code = Number(statusCode);
  if (code >= 4) return 2; // Completed
  if (code === 3) return 1; // Ready
  return 0; // Preparing (1 or 2)
}

const STATUS_LABEL_MAP: Record<number, string> = {
  1: "NEW",
  2: "PREPARING",
  3: "READY",
  4: "COMPLETED",
};

const STATUS_COLOR_MAP: Record<number, string> = {
  1: "#94a3b8",
  2: "#f97316",
  3: "#22c55e",
  4: "#6366f1",
};

export default function SettlementSuccessScreen({
  orderId: initialOrderId,
  tableNo: initialTableNo,
  tableId: initialTableId,
  isKiosk = true,
  showActionButtons = true,
  extraCharge: initialExtraCharge = 0,
  initialItems = [],
  subtotal: initialSubtotal,
  serviceCharge: initialServiceCharge,
  takeawayCharge: initialTakeawayCharge,
  gst: initialGst,
  total: initialTotal,
  isSelfCollect = false,
  isTentNumber = false,
  onReturnToOrder,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();

  const [orderId, setOrderId] = useState<string | null>(initialOrderId || null);
  const [tableNo, setTableNo] = useState<string>(initialTableNo || "");
  const [tableId, setTableId] = useState<string>(initialTableId || "");
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [statusCode, setStatusCode] = useState<number>(2); // default: 2 (PREPARING)
  const [orderStatus, setOrderStatus] = useState<"PREPARING" | "READY">("PREPARING");

  // Pulsing animation for real-time status indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (orderStatus === "PREPARING") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.35,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [orderStatus, pulseAnim]);

  // Order Details popup state - kept false so modal does not block screen
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>(initialItems || []);
  const [extraCharge, setExtraCharge] = useState<number>(initialExtraCharge || 0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const autoReturnTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const hasReturnedRef = useRef(false);
  const hasAutoPreviewedRef = useRef(false);

  // Read stored values if not passed as props
  useEffect(() => {
    const readStorage = async () => {
      try {
        if (!orderId) {
          const storedOrder =
            (await AsyncStorage.getItem("kioskOrderId")) ||
            (await AsyncStorage.getItem("orderId"));
          if (storedOrder) setOrderId(storedOrder);
        }
        if (!isSelfCollect) {
          const storedTable = await AsyncStorage.getItem("tableNo");
          if (storedTable) setTableNo(storedTable);
        }
        if (!tableId) {
          const storedTid = await AsyncStorage.getItem("tableId");
          if (storedTid) setTableId(storedTid);
        }
      } catch (err) {
        console.log("Error reading storage:", err);
      }
    };
    readStorage();
  }, [orderId, tableNo, tableId]);

  // Load Order Details & Live Status by Order Number (e.g. 0031) or ID
  const loadOrderDetails = useCallback(async () => {
    const lookupKey = orderNumber || orderId || "";
    if (!lookupKey) return;

    try {
      // 1. Fetch live status via dedicated status endpoint using order number
      const statusRes = await fetch(
        `${API}/order/status/${encodeURIComponent(lookupKey)}`
      ).catch(() => null);

      if (statusRes && statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData && statusData.success) {
          if (statusData.orderNumber) {
            setOrderNumber(String(statusData.orderNumber).trim());
          }
          if (statusData.isReady || statusData.status === "READY" || statusData.statusCode >= 3) {
            setOrderStatus("READY");
            setStatusCode(3);
          } else {
            setOrderStatus("PREPARING");
            setStatusCode(2);
          }
          return;
        }
      }

      // 2. Fallback to order-details
      const res = await fetch(
        `${API}/order/order-details/${encodeURIComponent(lookupKey)}`
      );
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const dbOrderNumber = data[0]?.OrderNumber;
        if (dbOrderNumber) {
          setOrderNumber(String(dbOrderNumber).trim());
        }

        const dbTableNo = data[0]?.Tableno || data[0]?.tableNo;
        if (!isSelfCollect && dbTableNo) {
          setTableNo(String(dbTableNo).trim());
        }

        const isAnyReady = data.some(
          (d: any) =>
            Number(d.StatusCode || 2) >= 3 ||
            String(d.StatusLabel || "").toUpperCase() === "READY" ||
            String(d.StatusLabel || "").toUpperCase() === "SERVED"
        );

        if (isAnyReady) {
          setOrderStatus("READY");
          setStatusCode(3);
        } else {
          setOrderStatus("PREPARING");
          setStatusCode(2);
        }
      }
    } catch (err) {
      console.log("Failed to load order details:", err);
    }
  }, [orderId, orderNumber]);

  const handleReturn = useCallback(async () => {
    if (hasReturnedRef.current) return;
    hasReturnedRef.current = true;
    if (autoReturnTimerRef.current) clearTimeout(autoReturnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    try {
      await AsyncStorage.multiRemove([
        "kioskOrderId",
        "kioskOrderType",
        "orderId",
        "tableId",
        "tableNo",
      ]);
      await AsyncStorage.setItem("returnToKioskStart", "true");
    } catch (e) {
      console.log("Error clearing storage on return:", e);
    }
    if (onReturnToOrder) {
      onReturnToOrder();
    }
  }, [onReturnToOrder]);

  // Load Items List for Modal
  const loadOrderItems = useCallback(async () => {
    if (!orderId) return;
    if (orderItems.length > 0) return; // Keep existing items if passed
    setItemsLoading(true);

    try {
      const res = await fetch(`${API}/order/order-items/${orderId}`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.items) && data.items.length > 0) {
        setOrderItems(data.items);
      }
    } catch (err) {
      console.log("Failed to load order items:", err);
    } finally {
      setItemsLoading(false);
    }
  }, [orderId, orderItems.length]);

  const calculatedItemsTotal = (orderItems || []).reduce(
    (sum: number, item: any) => sum + Number(item.LineTotal || (Number(item.PricePerUnit || item.price || item.Price || 0) * Number(item.Quantity || item.qty || 1))),
    0
  );

  const grandTotal = calculatedItemsTotal + Number(extraCharge || 0);

  const handlePrintReceipt = useCallback(async (isAuto = false) => {
    setIsPrinting(true);
    setShowPrintPrompt(false);
    try {
      // Ensure items are loaded
      let currentItems = orderItems;
      if (!currentItems || currentItems.length === 0) {
        const res = await fetch(`${API}/order/order-items/${orderId}`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.items)) {
          currentItems = data.items;
          setOrderItems(currentItems);
        }
      }

      const calculatedSubtotal = (currentItems || []).reduce(
        (sum: number, item: any) => sum + Number(item.LineTotal || (Number(item.PricePerUnit || item.price || item.Price || 0) * Number(item.Quantity || item.qty || 1))),
        0
      );

      const resolvedSubtotal = initialSubtotal !== undefined ? initialSubtotal : calculatedSubtotal;
      const resolvedTotal = initialTotal !== undefined ? initialTotal : (grandTotal > 0 ? grandTotal : (calculatedSubtotal + Number(extraCharge || 0)));

      const saleData = {
        orderId: orderNumber || orderId,
        invoiceNumber: orderNumber || orderId,
        tableNo: isSelfCollect ? "" : tableNo,
        isSelfCollect,
        isTentNumber,
        isKiosk: true,
        items: (currentItems || []).map((item: any) => ({
          name: item.DishName || item.Name || item.name || "Item",
          quantity: Number(item.Quantity || item.qty || 1),
          price: Number(item.PricePerUnit ?? item.price ?? item.Price ?? 0),
          modifiers: item.modifiers || [],
        })),
        extraCharge: Number(extraCharge || 0),
        subtotal: resolvedSubtotal,
        serviceCharge: initialServiceCharge !== undefined ? initialServiceCharge : 0,
        takeawayCharge: initialTakeawayCharge !== undefined ? initialTakeawayCharge : 0,
        gst: initialGst !== undefined ? initialGst : 0,
        total: resolvedTotal,
        paymentMethod: "PAID",
      };

      // Direct Kiosk receipt printer (PrinterType 5) via backend spooler/bridge or native device
      await UniversalPrinter.smartPrint(saleData, undefined, undefined, undefined, 5);
    } catch (e: any) {
      console.log("Print error:", e);
      if (!isAuto) {
        Alert.alert("Print Error", e.message || "Failed to print receipt.");
      }
    } finally {
      setIsPrinting(false);
    }
  }, [orderId, orderNumber, tableNo, orderItems, grandTotal, extraCharge, initialSubtotal, initialServiceCharge, initialTakeawayCharge, initialGst, initialTotal]);

  // ── REAL-TIME SOCKET LISTENER: Live Order Status from Kitchen / KDS ──
  useEffect(() => {
    let socket: Socket | null = null;
    try {
      const socketUrl =
        BASE_URL ||
        (typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "http://localhost:5000");

      socket = io(socketUrl, {
        transports: ["polling", "websocket"],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 4000,
        timeout: 10000,
      });

      const handleLiveStatusChange = (data: any) => {
        if (!data) return;
        const incomingId = String(data.orderId || data.orderNumber || data.OrderNumber || "").trim();
        const incomingSuffix = incomingId ? incomingId.replace(/\D/g, "").slice(-4) : "";
        const myFullId = String(orderNumber || orderId || "").trim();
        const mySuffix = myFullId ? myFullId.replace(/\D/g, "").slice(-4) : "";

        // Check if event is for this order
        const isMatch =
          !incomingId ||
          (incomingId && myFullId && (incomingId === myFullId || myFullId.includes(incomingId) || incomingId.includes(myFullId))) ||
          (incomingSuffix && mySuffix && incomingSuffix === mySuffix);

        if (isMatch) {
          console.log("🔔 [Live Status Socket] Real-time status event received:", data);
          const rawStatus = String(data.status || data.StatusLabel || data.statusCode || data.StatusCode || "").toUpperCase();
          if (rawStatus === "READY" || rawStatus === "3" || rawStatus === "SERVED" || rawStatus === "4") {
            setOrderStatus("READY");
            setStatusCode(3);
          } else if (rawStatus === "PREPARING" || rawStatus === "2" || rawStatus === "SENT" || rawStatus === "NEW" || rawStatus === "1") {
            setOrderStatus("PREPARING");
            setStatusCode(2);
          }
        }
      };

      socket.on("item_status_updated", handleLiveStatusChange);
      socket.on("order_status_updated", handleLiveStatusChange);
      socket.on("order_status_update", handleLiveStatusChange);
    } catch (sockErr) {
      console.warn("Socket live status initialization warning:", sockErr);
    }

    return () => {
      if (socket) {
        socket.off("item_status_updated");
        socket.off("order_status_updated");
        socket.off("order_status_update");
        socket.disconnect();
      }
    };
  }, [orderId, orderNumber]);

  // Fast polling fallback & Auto-return countdown timer (10 seconds)
  useEffect(() => {
    loadOrderDetails();
    loadOrderItems();

    // Fast 3-second polling ensures status updates even if socket drops
    const interval = setInterval(loadOrderDetails, 3000);

    // 10-second countdown tick for UI
    setCountdown(10);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Exactly 10-second auto-return timer to Start Over
    autoReturnTimerRef.current = setTimeout(() => {
      handleReturn();
    }, 10000);

    return () => {
      clearInterval(interval);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (autoReturnTimerRef.current) clearTimeout(autoReturnTimerRef.current);
    };
  }, [loadOrderDetails, loadOrderItems, handleReturn]);

  const handleOpenOrderDetails = () => {
    setShowOrderDetails(true);
    loadOrderItems();
  };

  // Auto-print receipt on order success (matches Car Wash kiosk implementation)
  const hasAutoPrintedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      handlePrintReceipt(true);
    }
  }, [handlePrintReceipt]);

  const handleSharePDF = async () => {
    try {
      let currentItems = orderItems;
      if (!currentItems || currentItems.length === 0) {
        const res = await fetch(`${API}/order/order-items/${orderId}`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.items)) {
          currentItems = data.items;
          setOrderItems(currentItems);
        }
      }

      const saleData = {
        orderId: orderNumber || orderId,
        invoiceNumber: orderNumber || orderId,
        tableNo,
        items: currentItems.map((item: any) => ({
          name: item.DishName || item.Name || item.name || "Item",
          quantity: Number(item.Quantity || item.qty || 1),
          price: Number(item.PricePerUnit ?? item.price ?? item.Price ?? 0),
          modifiers: item.modifiers || [],
        })),
        total: grandTotal,
        paymentMethod: "PAID",
      };

      await UniversalPrinter.sharePDF(saleData);
    } catch (e: any) {
      console.log("Share PDF error:", e);
      Alert.alert("PDF Error", e.message || "Failed to generate receipt PDF.");
    }
  };



  // Determine display number
  const effectiveNumber = orderNumber || orderId || "";
  const orderSuffix = effectiveNumber
    ? String(effectiveNumber).replace(/\D/g, "").slice(-4) || effectiveNumber
    : "----";

  const isReady = orderStatus === "READY" || statusCode >= 3;
  const isLandscape = screenWidth >= 768;

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0.35, 1],
    outputRange: [0.93, 1.07],
  });

  const renderCardContent = () => (
    <View style={styles.cardContent}>
      {/* Scalloped check badge with radiating rays */}
      <ScallopedCheckBadge />

      {/* Heading & Subtitle */}
      <Text style={styles.thankYouHeading}>Thank You!</Text>
      <Text style={styles.orderSubtitle}>Your order has been placed successfully.</Text>

      {/* Order Number White Card */}
      <TouchableOpacity
        style={styles.orderNumberCard}
        activeOpacity={0.92}
        onPress={handleOpenOrderDetails}
      >
        <View style={styles.cardLeftIcon}>
          <TicketClocheIcon />
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardRightInfo}>
          <Text style={styles.cardOrderLabel}>Your Order No.</Text>
          <Text style={styles.cardOrderNum}>{orderSuffix}</Text>
        </View>
      </TouchableOpacity>

      {/* 3-Step Horizontal Stepper */}
      <View style={styles.stepperContainer}>
        {/* Step 1: Order Placed */}
        <View style={styles.stepItem}>
          <View style={styles.stepCirclePlaced}>
            <Ionicons name="checkmark" size={20} color="#ffffff" />
          </View>
          <Text style={styles.stepLabel}>Order Placed</Text>
        </View>

        {/* Connector 1 */}
        <View style={[styles.stepConnectorLine, styles.stepConnectorActive]} />

        {/* Step 2: Preparing */}
        <View style={styles.stepItem}>
          <Animated.View
            style={[
              styles.stepCirclePreparing,
              isReady ? styles.stepCirclePreparingDone : null,
              !isReady ? { transform: [{ scale: pulseScale }] } : null,
            ]}
          >
            {isReady ? (
              <Ionicons name="checkmark" size={20} color="#ea580c" />
            ) : (
              <MaterialCommunityIcons name="chef-hat" size={24} color="#ea580c" />
            )}
          </Animated.View>
          <Text style={[styles.stepLabel, !isReady && styles.stepLabelActive]}>
            Preparing
          </Text>
        </View>

        {/* Connector 2 */}
        <View
          style={[
            styles.stepConnectorLine,
            isReady ? styles.stepConnectorActive : styles.stepConnectorPending,
          ]}
        />

        {/* Step 3: Ready */}
        <View style={styles.stepItem}>
          <View
            style={[
              styles.stepCircleReady,
              isReady && styles.stepCircleReadyActive,
            ]}
          >
            <Ionicons
              name={isReady ? "checkmark-circle" : "bag-handle"}
              size={20}
              color={isReady ? "#16a34a" : "rgba(255, 255, 255, 0.85)"}
            />
          </View>
          <Text style={[styles.stepLabel, isReady && styles.stepLabelReady]}>
            Ready
          </Text>
        </View>
      </View>

      {/* Notice Capsule */}
      <View style={styles.noticeCapsule}>
        <MaterialCommunityIcons
          name="receipt"
          size={18}
          color="#ffffff"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.noticeText}>
          {isReady
            ? "Your order is ready! Please collect your receipt."
            : "Please collect your receipt."}
        </Text>
      </View>

      {/* Start New Order Button */}
      <TouchableOpacity
        style={styles.newOrderBtn}
        onPress={handleReturn}
        activeOpacity={0.88}
      >
        <Ionicons
          name="reload"
          size={20}
          color="#ea580c"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.newOrderBtnText}>
          Start New Order {countdown > 0 ? `(${countdown}s)` : ""}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Ambient soft background curves */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Path
            d="M 500 -120 C 700 0, 900 180, 1200 90 L 1200 -120 Z"
            fill="rgba(255, 255, 255, 0.05)"
          />
          <Path
            d="M 700 800 C 850 650, 1000 620, 1200 680 L 1200 800 Z"
            fill="rgba(255, 255, 255, 0.05)"
          />
        </Svg>
      </View>

      {isLandscape ? (
        <View style={styles.landscapeContainer}>
          {/* Left: Food plate illustration anchored to left */}
          <View style={styles.foodColLandscape}>
            <Image
              source={thankyouFoodImg}
              style={styles.foodImageLandscape}
              resizeMode="cover"
            />
          </View>

          {/* Right: Confirmation flow */}
          <View style={styles.contentColLandscape}>
            {renderCardContent()}
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.portraitScrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.foodColPortrait}>
            <Image
              source={thankyouFoodImg}
              style={styles.foodImagePortrait}
              resizeMode="contain"
            />
          </View>
          <View style={styles.contentColPortrait}>
            {renderCardContent()}
          </View>
        </ScrollView>
      )}

      {/* Bill Prompt Dialog */}
      <BillPrompt
        visible={showPrintPrompt}
        total={grandTotal}
        onPrintBill={handlePrintReceipt}
        onSkip={() => setShowPrintPrompt(false)}
        onClose={() => setShowPrintPrompt(false)}
      />

      {/* Order Details Modal (Bottom sheet / centered popup) */}
      <Modal
        visible={showOrderDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIconWrap}>
                <Text style={styles.modalHeaderIcon}>📋</Text>
              </View>
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={styles.modalTitle}>Order Details</Text>
                {!!orderNumber && (
                  <Text style={styles.modalSubtitle}>Order #{orderNumber}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowOrderDetails(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Modal Body */}
            <View style={styles.modalBody}>
              {itemsLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color="#f97316" />
                  <Text style={styles.loadingText}>Loading your order…</Text>
                </View>
              ) : orderItems.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyIcon}>🍽️</Text>
                  <Text style={styles.emptyText}>No items found for this order.</Text>
                </View>
              ) : (
                <>
                  {/* Column Header */}
                  <View style={styles.colHeader}>
                    <Text style={[styles.colHeaderText, { flex: 2 }]}>ITEM</Text>
                    <Text style={[styles.colHeaderText, { width: 44, textAlign: "center" }]}>QTY</Text>
                    <Text style={[styles.colHeaderText, { width: 70, textAlign: "right" }]}>PRICE</Text>
                    <Text style={[styles.colHeaderText, { width: 70, textAlign: "right" }]}>TOTAL</Text>
                  </View>

                    <ScrollView style={styles.itemsScroll}>
                    {orderItems.map((item: any, idx: number) => {
                      const itemName = item.DishName || item.Name || item.name || "Item";
                      const itemQty = Number(item.Quantity || item.qty || 1);
                      const itemPrice = Number(item.PricePerUnit ?? item.price ?? item.Price ?? 0);
                      const itemTotal = Number(item.LineTotal ?? item.TotalDetailLineAmount ?? (itemPrice * itemQty));
                      const statusLabel =
                        STATUS_LABEL_MAP[item.StatusCode] || "PREPARING";
                      const statusColor =
                        STATUS_COLOR_MAP[item.StatusCode] || "#94a3b8";

                      return (
                        <View
                          key={item.OrderDetailId || item.id || idx}
                          style={styles.itemRow}
                        >
                          <View style={{ flex: 2, paddingRight: 8 }}>
                            <Text style={styles.itemName}>{itemName}</Text>
                            {!!item.Remarks && (
                              <Text style={styles.itemRemarks}>
                                📝 {item.Remarks}
                              </Text>
                            )}
                            <View
                              style={[
                                styles.itemStatusBadge,
                                {
                                  backgroundColor: `${statusColor}22`,
                                  borderColor: `${statusColor}55`,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.itemStatusText,
                                  { color: statusColor },
                                ]}
                              >
                                {statusLabel}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.itemQty}>×{itemQty}</Text>
                          <Text style={styles.itemPrice}>
                            ${itemPrice.toFixed(2)}
                          </Text>
                          <Text style={styles.itemTotal}>
                            ${itemTotal.toFixed(2)}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>

                  {/* Breakdown & Extra Charge */}
                  {Number(extraCharge) > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Subtotal</Text>
                      <Text style={styles.breakdownValue}>${calculatedItemsTotal.toFixed(2)}</Text>
                    </View>
                  )}
                  {Number(extraCharge) > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Service / Extra Charge</Text>
                      <Text style={styles.breakdownValue}>+${Number(extraCharge).toFixed(2)}</Text>
                    </View>
                  )}

                  {/* Grand Total */}
                  <View style={styles.grandTotalRow}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalValue}>
                      ${grandTotal.toFixed(2)}
                    </Text>
                  </View>

                  {/* Modal Action Buttons: Print & Share & Close */}
                  <View style={styles.modalActionsRow}>
                    <TouchableOpacity
                      style={styles.modalPrintBtn}
                      onPress={() => handlePrintReceipt(false)}
                      disabled={isPrinting}
                      activeOpacity={0.8}
                    >
                      {isPrinting ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Text style={styles.modalPrintBtnIcon}>🖨️</Text>
                          <Text style={styles.modalPrintBtnText}>Print Bill</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalShareBtn}
                      onPress={handleSharePDF}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalShareBtnIcon}>📤</Text>
                      <Text style={styles.modalShareBtnText}>Share PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalDoneBtn}
                      onPress={() => setShowOrderDetails(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalDoneBtnText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ea580c",
  },
  landscapeContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  foodColLandscape: {
    width: "36%",
    height: "100%",
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden",
  },
  foodImageLandscape: {
    width: "100%",
    height: "94%",
    maxWidth: 440,
  },
  contentColLandscape: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  portraitScrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
  },
  foodColPortrait: {
    width: "100%",
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  foodImagePortrait: {
    width: "90%",
    height: "100%",
  },
  contentColPortrait: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  cardContent: {
    width: "100%",
    maxWidth: 490,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  thankYouHeading: {
    fontSize: 42,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 4,
    textShadowColor: "rgba(0, 0, 0, 0.12)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  orderSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.95)",
    textAlign: "center",
    marginBottom: 20,
  },
  orderNumberCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: "100%",
    maxWidth: 440,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 20,
  },
  cardLeftIcon: {
    justifyContent: "center",
    alignItems: "center",
    width: 68,
  },
  cardDivider: {
    width: 1.5,
    height: 52,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 18,
  },
  cardRightInfo: {
    flex: 1,
    justifyContent: "center",
  },
  cardOrderLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 2,
  },
  cardOrderNum: {
    fontSize: 52,
    fontWeight: "900",
    color: "#ea580c",
    letterSpacing: -0.5,
    lineHeight: 56,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 440,
    marginBottom: 20,
  },
  stepItem: {
    alignItems: "center",
    width: 86,
  },
  stepCirclePlaced: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  stepCirclePreparing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#fef3c7",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  stepCirclePreparingDone: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  stepCircleReady: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  stepCircleReadyActive: {
    backgroundColor: "#ffffff",
    borderColor: "#22c55e",
    borderWidth: 2.5,
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    textAlign: "center",
  },
  stepLabelActive: {
    fontWeight: "800",
  },
  stepLabelReady: {
    fontWeight: "800",
    color: "#ffffff",
  },
  stepConnectorLine: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    marginTop: -18,
    marginHorizontal: -4,
  },
  stepConnectorActive: {
    backgroundColor: "#ffffff",
  },
  stepConnectorPending: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  noticeCapsule: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 22,
    width: "100%",
    maxWidth: 440,
    marginBottom: 18,
  },
  noticeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    textAlign: "center",
  },
  newOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 36,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  newOrderBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ea580c",
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    width: "100%",
    maxWidth: 580,
    maxHeight: "85%",
    paddingBottom: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  modalHeaderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderIcon: {
    fontSize: 20,
  },
  modalHeaderTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1e293b",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 44,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  colHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.6,
  },
  itemsScroll: {
    maxHeight: 320,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1e293b",
  },
  itemRemarks: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  itemStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  itemStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  itemQty: {
    width: 44,
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  itemPrice: {
    width: 70,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "right",
  },
  itemTotal: {
    width: 70,
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "right",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: "#ea580c",
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ea580c",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  breakdownLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    alignItems: "center",
  },
  modalPrintBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ea580c",
    borderRadius: 14,
    paddingVertical: 12,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  modalPrintBtnIcon: {
    fontSize: 16,
  },
  modalPrintBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  modalShareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 12,
  },
  modalShareBtnIcon: {
    fontSize: 15,
  },
  modalShareBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  modalDoneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDoneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
});

