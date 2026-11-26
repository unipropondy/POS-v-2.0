import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useActiveOrdersStore } from "../stores/activeOrdersStore";

const getTasteModifierText = (item: any) =>
  [
    item?.spicy && item.spicy !== "Medium" ? `Spicy: ${item.spicy}` : "",
    item?.salt && item.salt !== "Normal" ? `Salt: ${item.salt}` : "",
    item?.oil && item.oil !== "Normal" ? `Oil: ${item.oil}` : "",
    item?.sugar && item.sugar !== "Normal" ? `Sugar: ${item.sugar}` : "",
  ]
    .filter(Boolean)
    .join(" • ");

export type ComboChildDish = {
  childId: string;
  dishId: string;
  name: string;
  qty: number;
  status: "SENT" | "READY" | "SERVED";
  parentLineItemId: string;
  parentOrderId: string;
};

export const getComboChildDishes = (item: any, parentOrderId: string): ComboChildDish[] => {
  const parentQty = Number(item.qty || item.quantity || 1) || 1;
  const parentLineItemId = String(item.lineItemId || item.OrderDetailId || "").toLowerCase();
  let sels = item.comboSelections || item.combos || item.selectedCombos;
  if (!sels || (Array.isArray(sels) && sels.length === 0)) {
    const raw = item.ComboDetailsJSON || item.comboDetailsJSON;
    if (raw) {
      try {
        const p = typeof raw === "string" ? JSON.parse(raw) : raw;
        sels = Array.isArray(p) ? p : (p.groups || p.items || p.selections || []);
      } catch {
        sels = [];
      }
    }
  }
  if (!Array.isArray(sels) && typeof sels === "object" && sels !== null) {
    sels = sels.groups || sels.items || sels.selections || [];
  }

  const childStatuses = item.childStatuses || {};

  // If sels is empty, fallback to Description split (e.g. "Burger + Fries + Pepsi" or "Burger • Fries • Pepsi")
  if (!Array.isArray(sels) || sels.length === 0) {
    const desc = item.Description || item.description || item.note || item.notes;
    if (desc && typeof desc === "string" && !desc.toLowerCase().includes("combo promotion")) {
      const parts = desc.split(/[\+\|•\n,]/).map((s: string) => s.trim().replace(/^[\-\*\•]\s*/, "")).filter(Boolean);
      if (parts.length > 0) {
        return parts.map((dishName: string, idx: number) => {
          const childKey = `desc_${dishName.toLowerCase().replace(/\s+/g, '_')}`;
          const currentStatus = (childStatuses[childKey] || (item.status === "READY" ? "READY" : "SENT")) as "SENT" | "READY" | "SERVED";
          return {
            childId: childKey,
            dishId: `00000000-0000-0000-0000-${String(idx + 1).padStart(12, "0")}`,
            name: dishName,
            qty: parentQty,
            status: currentStatus,
            parentLineItemId,
            parentOrderId,
          };
        });
      }
    }
    return [];
  }

  const result: ComboChildDish[] = [];
  sels.forEach((g: any, gIdx: number) => {
    const choices = g.items || g.dishes || g.selections || g.selectedDishes || (Array.isArray(g) ? g : (g.name || g.DishName || g.itemName || g.dishName || typeof g === "string" ? [g] : []));
    if (Array.isArray(choices)) {
      choices.forEach((opt: any, optIdx: number) => {
        const dishName = (typeof opt === "string" ? opt : (opt.name || opt.DishName || opt.itemName || opt.dishName || "")).trim();
        if (!dishName) return;
        const rawDishId = typeof opt === "string" ? `item_${gIdx}_${optIdx}` : (opt.dishId || opt.DishId || opt.mappingId || `opt_${gIdx}_${optIdx}`);
        const cleanChildKey = String(rawDishId || dishName).toLowerCase();
        const currentStatus = (childStatuses[cleanChildKey] || opt.status || (item.status === "READY" ? "READY" : "SENT")) as "SENT" | "READY" | "SERVED";
        const singleQty = Number(opt.qty || opt.quantity || 1) || 1;
        result.push({
          childId: cleanChildKey,
          dishId: String(rawDishId || cleanChildKey),
          name: dishName,
          qty: singleQty * parentQty,
          status: currentStatus,
          parentLineItemId,
          parentOrderId,
        });
      });
    }
  });
  return result;
};

