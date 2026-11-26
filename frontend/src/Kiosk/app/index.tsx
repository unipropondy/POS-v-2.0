import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { API } from "@/config";
import KioskStartPage from "./KioskStartPage";
import LoginPage from "./LoginPage";
import OrderingScreen from "./OrderingScreen";
import SettlementSuccessScreen from "./SettlementSuccessScreen";

type ScreenState = "start" | "ordering" | "settlement_success";

type CompletedOrderMetadata = {
  items?: any[];
  extraCharge?: number;
  totalAmount?: number;
  tableNo?: string;
  tableId?: string;
  isSelfCollect?: boolean;
  isTentNumber?: boolean;
  subtotal?: number;
  serviceCharge?: number;
  takeawayCharge?: number;
  gst?: number;
  total?: number;
  [key: string]: any;
};

type IndexProps = {
  onBackToPOS?: () => void;
};

export default function Index({ onBackToPOS }: IndexProps = {}) {
  const [currentPage, setCurrentPage] = useState<ScreenState>("start");
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [completedOrderMeta, setCompletedOrderMeta] = useState<CompletedOrderMetadata | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Initial launch: ensure clean state and session check before revealing screen
    const checkSession = async () => {
      try {
        const storedTableId = await AsyncStorage.getItem("tableId");
        const storedTableNo = await AsyncStorage.getItem("tableNo");
        const storedKioskOrder = await AsyncStorage.getItem("kioskOrderId");

        // 🛡️ Auto-release any lingering/abandoned session from an earlier crash or page refresh
        if (storedTableId || storedTableNo || storedKioskOrder) {
          fetch(`${API}/order/kiosk/cancel-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId: storedTableId,
              tableNo: storedTableNo,
              orderNumber: storedKioskOrder,
            }),
          }).catch(() => {});

          await AsyncStorage.multiRemove([
            "kioskOrderId",
            "tableId",
            "tableNo",
            "kioskCarNumber",
            "kioskCustomerName",
            "kioskCustomerVehicleId",
            "kioskDefaultDishId",
            "kioskOrderType",
            "kioskAppliedPromotion",
            "kioskCart",
            "orderId",
            "returnToKioskStart",
            "kioskIsNewSession",
          ]);
          if (typeof window !== "undefined") {
            try {
              localStorage.removeItem("kioskAppliedPromotion");
              localStorage.removeItem("kioskCart");
              localStorage.removeItem("kioskOrderId");
            } catch (_) {}
          }
        }
      } catch (err) {
        console.error("Error checking initial session:", err);
      } finally {
        // Small graceful pause so fonts/layout settle smoothly without flicker
        setTimeout(() => {
          setIsInitializing(false);
        }, 350);
      }
    };
    checkSession();
  }, []);

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <View style={styles.logoBadge}>
            <Image
              source={require("./assets/images/app_logo.png")}
              style={{ width: 44, height: 44, borderRadius: 22 }}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>
            SMART <Text style={styles.brandAccent}>POS</Text>
          </Text>
          <Text style={styles.brandSubtitle}>Restaurant & Cafe Kiosk</Text>
          <ActivityIndicator size="large" color="#ff5722" style={styles.spinner} />
          <Text style={styles.loadingText}>Starting system...</Text>
        </View>
      </View>
    );
  }

  if (currentPage === "settlement_success") {
    return (
      <SettlementSuccessScreen
        orderId={completedOrderId}
        tableNo={completedOrderMeta?.tableNo}
        tableId={completedOrderMeta?.tableId}
        isSelfCollect={completedOrderMeta?.isSelfCollect}
        isTentNumber={completedOrderMeta?.isTentNumber}
        initialItems={completedOrderMeta?.items || []}
        extraCharge={completedOrderMeta?.extraCharge || 0}
        subtotal={completedOrderMeta?.subtotal}
        serviceCharge={completedOrderMeta?.serviceCharge}
        takeawayCharge={completedOrderMeta?.takeawayCharge}
        gst={completedOrderMeta?.gst}
        total={completedOrderMeta?.total}
        showActionButtons={true}
        onReturnToOrder={async () => {
          try {
            await AsyncStorage.multiRemove([
              "kioskOrderId",
              "tableId",
              "tableNo",
              "kioskCarNumber",
              "kioskCustomerName",
              "kioskCustomerVehicleId",
              "kioskDefaultDishId",
              "kioskOrderType",
              "kioskAppliedPromotion",
              "kioskCart",
              "orderId",
              "returnToKioskStart",
              "kioskIsNewSession",
            ]);
            if (typeof window !== "undefined") {
              try {
                localStorage.removeItem("kioskAppliedPromotion");
                localStorage.removeItem("kioskCart");
                localStorage.removeItem("kioskOrderId");
              } catch (_) {}
            }
          } catch (_) {}
          setCompletedOrderId(null);
          setCompletedOrderMeta(null);
          setCurrentPage("start");
        }}
      />
    );
  }

  if (currentPage === "ordering") {
    return (
      <OrderingScreen
        onOrderCompleted={(orderId, metadata) => {
          setCompletedOrderId(orderId);
          setCompletedOrderMeta(metadata || null);
          setCurrentPage("settlement_success");
        }}
        onLogout={async () => {
          try {
            const storedTableId = await AsyncStorage.getItem("tableId");
            const storedTableNo = await AsyncStorage.getItem("tableNo");
            const storedKioskOrder = await AsyncStorage.getItem("kioskOrderId");

            // 🛡️ Explicitly cancel Kiosk session and release Table in TableMaster to AVAILABLE (Status 0)
            if (storedTableId || storedTableNo || storedKioskOrder) {
              fetch(`${API}/order/kiosk/cancel-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tableId: storedTableId,
                  tableNo: storedTableNo,
                  orderNumber: storedKioskOrder,
                }),
              }).catch(() => {});
            }

            await AsyncStorage.multiRemove([
              "kioskOrderId",
              "tableId",
              "tableNo",
              "kioskCarNumber",
              "kioskCustomerName",
              "kioskCustomerVehicleId",
              "kioskDefaultDishId",
              "kioskOrderType",
              "kioskAppliedPromotion",
              "kioskCart",
              "orderId",
              "returnToKioskStart",
              "kioskIsNewSession",
            ]);
            if (typeof window !== "undefined") {
              try {
                localStorage.removeItem("kioskAppliedPromotion");
                localStorage.removeItem("kioskCart");
                localStorage.removeItem("kioskOrderId");
              } catch (_) {}
            }
          } catch (_) {}
          setCurrentPage("start");
        }}
      />
    );
  }

  if (currentPage === "start") {
    return (
      <KioskStartPage
        onStart={(user, selectedTable) => {
          console.log("Kiosk session started for user:", user, selectedTable);
          setCurrentPage("ordering");
        }}
        onBackToLogin={onBackToPOS}
      />
    );
  }

  return (
    <KioskStartPage
      onStart={(user, selectedTable) => {
        console.log("Kiosk session started for user:", user, selectedTable);
        setCurrentPage("ordering");
      }}
      onBackToLogin={onBackToPOS}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#101827",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 32,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#ff5722",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: "#ffffff",
    shadowColor: "#ff5722",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  restaurantIcon: {
    fontSize: 34,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  brandAccent: {
    color: "#ff5722",
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#6b7280",
    marginTop: 4,
    marginBottom: 20,
    textAlign: "center",
  },
  spinner: {
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4b5563",
    textAlign: "center",
  },
});