export default function KitchenStatusScreen() {
  const router = useRouter();
  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);
  const markItemServed = useActiveOrdersStore((s) => s.markItemServed);
  const markItemReady = useActiveOrdersStore((s) => s.markItemReady);
  const markChildDishStatus = useActiveOrdersStore((s) => s.markChildDishStatus);

  const handleServeAll = async (orderId: string, items: any[]) => {
    const readyItems = items.filter((i: any) => i.status === "READY");
    for (const item of readyItems) {
      await markItemServed(item.parentOrderId || orderId, item.lineItemId);
    }
  };
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const numColumns = width > 1000 ? 3 : width > 700 ? 2 : 1;



  React.useEffect(() => {
    const store = useActiveOrdersStore.getState();
    store.fetchActiveKitchenOrders();
    store.initializeSocketListeners();
  }, []);


  const groupedOrders = useMemo(() => {
    const tableGroups: Record<string, any> = {};

    activeOrders.forEach((order) => {
      const { context } = order;
      const groupKey = context.orderType === "DINE_IN" 
        ? `TABLE_${context.section}_${context.tableNo}`
        : `TAKEAWAY_${context.takeawayNo}`;

      if (!tableGroups[groupKey]) {
        tableGroups[groupKey] = {
          ...order,
          groupKey,
          items: []
        };
      }

      // Add items that are SENT, READY, or VOIDED
      order.items.forEach((i: any) => {
        if (i.status === "SENT" || i.status === "READY" || i.status === "VOIDED") {
          // Deduplicate items by lineItemId
          const exists = tableGroups[groupKey].items.find((ei: any) => ei.lineItemId === i.lineItemId);
          if (!exists) {
            tableGroups[groupKey].items.push({ ...i, parentOrderId: order.orderId });
          }
        }
      });
    });

    return Object.values(tableGroups)
      .filter(g => g.items.length > 0)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [activeOrders]);

  const renderOrderItem = (orderId: string, item: any) => {
    const isReady = item.status === "READY";
    const childDishes = getComboChildDishes(item, orderId);
    const isCombo = childDishes.length > 0;
    const rawItemName = String(
      item.name ||
      item.DishName ||
      item.dishName ||
      item.PromotionName ||
      item.Name ||
      item.ProductName ||
      (item.Description && !String(item.Description).includes("•") && !String(item.Description).includes("+") ? item.Description : "") ||
      ""
    ).trim();
    const itemName = (rawItemName && rawItemName !== "Dish")
      ? rawItemName
      : (isCombo ? "Combo Meal" : (item.Description ? String(item.Description).trim() : "Item"));

    if (isCombo) {
      return (
        <View key={item.lineItemId} style={[styles.itemRow, styles.comboRow, isReady && styles.itemReadyRow]}>
          <View style={{ flex: 1 }}>
            {/* Combo Parent Header */}
            <View style={styles.comboHeaderRow}>
              <View style={styles.itemTitle}>
                <Text style={styles.itemQty}>{item.qty}x</Text>
                <Text style={[styles.itemName, styles.comboParentName, item.status === "VOIDED" && styles.strikeThrough]}>
                  {itemName}
                </Text>
                <View style={styles.comboTag}>
                  <Text style={styles.comboTagText}>COMBO</Text>
                </View>
              </View>

              {isReady && (
                <Pressable
                  style={({ pressed }) => [
                    styles.servedBtn,
                    pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
                  ]}
                  onPress={() => markItemServed(orderId, item.lineItemId)}
                >
                  <Ionicons name="checkmark-done-circle" size={16} color="#FFF" />
                  <Text style={styles.servedBtnText}>SERVED</Text>
                </Pressable>
              )}
            </View>

            {(!!item.isTakeaway || !!item.IsTakeaway || !!item.isTakeAway) && (
              <View style={styles.takeawayBadge}>
                <Ionicons name="bag-handle" size={12} color="#FFF" />
                <Text style={styles.takeawayBadgeText}>PARCEL / TW</Text>
              </View>
            )}

            {/* Included Dish List */}
            <View style={styles.childDishesList}>
              {childDishes.map((child, idx) => {
                const isChildReady = child.status === "READY" || child.status === "SERVED";
                return (
                  <View
                    key={child.childId || `child-${idx}`}
                    style={[styles.childDishRow, isChildReady && styles.childDishReadyRow]}
                  >
                    <View style={styles.childDishInfo}>
                      <Text style={styles.childBullet}>•</Text>
                      <Text style={[styles.childDishName, isChildReady && styles.childDishNameReady]}>
                        {child.name}
                      </Text>
                      <Text style={styles.childDishQty}>({child.qty}x)</Text>
                    </View>

                    <Pressable
                      style={[
                        styles.statusBadge,
                        styles.childStatusBadge,
                        isChildReady ? styles.statusBadgeReady : styles.statusBadgePrep,
                      ]}
                      onPress={() => {
                        const nextStatus = isChildReady ? "SENT" : "READY";
                        markChildDishStatus(orderId, item.lineItemId, child.childId, nextStatus);
                      }}
                    >
                      <Ionicons
                        name={isChildReady ? "notifications" : "restaurant"}
                        size={12}
                        color="#FFF"
                      />
                      <Text style={styles.statusBadgeText}>
                        {isChildReady ? "READY" : "COOKING"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {item.modifiers
              ?.filter((m: any) => {
                const id = m.ModifierId || m.modifierId || m.ModifierID || m.modifierID;
                const name = (m.ModifierName || m.modifierName || "").trim().toUpperCase();
                const price = Number(m.Price || m.price || m.Amount || m.amount || 0);
                if (price > 0) return true;
                return id !== "00000000-0000-0000-0000-000000000001" && !name.startsWith("INSTR:");
              })
              .map((m: any, idx: number) => (
                <Text key={idx} style={styles.modifierText}>
                  • {m.ModifierName || m.modifierName}
                </Text>
              ))}
            {getTasteModifierText(item) ? (
              <Text style={styles.modifierText}>{getTasteModifierText(item)}</Text>
            ) : null}
            {item.note ? (
              <View style={styles.noteContainer}>
                <Ionicons name="chatbox-ellipses" size={12} color={Theme.danger} />
                <Text style={styles.noteText}>{item.note}</Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    }

    return (
      <View key={item.lineItemId} style={[styles.itemRow, isReady && styles.itemReadyRow]}>
        <View style={styles.itemMain}>
          <View style={styles.itemTitle}>
            <Text style={styles.itemQty}>{item.qty}x</Text>
            <Text style={[styles.itemName, item.status === "VOIDED" && styles.strikeThrough]}>
              {itemName}
            </Text>
          </View>
          {(!!item.isTakeaway || !!item.IsTakeaway || !!item.isTakeAway) && (
            <View style={styles.takeawayBadge}>
              <Ionicons name="bag-handle" size={12} color="#FFF" />
              <Text style={styles.takeawayBadgeText}>PARCEL / TW</Text>
            </View>
          )}
          {item.modifiers?.filter((m: any) => {
            const id = m.ModifierId || m.modifierId || m.ModifierID || m.modifierID;
            const name = (m.ModifierName || m.modifierName || "").trim().toUpperCase();
            const price = Number(m.Price || m.price || m.Amount || m.amount || 0);
            if (price > 0) return true;
            return id !== "00000000-0000-0000-0000-000000000001" && !name.startsWith("INSTR:");
          }).map((m: any, idx: number) => (
            <Text key={idx} style={styles.modifierText}>• {m.ModifierName || m.modifierName}</Text>
          ))}
          {getTasteModifierText(item) ? (
            <Text style={styles.modifierText}>{getTasteModifierText(item)}</Text>
          ) : null}
          {item.note ? (
            <View style={styles.noteContainer}>
              <Ionicons name="chatbox-ellipses" size={12} color={Theme.danger} />
              <Text style={styles.noteText}>{item.note}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Pressable
            style={[styles.statusBadge, isReady ? styles.statusBadgeReady : styles.statusBadgePrep]}
            onPress={() => {
              if (!isReady) {
                markItemReady(orderId, item.lineItemId);
              }
            }}
          >
            <Ionicons 
              name={isReady ? "notifications" : "restaurant"} 
              size={12} 
              color="#FFF" 
            />
            <Text style={styles.statusBadgeText}>
              {isReady ? "READY" : "COOKING"}
            </Text>
          </Pressable>

          {isReady && (
            <Pressable 
              style={({ pressed }) => [
                styles.servedBtn,
                pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }
              ]}
              onPress={() => markItemServed(orderId, item.lineItemId)}
            >
              <Ionicons name="checkmark-done-circle" size={16} color="#FFF" />
              <Text style={styles.servedBtnText}>SERVED</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderOrderCard = ({ item }: { item: any }) => {
    let readyCount = 0;
    let totalCount = 0;
    item.items.forEach((i: any) => {
      if (i.status === "VOIDED") return;
      const childDishes = getComboChildDishes(i, item.orderId);
      if (childDishes.length > 0) {
        totalCount += childDishes.length;
        readyCount += childDishes.filter((c) => c.status === "READY" || c.status === "SERVED").length;
      } else {
        totalCount += 1;
        if (i.status === "READY" || i.status === "SERVED") {
          readyCount += 1;
        }
      }
    });
    const isDineIn = item.context.orderType === "DINE_IN";

    return (
      <View style={[styles.orderCard, { flex: 1 / numColumns }]}>
        <View style={[styles.orderHeader, isDineIn ? styles.headerDineIn : styles.headerTakeaway]}>
          <View style={styles.headerInfo}>
            <View style={styles.iconCircle}>
              <Ionicons 
                name={isDineIn ? "restaurant" : "bag-handle"} 
                size={18} 
                color={isDineIn ? Theme.primary : Theme.warning} 
              />
            </View>
            <View>
              <Text style={styles.tableNumber}>
                {isDineIn ? `Table ${item.context.tableNo}` : `Order #${item.context.takeawayNo}`}
              </Text>
              <Text style={styles.orderId}>#{item.orderId.length > 20 ? item.orderId.slice(-8) : item.orderId}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {readyCount > 0 && (
                <Pressable
                  style={({ pressed }) => [
                    styles.serveAllBtn,
                    pressed && { opacity: 0.7 }
                  ]}
                  onPress={() => handleServeAll(item.orderId, item.items)}
                >
                  <Text style={styles.serveAllBtnText}>SERVE ALL</Text>
                </Pressable>
              )}
              <View style={styles.orderStats}>
                <Text style={styles.statsText}>{readyCount}/{totalCount} READY</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.itemsContainer}>
          {item.items.map((i: any) => renderOrderItem(i.parentOrderId || item.orderId, i))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)/category')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
        </Pressable>
        <View style={styles.titleContainer}>
          <Ionicons name="clipboard" size={20} color={Theme.primary} />
          <Text style={styles.title}>Kitchen Status</Text>
        </View>
        {groupedOrders.some(order => order.items.some((i: any) => i.status === "READY")) ? (
          <TouchableOpacity
            onPress={async () => {
              for (const order of groupedOrders) {
                const readyItems = order.items.filter((i: any) => i.status === "READY");
                for (const item of readyItems) {
                  await markItemServed(item.parentOrderId || order.orderId, item.lineItemId);
                }
              }
            }}
            style={styles.globalServeAllBtn}
          >
            <Ionicons name="checkmark-done-circle" size={20} color="#FFF" />
            <Text style={styles.globalServeAllBtnText}>Serve All</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        data={groupedOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item: any) => item?.orderId || Math.random().toString()}
        numColumns={numColumns}
        key={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="restaurant-outline" size={60} color={Theme.textMuted} />
            </View>
            <Text style={styles.emptyText}>All orders served! 🎉</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F0EBE3" }, // Warm Stone background to match Theme.bgMuted
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bgNav,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    letterSpacing: -0.5,
  },
  list: { padding: 16, paddingBottom: 60 },
  columnWrapper: { gap: 16 },
  orderCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    ...Theme.shadowMd,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "50",
  },
  headerDineIn: { backgroundColor: "#F0F9FF" }, // Soft Blue
  headerTakeaway: { backgroundColor: "#FFFBEB" }, // Soft Amber
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    ...Theme.shadowSm,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  tableNumber: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimary,
  },
  orderId: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  orderTime: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  orderStats: {
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  statsText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
  },
  itemsContainer: { padding: 16 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "50",
  },
  itemReadyRow: {
    backgroundColor: "#F0FDF4",
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  comboRow: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  comboHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  comboParentName: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  comboTag: {
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  comboTagText: {
    fontSize: 9,
    fontFamily: Fonts.black,
    color: "#C2410C",
  },
  childDishesList: {
    marginTop: 8,
    marginLeft: 26,
    gap: 6,
  },
  childDishRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  childDishReadyRow: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  childDishInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  childBullet: {
    fontSize: 16,
    color: Theme.primary,
    fontWeight: "900",
  },
  childDishName: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  childDishNameReady: {
    color: "#15803D",
  },
  childDishQty: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  childStatusBadge: {
    minWidth: 80,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  itemMain: { flex: 1, marginRight: 12 },
  itemTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemQty: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  itemName: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flex: 1,
  },
  strikeThrough: {
    textDecorationLine: 'line-through',
    opacity: 0.4,
  },
  modifierText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginLeft: 34,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    minWidth: 90,
    justifyContent: "center",
  },
  statusBadgePrep: { backgroundColor: "#3B82F6" },
  statusBadgeReady: { backgroundColor: "#22C55E" },
  statusBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: Fonts.black,
    letterSpacing: 0.5,
  },
  servedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary, // Brand Orange
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    ...Theme.shadowSm,
  },
  servedBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: Fonts.black,
    letterSpacing: 0.5,
  },
  takeawayBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: Theme.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
    marginLeft: 34,
  },
  takeawayBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginLeft: 34,
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Theme.danger,
  },
  noteText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.danger,
    flex: 1,
  },
  emptyContainer: {
    marginTop: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    ...Theme.shadowMd,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  serveAllBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    ...Theme.shadowSm,
  },
  serveAllBtnText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  globalServeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    ...Theme.shadowSm,
  },
  globalServeAllBtnText: {
    color: "#FFF",
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
});
