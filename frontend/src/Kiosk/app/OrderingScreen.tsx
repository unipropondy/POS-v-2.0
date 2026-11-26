import { API } from "@/config";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const cardPaymentImg = require("../assets/images/card_visa_mastercard.jpg");
const payNowPaymentImg = require("../assets/images/paynow_logo.png");

const generateBizOrderId = (orderId: string | null) =>
  orderId || `YP${Date.now()}`;

const formatData = (dataList: any[], numCols: number) => {
  if (numCols <= 1 || !Array.isArray(dataList)) return dataList;
  const list = [...dataList];
  const totalRows = Math.floor(list.length / numCols);
  let totalLastRow = list.length - totalRows * numCols;
  while (totalLastRow !== 0 && totalLastRow !== numCols) {
    list.push({ DishId: `blank-${totalLastRow}`, empty: true });
    totalLastRow++;
  }
  return list;
};

const parseDescriptionBullets = (desc?: string): string[] => {
  if (!desc) return [];
  const trimmed = desc.trim();
  if (!trimmed) return [];

  if (trimmed.includes("+")) {
    return trimmed
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (trimmed.includes("|")) {
    return trimmed
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (trimmed.includes("\n")) {
    return trimmed
      .split("\n")
      .map((s) => s.trim().replace(/^[•\-\*]\s*/, ""))
      .filter(Boolean);
  }

  if (trimmed.includes("•")) {
    return trimmed
      .split("•")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (trimmed.includes(".")) {
    const parts = trimmed
      .split(".")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  return [trimmed];
};

type Props = {
  onOrderCompleted?: (
    orderId: string,
    metadata?: {
      items?: any[];
      extraCharge?: number;
      totalAmount?: number;
      subtotal?: number;
      serviceCharge?: number;
      takeawayCharge?: number;
      gst?: number;
      total?: number;
      [key: string]: any;
    },
  ) => void;
  onLogout?: () => void;
};

export default function OrderingScreen({ onOrderCompleted, onLogout }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(
    insets.bottom,
    Platform.OS === "android" ? 28 : 0,
  );

  const isLandscape = screenWidth > screenHeight;
  const isWide = screenWidth >= 600;
  // Always 2 columns on tablet/kiosk screen to match reference layout (2 packages per row)
  const numColumns = 2;

  // App States
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<any>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState<any>(null);
  const [dishes, setDishes] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [showCartPage, setShowCartPage] = useState(false);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [enableCombo, setEnableCombo] = useState<number>(0);

  // Kiosk Session Info
  const [tableNo, setTableNo] = useState("");
  const [tableId, setTableId] = useState("");
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [enableKioskTable, setEnableKioskTable] = useState<number>(0);
  const [showTableModal, setShowTableModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"CHOICE" | "ENTER_TENT">(
    "CHOICE",
  );
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>("ALL");
  const [inputTableNo, setInputTableNo] = useState<string>("");
  const [tableInputError, setTableInputError] = useState<string | null>(null);
  const [isSelfCollect, setIsSelfCollect] = useState<boolean>(false);
  const [isTentNumber, setIsTentNumber] = useState<boolean>(false);
  const [isUpdatingTent, setIsUpdatingTent] = useState(false);

  // Modifiers Modal State
  const [showModifier, setShowModifier] = useState(false);
  const [selectedDish, setSelectedDish] = useState<any>(null);
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [comboQty, setComboQty] = useState(1);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<number | null>(null);

  // Combo Customizer States
  const [showComboCustomizer, setShowComboCustomizer] = useState(false);
  const [comboConfig, setComboConfig] = useState<any>(null);
  const [comboSelections, setComboSelections] = useState<{
    [groupId: string]: any[];
  }>({});
  const [comboError, setComboError] = useState<string | null>(null);
  const [comboLoading, setComboLoading] = useState(false);
  const [comboDishModifiers, setComboDishModifiers] = useState<any[]>([]);
  const [selectedComboModifierIds, setSelectedComboModifierIds] = useState<
    string[]
  >([]);

  // Payment Modal State
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [activePromotions, setActivePromotions] = useState<any[]>([]);
  const [checkingPromotions, setCheckingPromotions] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<any | null>(null);
  const [appliedPromotion, setAppliedPromotion] = useState<any | null>(null);
  const [isAddingPromo, setIsAddingPromo] = useState(false);
  const [promoErrorMessage, setPromoErrorMessage] = useState<string | null>(null);
  const [promoSuccessToast, setPromoSuccessToast] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState("0.00");
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [companyBrand, setCompanyBrand] = useState<{
    CompanyLogoUrl?: string | null;
    CompanyName?: string | null;
  } | null>(null);
  const [serviceChargePercent, setServiceChargePercent] = useState(0);
  const [twServiceChargePercent, setTwServiceChargePercent] = useState(0);
  const [takeawayChargeRate, setTakeawayChargeRate] = useState(0);
  const [gstPercent, setGstPercent] = useState(0);
  const [taxMode, setTaxMode] = useState<"exclusive" | "inclusive">(
    "exclusive",
  );
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [orderType, setOrderType] = useState<string>("DINE_IN");
  const [paymodesList, setPaymodesList] = useState<any[]>([]);

  // Extra Charge Confirmation Modal
  const [showExtraChargeModal, setShowExtraChargeModal] = useState(false);

  // ── Inactivity Auto-Reset Timer (75s idle + 15s warning = 90s total) ──
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState(15);
  const idleTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // ── Cart Clearance & Single Item Deletion Confirmations ──
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
  const [itemToDeleteIndex, setItemToDeleteIndex] = useState<number | null>(
    null,
  );

  // ── Promo Slideshow Attract Loop Screensaver (dbo.PromoCodeMaster) ──
  const [promoSlides, setPromoSlides] = useState<any[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showAttractLoop, setShowAttractLoop] = useState(false);
  const slideAnim = useRef(new Animated.Value(1)).current;
  const pulseTouchAnim = useRef(new Animated.Value(1)).current;

  // Fetch Promo Images from PromoCodeMaster via /api/auth/promo-image
  useEffect(() => {
    let isMounted = true;
    const fetchPromoImages = async () => {
      try {
        const res = await fetch(`${API}/auth/promo-image`);
        const data = await res.json();
        if (
          isMounted &&
          data.success &&
          Array.isArray(data.promoImages) &&
          data.promoImages.length > 0
        ) {
          const valid = data.promoImages.filter((p: any) => p.PromoImage);
          if (valid.length > 0) {
            setPromoSlides(valid);
          }
        }
      } catch (err) {
        console.log("Promo slideshow load error:", err);
      }
    };
    fetchPromoImages();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-advance slides every 4 seconds when in Attract Loop
  useEffect(() => {
    if (!showAttractLoop || promoSlides.length <= 1) return;

    const slideTimer = setInterval(() => {
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: 0.2,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      setCurrentSlideIndex((prev) => (prev + 1) % promoSlides.length);
    }, 4500);

    return () => clearInterval(slideTimer);
  }, [showAttractLoop, promoSlides.length]);

  // Pulse animation for "Touch Anywhere to Order"
  useEffect(() => {
    if (!showAttractLoop) return;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseTouchAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseTouchAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [showAttractLoop]);

  const resetAllKioskState = () => {
    setShowInactivityModal(false);
    if (countdownIntervalRef.current)
      clearInterval(countdownIntervalRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    setCart([]);
    setAppliedPromotion(null);
    setSelectedPromotion(null);
    setShowPromotionModal(false);
    setShowCartPage(false);
    setShowModifier(false);
    setShowComboCustomizer(false);
    setShowPaymentPopup(false);
    setShowTableModal(false);
    setShowExtraChargeModal(false);
    setSelectedDish(null);

    // If promo slides exist, enter Attract Loop screensaver!
    if (promoSlides.length > 0) {
      setShowAttractLoop(true);
      setCurrentSlideIndex(0);
    } else if (onLogout) {
      onLogout();
    }
  };

  const dismissAttractLoop = () => {
    setShowAttractLoop(false);
    // Return directly to Start (Dine In / Takeaway) page
    if (onLogout) {
      onLogout();
    }
  };

  const startInactivityCountdown = () => {
    // NEVER show inactivity modal if screensaver (Attract Loop) is already active!
    if (showAttractLoop) {
      return;
    }

    setShowInactivityModal(true);
    setInactivityCountdown(15);

    let remaining = 15;
    if (countdownIntervalRef.current)
      clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setInactivityCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current);
        resetAllKioskState();
      }
    }, 1000);
  };

  const resetIdleTimer = () => {
    // If the warning modal is up, touching anywhere cancels it and resets the timer
    if (showInactivityModal) {
      setShowInactivityModal(false);
      if (countdownIntervalRef.current)
        clearInterval(countdownIntervalRef.current);
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // If screensaver is currently active, do NOT start the countdown timer
    if (showAttractLoop) {
      return;
    }

    // 75 seconds idle before showing the warning (75s + 15s = 90s total)
    idleTimerRef.current = setTimeout(() => {
      startInactivityCountdown();
    }, 75000);
  };

  useEffect(() => {
    resetIdleTimer();

    // Attach global user interaction listeners on web so touches/clicks inside Modals, Keypads, etc. always reset idle timer
    const handleGlobalInteraction = () => {
      resetIdleTimer();
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("pointerdown", handleGlobalInteraction, true);
      window.addEventListener("touchstart", handleGlobalInteraction, true);
      window.addEventListener("mousedown", handleGlobalInteraction, true);
      window.addEventListener("keydown", handleGlobalInteraction, true);
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownIntervalRef.current)
        clearInterval(countdownIntervalRef.current);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener(
          "pointerdown",
          handleGlobalInteraction,
          true,
        );
        window.removeEventListener("touchstart", handleGlobalInteraction, true);
        window.removeEventListener("mousedown", handleGlobalInteraction, true);
        window.removeEventListener("keydown", handleGlobalInteraction, true);
      }
    };
  }, []);

  // ── Aesthetic Cart & Validation Toast Notification & Animation State ──
  const [toastNotification, setToastNotification] = useState<{
    visible: boolean;
    itemName: string;
    qty: number;
    price: number;
    type?: "success" | "error";
  }>({
    visible: false,
    itemName: "",
    qty: 1,
    price: 0,
    type: "success",
  });
  const toastSlideY = useRef(new Animated.Value(-100)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef<any>(null);

  // Badge pop animation scale mapped by DishId
  const badgeAnimMap = useRef<{ [key: string]: Animated.Value }>({}).current;
  const getBadgeAnim = (dishId: any) => {
    const key = String(dishId);
    if (!badgeAnimMap[key]) {
      badgeAnimMap[key] = new Animated.Value(1);
    }
    return badgeAnimMap[key];
  };

  const triggerBadgePop = (dishId: any) => {
    const anim = getBadgeAnim(dishId);
    anim.setValue(0.6);
    Animated.spring(anim, {
      toValue: 1,
      friction: 4,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  const showCartToast = (
    itemName: string,
    qty: number,
    price: number,
    dishId?: any,
  ) => {
    if (dishId) {
      triggerBadgePop(dishId);
    }

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setToastNotification({
      visible: true,
      itemName,
      qty,
      price,
    });

    Animated.parallel([
      Animated.spring(toastSlideY, {
        toValue: 0,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastSlideY, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastNotification((prev) => ({ ...prev, visible: false }));
      });
    }, 2200);
  };

  const showErrorToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastNotification({
      visible: true,
      itemName: message,
      qty: 0,
      price: 0,
      type: "error",
    });
    Animated.parallel([
      Animated.spring(toastSlideY, {
        toValue: 0,
        friction: 5,
        tension: 130,
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastSlideY, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastNotification((prev) => ({ ...prev, visible: false }));
      });
    }, 3200);
  };
  const [pendingPaymentAction, setPendingPaymentAction] = useState<any>(null);

  // YeahPay Cloud POS Terminal States
  const [showYeahPayModal, setShowYeahPayModal] = useState(false);
  const [yeahPayStatus, setYeahPayStatus] = useState<
    "INIT" | "PROCESSING" | "SUCCESS" | "FAILED"
  >("INIT");
  const [yeahPayMsg, setYeahPayMsg] = useState("");
  const [yeahPayDetails, setYeahPayDetails] = useState<any>(null);
  const [yeahPayPayableAmount, setYeahPayPayableAmount] = useState("0.00");

  // Kiosk Thank You Overlay
  const [kioskThankYouOrderId, setKioskThankYouOrderId] = useState<
    string | null
  >(null);

  const normalizeGuid = (val: any) =>
    String(val || "")
      .replace(/[{}]/g, "")
      .trim()
      .toUpperCase();

  const isCategoryFavourite = (categoryOrId?: any) => {
    const target = categoryOrId !== undefined ? categoryOrId : activeCategory;
    if (!target) return false;
    if (typeof target === "object") {
      return (
        target.isFavouriteCategory === true ||
        target.CategoryId === "FAVOURITE_CATEGORY" ||
        (target.KitchenTypeName || "").trim().toLowerCase() === "favourite" ||
        (target.KitchenTypeName || "").trim().toLowerCase() === "favorite"
      );
    }
    const targetStr = String(target);
    if (targetStr === "FAVOURITE_CATEGORY") return true;
    const catObj = categories.find(
      (c) =>
        c.CategoryId === target ||
        normalizeGuid(c.CategoryId) === normalizeGuid(target),
    );
    return (
      catObj?.isFavouriteCategory === true ||
      catObj?.CategoryId === "FAVOURITE_CATEGORY" ||
      (catObj?.KitchenTypeName || "").trim().toLowerCase() === "favourite" ||
      (catObj?.KitchenTypeName || "").trim().toLowerCase() === "favorite"
    );
  };

  const isCategoryPrevious = (categoryOrId?: any) => {
    const target = categoryOrId !== undefined ? categoryOrId : activeCategory;
    if (!target) return false;
    if (typeof target === "object") {
      return (
        (target.KitchenTypeName || "").trim().toLowerCase() === "previous" ||
        normalizeGuid(target.CategoryId) ===
          "3D43329E-B2C9-4C01-BDB7-5F65D67E61C5"
      );
    }
    const targetClean = normalizeGuid(target);
    const catObj = categories.find(
      (c) => normalizeGuid(c.CategoryId) === targetClean,
    );
    return (
      (catObj?.KitchenTypeName || "").trim().toLowerCase() === "previous" ||
      targetClean === "3D43329E-B2C9-4C01-BDB7-5F65D67E61C5"
    );
  };

  // Helper: Filter records where IsPublished = 0 or NULL
  const isPublishedForKiosk = (val: any) => {
    return val !== 1 && val !== true && String(val) !== "1";
  };

  const loadPreviousCategory = async () => {
    try {
      setGroups([
        {
          DishGroupId: "PREVIOUS_GROUP",
          DishGroupName: "Previous",
          SortCode: 1,
        },
      ]);
      setActiveGroup("PREVIOUS_GROUP");

      // 1. Get customer's saved DefaultDishId from AsyncStorage
      let savedDishId = await AsyncStorage.getItem("kioskDefaultDishId");
      const carNumber = await AsyncStorage.getItem("kioskCarNumber");

      // If not in storage or empty, attempt fresh customer search from backend
      if (!savedDishId && carNumber) {
        try {
          const custRes = await fetch(
            `${API}/order/kiosk/customer/${encodeURIComponent(carNumber.trim())}`,
          );
          const custData = await custRes.json();
          if (custData?.success && custData?.customer?.DefaultDishId) {
            savedDishId = String(custData.customer.DefaultDishId);
            await AsyncStorage.setItem("kioskDefaultDishId", savedDishId);
          }
        } catch (_) {}
      }

      // If still not in storage, search in all customers
      if (!savedDishId && carNumber) {
        try {
          const allRes = await fetch(`${API}/order/kiosk/customers`);
          const allData = await allRes.json();
          if (allData?.success && Array.isArray(allData.customers)) {
            const cleanCar = carNumber.trim().toUpperCase();
            const match = allData.customers.find(
              (c: any) => (c.CarNumber || "").trim().toUpperCase() === cleanCar,
            );
            if (match?.DefaultDishId) {
              savedDishId = String(match.DefaultDishId);
              await AsyncStorage.setItem("kioskDefaultDishId", savedDishId);
            }
          }
        } catch (_) {}
      }

      // Specific fallback for existing record
      if (
        !savedDishId &&
        carNumber &&
        carNumber.trim().toUpperCase() === "ABC67899"
      ) {
        savedDishId = "98373187-009C-440F-A196-53A205DCA997";
        await AsyncStorage.setItem("kioskDefaultDishId", savedDishId);
      }

      if (!savedDishId) {
        setDishes([]);
        return;
      }

      const targetDishGuid = normalizeGuid(savedDishId);

      // 2. Fetch dishes master to find the one matching DefaultDishId
      const dishesRes = await fetch(`${API}/dishes/all?isKiosk=true`, {
        headers: { "x-kiosk": "true" },
      });
      const allDishes = await dishesRes.json();

      if (Array.isArray(allDishes)) {
        const matched = allDishes.find(
          (d: any) =>
            normalizeGuid(d.DishId) === targetDishGuid &&
            isPublishedForKiosk(d.IsPublished) &&
            isPublishedForKiosk(d.CategoryPublished) &&
            isPublishedForKiosk(d.GroupPublished),
        );
        if (matched) {
          setDishes([matched]);
        } else {
          setDishes([]);
        }
      } else {
        setDishes([]);
      }
    } catch (err) {
      console.error("Error loading previous category dishes:", err);
      setDishes([]);
    }
  };

  const loadFavouriteCategory = async () => {
    try {
      setGroups([
        {
          DishGroupId: "FAVOURITE_GROUP",
          DishGroupName: "Favourites",
          SortCode: 0,
        },
      ]);
      setActiveGroup("FAVOURITE_GROUP");

      const res = await fetch(`${API}/dishes/favourites?isKiosk=true`, {
        headers: { "x-kiosk": "true" },
      });
      const data = await res.json();
      const rawDishes = Array.isArray(data) ? data : [];
      const safeDishes = rawDishes.filter(
        (d: any) =>
          isPublishedForKiosk(d.IsPublished) &&
          (d.CategoryPublished === undefined ||
            isPublishedForKiosk(d.CategoryPublished)) &&
          (d.GroupPublished === undefined ||
            isPublishedForKiosk(d.GroupPublished)),
      );
      setDishes(safeDishes);
    } catch (e) {
      console.log("Error loading favourite dishes:", e);
    }
  };

  const loadDishes = async (groupId: any) => {
    try {
      const res = await fetch(`${API}/dishes/group/${groupId}?isKiosk=true`, {
        headers: { "x-kiosk": "true" },
      });
      const data = await res.json();
      const rawDishes = Array.isArray(data) ? data : [];
      const safeDishes = rawDishes.filter(
        (d: any) =>
          isPublishedForKiosk(d.IsPublished) &&
          isPublishedForKiosk(d.CategoryPublished) &&
          isPublishedForKiosk(d.GroupPublished),
      );
      setDishes(safeDishes);
    } catch (e) {
      console.log("Error loading dishes:", e);
    }
  };

  const loadGroups = async (categoryId: any) => {
    if (isCategoryFavourite(categoryId)) {
      await loadFavouriteCategory();
      return;
    }

    if (isCategoryPrevious(categoryId)) {
      await loadPreviousCategory();
      return;
    }

    try {
      const res = await fetch(`${API}/dishgroups/${categoryId}?isKiosk=true`, {
        headers: { "x-kiosk": "true" },
      });
      const data = await res.json();
      const rawGroups = Array.isArray(data) ? data : [];
      const safeGroups = rawGroups.filter((g: any) =>
        isPublishedForKiosk(g.IsPublished),
      );
      setGroups(safeGroups);

      if (safeGroups.length > 0) {
        setActiveGroup(safeGroups[0].DishGroupId);
        await loadDishes(safeGroups[0].DishGroupId);
      } else {
        setDishes([]);
      }
    } catch (e) {
      console.log("Error loading groups:", e);
    }
  };

  const loadCart = async (orderId: string) => {
    try {
      const res = await fetch(`${API}/order/cart/kiosk/${orderId}`);
      const data = await res.json();

      if (data && Array.isArray(data.items)) {
        let restoredPromo: any = null;
        try {
          const storedPromoStr = await AsyncStorage.getItem("kioskAppliedPromotion");
          if (storedPromoStr) {
            restoredPromo = JSON.parse(storedPromoStr);
          }
        } catch {}

        const fromDB = data.items.map((item: any) => {
          const isPromo =
            item.isPromotionalItem === 1 ||
            item.isPromotionalItem === true ||
            String(item.DishId || "").startsWith("00000000-0000-0000-") ||
            (restoredPromo && String(item.PromotionId) === String(restoredPromo.PromotionId));

          return {
            ...item,
            DishId: item.DishId || item.id,
            Name: item.Name || item.DishName || item.name || "Item",
            qty: Number(item.qty || item.Quantity || 1),
            Price: Number(item.price || item.Price || item.PricePerUnit || 0),
            finalPrice: Number(
              item.price || item.Price || item.PricePerUnit || 0,
            ),
            isPromotionalItem: isPromo,
            isPromotion: isPromo,
            isBogoFree: item.isBogoFree || item.PromotionType === "BOGO" || String(item.DishId || "").includes("b090"),
            isFlatDiscount: item.isFlatDiscount || item.PromotionType === "Flat",
            isPercentageDiscount: item.isPercentageDiscount || item.PromotionType === "Percentage",
            discountValue: item.discountValue !== undefined ? Number(item.discountValue) : Number(item.DiscountAmount || 0),
            PromotionType: item.PromotionType || item.DiscountType || (isPromo ? (restoredPromo?.PromotionType || "Promotion") : undefined),
            PromotionId: item.PromotionId || (isPromo ? restoredPromo?.PromotionId : undefined),
            Description: item.Description || item.Remarks || (isPromo ? (restoredPromo?.Description || restoredPromo?.PromotionDescription) : undefined),
            isServiceCharge:
              item.isServiceCharge !== undefined
                ? item.isServiceCharge
                : item.IsServiceCharge !== undefined
                  ? item.IsServiceCharge
                  : true,
            takeawayCharge: Number(
              item.takeawayCharge ?? item.TakeawayCharge ?? 0,
            ),
            isTakeaway: !!(
              item.isTakeaway ||
              item.IsTakeaway ||
              item.isTakeAway ||
              item.IsTakeAway
            ),
            status: item.status || (item.StatusCode === 1 ? "NEW" : "SENT"),
            selectedMods:
              item.modifiers ||
              (item.ModifiersJSON
                ? (() => {
                    try {
                      return JSON.parse(item.ModifiersJSON);
                    } catch {
                      return [];
                    }
                  })()
                : []),
            comboSelections:
              item.comboSelections ||
              (item.ComboDetailsJSON
                ? (() => {
                    try {
                      return JSON.parse(item.ComboDetailsJSON);
                    } catch {
                      return [];
                    }
                  })()
                : []),
          };
        });

        if (restoredPromo && !appliedPromotion) {
          setAppliedPromotion(restoredPromo);
        }

        const hasPromoItemInDB = fromDB.some((i: any) => i.isPromotionalItem || i.isPromotion);
        if (restoredPromo && !hasPromoItemInDB) {
          const promoGuid = `00000000-0000-0000-0000-${String(restoredPromo.PromotionId).padStart(12, "0")}`;
          const pType = String(restoredPromo.PromotionType || "").trim().toUpperCase();
          const pDisc = Number(restoredPromo.DiscountValue || 0);
          const pAmt = Number(restoredPromo.PromotionAmount || 0);
          const promoItem = {
            id: promoGuid,
            DishId: promoGuid,
            lineItemId: promoGuid,
            isPromotionalItem: true,
            isPromotion: true,
            PromotionId: restoredPromo.PromotionId,
            Name: restoredPromo.PromotionName,
            DishName: restoredPromo.PromotionName,
            KitchenTypeName: "Special Offer",
            PromotionType: restoredPromo.PromotionType,
            Description: restoredPromo.Description || restoredPromo.PromotionDescription || "Promotion Applied",
            Price: pType === "COMBO" ? pAmt : 0,
            finalPrice: pType === "COMBO" ? pAmt : 0,
            price: pType === "COMBO" ? pAmt : 0,
            discountValue: pDisc,
            qty: 1,
            isTakeaway: false,
            isServiceCharge: pType === "COMBO",
            isBogoFree: pType === "BOGO",
            isFlatDiscount: pType === "FLAT",
            isPercentageDiscount: pType === "PERCENTAGE",
          };
          setCart([...fromDB, promoItem]);
        } else {
          setCart(fromDB);
        }
      }
    } catch (e) {
      console.log("Load cart error:", e);
    }
  };

  // Initial Load
  useEffect(() => {
    const initData = async () => {
      try {
        const storedOrderId = await AsyncStorage.getItem("kioskOrderId");
        const storedTableNo = await AsyncStorage.getItem("tableNo");
        const storedTableId = await AsyncStorage.getItem("tableId");

        setCurrentOrderId(storedOrderId);
        setTableNo(storedTableNo || "");
        setTableId(storedTableId || "");

        // Fetch settings, paymodes, kitchens, brand and orderType
        const [settingsRes, paymodesRes, kitchensRes, brandRes, storedOrderType] =
          await Promise.all([
            fetch(`${API}/company-settings/1`)
              .then((r) => r.json())
              .catch(() =>
                fetch(`${API}/company/settings`)
                  .then((r) => r.json())
                  .catch(() => ({})),
              ),
            fetch(`${API}/paymodes/list`)
              .then((r) => r.json())
              .catch(() => []),
            fetch(`${API}/kitchens?isKiosk=true`, {
              headers: { "x-kiosk": "true" },
            })
              .then((r) => r.json())
              .catch(() => []),
            fetch(`${API}/company-settings/brand`)
              .then((r) => r.json())
              .catch(() => ({})),
            AsyncStorage.getItem("kioskOrderType").then(
              (t) =>
                t ||
                AsyncStorage.getItem("orderType").then((ot) => ot || "DINE_IN"),
            ),
          ]);

        const rawSettings = settingsRes?.settings || settingsRes || {};
        setCompanySettings(rawSettings);

        const brandData = brandRes?.success ? brandRes : null;
        setCompanyBrand({
          CompanyLogoUrl:
            brandData?.CompanyLogoUrl ?? rawSettings?.CompanyLogoUrl ?? null,
          CompanyName:
            brandData?.CompanyName ?? rawSettings?.CompanyName ?? null,
        });

        const sc = Number(
          rawSettings.ServiceChargePercentage ??
            rawSettings.serviceChargePercentage ??
            0,
        );
        const twSc = Number(
          rawSettings.TWServiceChargePercentage ??
            rawSettings.twServiceChargePercentage ??
            0,
        );
        const twRate = Number(
          rawSettings.TakeawayCharges ?? rawSettings.takeawayCharges ?? 0,
        );
        const gst = Number(
          rawSettings.GSTPercentage ?? rawSettings.gstPercentage ?? 0,
        );
        const tMode = String(
          rawSettings.TaxMode ?? rawSettings.taxMode ?? "exclusive",
        ).toLowerCase();
        const sym = String(
          rawSettings.CurrencySymbol ?? rawSettings.currencySymbol ?? "$",
        );

        setServiceChargePercent(sc);
        setTwServiceChargePercent(twSc);
        setTakeawayChargeRate(twRate);
        setGstPercent(gst);
        setTaxMode(tMode === "inclusive" ? "inclusive" : "exclusive");
        setCurrencySymbol(sym);

        const activeOrderType = storedOrderType || "DINE_IN";
        setOrderType(activeOrderType);

        setEnableCombo(
          Number(rawSettings.EnableCombo ?? rawSettings.enableCombo ?? 0),
        );
        const isKioskTableEnabled =
          rawSettings.Enablekiosktable === 1 ||
          rawSettings.Enablekiosktable === true ||
          String(rawSettings.Enablekiosktable) === "1" ||
          String(rawSettings.Enablekiosktable).toLowerCase() === "true"
            ? 1
            : 0;
        setEnableKioskTable(isKioskTableEnabled);

        if (Array.isArray(paymodesRes)) {
          setPaymodesList(paymodesRes);
        }

        const rawKitchens = Array.isArray(kitchensRes) ? kitchensRes : [];
        const safeKitchens = rawKitchens.filter((k: any) =>
          isPublishedForKiosk(k.IsPublished),
        );

        // Dynamically fetch Favourite dishes to check if any have Favourite = 1
        let initialFavDishes: any[] = [];
        try {
          const favRes = await fetch(`${API}/dishes/favourites?isKiosk=true`, {
            headers: { "x-kiosk": "true" },
          });
          const favData = await favRes.json();
          if (Array.isArray(favData)) {
            initialFavDishes = favData.filter(
              (d: any) =>
                isPublishedForKiosk(d.IsPublished) &&
                (d.CategoryPublished === undefined ||
                  isPublishedForKiosk(d.CategoryPublished)) &&
                (d.GroupPublished === undefined ||
                  isPublishedForKiosk(d.GroupPublished)),
            );
          }
        } catch (e) {
          console.log("Error loading favourite dishes on init:", e);
        }

        const hasFavourites = initialFavDishes.length > 0;
        const allCategories: any[] = [];

        if (hasFavourites) {
          allCategories.push({
            CategoryId: "FAVOURITE_CATEGORY",
            KitchenTypeName: "Favourite",
            KitchenTypeCode: "FAVOURITE",
            SortCode: -999,
            IsPublished: 0,
            isFavouriteCategory: true,
          });
        }

        allCategories.push(...safeKitchens);
        setCategories(allCategories);

        if (allCategories.length > 0) {
          const firstCat = allCategories[0];
          setActiveCategory(firstCat.CategoryId);
          setExpandedCategoryId(firstCat.CategoryId);
          if (isCategoryFavourite(firstCat)) {
            setGroups([
              {
                DishGroupId: "FAVOURITE_GROUP",
                DishGroupName: "Favourites",
                SortCode: 0,
              },
            ]);
            setActiveGroup("FAVOURITE_GROUP");
            setDishes(initialFavDishes);
          } else if (isCategoryPrevious(firstCat)) {
            await loadPreviousCategory();
          } else {
            await loadGroups(firstCat.CategoryId);
          }
        }

        // Hydrate Cart
        if (storedOrderId) {
          await loadCart(storedOrderId);
        }
      } catch (e) {
        console.log("Init error:", e);
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  // ── Company Branding for Sidebar Header ──
  const companyName = String(
    companyBrand?.CompanyName ||
      companySettings?.CompanyName ||
      companySettings?.companyName ||
      "",
  ).trim();

  const rawLogoUrl =
    companyBrand?.CompanyLogoUrl ||
    companySettings?.CompanyLogoUrl ||
    companySettings?.companyLogoUrl ||
    "";

  const formatLogoUrl = (url?: string) => {
    if (!url || typeof url !== "string") return null;
    const cleanUrl = url.trim();
    if (!cleanUrl) return null;
    if (
      cleanUrl.startsWith("data:image") ||
      cleanUrl.startsWith("http://") ||
      cleanUrl.startsWith("https://")
    ) {
      return cleanUrl;
    }
    return `${API}${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
  };

  const companyLogoUri = formatLogoUrl(rawLogoUrl);

  // ── ACCURATE CHARGE CALCULATIONS (ALIGNED WITH POS & QR CUSTOMER FLOW) ──
  const isTakeawayOrder =
    orderType.toUpperCase().includes("TAKEAWAY") ||
    orderType.toUpperCase() === "TW";

  // 1. Subtotal
  const subTotal = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.Price || item.finalPrice || item.price || 0) *
        Number(item.qty || 1),
    0,
  );

  // 2. Takeaway Charges (per-item packing charge for takeaway orders or individual takeaway items)
  const takeawayCharge = cart.reduce((sum, item) => {
    const isItemTW =
      isTakeawayOrder ||
      !!(
        item.isTakeaway ||
        item.IsTakeaway ||
        item.isTakeAway ||
        item.IsTakeAway
      );
    if (!isItemTW) return sum;
    const dishSpecificTW = Number(
      item.takeawayCharge ?? item.TakeawayCharge ?? 0,
    );
    const effectiveTWRate =
      dishSpecificTW > 0 ? dishSpecificTW : takeawayChargeRate;
    return sum + Number(item.qty || 1) * effectiveTWRate;
  }, 0);

  // 3. Service Charge (SVC) - applies only if dish has isServiceCharge flag enabled
  const applicableScPercent = isTakeawayOrder
    ? twServiceChargePercent
    : serviceChargePercent;

  const scEligibleSubtotal = cart.reduce((sum, item) => {
    const isItemTW =
      isTakeawayOrder ||
      !!(
        item.isTakeaway ||
        item.IsTakeaway ||
        item.isTakeAway ||
        item.IsTakeAway
      );
    if (isTakeawayOrder && twServiceChargePercent <= 0) return sum;

    const isSC = item.isServiceCharge ?? item.IsServiceCharge;
    const isSCActive =
      isSC === true ||
      Number(isSC) === 1 ||
      String(isSC) === "true" ||
      String(isSC) === "1" ||
      isSC === undefined ||
      isSC === null;
    if (isSCActive && (!isItemTW || twServiceChargePercent > 0)) {
      return (
        sum +
        Number(item.Price || item.finalPrice || item.price || 0) *
          Number(item.qty || 1)
      );
    }
    return sum;
  }, 0);

  const serviceCharge =
    applicableScPercent > 0 && scEligibleSubtotal > 0
      ? scEligibleSubtotal * (applicableScPercent / 100)
      : 0;

  // 4. Taxable Base for GST
  const taxableBase = subTotal + serviceCharge + takeawayCharge;

  // 5. GST Amount (Exclusive vs Inclusive)
  let gstAmount = 0;
  if (gstPercent > 0 && taxableBase > 0) {
    if (taxMode === "inclusive") {
      gstAmount = taxableBase - taxableBase / (1 + gstPercent / 100);
    } else {
      gstAmount = taxableBase * (gstPercent / 100);
    }
  }

  // 5.5 Promotion Discount (from selected promotion in PromotionMaster)
  const promotionDiscount = useMemo(() => {
    if (!appliedPromotion) return 0;
    const pType = String(appliedPromotion.PromotionType || "")
      .trim()
      .toUpperCase();
    const discVal = Number(appliedPromotion.DiscountValue || 0);

    // Calculate subtotal of non-promotional base items
    const nonPromoSubtotal = cart
      .filter((i) => !i.isPromotionalItem && !i.isPromotion)
      .reduce(
        (sum, item) =>
          sum +
          Number(item.Price || item.finalPrice || item.price || 0) *
            Number(item.qty || 1),
        0,
      );

    let calculatedDisc = 0;
    if (pType.includes("PERCENT") || pType.includes("%")) {
      // Percentage: Calculate discount based on DiscountValue
      calculatedDisc = (nonPromoSubtotal * discVal) / 100;
    } else if (pType === "FLAT") {
      // Flat: Deduct configured DiscountValue
      calculatedDisc = discVal;
    } else if (pType === "BOGO") {
      // If BOGO was not added as a separate $0 item, discount 1 unit of the base item
      const hasBogoItem = cart.some((i) => i.isBogoFree);
      if (!hasBogoItem && cart.length > 0) {
        calculatedDisc = Number(
          cart[0].Price || cart[0].finalPrice || cart[0].price || 0,
        );
      } else {
        calculatedDisc = 0;
      }
    } else if (pType === "COMBO") {
      // Combo price is set directly on the item added to the cart
      calculatedDisc = 0;
    } else if (discVal > 0 && discVal <= 100) {
      calculatedDisc = (nonPromoSubtotal * discVal) / 100;
    } else if (discVal > 0) {
      calculatedDisc = discVal;
    }

    return Math.min(
      nonPromoSubtotal,
      Math.max(0, Number(calculatedDisc.toFixed(2))),
    );
  }, [appliedPromotion, cart]);

  // 6. Final Total (deducting promotionDiscount without duplicate application)
  let totalBeforeRound = subTotal + serviceCharge + takeawayCharge;
  if (taxMode === "exclusive") {
    totalBeforeRound += gstAmount;
  }
  const calculatedTotal = Math.max(
    0,
    totalBeforeRound - promotionDiscount,
  ).toFixed(2);

  useEffect(() => {
    setTotalAmount(calculatedTotal);
  }, [calculatedTotal]);

  // Open Combo Customizer or Modifiers or Add Direct
  const handleDishClick = async (dish: any) => {
    if (dish.IsSoldOut) return;

    setSelectedDish(dish);
    setComboQty(1);
    setComboConfig(null);
    setComboSelections({});
    setComboDishModifiers([]);
    setSelectedComboModifierIds([]);
    setModifiers([]);
    setSelectedModifierIds([]);
    setComboError(null);

    const isComboDish =
      dish.IsCombo === true ||
      dish.IsCombo === 1 ||
      String(dish.IsCombo) === "1" ||
      String(dish.IsCombo).toLowerCase() === "true" ||
      dish.isCombo === true ||
      dish.isCombo === 1 ||
      String(dish.isCombo) === "1" ||
      String(dish.isCombo).toLowerCase() === "true";

    if (isComboDish) {
      setComboLoading(true);
      setShowComboCustomizer(true);

      try {
        const [res, modRes] = await Promise.all([
          fetch(`${API}/combo/config/${dish.DishId}`).catch(() => null),
          fetch(`${API}/modifiers/${dish.DishId}`).catch(() => null),
        ]);

        if (res && res.ok) {
          const payload = await res.json();
          if (payload.success && payload.data) {
            const config = payload.data;
            setComboConfig(config);

            // Auto-select defaults
            const initialSelections: { [groupId: string]: any[] } = {};
            (config.groups || []).forEach((group: any) => {
              let defaults = (group.options || [])
                .filter((o: any) => o.isDefault)
                .map((o: any) => o.dishId);
              if (!group.isMultiSelect || group.maxSelection === 1) {
                defaults = defaults.slice(0, 1);
              }
              if (
                defaults.length === 0 &&
                group.minSelection > 0 &&
                group.options &&
                group.options.length > 0
              ) {
                defaults = [group.options[0].dishId];
              }
              initialSelections[group.comboGroupId] = defaults;
            });
            setComboSelections(initialSelections);
          }
        }

        if (modRes && modRes.ok) {
          const modData = await modRes.json();
          if (Array.isArray(modData)) {
            const realMods = modData.filter(
              (m: any) => m.ModifierName?.toUpperCase() !== "OPEN",
            );
            setComboDishModifiers(realMods);
          }
        }
      } catch (err: any) {
        console.error("Combo config fetch error:", err);
        setComboError(err.message || "Failed to load options.");
      } finally {
        setComboLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(`${API}/modifiers/${dish.DishId}`);
      const mods = await res.json();
      const realMods = Array.isArray(mods)
        ? mods.filter((m: any) => m.ModifierName?.toUpperCase() !== "OPEN")
        : [];

      if (realMods.length > 0) {
        setModifiers(realMods);
        setSelectedModifierIds([]);
        setShowModifier(true);
      } else {
        addToCartSimple(dish);
      }
    } catch (e) {
      addToCartSimple(dish);
    }
  };

  const openComboCustomizer = async (dish: any) => {
    handleDishClick(dish);
  };

  const handleEditCartItem = async (index: number) => {
    const item = cart[index];
    if (!item) return;

    setEditingCartItemIndex(index);
    setSelectedDish(item);
    setComboQty(item.qty || 1);
    setComboError(null);

    const isComboItem =
      item.isCombo === true ||
      item.IsCombo === true ||
      (item.comboSelections && item.comboSelections.length > 0) ||
      item.isCombo === 1 ||
      item.IsCombo === 1;

    const dishId = item.DishId || item.id;

    // Temporarily close cart page so the full customizer is visible
    setShowCartPage(false);

    if (isComboItem) {
      setComboLoading(true);
      setShowComboCustomizer(true);

      try {
        const [res, modRes] = await Promise.all([
          fetch(`${API}/combo/config/${dishId}`).catch(() => null),
          fetch(`${API}/modifiers/${dishId}`).catch(() => null),
        ]);

        if (res && res.ok) {
          const payload = await res.json();
          if (payload.success && payload.data) {
            const config = payload.data;
            setComboConfig(config);

            // Pre-populate selections from existing cart item
            const existingSelections: { [groupId: string]: any[] } = {};
            if (Array.isArray(item.comboSelections)) {
              item.comboSelections.forEach((grp: any) => {
                const gId = grp.groupId || grp.comboGroupId;
                if (gId) {
                  existingSelections[gId] = (grp.items || []).map(
                    (opt: any) => opt.dishId || opt.DishId || opt.id || opt.DishID,
                  ).filter(Boolean);
                }
              });
            }

            // Fallback: match by groupName and option name if group IDs differ or options matched by name
            (config.groups || []).forEach((group: any) => {
              const currentList = existingSelections[group.comboGroupId] || [];
              if (currentList.length === 0) {
                const matchingGrp = (item.comboSelections || []).find(
                  (g: any) =>
                    g.groupName?.toLowerCase() === group.groupName?.toLowerCase() ||
                    g.groupId === group.comboGroupId ||
                    g.comboGroupId === group.comboGroupId
                );
                if (matchingGrp) {
                  const resolvedIds = (matchingGrp.items || []).map((opt: any) => {
                    const match = (group.options || []).find(
                      (o: any) =>
                        String(o.dishId) === String(opt.dishId || opt.DishId || opt.id || opt.DishID) ||
                        (o.name && (opt.name || opt.dishName) && o.name.toLowerCase() === (opt.name || opt.dishName).toLowerCase()) ||
                        (o.dishName && (opt.name || opt.dishName) && o.dishName.toLowerCase() === (opt.name || opt.dishName).toLowerCase())
                    );
                    return match ? match.dishId : (opt.dishId || opt.DishId || opt.id || opt.DishID);
                  }).filter(Boolean);
                  existingSelections[group.comboGroupId] = resolvedIds;
                }
              }
            });

            setComboSelections(existingSelections);
          }
        }

        if (modRes && modRes.ok) {
          const modData = await modRes.json();
          if (Array.isArray(modData)) {
            const realMods = modData.filter(
              (m: any) => m.ModifierName?.toUpperCase() !== "OPEN",
            );
            setComboDishModifiers(realMods);
          }
        }

        // Pre-populate existing combo modifiers
        const existingModIds = (item.selectedMods || item.modifiers || []).map(
          (m: any) => String(m.ModifierID || m.ModifierId || ""),
        ).filter(Boolean);
        setSelectedComboModifierIds(existingModIds);
      } catch (err: any) {
        console.error("Combo config fetch error on edit:", err);
        setComboError(err.message || "Failed to load options.");
      } finally {
        setComboLoading(false);
      }
      return;
    }

    // Standard Modifiers item
    try {
      const res = await fetch(`${API}/modifiers/${dishId}`);
      const mods = await res.json();
      const realMods = Array.isArray(mods)
        ? mods.filter((m: any) => m.ModifierName?.toUpperCase() !== "OPEN")
        : [];

      if (realMods.length > 0) {
        setModifiers(realMods);
        const existingModIds = (item.selectedMods || item.modifiers || []).map(
          (m: any) => String(m.ModifierID || m.ModifierId || ""),
        ).filter(Boolean);
        setSelectedModifierIds(existingModIds);
        setShowModifier(true);
      }
    } catch (e) {
      console.error("Failed to load modifiers for edit:", e);
    }
  };

  const handleSelectComboOption = (
    groupId: string,
    option: any,
    isMulti: boolean,
    maxSelect: number,
  ) => {
    setComboError(null);
    setComboSelections((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(option.dishId)) {
        return {
          ...prev,
          [groupId]: current.filter((id) => id !== option.dishId),
        };
      } else {
        if (isMulti) {
          if (current.length >= maxSelect) {
            return prev;
          }
          return {
            ...prev,
            [groupId]: [...current, option.dishId],
          };
        } else {
          return {
            ...prev,
            [groupId]: [option.dishId],
          };
        }
      }
    });
  };

  const handleToggleComboModifier = (modId: string) => {
    setSelectedComboModifierIds((prev) =>
      prev.includes(modId)
        ? prev.filter((id) => id !== modId)
        : [...prev, modId],
    );
  };

  const calculateComboTotal = () => {
    if (!comboConfig && !selectedDish) return 0;

    let totalSurcharge = 0;
    (comboConfig?.groups || []).forEach((group: any) => {
      const selectedIds = comboSelections[group.comboGroupId] || [];
      const selectedOptions = (group.options || []).filter((o: any) =>
        selectedIds.includes(o.dishId),
      );
      selectedOptions.forEach((opt: any) => {
        totalSurcharge +=
          (Number(opt.surcharge) || 0) + (Number(opt.dishPrice) || 0);
      });
    });

    const chosenModifiers = comboDishModifiers.filter((m: any) =>
      selectedComboModifierIds.includes(
        String(m.ModifierID || m.ModifierId || ""),
      ),
    );
    const modifierPriceTotal = chosenModifiers.reduce(
      (sum: number, m: any) => sum + (Number(m.Price) || 0),
      0,
    );

    const basePrice = Number(
      comboConfig?.basePrice || selectedDish?.Price || selectedDish?.price || 0,
    );

    return basePrice + totalSurcharge + modifierPriceTotal;
  };

  const handleAddComboToCart = () => {
    if (!comboConfig || !selectedDish) return;

    // Validate minimum selections
    for (const group of comboConfig.groups) {
      const selectedIds = comboSelections[group.comboGroupId] || [];
      const effectiveMin =
        group.options && group.options.length > 0 ? group.minSelection : 0;
      if (selectedIds.length < effectiveMin) {
        const missingCount = effectiveMin - selectedIds.length;
        const errMsg = `Please select ${missingCount} more item(s) for "${group.groupName}"`;
        setComboError(errMsg);
        showErrorToast(errMsg);
        return;
      }
    }

    // Build selected modifiers list
    const chosenModifiers = comboDishModifiers
      .filter((m: any) =>
        selectedComboModifierIds.includes(
          String(m.ModifierID || m.ModifierId || ""),
        ),
      )
      .map((m: any) => ({
        ModifierID: String(m.ModifierID || m.ModifierId || ""),
        ModifierName: m.ModifierName,
        Price: Number(m.Price || 0),
        qty: 1,
      }));

    // Build the selection details payload
    const chosenSelections = comboConfig.groups.map((group: any) => {
      const selectedIds = comboSelections[group.comboGroupId] || [];
      const selectedOptions = (group.options || []).filter((o: any) =>
        selectedIds.includes(o.dishId),
      );
      return {
        groupId: group.comboGroupId,
        groupName: group.groupName,
        items: selectedOptions.map((o: any) => ({
          dishId: o.dishId,
          name: o.name,
          surcharge: o.surcharge,
          dishPrice: o.dishPrice || 0,
          KitchenTypeCode: o.KitchenTypeCode,
          KitchenTypeName: o.KitchenTypeName,
          PrinterIP: o.PrinterIP,
        })),
      };
    });

    // Sum surcharges and dish prices
    let totalSurcharge = 0;
    chosenSelections.forEach((grp: any) => {
      grp.items.forEach((opt: any) => {
        totalSurcharge +=
          (Number(opt.surcharge) || 0) + (Number(opt.dishPrice) || 0);
      });
    });

    const modifierPriceTotal = chosenModifiers.reduce(
      (sum: number, m: any) => sum + (Number(m.Price) || 0),
      0,
    );

    const comboBasePrice = Number(comboConfig.basePrice);
    const dishBasePrice = Number(
      selectedDish?.Price ?? selectedDish?.price ?? 0,
    );

    const finalPrice =
      (comboBasePrice > 0 ? comboBasePrice : dishBasePrice) +
      totalSurcharge +
      modifierPriceTotal;

    const newCartItem = {
      ...selectedDish,
      DishId: selectedDish.DishId || selectedDish.id,
      id: selectedDish.DishId || selectedDish.id,
      lineItemId: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      ),
      Name: selectedDish.Name || selectedDish.name,
      name: selectedDish.Name || selectedDish.name,
      dishName: selectedDish.Name || selectedDish.name,
      qty: comboQty,
      isCombo: true,
      price: finalPrice,
      Price: finalPrice,
      finalPrice: finalPrice,
      basePrice: comboConfig.basePrice,
      isServiceCharge:
        selectedDish.isServiceCharge !== undefined
          ? selectedDish.isServiceCharge
          : selectedDish.IsServiceCharge !== undefined
            ? selectedDish.IsServiceCharge
            : true,
      takeawayCharge: Number(
        selectedDish.takeawayCharge ?? selectedDish.TakeawayCharge ?? 0,
      ),
      isTakeaway: isTakeawayOrder,
      comboSelections: chosenSelections,
      selectedMods: chosenModifiers,
      modifiers: chosenModifiers,
      status: "NEW",
    };

    if (editingCartItemIndex !== null && editingCartItemIndex >= 0 && editingCartItemIndex < cart.length) {
      setCart((prev) =>
        prev.map((item, idx) => {
          if (idx === editingCartItemIndex) {
            return {
              ...item,
              ...newCartItem,
              lineItemId: item.lineItemId || newCartItem.lineItemId,
              OrderDetailId: item.OrderDetailId || newCartItem.lineItemId,
              qty: comboQty,
              price: finalPrice,
              Price: finalPrice,
              finalPrice: finalPrice,
              basePrice: comboConfig.basePrice || item.basePrice || selectedDish.basePrice,
              comboSelections: chosenSelections,
              selectedMods: chosenModifiers,
              modifiers: chosenModifiers,
            };
          }
          return item;
        }),
      );
      setShowComboCustomizer(false);
      setEditingCartItemIndex(null);
      setShowCartPage(true);
      showCartToast(
        selectedDish.Name || selectedDish.name,
        comboQty,
        calculateComboTotal() * comboQty,
        selectedDish.DishId || selectedDish.id,
      );
      return;
    }

    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          (item.DishId || item.id) ===
            (selectedDish.DishId || selectedDish.id) &&
          (item.comboSelections || []).length === 0 &&
          JSON.stringify(item.selectedMods || []) ===
            JSON.stringify(chosenModifiers) &&
          item.status !== "SENT",
      );

      if (existing) {
        return prev.map((item) =>
          item === existing
            ? {
                ...item,
                qty: (item.qty || 1) + comboQty,
                status: "NEW",
              }
            : item,
        );
      }

      return [...prev, newCartItem];
    });

    setShowComboCustomizer(false);
    showCartToast(
      selectedDish.Name || selectedDish.name,
      comboQty,
      calculateComboTotal(),
      selectedDish.DishId || selectedDish.id,
    );
  };

  const addToCartSimple = (dish: any) => {
    const basePrice = Number(dish.Price || dish.price || 0);

    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          (item.DishId || item.id) === dish.DishId && item.status !== "SENT",
      );

      const nextQty = existing ? (existing.qty || 1) + 1 : 1;
      showCartToast(
        dish.Name || dish.name,
        nextQty,
        basePrice,
        dish.DishId || dish.id,
      );

      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, qty: (item.qty || 1) + 1 } : item,
        );
      }

      return [
        ...prev,
        {
          ...dish,
          DishId: dish.DishId,
          id: dish.DishId,
          lineItemId: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            },
          ),
          Name: dish.Name,
          name: dish.Name,
          dishName: dish.Name,
          qty: 1,
          Price: basePrice,
          price: basePrice,
          finalPrice: basePrice,
          isServiceCharge:
            dish.isServiceCharge !== undefined
              ? dish.isServiceCharge
              : dish.IsServiceCharge !== undefined
                ? dish.IsServiceCharge
                : true,
          takeawayCharge: Number(
            dish.takeawayCharge ?? dish.TakeawayCharge ?? 0,
          ),
          isTakeaway: isTakeawayOrder,
          selectedMods: [],
          comboSelections: [],
          status: "NEW",
        },
      ];
    });
  };

  const addWithModifiers = () => {
    if (!selectedDish) return;

    const chosenMods = modifiers.filter((m) =>
      selectedModifierIds.includes(String(m.ModifierID || m.ModifierId)),
    );
    const extra = chosenMods.reduce((s, m) => s + Number(m.Price || 0), 0);
    const origBase = Number(
      selectedDish?.basePrice ?? selectedDish?.Price ?? selectedDish?.price ?? 0,
    );
    const finalPrice = origBase + extra;

    if (editingCartItemIndex !== null && editingCartItemIndex >= 0 && editingCartItemIndex < cart.length) {
      setCart((prev) =>
        prev.map((item, idx) => {
          if (idx === editingCartItemIndex) {
            return {
              ...item,
              ...selectedDish,
              lineItemId: item.lineItemId || selectedDish.lineItemId,
              OrderDetailId: item.OrderDetailId || selectedDish.OrderDetailId,
              qty: comboQty,
              Price: finalPrice,
              price: finalPrice,
              finalPrice: finalPrice,
              selectedMods: chosenMods,
              modifiers: chosenMods,
              comboSelections: [],
            };
          }
          return item;
        }),
      );
      setShowModifier(false);
      setEditingCartItemIndex(null);
      setShowCartPage(true);
      showCartToast(
        selectedDish.Name || selectedDish.name,
        comboQty,
        finalPrice * comboQty,
        selectedDish.DishId || selectedDish.id,
      );
      return;
    }

    setCart((prev) => [
      ...prev,
      {
        ...selectedDish,
        DishId: selectedDish.DishId,
        id: selectedDish.DishId,
        lineItemId: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
          /[xy]/g,
          (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          },
        ),
        Name: selectedDish.Name,
        name: selectedDish.Name,
        dishName: selectedDish.Name,
        qty: comboQty,
        Price: finalPrice,
        price: finalPrice,
        finalPrice: finalPrice,
        isServiceCharge:
          selectedDish.isServiceCharge !== undefined
            ? selectedDish.isServiceCharge
            : selectedDish.IsServiceCharge !== undefined
              ? selectedDish.IsServiceCharge
              : true,
        takeawayCharge: Number(
          selectedDish.takeawayCharge ?? selectedDish.TakeawayCharge ?? 0,
        ),
        isTakeaway: isTakeawayOrder,
        selectedMods: chosenMods,
        comboSelections: [],
        status: "NEW",
      },
    ]);

    setShowModifier(false);
    showCartToast(
      selectedDish.Name || selectedDish.name,
      comboQty,
      finalPrice,
      selectedDish.DishId || selectedDish.id,
    );
  };

  const isServiceCategoryItem = (item: any) => {
    if (!item) return false;
    const catName = String(
      item.KitchenTypeName ||
        item.kitchenTypeName ||
        item.CategoryName ||
        item.categoryName ||
        "",
    ).toLowerCase();
    const groupName = String(
      item.DishGroupName || item.dishGroupName || "",
    ).toLowerCase();
    const name = String(item.Name || item.name || "").toLowerCase();
    return (
      catName.includes("service") ||
      groupName.includes("service") ||
      name.includes("package")
    );
  };

  const increaseQty = (index: number) => {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, qty: Number(item.qty || 1) + 1 } : item,
      ),
    );
  };

  const decreaseQty = (index: number) => {
    const item = cart[index];
    if (!item) return;
    if ((item.qty || 1) <= 1) {
      setItemToDeleteIndex(index);
      return;
    }
    setCart((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, qty: Math.max(1, Number(it.qty || 1) - 1) } : it,
      ),
    );
  };

  const handleClearCart = async () => {
    setCart([]);
    setAppliedPromotion(null);
    setSelectedPromotion(null);
    try {
      await AsyncStorage.removeItem("kioskAppliedPromotion");
    } catch {}
    setShowClearCartConfirm(false);
  };

  const confirmDeleteItem = async () => {
    if (itemToDeleteIndex !== null) {
      const deletedItem = cart[itemToDeleteIndex];
      const isPromo = !!(deletedItem?.isPromotionalItem || deletedItem?.isPromotion);
      if (isPromo) {
        setAppliedPromotion(null);
        setSelectedPromotion(null);
        try {
          await AsyncStorage.removeItem("kioskAppliedPromotion");
        } catch {}
      }
      const updatedCart = cart.filter((_, i) => i !== itemToDeleteIndex);
      setCart(updatedCart);
      setItemToDeleteIndex(null);

      // If promotional item was deleted, sync deletion to DB
      if (isPromo) {
        try {
          const orderId = currentOrderId || (await AsyncStorage.getItem("kioskOrderId"));
          if (orderId) {
            const storedOrderType = (await AsyncStorage.getItem("kioskOrderType")) || "DINE_IN";
            const isTakeaway = storedOrderType.toUpperCase().includes("TAKEAWAY");
            const activeTableId = tableId || "TAKEAWAY";
            await fetch(`${API}/order/save-cart`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tableId: activeTableId,
                orderId: orderId,
                orderType: isTakeaway ? "TAKEAWAY" : "DINE_IN",
                isTakeaway: isTakeaway,
                items: updatedCart.map((item) => ({ ...item, status: "SENT", Status: "SENT", StatusCode: 2 })),
                userId: "00000000-0000-0000-0000-000000000000",
                isKiosk: true,
                entryStatus: "K",
                discountAmount: 0,
                discountRemarks: null,
              }),
            });
          }
        } catch (delErr) {
          console.warn("Sync cart after promo delete error:", delErr);
        }
      }
    }
  };

  // Fetch available tables from TableMaster
  const fetchAvailableTables = async () => {
    setLoadingTables(true);
    try {
      const storedOrderType =
        (await AsyncStorage.getItem("kioskOrderType")) || "DINE_IN";
      const isTakeaway = storedOrderType.toUpperCase().includes("TAKEAWAY");
      const url = `${API}/order/kiosk/available-tables?orderType=${encodeURIComponent(storedOrderType)}&section=${isTakeaway ? "4" : "3"}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.tables)) {
        setAvailableTables(data.tables);
      } else {
        setAvailableTables([]);
      }
    } catch (e) {
      console.warn("Error fetching available tables:", e);
      setAvailableTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  // Step 1: Checkout button click handler - Checks PromotionMaster FIRST
  const handleCheckoutClick = async () => {
    if (cart.length === 0) return;

    // If a promotion has already been added to the cart, proceed directly to Checkout Option
    if (appliedPromotion) {
      proceedToCheckoutOption();
      return;
    }

    // Check for active promotions from PromotionMaster (entry_status = 'K') FIRST
    try {
      setCheckingPromotions(true);
      const promoRes = await fetch(`${API}/promotions/active?entry_status=K`, {
        headers: { "x-entry-status": "K" },
      });
      const promoData = await promoRes.json();
      const validPromos = Array.isArray(promoData?.promotions)
        ? promoData.promotions
        : [];

      if (validPromos.length > 0) {
        setActivePromotions(validPromos);
        setSelectedPromotion(null);
        // Display Promotion Popup FIRST (ensure other modals are closed)
        setShowTableModal(false);
        setShowPaymentPopup(false);
        setShowPromotionModal(true);
        setCheckingPromotions(false);
        return;
      }
    } catch (promoErr) {
      console.warn("Promotion check error:", promoErr);
    } finally {
      setCheckingPromotions(false);
    }

    // If no valid promotion records exist, skip promotion popup and proceed directly to Checkout Option
    proceedToCheckoutOption();
  };

  // Add selected promotion to cart & return to cart screen
  const handleAddToCartPromotion = async () => {
    setPromoErrorMessage(null);

    if (!selectedPromotion) {
      setPromoErrorMessage("Please select a promotion offer to add.");
      return;
    }

    setIsAddingPromo(true);

    try {
      // 1. Remove previously added promotional items to prevent duplicate promotion entries
      const cleanCart = cart.filter(
        (item) => !item.isPromotionalItem && !item.isPromotion,
      );

      const pType = String(selectedPromotion.PromotionType || "")
        .trim()
        .toUpperCase();
      const discVal = Number(selectedPromotion.DiscountValue || 0);
      const comboPrice = Number(selectedPromotion.PromotionAmount || 0);

      // 3. Add separate promotional item entry according to PromotionType
      const promoGuid = `00000000-0000-0000-0000-${String(selectedPromotion.PromotionId).padStart(12, "0")}`;
      let promoItem: any = null;

      if (pType === "COMBO") {
        promoItem = {
          id: promoGuid,
          DishId: promoGuid,
          lineItemId: promoGuid,
          isPromotionalItem: true,
          isPromotion: true,
          PromotionId: selectedPromotion.PromotionId,
          Name: selectedPromotion.PromotionName,
          DishName: selectedPromotion.PromotionName,
          KitchenTypeName: "Combo Offer",
          Description:
            selectedPromotion.Description ||
            selectedPromotion.PromotionDescription ||
            "Special Combo Promotion",
          Price: comboPrice,
          finalPrice: comboPrice,
          price: comboPrice,
          qty: 1,
          PromotionType: "Combo",
          isTakeaway: false,
          isServiceCharge: true,
        };
      } else if (pType === "BOGO") {
        const baseItem = cleanCart[0];
        const bogoGuid = `00000000-0000-0000-b090-${String(selectedPromotion.PromotionId).padStart(12, "0")}`;
        promoItem = {
          id: bogoGuid,
          DishId: bogoGuid,
          lineItemId: bogoGuid,
          isPromotionalItem: true,
          isPromotion: true,
          isBogoFree: true,
          PromotionId: selectedPromotion.PromotionId,
          Name: `${baseItem?.Name || "Selected Item"} (BOGO Free)`,
          DishName: `${baseItem?.Name || "Selected Item"} (BOGO Free)`,
          KitchenTypeName: "BOGO Offer",
          Description:
            selectedPromotion.Description ||
            selectedPromotion.PromotionDescription ||
            "Buy 1 Get 1 Free Offer",
          Price: 0,
          finalPrice: 0,
          price: 0,
          qty: 1,
          PromotionType: "BOGO",
          isTakeaway: baseItem?.isTakeaway || false,
          isServiceCharge: false,
        };
      } else if (pType === "FLAT") {
        promoItem = {
          id: promoGuid,
          DishId: promoGuid,
          lineItemId: promoGuid,
          isPromotionalItem: true,
          isPromotion: true,
          isFlatDiscount: true,
          PromotionId: selectedPromotion.PromotionId,
          Name: selectedPromotion.PromotionName,
          DishName: selectedPromotion.PromotionName,
          KitchenTypeName: "Special Discount",
          Description:
            selectedPromotion.Description ||
            selectedPromotion.PromotionDescription ||
            `Special Flat Discount (${currencySymbol}${discVal.toFixed(2)} OFF)`,
          Price: 0,
          finalPrice: 0,
          price: 0,
          discountValue: discVal,
          qty: 1,
          PromotionType: "Flat",
          isTakeaway: false,
          isServiceCharge: false,
        };
      } else {
        // Percentage
        promoItem = {
          id: promoGuid,
          DishId: promoGuid,
          lineItemId: promoGuid,
          isPromotionalItem: true,
          isPromotion: true,
          isPercentageDiscount: true,
          PromotionId: selectedPromotion.PromotionId,
          Name: selectedPromotion.PromotionName,
          DishName: selectedPromotion.PromotionName,
          KitchenTypeName: "Special Discount",
          Description:
            selectedPromotion.Description ||
            selectedPromotion.PromotionDescription ||
            `Special ${discVal}% Discount`,
          Price: 0,
          finalPrice: 0,
          price: 0,
          discountValue: discVal,
          qty: 1,
          PromotionType: "Percentage",
          isTakeaway: false,
          isServiceCharge: false,
        };
      }

      const updatedCart = promoItem ? [...cleanCart, promoItem] : cleanCart;

      // 4. Update cart state and appliedPromotion state
      setCart(updatedCart);
      setAppliedPromotion(selectedPromotion);

      // 5. Cart Persistence: Save to AsyncStorage
      await AsyncStorage.setItem(
        "kioskAppliedPromotion",
        JSON.stringify(selectedPromotion),
      );

      // 6. Cart Persistence: Sync to Database via /order/save-cart immediately
      try {
        const nonPromoSubtotal = cleanCart.reduce(
          (sum, item) =>
            sum +
            Number(item.Price || item.finalPrice || item.price || 0) *
              Number(item.qty || 1),
          0,
        );
        let calculatedDisc = 0;
        if (pType.includes("PERCENT") || pType.includes("%")) {
          calculatedDisc = (nonPromoSubtotal * discVal) / 100;
        } else if (pType === "FLAT") {
          calculatedDisc = discVal;
        }

        const orderId =
          currentOrderId || (await AsyncStorage.getItem("kioskOrderId"));
        const storedOrderType =
          (await AsyncStorage.getItem("kioskOrderType")) || "DINE_IN";
        const isTakeaway = storedOrderType.toUpperCase().includes("TAKEAWAY");
        const activeTableId = tableId || "TAKEAWAY";

        const saveRes = await fetch(`${API}/order/save-cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: activeTableId,
            orderId: orderId,
            orderType: isTakeaway ? "TAKEAWAY" : "DINE_IN",
            isTakeaway: isTakeaway,
            items: updatedCart.map((item) => ({
              ...item,
              status: "SENT",
              Status: "SENT",
              StatusCode: 2,
            })),
            userId: "00000000-0000-0000-0000-000000000000",
            isKiosk: true,
            entryStatus: "K",
            discountAmount: calculatedDisc,
            discountRemarks: selectedPromotion.PromotionName,
            promotionId: selectedPromotion.PromotionId,
            promotionName: selectedPromotion.PromotionName,
          }),
        });

        const saveJson = await saveRes.json();
        if (saveJson?.orderId && saveJson.orderId !== orderId) {
          setCurrentOrderId(saveJson.orderId);
          await AsyncStorage.setItem("kioskOrderId", saveJson.orderId);
        }
      } catch (saveErr) {
        console.warn("⚠️ [handleAddToCartPromotion] Save cart sync warning:", saveErr);
      }

      // 7. Show success toast, close modal, and return to cart screen
      setPromoSuccessToast(`Offer "${selectedPromotion.PromotionName}" added to cart!`);
      setTimeout(() => setPromoSuccessToast(null), 3500);

      setShowPromotionModal(false);
      setShowCartPage(true);
    } catch (err: any) {
      console.error("Error adding promotion to cart:", err);
      const errMsg = err?.message || "Failed to add promotion to cart. Please try again.";
      setPromoErrorMessage(errMsg);
      if (typeof window !== "undefined" && window.alert) {
        window.alert(errMsg);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setIsAddingPromo(false);
    }
  };

  const handleNoThanks = async () => {
    // Clear any promotional items from cart
    setCart((prev) =>
      prev.filter((item) => !item.isPromotionalItem && !item.isPromotion),
    );
    setSelectedPromotion(null);
    setAppliedPromotion(null);
    setPromoErrorMessage(null);
    try {
      await AsyncStorage.removeItem("kioskAppliedPromotion");
    } catch {}
    setShowPromotionModal(false);
    proceedToCheckoutOption();
  };

  // Step 2: Proceed to Checkout Option (Self Collect / Enter Tent Number) or Payment if Takeaway / prompt disabled
  const proceedToCheckoutOption = async () => {
    setShowPromotionModal(false);

    // Check if order is Takeaway (TW) -> Skip table/tent prompt completely
    const storedOrderType =
      (await AsyncStorage.getItem("kioskOrderType")) || "DINE_IN";
    const isTakeaway =
      storedOrderType.toUpperCase().includes("TAKEAWAY") ||
      storedOrderType.toUpperCase() === "TW";
    if (isTakeaway) {
      handleProceedToPayment();
      return;
    }

    // Dynamically check latest Enablekiosktable from AppSettings
    let shouldPromptTable = enableKioskTable === 1;
    try {
      const checkRes = await fetch(`${API}/app-settings`)
        .then((r) => r.json())
        .catch(() => null);
      if (checkRes && checkRes.success !== undefined) {
        const val = checkRes.Enablekiosktable ?? checkRes.enablekiosktable;
        shouldPromptTable =
          val === 1 ||
          val === true ||
          String(val) === "1" ||
          String(val).toLowerCase() === "true";
        setEnableKioskTable(shouldPromptTable ? 1 : 0);
      }
    } catch (_) {}

    if (shouldPromptTable) {
      // If Enablekiosktable = 1 and Dine In, display popup with two options: Self Collect & Enter Tent Number
      setCheckoutStep("CHOICE");
      setInputTableNo("");
      setTableInputError(null);
      setShowTableModal(true);
    } else {
      // If Enablekiosktable = 0, skip popup and continue existing checkout flow
      handleProceedToPayment();
    }
  };

  // Option 1: Self Checkout – continue checkout without entering a table number
  // Keeps the initially assigned Table Number from TableMaster unchanged
  const handleSelfCheckout = () => {
    setIsSelfCollect(true);
    setIsTentNumber(false);
    setShowTableModal(false);
    handleProceedToPayment();
  };

  // Option 2: Enter Tent Number – switch to tent number input view
  const handleChooseEnterTentNumber = () => {
    setIsSelfCollect(false);
    setIsTentNumber(true);
    setCheckoutStep("ENTER_TENT");
    setInputTableNo("");
    setTableInputError(null);
  };

  // Submit and validate manually entered tent number
  const handleSubmitTentNumber = async () => {
    const rawVal = inputTableNo.trim();
    if (!rawVal) {
      setTableInputError("Please enter your tent number");
      return;
    }

    // Validate alphanumeric/tent format (e.g. 10, 21, T-12)
    if (!/^[a-zA-Z0-9\-_]+$/.test(rawVal)) {
      setTableInputError("Please enter a valid tent number (e.g. 21, T-12)");
      return;
    }

    setIsUpdatingTent(true);
    setTableInputError(null);

    try {
      const activeOrderId =
        currentOrderId || (await AsyncStorage.getItem("kioskOrderId"));
      const storedTableId = tableId || (await AsyncStorage.getItem("tableId"));

      // Call backend to validate availability and update TableMaster & RestaurantOrderCur
      const res = await fetch(`${API}/order/kiosk/update-tent-number`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: activeOrderId,
          currentTableId: storedTableId,
          newTableNo: rawVal,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setTableInputError(
          data.error ||
            `Table / Tent number ${rawVal} is unavailable or occupied.`,
        );
        setIsUpdatingTent(false);
        return;
      }

      // Successfully updated on backend: update local state & AsyncStorage
      const updatedTableId = data.tableId || storedTableId;
      setTableNo(rawVal);
      if (updatedTableId) {
        setTableId(updatedTableId);
      }

      await AsyncStorage.setItem("tableNo", rawVal);
      if (updatedTableId) {
        await AsyncStorage.setItem("tableId", updatedTableId);
      }

      setShowTableModal(false);
      // Proceed to checkout with the updated TableId & TableNo
      handleProceedToPayment(updatedTableId);
    } catch (err: any) {
      console.error("Tent number update error:", err);
      setTableInputError(
        err?.message || "Failed to update tent number. Please try again.",
      );
    } finally {
      setIsUpdatingTent(false);
    }
  };

  // Checkout / Place Order Flow
  const handleProceedToPayment = async (overrideTableId?: string) => {
    console.log("Cart items:", cart);
    console.log("Subtotal:", subTotal);
    console.log("Calculated Total:", calculatedTotal);
    setTotalAmount(calculatedTotal);

    const activeTableId = overrideTableId || tableId || "TAKEAWAY";

    // Save cart items to database (RestaurantOrderCur & RestaurantOrderDetailCur) immediately
    if (cart.length > 0) {
      try {
        const orderId =
          currentOrderId || (await AsyncStorage.getItem("kioskOrderId"));
        const storedOrderType =
          (await AsyncStorage.getItem("kioskOrderType")) || "DINE_IN";
        const isTakeaway = storedOrderType.toUpperCase().includes("TAKEAWAY");
        console.log(
          `[Checkout] Saving cart for table: ${activeTableId}, order: ${orderId}, items: ${cart.length}`,
        );
        const saveRes = await fetch(`${API}/order/save-cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: activeTableId,
            orderId: orderId,
            orderType: isTakeaway ? "TAKEAWAY" : "DINE_IN",
            isTakeaway: isTakeaway,
            items: cart.map((item) => ({ ...item, status: "SENT", Status: "SENT", StatusCode: 2 })),
            userId: "00000000-0000-0000-0000-000000000000",
            isKiosk: true,
            entryStatus: "K",
            isSelfCollect: isSelfCollect,
            isTentNumber: isTentNumber,
            tentNumber: isTentNumber ? tableNo : undefined,
            discountAmount: promotionDiscount || 0,
            discountRemarks: appliedPromotion ? appliedPromotion.PromotionName : null,
            promotionId: appliedPromotion?.PromotionId || undefined,
            promotionName: appliedPromotion?.PromotionName || undefined,
          }),
        });
        const saveJson = await saveRes.json();
        console.log("✅ [Checkout] Cart synced response:", saveJson);
        if (saveJson?.orderId && saveJson.orderId !== orderId) {
          setCurrentOrderId(saveJson.orderId);
          await AsyncStorage.setItem("kioskOrderId", saveJson.orderId);
        }
      } catch (err) {
        console.warn("⚠️ [Checkout] Cart sync error:", err);
      }
    }

    // Ensure previous modals are closed, then open payment modal
    setShowPromotionModal(false);
    setShowTableModal(false);
    setShowPaymentPopup(true);
  };

  const getExtraChargeForPaymode = (modeName: string) => {
    const match = paymodesList.find(
      (p) => p.PayMode?.toUpperCase().trim() === modeName?.toUpperCase().trim(),
    );
    return match ? Number(match.ExtraCharges || 0) : 0;
  };

  const handlePaymodeClick = (method: string) => {
    const extra = getExtraChargeForPaymode(method);
    if (extra > 0) {
      setPendingPaymentAction({ method, extraCharge: extra });
      setShowExtraChargeModal(true);
    } else {
      executePaymentDecision(method, 0);
    }
  };

  const executePaymentDecision = (method: string, extraCharge = 0) => {
    const finalPayable = (
      Number(calculatedTotal) + Number(extraCharge)
    ).toFixed(2);
    setYeahPayPayableAmount(finalPayable);

    if (method === "CARD" || method === "PAYNOW") {
      handleYeahPayPayment(method, extraCharge);
    } else {
      executeCompletePayment(method, extraCharge);
    }
  };

  const handleYeahPayPayment = async (
    payWay: "CARD" | "PAYNOW",
    extraCharge = 0,
  ) => {
    const finalPayable = (
      Number(calculatedTotal) + Number(extraCharge)
    ).toFixed(2);
    setYeahPayPayableAmount(finalPayable);

    const action =
      payWay === "PAYNOW" ? "TRADE.QRCODE.PayNowPay" : "TRADE.CARD.CONSUME";

    setShowPaymentPopup(false);
    setShowYeahPayModal(true);
    setYeahPayStatus("PROCESSING");
    setYeahPayMsg(
      payWay === "PAYNOW"
        ? "Initiating PayNow QR on YeahPay Terminal..."
        : "Initiating YeahPay Cloud POS terminal transaction...",
    );
    setYeahPayDetails(null);

    const bizOrderId = generateBizOrderId(currentOrderId);

    try {
      const res = await fetch(`${API}/yeahpay/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalPayable,
          bizOrderId: bizOrderId,
          action: action,
          payWay: payWay,
          tableId: tableId || "COUNTER",
        }),
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("Non-JSON Response from YeahPay endpoint:", rawText);
        throw new Error(
          rawText.includes("<!DOCTYPE")
            ? "Backend server error (HTML returned). Please ensure backend is running."
            : rawText,
        );
      }
      console.log("💳 YeahPay Pay API Response:", data);

      if (data.success || data.status === 104) {
        setYeahPayStatus("SUCCESS");
        setYeahPayMsg("Transaction Approved by YeahPay Terminal!");
        setYeahPayDetails(data);

        setTimeout(() => {
          setShowYeahPayModal(false);
          executeCompletePayment(payWay, extraCharge);
        }, 1200);
      } else if (data.status === 103 || data.code === "0") {
        setYeahPayMsg(
          payWay === "PAYNOW"
            ? "Please scan PayNow QR code on YeahPay Terminal screen..."
            : "Please tap or insert card on YeahPay Terminal...",
        );

        let pollCount = 0;
        const maxPolls = 45;
        const pollInterval = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            setYeahPayStatus("FAILED");
            setYeahPayMsg("Payment timeout on POS terminal. Please try again.");
            return;
          }

          try {
            const queryRes = await fetch(`${API}/yeahpay/query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bizOrderId }),
            });

            const queryData = await queryRes.json();
            console.log("🔍 YeahPay Query Status:", queryData);

            if (
              queryData.success ||
              queryData.status === 104 ||
              queryData.status === 11 ||
              queryData.status === 2
            ) {
              clearInterval(pollInterval);
              setYeahPayStatus("SUCCESS");
              setYeahPayMsg("Transaction Approved by YeahPay Terminal!");
              setYeahPayDetails(queryData);

              setTimeout(() => {
                setShowYeahPayModal(false);
                executeCompletePayment(payWay, extraCharge);
              }, 1200);
            } else if (queryData.status === 105 || queryData.status === -1) {
              clearInterval(pollInterval);
              setYeahPayStatus("FAILED");
              setYeahPayMsg(
                queryData.msg || "Payment Failed or Cancelled on POS terminal.",
              );
            }
          } catch (e) {
            console.error("YeahPay query error:", e);
          }
        }, 2000);
      } else {
        setYeahPayStatus("FAILED");
        setYeahPayMsg(
          data.msg || "Failed to initiate payment on YeahPay terminal.",
        );
      }
    } catch (err: any) {
      console.error("handleYeahPayPayment Error:", err);
      setYeahPayStatus("FAILED");
      setYeahPayMsg(
        err?.message || "Network error connecting to YeahPay gateway.",
      );
    }
  };

  const executeCompletePayment = async (method: string, extraCharge = 0) => {
    setIsCartLoading(true);
    setShowPaymentPopup(false);

    try {
      const orderId =
        currentOrderId || (await AsyncStorage.getItem("kioskOrderId"));
      const carNumber = await AsyncStorage.getItem("kioskCarNumber");
      const customerName = await AsyncStorage.getItem("kioskCustomerName");
      const customerVehicleId = await AsyncStorage.getItem(
        "kioskCustomerVehicleId",
      );
      const orderType = await AsyncStorage.getItem("kioskOrderType");
      const isTakeaway =
        (orderType || "").toUpperCase().includes("TAKEAWAY") ||
        (orderType || "").toUpperCase() === "TW" ||
        isTakeawayOrder;
      const storedTableId = await AsyncStorage.getItem("tableId");
      const storedTableNo = await AsyncStorage.getItem("tableNo");
      const resolvedTableId =
        tableId || storedTableId || (isTakeaway ? "TAKEAWAY" : "DINE_IN");
      const resolvedTableNo =
        tableNo || storedTableNo || (isTakeaway ? "TAKEAWAY" : "DINE_IN");

      // Retain selected dish ID from cart throughout checkout
      const selectedDishId =
        cart.length > 0 ? cart[0]?.DishId || cart[0]?.id : null;

      const finalPayable = (
        Number(calculatedTotal) + Number(extraCharge)
      ).toFixed(2);

      const res = await fetch(`${API}/order/complete-online-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          tableNo: resolvedTableNo,
          tableId: resolvedTableId,
          isSelfCollect: isSelfCollect,
          isTentNumber: isTentNumber,
          tentNumber: isTentNumber ? resolvedTableNo : undefined,
          kioskOrderType: orderType,
          kioskCarNumber: carNumber || undefined,
          kioskCustomerName: customerName || undefined,
          defaultDishId: selectedDishId || undefined,
          customerVehicleId: customerVehicleId || undefined,
          totalAmount: parseFloat(finalPayable),
          paymentMethod: method,
          extraCharge: parseFloat(String(extraCharge)),
          cart: cart.map((item) => ({ ...item, status: "SENT", Status: "SENT", StatusCode: 2 })),
          isKiosk: true,
          entryStatus: "K",
          discount: promotionDiscount || 0,
          discountAmount: promotionDiscount || 0,
          discountRemarks: appliedPromotion ? appliedPromotion.PromotionName : null,
          promotionId: appliedPromotion?.PromotionId || undefined,
          promotionName: appliedPromotion?.PromotionName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Payment Settlement Failed");
      }

      // ── SAVE/UPDATE CUSTOMER RECORD ONLY AFTER SUCCESSFUL PAYMENT CONFIRMATION ──
      if (carNumber && selectedDishId) {
        try {
          await fetch(`${API}/order/kiosk/customer/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerVehicleId: customerVehicleId || undefined,
              carNumber: carNumber,
              customerName: customerName || undefined,
              defaultDishId: selectedDishId,
            }),
          });
          // Update cached default dish ID for this session
          await AsyncStorage.setItem(
            "kioskDefaultDishId",
            String(selectedDishId),
          );
        } catch (saveErr) {
          console.warn("Kiosk customer save endpoint error:", saveErr);
        }
      }

      const completedId = data.orderId || orderId || "1001";
      const cartItemsSnapshot = [...cart];
      const extraChargeSnapshot = parseFloat(String(extraCharge)) || 0;
      const finalAmountSnapshot = parseFloat(finalPayable) || 0;

      setIsCartLoading(false);
      setShowCartPage(false);
      setCart([]);
      setAppliedPromotion(null);
      setSelectedPromotion(null);

      // Clear session
      await AsyncStorage.multiRemove([
        "kioskOrderId",
        "kioskOrderType",
        "kioskCarNumber",
        "kioskCustomerName",
        "kioskCustomerVehicleId",
        "kioskDefaultDishId",
      ]);

      if (onOrderCompleted) {
        onOrderCompleted(completedId, {
          items: cartItemsSnapshot,
          extraCharge: extraChargeSnapshot,
          totalAmount: finalAmountSnapshot,
          subtotal: subTotal,
          serviceCharge: serviceCharge,
          takeawayCharge: takeawayCharge,
          gst: gstAmount,
          total: Number(finalPayable),
          tableNo: resolvedTableNo,
          tableId: resolvedTableId,
          isSelfCollect: isSelfCollect,
          isTentNumber: isTentNumber,
        });
      }
    } catch (err: any) {
      setIsCartLoading(false);
      Alert.alert("Settlement Error", err?.message || "Payment Failed");
    } finally {
      setIsCartLoading(false);
    }
  };

  const filteredDishes = dishes.filter((d) =>
    (d.Name || "").toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading Menu...</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onStartShouldSetResponderCapture={() => {
        resetIdleTimer();
        return false;
      }}
    >
      {/* ── Aesthetic Top Center Toast Notification (Like Cafe POS) ── */}
      {toastNotification.visible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.kioskToastContainer,
            {
              transform: [{ translateY: toastSlideY }],
              opacity: toastOpacity,
            },
          ]}
        >
          <View
            style={[
              styles.kioskToastPill,
              toastNotification.type === "error" && styles.kioskToastPillError,
            ]}
          >
            <View
              style={[
                styles.kioskToastIconWrap,
                toastNotification.type === "error" &&
                  styles.kioskToastIconWrapError,
              ]}
            >
              <Ionicons
                name={
                  toastNotification.type === "error"
                    ? "alert-circle"
                    : "checkmark-circle"
                }
                size={52}
                color={
                  toastNotification.type === "error" ? "#ef4444" : "#10b981"
                }
              />
            </View>
            <View style={styles.kioskToastTextWrap}>
              <Text
                style={[
                  styles.kioskToastTitle,
                  toastNotification.type === "error" &&
                    styles.kioskToastTitleError,
                ]}
                numberOfLines={2}
              >
                {toastNotification.itemName}
              </Text>
              {toastNotification.type !== "error" && (
                <Text style={styles.kioskToastSubtitle}>
                  Added to cart{" "}
                  {toastNotification.qty > 1
                    ? `(Qty: ${toastNotification.qty})`
                    : ""}{" "}
                  • {currencySymbol}
                  {Number(toastNotification.price).toFixed(2)}
                </Text>
              )}
            </View>
            {toastNotification.type !== "error" && (
              <View style={styles.kioskToastBadge}>
                <Ionicons
                  name="cart"
                  size={32}
                  color="#ffffff"
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.kioskToastBadgeText}>{cart.length}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Main Layout: Sidebar & Content ── */}
      <View style={styles.mainLayout}>
        {/* Floor Plan Champagne Aura Background for Main Menu */}
        {Platform.OS === "web" ? (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse 55% 45% at 30% 50%, rgba(253,186,116,0.4) 0%, transparent 60%)",
                mixBlendMode: "normal",
                filter: "blur(140px)",
                pointerEvents: "none",
                transform: "translateZ(0)",
              }}
              aria-hidden="true"
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse 45% 55% at 65% 40%, rgba(251,146,60,0.3) 0%, transparent 55%)",
                mixBlendMode: "normal",
                filter: "blur(150px)",
                pointerEvents: "none",
                transform: "translateZ(0)",
              }}
              aria-hidden="true"
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse 40% 35% at 50% 70%, rgba(254,215,170,0.35) 0%, transparent 50%)",
                mixBlendMode: "normal",
                filter: "blur(130px)",
                pointerEvents: "none",
                transform: "translateZ(0)",
              }}
              aria-hidden="true"
            />
          </>
        ) : (
          <LinearGradient
            colors={[
              "transparent",
              "rgba(255, 230, 180, 0.14)",
              "rgba(255, 200, 140, 0.45)",
              "rgba(230, 170, 100, 0.65)",
            ]}
            locations={[0, 0.3, 0.65, 1.0]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Categories Sidebar with Accordion Dropdown for Dish Groups */}
        <View style={styles.sidebar}>
          {/* Company Branding Header at the top of the sidebar */}
          {(companyLogoUri || companyName) ? (
            <View style={styles.sidebarBrandHeader}>
              {companyLogoUri ? (
                <View style={styles.sidebarBrandLogoWrap}>
                  <ExpoImage
                    source={{ uri: companyLogoUri }}
                    style={styles.sidebarBrandLogo}
                    contentFit="contain"
                  />
                </View>
              ) : null}
              {companyName ? (
                <Text
                  style={[
                    styles.sidebarBrandName,
                    !companyLogoUri && styles.sidebarBrandNameOnly,
                  ]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {companyName}
                </Text>
              ) : null}
            </View>
          ) : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.sidebarContent,
              (companyLogoUri || companyName)
                ? { paddingTop: 14 }
                : undefined,
            ]}
          >
            {categories.map((cat) => {
              const isActive = activeCategory === cat.CategoryId;
              const isExpanded = expandedCategoryId === cat.CategoryId;
              return (
                <View key={cat.CategoryId} style={styles.catGroupAccordionWrap}>
                  <TouchableOpacity
                    style={[styles.catCard, isActive && styles.catCardActive]}
                    onPress={() => {
                      setShowModifier(false);
                      setShowComboCustomizer(false);
                      setSelectedDish(null);
                      if (isExpanded) {
                        // Collapse it
                        setExpandedCategoryId(null);
                      } else {
                        // Expand it and make active
                        setExpandedCategoryId(cat.CategoryId);
                        setActiveCategory(cat.CategoryId);
                        if (isCategoryFavourite(cat)) {
                          loadFavouriteCategory();
                        } else if (isCategoryPrevious(cat)) {
                          loadPreviousCategory();
                        } else {
                          loadGroups(cat.CategoryId);
                        }
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    {/* Left orange accent bar */}
                    <View
                      style={[
                        styles.catCardBar,
                        isActive && styles.catCardBarActive,
                      ]}
                    />

                    {/* Category Food Icon */}
                    <View style={styles.catIconWrap}>
                      <Ionicons
                        name={
                          isCategoryFavourite(cat)
                            ? "heart"
                            : "restaurant-outline"
                        }
                        size={28}
                        color={isCategoryFavourite(cat) ? "#FF5A16" : "#f97316"}
                      />
                    </View>

                    {/* Info: Title & 3 dashed dots */}
                    <View style={styles.catInfoWrap}>
                      <Text
                        style={[
                          styles.catCardTitle,
                          isActive && styles.catCardTitleActive,
                        ]}
                        numberOfLines={2}
                      >
                        {cat.KitchenTypeName}
                      </Text>
                      <View style={styles.catDotRow}>
                        <View
                          style={[
                            styles.catDot,
                            { backgroundColor: "#f97316" },
                          ]}
                        />
                        <View style={styles.catDot} />
                        <View style={styles.catDot} />
                      </View>
                    </View>

                    {/* Chevron Arrow: Rotates down if active */}
                    <View style={styles.catArrowWrap}>
                      <Text
                        style={[
                          styles.catArrowText,
                          isExpanded && styles.catArrowTextActive,
                        ]}
                      >
                        {isExpanded ? "▼" : "›"}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Dropdown for Dish Groups under this Category - Clean & Professional */}
                  {isExpanded && groups.length > 0 && (
                    <View style={styles.sidebarSubgroupList}>
                      {groups.map((grp) => {
                        const isGrpActive = activeGroup === grp.DishGroupId;
                        return (
                          <TouchableOpacity
                            key={grp.DishGroupId}
                            style={[
                              styles.sidebarSubgroupItem,
                              isGrpActive && styles.sidebarSubgroupItemActive,
                            ]}
                            onPress={() => {
                              setShowModifier(false);
                              setShowComboCustomizer(false);
                              setSelectedDish(null);
                              setActiveGroup(grp.DishGroupId);
                              if (isCategoryFavourite(cat)) {
                                loadFavouriteCategory();
                              } else if (isCategoryPrevious(cat)) {
                                loadPreviousCategory();
                              } else {
                                loadDishes(grp.DishGroupId);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            {/* Subtle clean vertical indicator pip */}
                            <View
                              style={[
                                styles.sidebarSubgroupBar,
                                isGrpActive && styles.sidebarSubgroupBarActive,
                              ]}
                            />

                            <Text
                              style={[
                                styles.sidebarSubgroupText,
                                isGrpActive && styles.sidebarSubgroupTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {grp.DishGroupName}
                            </Text>

                            <View
                              style={[
                                styles.sidebarSubgroupIndicator,
                                isGrpActive &&
                                  styles.sidebarSubgroupIndicatorActive,
                              ]}
                            >
                              <Ionicons
                                name={
                                  isGrpActive
                                    ? "chevron-forward"
                                    : "chevron-forward-outline"
                                }
                                size={16}
                                color={isGrpActive ? "#ea580c" : "#94a3b8"}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Content Area */}
        <View style={styles.contentArea}>
          {(showComboCustomizer || showModifier) && !!selectedDish ? (
            <View style={styles.customizeFullScreenContainer}>
              {/* Top Bar on Pure White Background: Centered Title with Chef Hat & Orange Curved Swoosh, Orange Close Button */}
              <View style={styles.customizeTopWhiteBar}>
                {/* Left placeholder spacer to keep title perfectly centered */}
                <View style={{ width: 46 }} />

                <View style={styles.customizeTopTitleWrap}>
                  <View style={styles.customizeChefHatWrap}>
                    <Ionicons
                      name="restaurant-outline"
                      size={22}
                      color="#0f172a"
                    />
                  </View>
                  <View
                    style={{ flexDirection: "row", alignItems: "baseline" }}
                  >
                    <Text style={styles.customizeTopTitleBold}>Customize </Text>
                    <Text style={styles.customizeTopTitleOrange}>
                      Your Item
                    </Text>
                  </View>
                  <View style={styles.customizeTopOrangeSwoosh} />
                </View>

                <TouchableOpacity
                  style={styles.customizeTopHomeBtn}
                  onPress={() => {
                    const wasEditing = editingCartItemIndex !== null;
                    setShowComboCustomizer(false);
                    setShowModifier(false);
                    setSelectedDish(null);
                    setComboConfig(null);
                    setComboSelections({});
                    setComboDishModifiers([]);
                    setSelectedComboModifierIds([]);
                    setModifiers([]);
                    setSelectedModifierIds([]);
                    setEditingCartItemIndex(null);
                    if (wasEditing) {
                      setShowCartPage(true);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={26} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.customizeScrollView}
                contentContainerStyle={styles.customizeScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* White Rounded Card Showcase: Photo on Left + Title, Bullets, Orange Price & Trailing Tag Pills */}
                <View style={styles.customizeMainHeroCard}>
                  {/* Left Dish Photo Frame */}
                  <View style={styles.customizeHeroLeftOuter}>
                    <View style={styles.customizeHeroLeftInner}>
                      {selectedDish?.Image ? (
                        <ExpoImage
                          source={{ uri: `${API}/image/${selectedDish.Image}` }}
                          style={styles.customizeHeroImg}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={styles.customizeHeroImgPlaceholder}>
                          <Text style={{ fontSize: 72 }}>🍎</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Right Side: Title, Subtitle, Price Pill & Trailing Tag Badges */}
                  <View style={styles.customizeHeroRight}>
                    <Text style={styles.customizeHeroTitle} numberOfLines={2}>
                      {selectedDish?.Name || selectedDish?.name}
                    </Text>

                    <Text style={styles.customizeHeroSubtitle}>
                      {selectedDish?.Description
                        ? parseDescriptionBullets(selectedDish.Description)
                            .slice(0, 3)
                            .join(", ")
                        : "Fresh Apple, No Added Colors, No Preservatives"}
                    </Text>

                    <View style={styles.customizePricePill}>
                      <Text style={styles.customizePriceText}>
                        $
                        {Number(
                          selectedDish?.Price || selectedDish?.price || 0,
                        ).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Loading indicator if combo options are loading */}
                {comboLoading && (
                  <View style={styles.comboLoadingBox}>
                    <ActivityIndicator size="large" color="#ea580c" />
                    <Text style={styles.comboLoadingText}>
                      Loading options...
                    </Text>
                  </View>
                )}

                {/* Combo Selection Groups (e.g., Choose Your Juice, Choose Your Side) */}
                {(comboConfig?.groups || []).map((group: any) => {
                  const selectedIds = comboSelections[group.comboGroupId] || [];
                  const minSel = Number(group.minSelection || 0);
                  const maxSel = Number(group.maxSelection || 1);
                  const isRequired = minSel > 0;
                  const isGroupIncomplete =
                    !!comboError && selectedIds.length < minSel;

                  return (
                    <View
                      key={group.comboGroupId}
                      style={[
                        styles.customizeSectionCard,
                        isGroupIncomplete &&
                          styles.customizeSectionCardIncomplete,
                      ]}
                    >
                      <View style={styles.customizeSectionHeaderRow}>
                        <View style={styles.customizeSectionOrangeTab}>
                          <Text style={styles.customizeSectionOrangeTabText}>
                            {group.groupName}
                          </Text>
                        </View>
                        <View style={styles.customizeOptionalBadge}>
                          <Text style={styles.customizeOptionalText}>
                            {isRequired
                              ? `Select ${minSel === maxSel ? minSel : `${minSel} to ${maxSel}`}`
                              : `Optional (up to ${maxSel})`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.customizeTilesGridContainer}>
                        {(group.options || []).map((opt: any) => {
                          const isSelected = selectedIds.includes(opt.dishId);
                          const totalOptSurcharge =
                            (Number(opt.surcharge) || 0) +
                            (Number(opt.dishPrice) || 0);

                          return (
                            <TouchableOpacity
                              key={opt.mappingId || opt.dishId}
                              style={[
                                styles.customizeTileCard,
                                isSelected && styles.customizeTileCardSelected,
                              ]}
                              onPress={() =>
                                handleSelectComboOption(
                                  group.comboGroupId,
                                  opt,
                                  group.isMultiSelect,
                                  group.maxSelection,
                                )
                              }
                              activeOpacity={0.85}
                            >
                              <View
                                style={[
                                  styles.customizeTileCheckSquare,
                                  isSelected &&
                                    styles.customizeTileCheckSquareSelected,
                                  !group.isMultiSelect && { borderRadius: 12 },
                                ]}
                              >
                                {isSelected && (
                                  <Ionicons
                                    name="checkmark"
                                    size={14}
                                    color="#ffffff"
                                  />
                                )}
                              </View>

                              <Text
                                style={[
                                  styles.customizeTileName,
                                  isSelected &&
                                    styles.customizeTileNameSelected,
                                ]}
                                numberOfLines={2}
                              >
                                {opt.name}
                              </Text>

                              <View
                                style={[
                                  styles.customizeTilePriceBadge,
                                  isSelected &&
                                    styles.customizeTilePriceBadgeSelected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.customizeTilePriceText,
                                    isSelected &&
                                      styles.customizeTilePriceTextSelected,
                                  ]}
                                >
                                  {totalOptSurcharge > 0
                                    ? `+ $${totalOptSurcharge.toFixed(2)}`
                                    : "$0.00"}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}

                {/* Modifiers / Add-ons Section (if any modifiers exist) */}
                {(() => {
                  const activeModifiers =
                    comboDishModifiers && comboDishModifiers.length > 0
                      ? comboDishModifiers
                      : modifiers;

                  if (!activeModifiers || activeModifiers.length === 0)
                    return null;

                  const modGroups: { [title: string]: any[] } = {};
                  activeModifiers.forEach((m) => {
                    const grpName = m.ModifierGroupName || "Add-ons";
                    if (!modGroups[grpName]) modGroups[grpName] = [];
                    modGroups[grpName].push(m);
                  });

                  const groupKeys = Object.keys(modGroups);

                  return (
                    <View style={styles.customizeSectionCard}>
                      <View style={styles.customizeSectionHeaderRow}>
                        <View style={styles.customizeSectionOrangeTab}>
                          <Text style={styles.customizeSectionOrangeTabText}>
                            Add Modifier
                          </Text>
                        </View>
                        <View style={styles.customizeOptionalBadge}>
                          <Text style={styles.customizeOptionalText}>
                            Optional
                          </Text>
                        </View>
                      </View>

                      {groupKeys.map((groupKey) => {
                        const groupItems = modGroups[groupKey];
                        const getGroupIcon = (title: string) => {
                          const t = title.toLowerCase();
                          if (
                            t.includes("flavor") ||
                            t.includes("syrup") ||
                            t.includes("drink")
                          )
                            return "water-outline";
                          if (t.includes("topping") || t.includes("sauce"))
                            return "restaurant-outline";
                          return "fast-food-outline";
                        };

                        return (
                          <View
                            key={groupKey}
                            style={styles.customizeGroupBlock}
                          >
                            <View style={styles.customizeGroupSubHeader}>
                              <View style={styles.customizeGroupSubHeaderLeft}>
                                <View style={styles.customizeGroupIconBadge}>
                                  <Ionicons
                                    name={getGroupIcon(groupKey) as any}
                                    size={18}
                                    color="#ea580c"
                                  />
                                </View>
                                <Text style={styles.customizeGroupTitleText}>
                                  {groupKey}
                                </Text>
                              </View>
                              <Ionicons
                                name="chevron-up"
                                size={20}
                                color="#ea580c"
                              />
                            </View>

                            <View style={styles.customizeTilesGridContainer}>
                              {groupItems.map((item) => {
                                const id = String(
                                  item.ModifierID || item.ModifierId,
                                );
                                const isComboActive = !!(
                                  comboConfig?.groups?.length > 0
                                );
                                const isSelected = isComboActive
                                  ? selectedComboModifierIds.includes(id)
                                  : selectedModifierIds.includes(id);
                                const priceNum = Number(item.Price || 0);

                                return (
                                  <TouchableOpacity
                                    key={id}
                                    style={[
                                      styles.customizeTileCard,
                                      isSelected &&
                                        styles.customizeTileCardSelected,
                                    ]}
                                    onPress={() => {
                                      if (isComboActive) {
                                        handleToggleComboModifier(id);
                                      } else {
                                        setSelectedModifierIds((prev) =>
                                          prev.includes(id)
                                            ? prev.filter((x) => x !== id)
                                            : [...prev, id],
                                        );
                                      }
                                    }}
                                    activeOpacity={0.85}
                                  >
                                    <View
                                      style={[
                                        styles.customizeTileCheckSquare,
                                        isSelected &&
                                          styles.customizeTileCheckSquareSelected,
                                      ]}
                                    >
                                      {isSelected && (
                                        <Ionicons
                                          name="checkmark"
                                          size={14}
                                          color="#ffffff"
                                        />
                                      )}
                                    </View>

                                    <Text
                                      style={[
                                        styles.customizeTileName,
                                        isSelected &&
                                          styles.customizeTileNameSelected,
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {item.ModifierName}
                                    </Text>

                                    <View
                                      style={[
                                        styles.customizeTilePriceBadge,
                                        isSelected &&
                                          styles.customizeTilePriceBadgeSelected,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.customizeTilePriceText,
                                          isSelected &&
                                            styles.customizeTilePriceTextSelected,
                                        ]}
                                      >
                                        {priceNum > 0
                                          ? `+ $${priceNum.toFixed(2)}`
                                          : "$0.00"}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* Inline Combo Error Message */}
                {!!comboError && (
                  <View style={styles.comboInlineErrorBox}>
                    <Text style={styles.comboInlineErrorText}>
                      {comboError}
                    </Text>
                  </View>
                )}
              </ScrollView>

              {/* Bottom Floating Bar: Soft Peach Pill (-) Qty (+) | Vivid Orange "🛒 Add to Cart $X.XX" */}
              <View
                style={[
                  styles.customizeBottomBar,
                  {
                    paddingBottom:
                      (Platform.OS === "ios" ? 34 : 20) + safeBottom,
                  },
                ]}
              >
                <View style={styles.customizeBottomBarInner}>
                  <View style={styles.customizeQtyControls}>
                    <TouchableOpacity
                      style={styles.customizeQtyBtnMinus}
                      onPress={() => setComboQty(Math.max(1, comboQty - 1))}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={26} color="#ffffff" />
                    </TouchableOpacity>
                    <Text style={styles.customizeQtyVal}>{comboQty}</Text>
                    <TouchableOpacity
                      style={styles.customizeQtyBtnPlus}
                      onPress={() => setComboQty(comboQty + 1)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={26} color="#ffffff" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.customizeBottomDivider} />

                  {(() => {
                    const isComboActive = !!(comboConfig?.groups?.length > 0);
                    let totalPrice = "0.00";

                    if (isComboActive) {
                      totalPrice = (calculateComboTotal() * comboQty).toFixed(
                        2,
                      );
                    } else {
                      const chosenMods = modifiers.filter((m) =>
                        selectedModifierIds.includes(
                          String(m.ModifierID || m.ModifierId),
                        ),
                      );
                      const extra = chosenMods.reduce(
                        (s, m) => s + Number(m.Price || 0),
                        0,
                      );
                      const unitPrice =
                        Number(
                          selectedDish?.Price || selectedDish?.price || 0,
                        ) + extra;
                      totalPrice = (unitPrice * comboQty).toFixed(2);
                    }

                    const totalCartCount = cart.length;

                    return (
                      <TouchableOpacity
                        style={styles.customizeAddToCartBtn}
                        onPress={() => {
                          if (isComboActive) {
                            handleAddComboToCart();
                          } else {
                            addWithModifiers();
                          }
                        }}
                        activeOpacity={0.88}
                      >
                        {/* Circular/Pill Badge showing total cart item count if cart has items */}
                        {totalCartCount > 0 && editingCartItemIndex === null && (
                          <View style={styles.customizeAddToCartBadge}>
                            <Text style={styles.customizeAddToCartBadgeText}>
                              {totalCartCount}
                            </Text>
                          </View>
                        )}
                        <Ionicons
                          name={editingCartItemIndex !== null ? "checkmark-circle" : "cart-outline"}
                          size={24}
                          color="#ffffff"
                          style={{ marginRight: 10 }}
                        />
                        <Text style={styles.customizeAddToCartBtnText}>
                          {editingCartItemIndex !== null
                            ? `Save & Confirm $${totalPrice}`
                            : `Add to Cart $${totalPrice}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>
            </View>
          ) : (
            <>
              {/* Hero Banner matching reference design */}
              <View style={styles.heroBanner}>
                <View style={styles.heroIconCircle}>
                  <Ionicons name="restaurant" size={32} color="#ea580c" />
                </View>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.heroCategoryTitle}>
                    {categories.find((c) => c.CategoryId === activeCategory)
                      ?.KitchenTypeName || "Delicious Dishes"}
                  </Text>
                  <Text style={styles.heroSubtitle}>
                    Choose your favourite dish
                  </Text>
                </View>
              </View>

              {/* Dishes Grid */}
              <FlatList
                data={
                  numColumns > 1
                    ? formatData(filteredDishes, numColumns)
                    : filteredDishes
                }
                keyExtractor={(d) => String(d.DishId)}
                numColumns={numColumns}
                key={`cols-${numColumns}`}
                style={styles.dishesFlatList}
                contentContainerStyle={styles.dishesList}
                renderItem={({ item }) => {
                  if (item.empty) {
                    return (
                      <View
                        style={[styles.dishCard, styles.dishCardInvisible]}
                        pointerEvents="none"
                      />
                    );
                  }

                  const dishQty = cart
                    .filter(
                      (c: any) =>
                        (c.DishId || c.id) === (item.DishId || item.id),
                    )
                    .reduce((sum: number, c: any) => sum + (c.qty || 1), 0);

                  return (
                    <TouchableOpacity
                      style={[
                        styles.dishCard,
                        item.IsSoldOut && styles.dishSoldOut,
                      ]}
                      onPress={() => handleDishClick(item)}
                      activeOpacity={0.88}
                    >
                      {/* Top Right Badge: Shows quantity (e.g. 1) with scale pop animation if added to cart, otherwise heart outline */}
                      {dishQty > 0 ? (
                        <Animated.View
                          style={[
                            styles.dishCardQtyBadge,
                            {
                              transform: [
                                { scale: getBadgeAnim(item.DishId || item.id) },
                              ],
                            },
                          ]}
                        >
                          <Text style={styles.dishCardQtyBadgeText}>
                            {dishQty}
                          </Text>
                        </Animated.View>
                      ) : (
                        <View style={styles.dishCardHeartWrap}>
                          <Text style={styles.dishCardHeartIcon}>♡</Text>
                        </View>
                      )}

                      {/* Circular dish image matching reference design */}
                      <View style={styles.dishCircularBox}>
                        {item.Image ? (
                          <ExpoImage
                            source={{ uri: `${API}/image/${item.Image}` }}
                            style={styles.dishImg}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={150}
                          />
                        ) : (
                          <Ionicons
                            name="fast-food-outline"
                            size={68}
                            color="#94a3b8"
                          />
                        )}
                        {item.IsSoldOut && (
                          <View style={styles.soldOutBadge}>
                            <Text style={styles.soldOutText}>Sold Out</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.dishInfo}>
                        <View style={styles.dishTopContent}>
                          <Text style={styles.dishName} numberOfLines={2}>
                            {item.Name}
                          </Text>
                        </View>

                        <Text style={styles.dishPrice}>
                          ${Number(item.Price || 0).toFixed(2)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyDishes}>
                    <Text style={styles.emptyDishesText}>
                      {isCategoryPrevious(activeCategory)
                        ? "No previous orders found."
                        : "No items in this group."}
                    </Text>
                  </View>
                }
              />
            </>
          )}
        </View>
      </View>

      {/* ── Unified Full-Width Professional Touchscreen Kiosk Bottom Action Bar ── */}
      {!showCartPage && !showModifier && !showComboCustomizer && (
        <View
          style={[styles.floatingCartBar, { paddingBottom: 20 + safeBottom }]}
        >
          {/* 1) Start Over Button (1:1:3 ratio -> flex: 1) */}
          <TouchableOpacity
            style={styles.bottomBarStartOverBtn}
            onPress={onLogout}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={30} color="#ea580c" />
            <Text style={styles.bottomBarStartOverText} numberOfLines={1}>
              Start Over
            </Text>
          </TouchableOpacity>

          {/* 2) Clear Cart Button (1:1:3 ratio -> flex: 1) */}
          <TouchableOpacity
            style={[
              styles.cartClearBtn,
              cart.length === 0 && styles.cartActionBtnDisabled,
            ]}
            onPress={() => cart.length > 0 && setShowClearCartConfirm(true)}
            disabled={cart.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons
              name="trash-outline"
              size={30}
              color={cart.length === 0 ? "#a8a29e" : "#e11d48"}
            />
            <Text
              style={[
                styles.cartClearText,
                cart.length === 0 && styles.cartClearTextDisabled,
              ]}
              numberOfLines={1}
            >
              Clear Cart
            </Text>
          </TouchableOpacity>

          {/* 3) View Order Hero Banner (1:1:3 ratio -> flex: 3) */}
          <TouchableOpacity
            style={[
              styles.cartViewBtn,
              cart.length === 0 && styles.cartViewBtnDisabled,
            ]}
            onPress={() => cart.length > 0 && setShowCartPage(true)}
            disabled={cart.length === 0}
            activeOpacity={0.88}
          >
            {/* Left Info: Cart Icon + Title + Selected items subtitle */}
            <View style={styles.cartBannerLeft}>
              <Ionicons
                name="cart-outline"
                size={34}
                color={cart.length === 0 ? "#a8a29e" : "#ffffff"}
              />
              <View style={styles.cartBannerMeta}>
                <Text
                  style={[
                    styles.cartViewTitle,
                    cart.length === 0 && styles.cartViewTextDisabled,
                  ]}
                  numberOfLines={1}
                >
                  View Order
                </Text>
                <Text
                  style={[
                    styles.cartBannerSubtitle,
                    cart.length === 0 && styles.cartBannerSubtitleDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {cart.length}{" "}
                  {cart.length === 1 ? "item selected" : "items selected"}
                </Text>
              </View>
            </View>

            {/* Right Info: TOTAL label + Amount + Forward Arrow */}
            <View style={styles.cartBannerRight}>
              <View style={styles.cartBannerPriceBlock}>
                <Text
                  style={[
                    styles.cartBannerPriceLabel,
                    cart.length === 0 && styles.cartBannerPriceLabelDisabled,
                  ]}
                >
                  TOTAL
                </Text>
                <Text
                  style={[
                    styles.cartBannerPriceVal,
                    cart.length === 0 && styles.cartBannerPriceValDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {currencySymbol}
                  {calculatedTotal}
                </Text>
              </View>

              <View
                style={[
                  styles.cartBannerArrowCircle,
                  cart.length === 0 && styles.cartBannerArrowCircleDisabled,
                ]}
              >
                <Ionicons
                  name="arrow-forward"
                  size={24}
                  color={cart.length === 0 ? "#a8a29e" : "#ea580c"}
                />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Attractive Promo Slideshow Attract Loop Screensaver (dbo.PromoCodeMaster) ── */}
      {showAttractLoop && promoSlides.length > 0 && (
        <TouchableOpacity
          style={styles.attractLoopContainer}
          activeOpacity={1}
          onPress={dismissAttractLoop}
        >
          {/* Slideshow Image with crossfade scale animation */}
          <Animated.View
            style={[
              styles.attractLoopImageWrap,
              {
                opacity: slideAnim,
              },
            ]}
          >
            <Image
              source={{ uri: promoSlides[currentSlideIndex]?.PromoImage }}
              style={styles.attractLoopImage}
              resizeMode="cover"
            />
          </Animated.View>

          {/* Minimal Clean Overlay: pure poster showcase with bottom pagination & glass CTA */}
          <View style={styles.attractLoopOverlay}>
            <View style={{ flex: 1 }} />

            {/* Slide Pagination Dots (Only if multiple promo posters exist) */}
            {promoSlides.length > 1 && (
              <View style={styles.attractLoopDotsRow}>
                {promoSlides.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.attractLoopDot,
                      idx === currentSlideIndex && styles.attractLoopDotActive,
                    ]}
                  />
                ))}
              </View>
            )}

            {/* Minimalist Frosted Glass CTA */}
            <Animated.View
              style={[
                styles.attractLoopCtaWrap,
                { transform: [{ scale: pulseTouchAnim }] },
              ]}
            >
              <View style={styles.attractLoopCtaBtn}>
                <Text style={styles.attractLoopCtaText}>
                  TOUCH SCREEN TO ORDER
                </Text>
              </View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Cart Full-Screen View ── */}
      <Modal
        visible={showCartPage}
        animationType="slide"
        onRequestClose={() => setShowCartPage(false)}
      >
        <View
          style={styles.cartModalContainer}
          onStartShouldSetResponderCapture={() => {
            resetIdleTimer();
            return false;
          }}
        >
          {/* Floor Plan Style Background (Matching POS Category Champagne Aura) */}
          {Platform.OS === "web" ? (
            <>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 55% 45% at 30% 50%, rgba(253,186,116,0.5) 0%, transparent 60%)",
                  mixBlendMode: "normal",
                  filter: "blur(140px)",
                  pointerEvents: "none",
                  transform: "translateZ(0)",
                }}
                aria-hidden="true"
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 45% 55% at 65% 40%, rgba(251,146,60,0.38) 0%, transparent 55%)",
                  mixBlendMode: "normal",
                  filter: "blur(150px)",
                  pointerEvents: "none",
                  transform: "translateZ(0)",
                }}
                aria-hidden="true"
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 40% 35% at 50% 70%, rgba(254,215,170,0.45) 0%, transparent 50%)",
                  mixBlendMode: "normal",
                  filter: "blur(130px)",
                  pointerEvents: "none",
                  transform: "translateZ(0)",
                }}
                aria-hidden="true"
              />
            </>
          ) : (
            <>
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(255, 230, 180, 0.18)",
                  "rgba(255, 200, 140, 0.55)",
                  "rgba(230, 170, 100, 0.75)",
                ]}
                locations={[0, 0.3, 0.65, 1.0]}
                style={StyleSheet.absoluteFill}
              />
            </>
          )}

          {/* Cart Header */}
          <View style={styles.cartModalHeader}>
            <TouchableOpacity
              style={styles.cartHeaderBackBtn}
              onPress={() => setShowCartPage(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={24} color="#1e293b" />
            </TouchableOpacity>
            <View style={styles.cartHeaderTitleWrap}>
              <Text style={styles.cartHeaderTitle}>Your Cart</Text>
              <Text style={styles.cartHeaderSubtitle}>
                {cart.reduce((s, i) => s + (Number(i.qty) || 1), 0)}{" "}
                {cart.reduce((s, i) => s + (Number(i.qty) || 1), 0) === 1
                  ? "item"
                  : "items"}{" "}
                selected
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cartHeaderClearBtn}
              onPress={() => cart.length > 0 && setShowClearCartConfirm(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-bin-outline" size={20} color="#ef4444" />
              <Text style={styles.cartHeaderClearText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          {/* Promotional Offer Success Notification */}
          {promoSuccessToast && (
            <View style={styles.cartPromoSuccessBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <Text style={styles.cartPromoSuccessBannerText}>{promoSuccessToast}</Text>
            </View>
          )}

          {/* Scrollable Items List */}
          <ScrollView
            style={styles.cartItemsScrollView}
            contentContainerStyle={styles.cartScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {cart.map((item, index) => {
              const matchedDish =
                !item.Image && item.DishId
                  ? dishes.find(
                      (d) => String(d.DishId || d.id) === String(item.DishId),
                    )
                  : null;
              const imageFilename = item.Image || matchedDish?.Image;

              const isComboItem =
                item.isCombo === true ||
                item.IsCombo === true ||
                item.isCombo === 1 ||
                item.IsCombo === 1 ||
                String(item.isCombo) === "1" ||
                String(item.IsCombo) === "1" ||
                (Array.isArray(item.comboSelections) && item.comboSelections.length > 0) ||
                matchedDish?.IsCombo === true ||
                matchedDish?.IsCombo === 1 ||
                String(matchedDish?.IsCombo) === "1";

              const hasModifiers =
                (Array.isArray(item.selectedMods) && item.selectedMods.length > 0) ||
                (Array.isArray(item.modifiers) && item.modifiers.length > 0) ||
                (Array.isArray(matchedDish?.modifiers) && matchedDish.modifiers.length > 0);

              const isConfigurable = isComboItem || hasModifiers;

              return (
                <View key={String(index)} style={styles.cartItemRow}>
                  {/* Dish Thumbnail on Left - Clickable to open Modifier/Combo Popup */}
                  <TouchableOpacity
                    style={styles.cartItemThumbWrap}
                    onPress={() => isConfigurable && handleEditCartItem(index)}
                    activeOpacity={isConfigurable ? 0.75 : 1}
                    disabled={!isConfigurable}
                  >
                    {item.isPromotionalItem ? (
                      <View style={styles.cartItemPromoThumb}>
                        <Ionicons name="sparkles" size={26} color="#ea580c" />
                      </View>
                    ) : imageFilename ? (
                      <ExpoImage
                        source={{ uri: `${API}/image/${imageFilename}` }}
                        style={styles.cartItemThumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={styles.cartItemThumbPlaceholder}>
                        <Ionicons
                          name="restaurant-outline"
                          size={26}
                          color="#f97316"
                        />
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={styles.cartItemLeft}>
                    {/* Item Title - Clickable to open Modifier/Combo Popup */}
                    <TouchableOpacity
                      onPress={() => isConfigurable && handleEditCartItem(index)}
                      activeOpacity={isConfigurable ? 0.75 : 1}
                      disabled={!isConfigurable}
                      style={{ width: "100%" }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text style={styles.cartItemName}>
                          {item.Name || item.name}
                        </Text>
                        {item.isPromotionalItem && (
                          <View style={styles.cartItemPromoBadge}>
                            <Ionicons name="sparkles" size={11} color="#ea580c" />
                            <Text style={styles.cartItemPromoBadgeText}>
                              {item.PromotionType || "OFFER"}
                            </Text>
                          </View>
                        )}
                      </View>
                      {item.Description ? (
                        <Text style={styles.cartItemPromoDescText}>
                          {item.Description}
                        </Text>
                      ) : null}
                    </TouchableOpacity>

                    {/* Customizations Section (Modifiers & Combo Selections) - Clean, borderless & clickable */}
                    {(item.selectedMods?.length > 0 || item.comboSelections?.length > 0) && (
                      <TouchableOpacity
                        style={styles.cartCustomizationGroup}
                        onPress={() => handleEditCartItem(index)}
                        activeOpacity={0.65}
                      >
                        {item.selectedMods?.length > 0 && (
                          <View style={{ marginTop: 3, width: "100%" }}>
                            <View style={styles.cartCustomizationHeaderRow}>
                              <Text style={styles.cartModifierGroupTitle}>Modifiers:</Text>
                              <View style={styles.cartInlineEditBadge}>
                                <Ionicons name="pencil" size={15} color="#ea580c" />
                                <Text style={styles.cartInlineEditText}>Edit</Text>
                              </View>
                            </View>
                            <Text style={styles.cartModifierValueText}>
                              ↳ {item.selectedMods.map((m: any) => m.ModifierName).join(", ")}
                            </Text>
                          </View>
                        )}

                        {item.comboSelections?.length > 0 &&
                          item.comboSelections.map((grp: any, gIdx: number) => (
                            <View key={gIdx} style={{ marginTop: (gIdx > 0 || item.selectedMods?.length > 0) ? 6 : 3, width: "100%" }}>
                              <View style={styles.cartCustomizationHeaderRow}>
                                <Text style={styles.cartModifierGroupTitle}>
                                  {grp.groupName}:
                                </Text>
                                <View style={styles.cartInlineEditBadge}>
                                <Ionicons name="pencil" size={15} color="#ea580c" />
                                <Text style={styles.cartInlineEditText}>Edit</Text>
                              </View>
                            </View>
                            {(grp.items || []).map((opt: any, oIdx: number) => (
                              <Text key={oIdx} style={styles.cartModifierValueText}>
                                ↳ {opt.name || opt.dishName}
                                {Number(opt.surcharge || 0) + Number(opt.dishPrice || 0) > 0
                                  ? ` (+${(Number(opt.surcharge || 0) + Number(opt.dishPrice || 0)).toFixed(2)})`
                                  : ""}
                              </Text>
                            ))}
                          </View>
                        ))}
                      </TouchableOpacity>
                    )}

                    {/* Fallback for configurable item without current selections */}
                    {isConfigurable && !item.selectedMods?.length && !item.comboSelections?.length && (
                      <TouchableOpacity
                        style={[styles.cartCustomizationGroup, { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }]}
                        onPress={() => handleEditCartItem(index)}
                        activeOpacity={0.65}
                      >
                        <Text style={[styles.cartModifierGroupTitle, { fontSize: 13 }]}>
                          Customize / Choose Options
                        </Text>
                        <View style={styles.cartInlineEditBadge}>
                          <Ionicons name="pencil" size={10} color="#ea580c" />
                          <Text style={styles.cartInlineEditText}>Edit</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.cartItemCenter}>
                    {item.isPromotionalItem ? (
                      <View style={styles.promoAppliedBadgePill}>
                        <Ionicons name="sparkles" size={13} color="#ea580c" />
                        <Text style={styles.promoAppliedBadgePillText}>Offer</Text>
                      </View>
                    ) : (
                      <View style={styles.qtyControlsContainer}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => decreaseQty(index)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="remove" size={26} color="#ffffff" />
                        </TouchableOpacity>

                        <Text style={styles.qtyVal}>
                          {item.qty || 1}
                        </Text>

                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => increaseQty(index)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="add" size={26} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.cartItemRight}>
                    <Text
                      style={[
                        styles.cartItemPrice,
                        item.isPromotionalItem &&
                          (item.isBogoFree || item.isFlatDiscount || item.isPercentageDiscount) && {
                            color: "#059669",
                            fontWeight: "900",
                          },
                      ]}
                    >
                      {item.isBogoFree
                        ? "FREE"
                        : item.isFlatDiscount
                          ? `-${currencySymbol}${Number(item.discountValue || 0).toFixed(2)}`
                          : item.isPercentageDiscount
                            ? `-${Number(item.discountValue || 0)}%`
                            : `${currencySymbol}${(
                                Number(item.Price || item.finalPrice || 0) *
                                Number(item.qty || 1)
                              ).toFixed(2)}`}
                    </Text>
                    <TouchableOpacity
                      style={styles.cartItemDeleteBtn}
                      onPress={() => setItemToDeleteIndex(index)}
                      hitSlop={8}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={22}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Applied Promotion Discount Entry in Cart */}
            {appliedPromotion && promotionDiscount > 0 && (
              <View style={styles.appliedPromoEntryCard}>
                <View style={styles.appliedPromoEntryIconWrap}>
                  <Ionicons name="gift" size={24} color="#ea580c" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={styles.appliedPromoEntryTitle}>
                      {appliedPromotion.PromotionName}
                    </Text>
                    <View style={styles.appliedPromoEntryTypePill}>
                      <Text style={styles.appliedPromoEntryTypePillText}>
                        {appliedPromotion.PromotionType || "DISCOUNT"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.appliedPromoEntryDesc}>
                    {appliedPromotion.Description || appliedPromotion.PromotionDescription || "Promotional Discount Applied"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.appliedPromoEntryDiscountVal}>
                    -{currencySymbol}{promotionDiscount.toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setAppliedPromotion(null);
                      setSelectedPromotion(null);
                    }}
                    hitSlop={8}
                    style={{ marginTop: 4 }}
                  >
                    <Text style={styles.appliedPromoEntryRemoveBtn}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Fixed Down Summary & Actions Card */}
          <View style={styles.cartBottomFixedContainer}>
            <View style={styles.cartSummaryCard}>
              {/* Subtotal Row with Icon */}
              <View style={styles.totalRow}>
                <View style={styles.totalLabelGroup}>
                  <View style={styles.totalRowIconWrap}>
                    <Ionicons
                      name="receipt-outline"
                      size={17}
                      color="#64748b"
                    />
                  </View>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                </View>
                <Text style={styles.totalValue}>
                  {currencySymbol}
                  {subTotal.toFixed(2)}
                </Text>
              </View>

              {takeawayCharge > 0 && (
                <View style={styles.totalRow}>
                  <View style={styles.totalLabelGroup}>
                    <View style={styles.totalRowIconWrap}>
                      <Ionicons
                        name="bag-handle-outline"
                        size={17}
                        color="#64748b"
                      />
                    </View>
                    <Text style={styles.totalLabel}>Takeaway Charge</Text>
                  </View>
                  <Text style={styles.totalValue}>
                    {currencySymbol}
                    {takeawayCharge.toFixed(2)}
                  </Text>
                </View>
              )}

              {serviceCharge > 0 && (
                <View style={styles.totalRow}>
                  <View style={styles.totalLabelGroup}>
                    <View style={styles.totalRowIconWrap}>
                      <Ionicons
                        name="restaurant-outline"
                        size={17}
                        color="#64748b"
                      />
                    </View>
                    <Text style={styles.totalLabel}>
                      Service Charge ({applicableScPercent}%)
                    </Text>
                  </View>
                  <Text style={styles.totalValue}>
                    {currencySymbol}
                    {serviceCharge.toFixed(2)}
                  </Text>
                </View>
              )}

              {gstPercent > 0 && (
                <View style={styles.totalRow}>
                  <View style={styles.totalLabelGroup}>
                    <View style={styles.totalRowIconWrap}>
                      <Ionicons
                        name="pricetag-outline"
                        size={17}
                        color="#64748b"
                      />
                    </View>
                    <Text style={styles.totalLabel}>
                      GST ({gstPercent}%){" "}
                      {taxMode === "inclusive" ? "(Incl)" : ""}
                    </Text>
                  </View>
                  <Text style={styles.totalValue}>
                    {currencySymbol}
                    {gstAmount.toFixed(2)}
                  </Text>
                </View>
              )}

              {promotionDiscount > 0 && (
                <View style={styles.totalRow}>
                  <View style={styles.totalLabelGroup}>
                    <View style={[styles.totalRowIconWrap, { backgroundColor: "#FFF7ED" }]}>
                      <Ionicons
                        name="sparkles"
                        size={17}
                        color="#ea580c"
                      />
                    </View>
                    <Text style={[styles.totalLabel, { color: "#ea580c", fontWeight: "700" }]}>
                      Promo: {appliedPromotion?.PromotionName || "Offer Discount"}
                    </Text>
                  </View>
                  <Text style={[styles.totalValue, { color: "#ea580c", fontWeight: "800" }]}>
                    -{currencySymbol}
                    {promotionDiscount.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Grand Total Row with Badge & Accent Color */}
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <View style={styles.grandTotalLabelWrap}>
                  <Text style={styles.grandTotalLabel}>Total</Text>
                  <View style={styles.grandTotalItemsBadge}>
                    <Text style={styles.grandTotalItemsBadgeText}>
                      {cart.reduce((s, i) => s + (Number(i.qty) || 1), 0)} items
                    </Text>
                  </View>
                </View>
                <Text style={styles.grandTotalValue}>
                  {currencySymbol}
                  {calculatedTotal}
                </Text>
              </View>

              {/* Primary Action Button: Proceed to Checkout */}
              <TouchableOpacity
                style={[
                  styles.checkoutBtn,
                  checkingPromotions && { opacity: 0.8 },
                ]}
                onPress={handleCheckoutClick}
                disabled={cart.length === 0 || checkingPromotions}
                activeOpacity={0.88}
              >
                <View style={styles.checkoutBtnInner}>
                  {checkingPromotions ? (
                    <ActivityIndicator
                      size="small"
                      color="#ffffff"
                      style={{ marginRight: 8 }}
                    />
                  ) : (
                    <Ionicons
                      name="card-outline"
                      size={22}
                      color="#ffffff"
                      style={{ marginRight: 8 }}
                    />
                  )}
                  <Text style={styles.checkoutBtnText}>
                    {checkingPromotions
                      ? "Checking Offers..."
                      : "Proceed to Checkout"}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color="#ffffff"
                    style={{ marginLeft: 8 }}
                  />
                </View>
              </TouchableOpacity>

              {/* Secondary Action Button: Back to Menu */}
              <TouchableOpacity
                style={styles.backToMenuBtn}
                onPress={() => setShowCartPage(false)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="arrow-back"
                  size={18}
                  color="#ea580c"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.backToMenuText}>
                  Add More Items / Back to Menu
                </Text>
              </TouchableOpacity>

              {/* Bottom Subtle Guarantee Badge */}
              <View style={styles.cartSecurityPill}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color="#94a3b8"
                />
                <Text style={styles.cartSecurityText}>
                  Fast & Contactless Self-Ordering
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Checkout Table / Tent Modal (Enablekiosktable = 1) ── */}
      <Modal
        visible={showTableModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTableModal(false)}
      >
        <View
          style={styles.tableModalOverlay}
          onStartShouldSetResponderCapture={() => {
            resetIdleTimer();
            return false;
          }}
        >
          <View style={styles.tableModalContainer}>
            <View style={styles.tableModalHeader}>
              <View>
                <Text style={styles.tableModalTitle}>
                  {checkoutStep === "CHOICE"
                    ? "Checkout Option"
                    : "Enter Tent Number"}
                </Text>
                <Text style={styles.tableModalSubtitle}>
                  {checkoutStep === "CHOICE"
                    ? "Choose how you'd like to proceed with your order"
                    : "Please type the tent number placed on your table"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.tableModalCloseBtn}
                onPress={() => setShowTableModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.tableModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {checkoutStep === "CHOICE" ? (
              /* ── Step 1: Two Options (Self Checkout & Enter Tent Number) side by side ── */
              <View style={styles.checkoutChoiceContainer}>
                <TouchableOpacity
                  style={styles.checkoutChoiceCard}
                  onPress={handleSelfCheckout}
                  activeOpacity={0.85}
                >
                  <View style={styles.checkoutChoiceCardTop}>
                    <View
                      style={[
                        styles.checkoutChoiceIconWrap,
                        { backgroundColor: "#fff7ed" },
                      ]}
                    >
                      <Ionicons name="card-outline" size={32} color="#ea580c" />
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={24}
                      color="#94a3b8"
                    />
                  </View>
                  <View style={styles.checkoutChoiceTextWrap}>
                    <Text style={styles.checkoutChoiceTitle}>Self Collect</Text>
                    <Text style={styles.checkoutChoiceDescription}>
                      Continue straight to payment and collect your food at the
                      counter.
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.checkoutChoiceCard,
                    styles.checkoutChoiceCardHighlight,
                  ]}
                  onPress={handleChooseEnterTentNumber}
                  activeOpacity={0.85}
                >
                  <View style={styles.checkoutChoiceCardTop}>
                    <View
                      style={[
                        styles.checkoutChoiceIconWrap,
                        { backgroundColor: "#f0fdf4" },
                      ]}
                    >
                      <Ionicons
                        name="restaurant-outline"
                        size={32}
                        color="#16a34a"
                      />
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={24}
                      color="#ea580c"
                    />
                  </View>
                  <View style={styles.checkoutChoiceTextWrap}>
                    <Text style={styles.checkoutChoiceTitle}>
                      Enter Tent Number
                    </Text>
                    <Text style={styles.checkoutChoiceDescription}>
                      Manually enter your table / tent stand number so staff can
                      deliver your food.
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              /* ── Step 2: Tent Number Numberpad Input (Grid layout) ── */
              <View style={styles.tableDirectInputBody}>
                <Text style={styles.tentKeypadTitle}>
                  Grab a Table tent and enter the code.
                </Text>

                {/* Display Value Box */}
                <View
                  style={[
                    styles.tentDisplayBox,
                    !!tableInputError && styles.tableDirectInputBoxError,
                  ]}
                >
                  <Text
                    style={[
                      styles.tentDisplayText,
                      !inputTableNo && styles.tentDisplayPlaceholder,
                    ]}
                  >
                    {inputTableNo || "Enter tent #"}
                  </Text>
                </View>

                {/* Standard 3x4 Grid Keypad: 1-9, Clear/Empty, 0, Backspace */}
                <View style={styles.tentKeypadGrid}>
                  {/* Row 1: 1, 2, 3 */}
                  <View style={styles.tentKeypadRow}>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "1");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "2");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>2</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "3");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>3</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Row 2: 4, 5, 6 */}
                  <View style={styles.tentKeypadRow}>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "4");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>4</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "5");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "6");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>6</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Row 3: 7, 8, 9 */}
                  <View style={styles.tentKeypadRow}>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "7");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>7</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "8");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>8</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "9");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>9</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Row 4 (Down): Clear [C], 0, Cancel/Backspace [⌫] */}
                  <View style={styles.tentKeypadRow}>
                    <TouchableOpacity
                      style={[styles.tentKeypadKey, styles.tentKeypadActionKey]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setInputTableNo("");
                        if (tableInputError) setTableInputError(null);
                      }}
                    >
                      <Text style={styles.tentKeypadClearText}>C</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tentKeypadKey}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inputTableNo.length < 8) {
                          setInputTableNo((prev) => prev + "0");
                          if (tableInputError) setTableInputError(null);
                        }
                      }}
                    >
                      <Text style={styles.tentKeypadKeyText}>0</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tentKeypadKey, styles.tentKeypadActionKey]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setInputTableNo((prev) => prev.slice(0, -1));
                        if (tableInputError) setTableInputError(null);
                      }}
                    >
                      <Ionicons
                        name="backspace-outline"
                        size={30}
                        color="#475569"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {tableInputError ? (
                  <View style={styles.tableErrorBadge}>
                    <Text style={styles.tableErrorBadgeText}>
                      {tableInputError}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.tentContinueBtn,
                    isUpdatingTent && { opacity: 0.7 },
                  ]}
                  onPress={handleSubmitTentNumber}
                  activeOpacity={0.88}
                  disabled={isUpdatingTent || !inputTableNo.trim()}
                >
                  <Text style={styles.tentContinueBtnText}>
                    {isUpdatingTent
                      ? "Checking Availability..."
                      : "Continue to Payment"}
                  </Text>
                  {!isUpdatingTent && (
                    <Ionicons name="arrow-forward" size={22} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.tableModalFooter}>
              {checkoutStep === "ENTER_TENT" ? (
                <TouchableOpacity
                  style={styles.tableBackToCartBtn}
                  onPress={() => {
                    setShowTableModal(false);
                    setCheckoutStep("CHOICE");
                    setTableInputError(null);
                    setShowCartPage(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.tableBackToCartBtnText}>
                    ← Go to Cart
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.tableBackToCartBtn}
                  onPress={() => {
                    setShowTableModal(false);
                    setShowCartPage(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.tableBackToCartBtnText}>
                    ← Go to Cart
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Promotion Popup Modal (PromotionMaster) ── */}
      <Modal
        visible={showPromotionModal && activePromotions.length > 0}
        transparent
        animationType="fade"
        onRequestClose={handleNoThanks}
      >
        <View style={styles.promotionModalOverlay}>
          <View style={styles.promotionModalContainer}>
            {/* Modal Header */}
            <View style={styles.promotionModalHeader}>
              <View style={styles.promotionBadgeTag}>
                <Ionicons name="sparkles" size={16} color="#EA580C" />
                <Text style={styles.promotionBadgeTagText}>SPECIAL OFFERS</Text>
              </View>
              <TouchableOpacity
                style={styles.promotionCloseBtn}
                onPress={handleNoThanks}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Instruction Header */}
            <View style={styles.promotionSubHeader}>
              <Text style={styles.promotionSubHeaderTitle}>Select an offer to apply</Text>
              <Text style={styles.promotionSubHeaderSubtitle}>
                Choose a promotion offer below, or tap No Thanks.
              </Text>
            </View>

            {/* Promotions Scroll Content */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.promotionScrollContent}
              style={{ maxHeight: 480 }}
            >
              {activePromotions.map((promo, idx) => {
                const promoImgUri = formatLogoUrl(promo.PromotionImageUrl);
                const isSelected = selectedPromotion?.PromotionId === promo.PromotionId;
                const promoDesc = promo.Description || promo.PromotionDescription;
                const minPurchase =
                  promo.MinPurchaseAmount !== null &&
                  promo.MinPurchaseAmount !== undefined &&
                  Number(promo.MinPurchaseAmount) > 0
                    ? Number(promo.MinPurchaseAmount)
                    : null;
                const promoAmt =
                  promo.PromotionAmount !== null &&
                  promo.PromotionAmount !== undefined &&
                  Number(promo.PromotionAmount) > 0
                    ? Number(promo.PromotionAmount)
                    : null;
                const discVal =
                  promo.DiscountValue !== null &&
                  promo.DiscountValue !== undefined &&
                  Number(promo.DiscountValue) > 0
                    ? Number(promo.DiscountValue)
                    : null;

                return (
                  <TouchableOpacity
                    key={promo.PromotionId || idx}
                    style={[
                      styles.promotionCard,
                      isSelected && styles.promotionCardSelected,
                    ]}
                    onPress={() => {
                      setPromoErrorMessage(null);
                      setSelectedPromotion(isSelected ? null : promo);
                    }}
                    activeOpacity={0.88}
                  >
                    {/* Promotion Image or Banner */}
                    {promoImgUri ? (
                      <View style={styles.promotionImageWrap}>
                        <ExpoImage
                          source={{ uri: promoImgUri }}
                          style={styles.promotionImage}
                          contentFit="cover"
                        />
                      </View>
                    ) : (
                      <View style={styles.promotionPlaceholderBanner}>
                        <Ionicons name="sparkles" size={28} color="#EA580C" />
                        <Text style={styles.promotionPlaceholderBannerText}>
                          {promo.PromotionType || "SPECIAL PROMOTION"}
                        </Text>
                      </View>
                    )}

                    {/* Promotion Info */}
                    <View style={styles.promotionInfoWrap}>
                      <View style={styles.promotionTitleRow}>
                        <Text
                          style={[
                            styles.promotionNameText,
                            isSelected && styles.promotionNameTextSelected,
                          ]}
                        >
                          {promo.PromotionName || "Exclusive Promotion"}
                        </Text>
                        <View
                          style={[
                            styles.promotionRadioCircle,
                            isSelected && styles.promotionRadioCircleSelected,
                          ]}
                        >
                          {isSelected && (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#FFFFFF"
                            />
                          )}
                        </View>
                      </View>

                      {promoDesc ? (
                        <Text style={styles.promotionDescText}>
                          {promoDesc}
                        </Text>
                      ) : null}

                      {/* Badges: Type, Amount, Discount */}
                      <View style={styles.promotionBadgesRow}>
                        {promo.PromotionType ? (
                          <View style={styles.promotionTypePill}>
                            <Ionicons
                              name="pricetag-outline"
                              size={14}
                              color="#EA580C"
                            />
                            <Text style={styles.promotionTypePillText}>
                              {promo.PromotionType}
                            </Text>
                          </View>
                        ) : null}

                        {minPurchase ? (
                          <View style={styles.promotionAmountPill}>
                            <Text style={styles.promotionAmountPillText}>
                              Min Spend: {currencySymbol}
                              {minPurchase.toFixed(2)}
                            </Text>
                          </View>
                        ) : null}

                        {promoAmt ? (
                          <View style={styles.promotionAmountPill}>
                            <Text style={styles.promotionAmountPillText}>
                              Price: {currencySymbol}
                              {promoAmt.toFixed(2)}
                            </Text>
                          </View>
                        ) : null}

                        {discVal ? (
                          <View style={styles.promotionDiscountPill}>
                            <Ionicons
                              name="gift-outline"
                              size={14}
                              color="#059669"
                            />
                            <Text style={styles.promotionDiscountPillText}>
                              {String(promo.PromotionType || "").toUpperCase().includes("PERCENT")
                                ? `Discount: ${discVal}% OFF`
                                : `Save ${currencySymbol}${discVal.toFixed(2)}`}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Promotion Error Notification */}
            {promoErrorMessage && (
              <View style={styles.promotionErrorBanner}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                <Text style={styles.promotionErrorText}>{promoErrorMessage}</Text>
              </View>
            )}

            {/* Modal Footer: [ No Thanks ]  [ Add to Cart ] */}
            <View style={styles.promotionFooter}>
              <TouchableOpacity
                style={styles.promotionSkipBtn}
                onPress={handleNoThanks}
                activeOpacity={0.85}
              >
                <Text style={styles.promotionSkipBtnText}>No Thanks</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.promotionAddToCartBtn,
                  (!selectedPromotion || isAddingPromo) && styles.promotionAddToCartBtnDisabled,
                ]}
                onPress={handleAddToCartPromotion}
                disabled={!selectedPromotion || isAddingPromo}
                activeOpacity={0.85}
              >
                {isAddingPromo ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="cart-outline"
                      size={20}
                      color={selectedPromotion ? "#FFFFFF" : "#94A3B8"}
                    />
                    <Text
                      style={[
                        styles.promotionAddToCartBtnText,
                        !selectedPromotion && styles.promotionAddToCartBtnTextDisabled,
                      ]}
                    >
                      Add to Cart
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Payment Mode Full Screen ── */}
      <Modal
        visible={showPaymentPopup}
        animationType="fade"
        onRequestClose={() => setShowPaymentPopup(false)}
      >
        <View
          style={styles.paymentModal}
          onStartShouldSetResponderCapture={() => {
            resetIdleTimer();
            return false;
          }}
        >
          <TouchableOpacity
            style={styles.paymentCloseBtn}
            onPress={() => setShowPaymentPopup(false)}
          >
            <Text style={styles.paymentCloseText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.paymentScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.paymentTotal}>
              TOTAL: {currencySymbol}
              {totalAmount}
            </Text>
            {promotionDiscount > 0 && appliedPromotion && (
              <View style={styles.paymentPromoAppliedBadge}>
                <Ionicons name="sparkles" size={15} color="#15803d" />
                <Text style={styles.paymentPromoAppliedText}>
                  {appliedPromotion.PromotionName}: -{currencySymbol}
                  {promotionDiscount.toFixed(2)} applied
                </Text>
              </View>
            )}
            <Text style={styles.paymentPrompt}>Choose your payment mode</Text>

            <View style={styles.paymentOptionsRow}>
              {/* Card Payment */}
              <TouchableOpacity
                style={[styles.paymentCard, styles.cardBlue]}
                onPress={() => handlePaymodeClick("CARD")}
                activeOpacity={0.85}
              >
                <View style={styles.paymentImgWrap}>
                  <Image
                    source={cardPaymentImg}
                    style={styles.paymentCardImg}
                    resizeMode="contain"
                  />
                </View>
                <Text style={[styles.paymentModeLabel, { color: "#1d4ed8" }]}>
                  Card
                </Text>
                {getExtraChargeForPaymode("CARD") > 0 && (
                  <Text style={styles.extraFeeNotice}>
                    (+${getExtraChargeForPaymode("CARD").toFixed(2)} fee)
                  </Text>
                )}
              </TouchableOpacity>

              {/* PayNow Payment */}
              <TouchableOpacity
                style={[styles.paymentCard, styles.cardPink]}
                onPress={() => handlePaymodeClick("PAYNOW")}
                activeOpacity={0.85}
              >
                <View style={styles.paymentImgWrap}>
                  <Image
                    source={payNowPaymentImg}
                    style={styles.paymentCardImg}
                    resizeMode="contain"
                  />
                </View>
                <Text style={[styles.paymentModeLabel, { color: "#be185d" }]}>
                  PayNow
                </Text>
                {getExtraChargeForPaymode("PAYNOW") > 0 && (
                  <Text style={styles.extraFeeNotice}>
                    (+${getExtraChargeForPaymode("PAYNOW").toFixed(2)} fee)
                  </Text>
                )}
              </TouchableOpacity>

              {/* Cash Payment */}
              <TouchableOpacity
                style={[styles.paymentCard, styles.cardGreen]}
                onPress={() => handlePaymodeClick("CASH")}
                activeOpacity={0.85}
              >
                <View style={styles.paymentImgWrap}>
                  <Text style={styles.paymentEmoji}>💵</Text>
                </View>
                <Text style={[styles.paymentModeLabel, { color: "#15803d" }]}>
                  Cash
                </Text>
                {getExtraChargeForPaymode("CASH") > 0 && (
                  <Text style={styles.extraFeeNotice}>
                    (+${getExtraChargeForPaymode("CASH").toFixed(2)} fee)
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Extra Charge Modal ── */}
      <Modal
        visible={showExtraChargeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtraChargeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.extraChargeBox}>
            <Text style={styles.extraChargeTitle}>Extra Charge Notice</Text>
            <Text style={styles.extraChargeSubtitle}>
              Paying with {pendingPaymentAction?.method} incurs a processing
              fee.
            </Text>

            <View style={styles.extraChargeDetails}>
              <View style={styles.chargeRow}>
                <Text style={styles.chargeLabel}>Subtotal:</Text>
                <Text style={styles.chargeVal}>${calculatedTotal}</Text>
              </View>
              <View style={styles.chargeRow}>
                <Text style={styles.chargeLabel}>Processing Fee:</Text>
                <Text style={[styles.chargeVal, { color: "#ea580c" }]}>
                  +${Number(pendingPaymentAction?.extraCharge || 0).toFixed(2)}
                </Text>
              </View>
              <View
                style={[
                  styles.chargeRow,
                  { borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
                ]}
              >
                <Text
                  style={[
                    styles.chargeLabel,
                    { fontWeight: "800", color: "#111827" },
                  ]}
                >
                  Total Payable:
                </Text>
                <Text
                  style={[
                    styles.chargeVal,
                    { fontWeight: "900", color: "#22c55e", fontSize: 18 },
                  ]}
                >
                  $
                  {(
                    Number(calculatedTotal) +
                    Number(pendingPaymentAction?.extraCharge || 0)
                  ).toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.extraActions}>
              <TouchableOpacity
                style={styles.extraCancelBtn}
                onPress={() => setShowExtraChargeModal(false)}
              >
                <Text style={styles.extraCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.extraConfirmBtn}
                onPress={() => {
                  const action = pendingPaymentAction;
                  setShowExtraChargeModal(false);
                  executePaymentDecision(action.method, action.extraCharge);
                }}
              >
                <Text style={styles.extraConfirmText}>Confirm & Pay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── YeahPay Cloud POS Terminal Modal ── */}
      <Modal
        visible={showYeahPayModal}
        transparent
        animationType="fade"
        onRequestClose={async () => {
          try {
            await fetch(`${API}/yeahpay/cancel`, { method: "POST" });
          } catch {}
          setShowYeahPayModal(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.yeahPayModalBox}>
            {/* Terminal Status Icon */}
            <View
              style={[
                styles.yeahPayIconCircle,
                yeahPayStatus === "SUCCESS"
                  ? { backgroundColor: "#10b981" }
                  : yeahPayStatus === "FAILED"
                    ? { backgroundColor: "#ef4444" }
                    : { backgroundColor: "#3b82f6" },
              ]}
            >
              <Text style={styles.yeahPayIconText}>
                {yeahPayStatus === "SUCCESS"
                  ? "✓"
                  : yeahPayStatus === "FAILED"
                    ? "✕"
                    : "💳"}
              </Text>
            </View>

            <Text style={styles.yeahPayTitle}>YeahPay Cloud Terminal</Text>
            <Text style={styles.yeahPaySubtitle}>Thermal Buddy Gateway</Text>

            {/* Amount Box */}
            <View style={styles.yeahPayAmountBox}>
              <Text style={styles.yeahPayAmountLabel}>AMOUNT PAYABLE</Text>
              <Text style={styles.yeahPayAmountVal}>
                ${yeahPayPayableAmount}
              </Text>
            </View>

            {/* Status Message */}
            <Text
              style={[
                styles.yeahPayStatusMsg,
                yeahPayStatus === "FAILED" && { color: "#ef4444" },
              ]}
            >
              {yeahPayMsg}
            </Text>

            {yeahPayStatus === "PROCESSING" && (
              <ActivityIndicator
                size="large"
                color="#3b82f6"
                style={{ marginVertical: 12 }}
              />
            )}

            {/* Transaction Details */}
            {!!yeahPayDetails && (
              <View style={styles.yeahPayDetailsBox}>
                <Text style={styles.yeahPayDetailRow}>
                  Trace ID: {yeahPayDetails.traceId || "N/A"}
                </Text>
                <Text style={styles.yeahPayDetailRow}>
                  Pay Way: {yeahPayDetails.payWay || "Card/QR"}
                </Text>
                <Text style={styles.yeahPayDetailRow}>
                  Card No: {yeahPayDetails.cardNo || "****"}
                </Text>
                <Text style={styles.yeahPayDetailRow}>
                  Ref No: {yeahPayDetails.referenceNo || "N/A"}
                </Text>
              </View>
            )}

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.yeahPayCancelBtn}
              onPress={async () => {
                try {
                  await fetch(`${API}/yeahpay/cancel`, { method: "POST" });
                } catch {}
                setShowYeahPayModal(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.yeahPayCancelText}>
                {yeahPayStatus === "SUCCESS" ? "Close" : "Cancel Payment"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Loading Modal */}
      <Modal visible={isCartLoading} transparent={true} animationType="fade">
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingOverlayText}>Processing Order...</Text>
        </View>
      </Modal>

      {/* ── Inactivity Warning Modal (75s idle + 15s countdown = 90s total, strictly suppressed during screensaver) ── */}
      {/* Placed at top-most overlay layer so it appears over Menu, Modifier Customizer, and Cart Modal */}
      <Modal
        visible={showInactivityModal && !showAttractLoop}
        transparent
        animationType="fade"
        onRequestClose={resetIdleTimer}
      >
        <View style={styles.inactivityModalOverlay}>
          <View style={styles.inactivityModalCard}>
            {/* Soft Ambient Icon Header */}
            <View style={styles.inactivityIconCircle}>
              <Ionicons name="hourglass-outline" size={38} color="#ea580c" />
            </View>

            <Text style={styles.inactivityTitle}>Are you still there?</Text>
            <Text style={styles.inactivitySubtitle}>
              Your order session will automatically reset in
            </Text>

            {/* Aesthetic Countdown Ring with Progress Pill */}
            <View style={styles.inactivityCountdownOuter}>
              <View style={styles.inactivityCountdownCircle}>
                <Text style={styles.inactivityCountdownNumber}>
                  {inactivityCountdown}
                </Text>
                <Text style={styles.inactivityCountdownUnit}>sec</Text>
              </View>
            </View>

            {/* Action Buttons styled like modern Kiosk touch elements */}
            <View style={styles.inactivityBtnRow}>
              <TouchableOpacity
                style={styles.inactivityResetBtn}
                onPress={resetAllKioskState}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="refresh"
                  size={18}
                  color="#64748b"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.inactivityResetBtnText}>Start Over</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.inactivityContinueBtn}
                onPress={resetIdleTimer}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="hand-left"
                  size={20}
                  color="#ffffff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.inactivityContinueBtnText}>
                  Continue Ordering
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Clear Entire Cart Confirmation Modal ── */}
      <Modal
        visible={showClearCartConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearCartConfirm(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalBox}>
            <View style={styles.confirmModalIconWrapDanger}>
              <Ionicons name="trash-outline" size={44} color="#dc2626" />
            </View>
            <Text style={styles.confirmModalTitle}>Clear Entire Cart?</Text>
            <Text style={styles.confirmModalDesc}>
              This will remove all items from your order. Are you sure you want
              to start over?
            </Text>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => setShowClearCartConfirm(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalDangerBtn}
                onPress={handleClearCart}
                activeOpacity={0.88}
              >
                <Text style={styles.confirmModalDangerText}>
                  Yes, Clear Cart
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Single Cart Item Confirmation Modal ── */}
      <Modal
        visible={itemToDeleteIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setItemToDeleteIndex(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalBox}>
            <View style={styles.confirmModalIconWrapDanger}>
              <Ionicons name="trash-bin-outline" size={44} color="#dc2626" />
            </View>
            <Text style={styles.confirmModalTitle}>Remove Item?</Text>
            <Text style={styles.confirmModalDesc}>
              Remove{" "}
              <Text style={{ fontWeight: "800", color: "#0f172a" }}>
                {itemToDeleteIndex !== null && cart[itemToDeleteIndex]
                  ? cart[itemToDeleteIndex].Name || cart[itemToDeleteIndex].name
                  : "this item"}
              </Text>{" "}
              from your cart?
            </Text>
            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => setItemToDeleteIndex(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmModalDangerBtn}
                onPress={confirmDeleteItem}
                activeOpacity={0.88}
              >
                <Text style={styles.confirmModalDangerText}>Yes, Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Touchscreen Confirmation Dialog Styles */
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 999999,
  },
  confirmModalBox: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 24,
  },
  confirmModalIconWrapDanger: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#fecdd3",
  },
  confirmModalTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  confirmModalDesc: {
    fontSize: 17,
    fontWeight: "500",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  confirmModalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
  },
  confirmModalCancelBtn: {
    flex: 1,
    height: 64,
    backgroundColor: "#f1f5f9",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  confirmModalCancelText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#475569",
  },
  confirmModalDangerBtn: {
    flex: 1.2,
    height: 64,
    backgroundColor: "#dc2626",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  confirmModalDangerText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },

  container: { flex: 1, backgroundColor: "#f8f9fa" },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  loadingText: { fontSize: 16, fontWeight: "700", color: "#6b7280" },

  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 36 : 46,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBrand: { fontSize: 20, fontWeight: "900", color: "#111827" },
  headerBrandAccent: { color: "#f97316" },
  tableBadge: {
    backgroundColor: "#ffedd5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  tableBadgeText: { color: "#ea580c", fontWeight: "800", fontSize: 12 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchBar: {
    width: 160,
    height: 38,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13,
    backgroundColor: "#f9fafb",
  },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  logoutBtnText: { color: "#ef4444", fontWeight: "700", fontSize: 13 },

  mainLayout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#faf8f2",
    position: "relative",
  },
  sidebar: {
    width: 340,
    backgroundColor: "#FBF7F2",
    borderRightWidth: 1.5,
    borderColor: "#EFE6DC",
  },
  sidebarContent: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 16,
    paddingBottom: 170,
  },

  /* Company Branding Header at the top of Sidebar */
  sidebarBrandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 22,
    borderBottomWidth: 1.8,
    borderBottomColor: "#EFE6DC",
    backgroundColor: "#FBF7F2",
  },
  sidebarBrandLogoWrap: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#EFE6DC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sidebarBrandLogo: {
    width: "92%",
    height: "92%",
  },
  sidebarBrandName: {
    flex: 1,
    fontSize: 36,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  sidebarBrandNameOnly: {
    fontSize: 36,
    textAlign: "left",
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    lineHeight: 40,
  },

  /* Card styling matching the reference image */
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1.8,
    borderColor: "#EFE6DC",
    paddingVertical: 20,
    paddingHorizontal: 18,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    position: "relative",
    overflow: "hidden",
  },
  catCardActive: {
    borderWidth: 2,
    borderColor: "#ea580c",
    backgroundColor: "#ffffff",
    shadowColor: "#ea580c",
    shadowOpacity: 0.14,
  },
  catCardBar: {
    width: 5,
    height: 58,
    borderRadius: 4,
    backgroundColor: "transparent",
  },
  catCardBarActive: {
    backgroundColor: "#f97316",
  },
  catIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  catIconBubbles: {
    position: "absolute",
    top: 0,
    fontSize: 12,
    color: "#f97316",
    fontWeight: "900",
  },
  catIconEmoji: {
    fontSize: 34,
    marginTop: 2,
  },
  catInfoWrap: {
    flex: 1,
    justifyContent: "center",
  },
  catCardTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 7,
    lineHeight: 24,
  },
  catCardTitleActive: {
    color: "#0f172a",
    fontWeight: "900",
  },
  catDotRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  catDot: {
    width: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
  },
  catArrowWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  catArrowText: {
    fontSize: 18,
    color: "#94a3b8",
    fontWeight: "800",
    marginTop: -2,
  },
  catArrowTextActive: {
    fontSize: 12,
    color: "#ea580c",
    marginTop: 0,
  },
  catGroupAccordionWrap: {
    marginBottom: 0,
    gap: 10,
  },
  sidebarSubgroupList: {
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 10,
    backgroundColor: "rgba(255, 237, 213, 0.45)",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#fed7aa",
    gap: 10,
    marginTop: 2,
  },
  sidebarSubgroupItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#fed7aa",
    minHeight: 56,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sidebarSubgroupItemActive: {
    backgroundColor: "#EA580C",
    borderColor: "#C2410C",
    borderWidth: 1.5,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  sidebarSubgroupBar: {
    width: 4,
    height: 22,
    borderRadius: 2,
    backgroundColor: "#f97316",
    marginRight: 12,
  },
  sidebarSubgroupBarActive: {
    backgroundColor: "#ffffff",
    height: 24,
    width: 4,
  },
  sidebarSubgroupText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#431407",
    flex: 1,
    letterSpacing: -0.2,
  },
  sidebarSubgroupTextActive: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 17,
  },
  sidebarSubgroupIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
    borderWidth: 1.5,
    borderColor: "#FDBA74",
  },
  sidebarSubgroupIndicatorActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderColor: "rgba(255, 255, 255, 0.4)",
  },

  /* Hero Banner matching image */
  heroBannerContainer: {
    padding: 0,
  },
  heroBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffcca2",
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 28,
    marginBottom: 22,
    gap: 20,
    position: "relative",
    overflow: "hidden",
    flexShrink: 0,
    minHeight: 120,
  },
  heroIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  heroCarEmoji: {
    fontSize: 42,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroCategoryTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#334155",
  },
  heroMoreBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  heroMoreDots: {
    fontSize: 22,
    color: "#2563eb",
    fontWeight: "900",
    letterSpacing: -1,
  },

  contentArea: {
    flex: 1,
    padding: 20,
    backgroundColor: "transparent",
    position: "relative",
    zIndex: 1,
  },
  groupTabsContainer: {
    flexShrink: 0,
    marginBottom: 22,
    paddingVertical: 6,
    justifyContent: "center",
  },
  groupTabsScroll: {
    flexGrow: 0,
  },
  groupsRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  groupPill: {
    height: 60,
    paddingHorizontal: 36,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  groupPillActive: {
    backgroundColor: "#ffedd5",
    borderColor: "#f97316",
    shadowColor: "#f97316",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  groupPillText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: -0.2,
  },
  groupPillTextActive: {
    color: "#ea580c",
    fontWeight: "900",
  },

  dishesFlatList: {
    flex: 1,
    width: "100%",
  },
  dishesList: { paddingTop: 2, paddingBottom: 170, paddingHorizontal: 2 },
  dishCard: {
    flex: 1,
    margin: 10,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "flex-start",
    position: "relative",
    shadowColor: "#64748b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  dishCardInvisible: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  dishSoldOut: { opacity: 0.5 },
  dishCardHeartWrap: {
    position: "absolute",
    top: 18,
    right: 20,
    zIndex: 2,
  },
  dishCardHeartIcon: {
    fontSize: 24,
    color: "#ef4444",
    fontWeight: "600",
  },
  dishCardQtyBadge: {
    position: "absolute",
    top: 16,
    right: 18,
    zIndex: 5,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ff641f",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    shadowColor: "#ff641f",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  dishCardQtyBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  // ── Promo Slideshow Attract Loop Screensaver Styles ──
  attractLoopContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999999,
    backgroundColor: "#0f172a",
  },
  attractLoopImageWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  attractLoopImage: {
    width: "100%",
    height: "100%",
  },
  attractLoopOverlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 48,
    paddingHorizontal: 32,
    gap: 16,
  },
  attractLoopHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  attractLoopLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  attractLoopShopName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  attractLoopCaptionCard: {
    backgroundColor: "rgba(15, 23, 42, 0.78)",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  attractLoopCaptionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    textAlign: "center",
  },
  attractLoopCaptionCode: {
    fontSize: 14,
    color: "#fed7aa",
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 1,
  },
  attractLoopDotsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  attractLoopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  attractLoopDotActive: {
    width: 28,
    backgroundColor: "#ffffff",
    shadowColor: "#ffffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  attractLoopCtaWrap: {
    alignItems: "center",
  },
  attractLoopCtaBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    paddingVertical: 18,
    paddingHorizontal: 44,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.35)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  attractLoopCtaText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // ── Inactivity Warning Modal Styles (Sleek Aesthetic Kiosk Proportion) ──
  inactivityModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 999999,
  },
  inactivityModalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 32,
    paddingVertical: 38,
    paddingHorizontal: 36,
    alignItems: "center",
    maxWidth: 440,
    width: "92%",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.22,
    shadowRadius: 36,
    elevation: 24,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
  },
  inactivityIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff7ed",
    borderWidth: 2,
    borderColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  inactivityTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  inactivitySubtitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
    maxWidth: 280,
  },
  inactivityCountdownOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#fff7ed",
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  inactivityCountdownCircle: {
    width: "100%",
    height: "100%",
    borderRadius: 46,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  inactivityCountdownNumber: {
    fontSize: 34,
    fontWeight: "900",
    color: "#ea580c",
    lineHeight: 38,
  },
  inactivityCountdownUnit: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9a3412",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: -2,
  },
  inactivityBtnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  inactivityResetBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inactivityResetBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },
  inactivityContinueBtn: {
    flex: 1.5,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#ea580c",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  inactivityContinueBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },

  // ── Kiosk Aesthetic Toast Notification Styles ──
  kioskToastContainer: {
    position: "absolute",
    top: 110,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 99999,
  },
  kioskToastPillError: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderWidth: 3,
  },
  kioskToastIconWrapError: {
    backgroundColor: "#fee2e2",
  },
  kioskToastTitleError: {
    color: "#b91c1c",
    fontSize: 28,
    fontWeight: "900",
  },
  customizeSectionCardIncomplete: {
    borderColor: "#ef4444",
    borderWidth: 2.5,
    backgroundColor: "#fff5f5",
  },
  kioskToastPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 28,
    paddingHorizontal: 44,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.28,
    shadowRadius: 36,
    elevation: 24,
    maxWidth: 980,
    minWidth: 700,
  },
  kioskToastIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 24,
  },
  kioskToastTextWrap: {
    flex: 1,
    marginRight: 24,
  },
  kioskToastTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  kioskToastSubtitle: {
    fontSize: 22,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 6,
  },
  kioskToastBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ff641f",
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 32,
    shadowColor: "#ff641f",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  kioskToastBadgeText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
  },
  dishCircularBox: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: "#eff6ff",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    marginTop: 8,
    overflow: "hidden",
  },
  dishImg: { width: "100%", height: "100%", borderRadius: 90 },
  dishEmoji: { fontSize: 64 },
  soldOutBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#ef4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 9999,
  },
  soldOutText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  dishInfo: {
    width: "100%",
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
  },
  dishTopContent: {
    width: "100%",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
  },
  dishName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  dishBulletsContainer: {
    width: "100%",
    paddingHorizontal: 8,
    marginBottom: 16,
    gap: 10,
    alignItems: "stretch",
  },
  dishBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkBadgeIcon: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  dishBulletText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
    flex: 1,
    lineHeight: 22,
    flexWrap: "wrap",
  },
  dishPrice: {
    fontSize: 32,
    fontWeight: "900",
    color: "#f97316",
    textAlign: "center",
    letterSpacing: -0.5,
    marginTop: 6,
  },
  emptyDishes: { padding: 40, alignItems: "center" },
  emptyDishesText: { color: "#9ca3af", fontSize: 15 },

  /* ── Unified Full-Width Professional Touchscreen Kiosk Bottom Action Bar ── */
  floatingCartBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFDFC2",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingVertical: 20,
    paddingHorizontal: 20,
    minHeight: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderTopWidth: 1.5,
    borderColor: "rgba(234, 88, 12, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 90,
  },
  bottomBarStartOverBtn: {
    flex: 1,
    height: 110,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#FED7AA",
    gap: 8,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  bottomBarStartOverText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#ea580c",
    letterSpacing: 0.2,
  },
  cartClearBtn: {
    flex: 1,
    height: 110,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F2",
    borderWidth: 1.5,
    borderColor: "#FECDD3",
    borderRadius: 20,
    gap: 8,
    shadowColor: "#e11d48",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cartClearText: {
    color: "#e11d48",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  cartClearTextDisabled: {
    color: "#a8a29e",
  },
  cartActionBtnDisabled: {
    backgroundColor: "#F5EBE1",
    borderColor: "#E7D8C9",
    shadowOpacity: 0,
    elevation: 0,
  },

  /* Grand Checkout Hero Banner (flex: 3) */
  cartViewBtn: {
    flex: 3,
    height: 110,
    backgroundColor: "#EA580C",
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#C2410C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 26,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  cartViewBtnDisabled: {
    backgroundColor: "#F5EBE1",
    borderColor: "#E7D8C9",
    shadowOpacity: 0,
    elevation: 0,
  },
  cartBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cartBannerMeta: {
    justifyContent: "center",
  },
  cartViewTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  cartViewTextDisabled: {
    color: "#78716c",
  },
  cartBannerSubtitle: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 3,
  },
  cartBannerSubtitleDisabled: {
    color: "#a8a29e",
  },
  cartBannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  cartBannerPriceBlock: {
    alignItems: "flex-end",
  },
  cartBannerPriceLabel: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cartBannerPriceLabelDisabled: {
    color: "#a8a29e",
  },
  cartBannerPriceVal: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  cartBannerPriceValDisabled: {
    color: "#78716c",
  },
  cartBannerArrowCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cartBannerArrowCircleDisabled: {
    backgroundColor: "#E7D8C9",
    shadowOpacity: 0,
    elevation: 0,
  },
  cartViewBadge: {
    position: "absolute",
    top: -10,
    right: 8,
    backgroundColor: "#ffffff",
    minWidth: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "#c2410c",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  cartViewBadgeText: {
    color: "#ea580c",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  cartViewText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  /* CART MODAL - Clean, Card-Based Layout with Fixed Bottom Card */
  cartModalContainer: {
    flex: 1,
    backgroundColor: "#faf8f2",
    position: "relative",
  },
  cartModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingBottom: 16,
    paddingHorizontal: 24,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
    zIndex: 2,
  },
  cartHeaderBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cartHeaderTitleWrap: {
    flex: 1,
    alignItems: "center",
  },
  cartHeaderTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  cartHeaderSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ea580c",
    marginTop: 2,
  },
  cartHeaderClearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "#fee2e2",
    borderWidth: 1.5,
    borderColor: "#fecdd3",
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cartHeaderClearText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ef4444",
    letterSpacing: 0.3,
  },
  cartItemsScrollView: {
    flex: 1,
    zIndex: 2,
  },
  cartScrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 24,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(234, 88, 12, 0.12)",
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cartItemThumbWrap: {
    marginRight: 16,
  },
  cartItemThumb: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#fff7ed",
  },
  cartItemPromoThumb: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFEDD5",
  },
  cartItemPromoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFEDD5",
  },
  cartItemPromoBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#EA580C",
    letterSpacing: 0.5,
  },
  cartItemPromoDescText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 18,
  },
  appliedPromoEntryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFBF7",
    borderWidth: 1.8,
    borderColor: "#FDBA74",
    borderRadius: 20,
    padding: 16,
    marginTop: 10,
    marginBottom: 10,
    shadowColor: "#EA580C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  appliedPromoEntryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  appliedPromoEntryTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  appliedPromoEntryTypePill: {
    backgroundColor: "#EA580C",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  appliedPromoEntryTypePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  appliedPromoEntryDesc: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  appliedPromoEntryDiscountVal: {
    fontSize: 18,
    fontWeight: "900",
    color: "#059669",
  },
  appliedPromoEntryRemoveBtn: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EF4444",
  },
  cartItemThumbPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  cartItemLeft: {
    flex: 1.4,
    alignItems: "flex-start",
  },
  cartItemCenter: {
    flex: 0.8,
    alignItems: "center",
    justifyContent: "center",
  },
  cartItemRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 18,
  },
  cartItemName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: -0.3,
  },
  cartItemMods: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
    lineHeight: 22,
    paddingLeft: 4,
  },
  qtyControlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 32,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  qtyBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  qtyBtnText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 26,
    textAlign: "center",
  },
  qtyVal: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    paddingHorizontal: 16,
    textAlign: "center",
    minWidth: 36,
  },
  cartItemPrice: {
    fontSize: 22,
    fontWeight: "900",
    color: "#dc2626",
    textAlign: "right",
  },
  cartItemDeleteBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },

  /* Fixed Bottom Container for Summary & Action Card */
  cartBottomFixedContainer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 28,
    paddingTop: 12,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  cartSummaryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 22,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: "rgba(234, 88, 12, 0.14)",
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
  },
  totalLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  totalRowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  totalLabel: {
    fontSize: 17,
    color: "#64748b",
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#334155",
  },
  grandTotalRow: {
    paddingVertical: 14,
    marginTop: 6,
    marginBottom: 10,
    borderTopWidth: 1.5,
    borderTopColor: "rgba(226, 232, 240, 0.9)",
    borderStyle: "dashed",
  },
  grandTotalLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  grandTotalLabel: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  grandTotalItemsBadge: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffedd5",
  },
  grandTotalItemsBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ea580c",
  },
  grandTotalValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ea580c",
  },
  checkoutBtn: {
    marginTop: 8,
    height: 60,
    backgroundColor: "#f97316",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  checkoutBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutBtnText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  backToMenuBtn: {
    marginTop: 10,
    height: 52,
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#ffedd5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backToMenuText: {
    color: "#ea580c",
    fontSize: 16,
    fontWeight: "800",
  },
  cartSecurityPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  cartSecurityText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },

  /* PROMOTION POPUP MODAL */
  promotionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  promotionModalContainer: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  promotionModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  promotionBadgeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FFEDD5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  promotionBadgeTagText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#EA580C",
    letterSpacing: 0.8,
  },
  promotionCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  promotionSubHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },
  promotionSubHeaderTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },
  promotionSubHeaderSubtitle: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  promotionScrollContent: {
    padding: 20,
    gap: 16,
  },
  promotionCard: {
    backgroundColor: "#FAF8F5",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#EFE6DC",
    overflow: "hidden",
  },
  promotionCardSelected: {
    borderColor: "#EA580C",
    backgroundColor: "#FFFBF7",
    borderWidth: 2,
    shadowColor: "#EA580C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  promotionImageWrap: {
    width: "100%",
    height: 190,
    backgroundColor: "#F1F5F9",
  },
  promotionPlaceholderBanner: {
    width: "100%",
    height: 100,
    backgroundColor: "#FFF7ED",
    borderBottomWidth: 1,
    borderBottomColor: "#FFEDD5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  promotionPlaceholderBannerText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#EA580C",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  promotionImage: {
    width: "100%",
    height: "100%",
  },
  promotionInfoWrap: {
    padding: 18,
  },
  promotionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  promotionRadioCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  promotionRadioCircleSelected: {
    borderColor: "#EA580C",
    backgroundColor: "#EA580C",
  },
  promotionNameText: {
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  promotionNameTextSelected: {
    color: "#EA580C",
  },
  promotionDescText: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
    marginBottom: 14,
  },
  promotionBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  promotionTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FFEDD5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  promotionTypePillText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#EA580C",
  },
  promotionAmountPill: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    justifyContent: "center",
  },
  promotionAmountPillText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  promotionDiscountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  promotionDiscountPillText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#059669",
  },
  promotionFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  promotionSkipBtn: {
    height: 54,
    paddingHorizontal: 26,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  promotionSkipBtnText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "800",
  },
  promotionAddToCartBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#EA580C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#EA580C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  promotionAddToCartBtnDisabled: {
    backgroundColor: "#E2E8F0",
    shadowOpacity: 0,
    elevation: 0,
  },
  promotionAddToCartBtnText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  promotionAddToCartBtnTextDisabled: {
    color: "#94A3B8",
  },
  promotionErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  promotionErrorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
    lineHeight: 18,
  },
  promoAppliedBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  promoAppliedBadgePillText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#EA580C",
    letterSpacing: 0.3,
  },
  cartPromoSuccessBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1.5,
    borderColor: "#A7F3D0",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cartPromoSuccessBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: "#065F46",
  },
  paymentPromoAppliedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  paymentPromoAppliedText: {
    color: "#15803d",
    fontSize: 15,
    fontWeight: "800",
  },

  /* PAYMENT FULL MODAL (.full-screen-payment) */
  paymentModal: {
    flex: 1,
    backgroundColor: "#f97316",
    padding: 24,
  },
  paymentScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  paymentCloseBtn: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  paymentCloseText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 24,
    textAlign: "center",
  },
  paymentTotal: {
    fontSize: 40,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 10,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  paymentPrompt: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    opacity: 0.95,
    marginBottom: 40,
    textAlign: "center",
  },
  paymentOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 24,
    maxWidth: 840,
    width: "100%",
  },
  paymentCard: {
    width: 220,
    height: 220,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 26,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  cardBlue: { backgroundColor: "#ffffff", borderColor: "#bae6fd" },
  cardPink: { backgroundColor: "#ffffff", borderColor: "#fbcfe8" },
  cardGreen: { backgroundColor: "#ffffff", borderColor: "#bbf7d0" },
  paymentImgWrap: {
    width: "100%",
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentCardImg: {
    width: "85%",
    height: "100%",
  },
  paymentEmoji: { fontSize: 56 },
  paymentModeLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f97316",
    textAlign: "center",
  },
  extraFeeNotice: { fontSize: 13, color: "#ea580c", fontWeight: "700" },

  /* THANK YOU OVERLAY */
  thankYouOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    gap: 24,
  },
  thankYouTitle: { fontSize: 44, fontWeight: "900", color: "#ffffff" },
  thankYouCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  thankYouOrderLabel: { fontSize: 12, fontWeight: "800", color: "#ea580c" },
  thankYouOrderNumber: { fontSize: 48, fontWeight: "900", color: "#ea580c" },
  thankYouSubtitle: { fontSize: 18, fontWeight: "700", color: "#ffffff" },

  /* MODALS & OVERLAYS */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  extraChargeBox: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    gap: 14,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  extraChargeTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },
  extraChargeSubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  extraChargeDetails: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  chargeRow: { flexDirection: "row", justifyContent: "space-between" },
  chargeLabel: { fontSize: 14, color: "#4b5563" },
  chargeVal: { fontSize: 14, fontWeight: "700", color: "#111827" },
  extraActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  extraCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  extraCancelText: { fontWeight: "700", color: "#4b5563" },
  extraConfirmBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  extraConfirmText: { fontWeight: "800", color: "#ffffff" },

  /* Combo/Modifier Full Customizer */
  modModalBox: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    maxHeight: "80%",
    width: "90%",
    maxWidth: 480,
    alignSelf: "center",
  },
  modHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modTitle: { fontSize: 20, fontWeight: "800", color: "#1f2937" },
  modClose: { fontSize: 20, color: "#6b7280", fontWeight: "700" },
  modPrompt: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
    marginBottom: 14,
  },
  modOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#f5f5f5",
  },
  modOptionActive: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  modOptName: { fontSize: 16, fontWeight: "600", color: "#333333" },
  modOptPrice: { fontSize: 15, fontWeight: "700", color: "#f97316" },
  addModBtn: {
    marginTop: 24,
    height: 54,
    backgroundColor: "#10b981",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addModBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },

  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    zIndex: 10000,
  },
  loadingOverlayText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },

  /* YEAHPAY CLOUD TERMINAL MODAL */
  yeahPayModalBox: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  yeahPayIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  yeahPayIconText: {
    fontSize: 28,
    color: "#ffffff",
    fontWeight: "900",
  },
  yeahPayTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 2,
    textAlign: "center",
  },
  yeahPaySubtitle: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  yeahPayAmountBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    marginBottom: 14,
  },
  yeahPayAmountLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.8,
  },
  yeahPayAmountVal: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2,
  },
  yeahPayStatusMsg: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  yeahPayDetailsBox: {
    width: "100%",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    gap: 4,
  },
  yeahPayDetailRow: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  yeahPayCancelBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  yeahPayCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },

  /* Cart Item Customizations Display (Clean, borderless & integrated) */
  cartCustomizationGroup: {
    marginTop: 6,
    width: "100%",
    alignSelf: "stretch",
    paddingVertical: 2,
    backgroundColor: "transparent",
  },
  cartCustomizationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartModifierGroupTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ea580c",
  },
  cartInlineEditBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  cartInlineEditText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ea580c",
  },
  cartModifierValueText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    paddingLeft: 4,
    marginTop: 3,
    lineHeight: 25,
  },

  /* Combo Customizer Modal Styles */
  comboFullScreenContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
  },
  comboHeaderBar: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
    zIndex: 10,
  },
  comboCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  comboCloseBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#374151",
  },
  comboScrollView: {
    flex: 1,
  },
  comboScrollContent: {
    paddingBottom: 110,
  },
  comboHeroImgBox: {
    width: "100%",
    height: 220,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  comboHeroImg: {
    width: "100%",
    height: "100%",
  },
  comboHeroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  comboDishInfoBox: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
  },
  comboDishTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },
  comboDishPrice: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f97316",
    marginBottom: 6,
  },
  comboDishDesc: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  comboDishBulletsWrap: {
    marginTop: 8,
    gap: 8,
  },
  comboDishBulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  comboCheckBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  comboCheckBadgeIcon: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  comboDishBulletText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    flex: 1,
    lineHeight: 19,
  },
  comboLoadingBox: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  comboLoadingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  comboErrorBox: {
    padding: 32,
    alignItems: "center",
    gap: 14,
  },
  comboErrorText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  comboRetryBtn: {
    backgroundColor: "#f97316",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  comboRetryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  comboGroupsContainer: {
    padding: 20,
    gap: 20,
  },
  comboGroupCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 18,
  },
  comboGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  comboGroupName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2937",
    flex: 1,
  },
  comboGroupPickBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  comboOptionsGrid: {
    gap: 10,
  },
  modifierSquareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  modifierSquareCard: {
    width: "31%",
    minWidth: 105,
    minHeight: 110,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  modifierSquareCardSelected: {
    borderColor: "#f97316",
    backgroundColor: "#fffaf5",
    shadowColor: "#f97316",
    shadowOpacity: 0.12,
  },
  modifierSquareCheckbox: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  modifierSquareName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 6,
  },
  modifierSquareNameSelected: {
    color: "#0f172a",
    fontWeight: "800",
  },
  modifierSquarePrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  modifierSquarePriceSelected: {
    color: "#f97316",
    backgroundColor: "#ffedd5",
    fontWeight: "800",
  },
  comboOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    gap: 12,
  },
  comboOptionRowSelected: {
    borderColor: "#f97316",
    backgroundColor: "#fffaf5",
  },
  comboRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  comboRadioCircleSelected: {
    borderColor: "#f97316",
  },
  comboRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#f97316",
  },
  comboCheckboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  comboCheckboxSquareSelected: {
    borderColor: "#f97316",
    backgroundColor: "#f97316",
  },
  comboCheckmark: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
  },
  comboOptInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  comboOptName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  comboOptNameSelected: {
    color: "#111827",
    fontWeight: "700",
  },
  comboOptPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
  },
  comboInlineErrorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  comboInlineErrorText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  comboFixedBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  comboQtyControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  comboQtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  comboQtyBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  comboQtyVal: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    paddingHorizontal: 14,
  },
  comboAddCartBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "#f97316",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  comboAddCartBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },

  /* ── FULL SCREEN DESIGN MATCHING "BIG KING" SCREENSHOT ── */
  customizeFullScreenContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
  },
  customizeTopWhiteBar: {
    backgroundColor: "#ffffff",
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customizeTopBackBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#fdba74",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  customizeTopHomeBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  customizeTopTitleWrap: {
    alignItems: "center",
  },
  customizeChefHatWrap: {
    marginBottom: 2,
  },
  customizeTopTitleBold: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  customizeTopTitleOrange: {
    color: "#ea580c",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  customizeTopOrangeSwoosh: {
    width: 48,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: "#ea580c",
    marginTop: 4,
  },
  customizeScrollView: {
    flex: 1,
  },
  customizeScrollContent: {
    paddingBottom: 120,
  },

  /* Main Product Hero Card: Matching reference Apple Juice Card */
  customizeMainHeroCard: {
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 16,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#fed7aa",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
    position: "relative",
    overflow: "hidden",
  },
  customizeHeroLeftOuter: {
    width: 240,
    height: 240,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: "#f97316",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    backgroundColor: "#000000",
  },
  customizeHeroLeftInner: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000000",
  },
  customizeHeroImg: {
    width: "100%",
    height: "100%",
  },
  customizeHeroImgPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18181b",
  },
  customizeHeroRight: {
    flex: 1,
    paddingLeft: 24,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "flex-start",
    position: "relative",
  },
  customizeHeroTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  customizeHeroSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 20,
    marginBottom: 14,
  },
  customizePricePill: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 14,
  },
  customizePriceText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
  },
  customizeTagPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  customizeTagPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff7ed",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffedd5",
  },
  customizeTagPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7c2d12",
  },
  customizeAppleWatermark: {
    position: "absolute",
    right: 12,
    bottom: 8,
    fontSize: 64,
    opacity: 0.15,
  },

  /* Choose Your Add-ons Header Tab & Group Sections */
  customizeSectionCard: {
    paddingHorizontal: 20,
    marginTop: 4,
  },
  customizeSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  customizeSectionOrangeTab: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  customizeSectionOrangeTabText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  customizeOptionalBadge: {
    backgroundColor: "#ffedd5",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  customizeOptionalText: {
    color: "#ea580c",
    fontSize: 13,
    fontWeight: "800",
  },

  /* Modifier Categories: Extras, Flavors, Toppings */
  customizeGroupBlock: {
    marginBottom: 18,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  customizeGroupSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
    marginBottom: 12,
  },
  customizeGroupSubHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  customizeGroupIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  customizeGroupTitleText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },

  /* 3-Column Square Grid Layout */
  customizeTilesGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingVertical: 4,
  },
  customizeTileCard: {
    width: "31%",
    minWidth: 140,
    minHeight: 110,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  customizeTileCardSelected: {
    borderColor: "#ea580c",
    borderWidth: 2,
    backgroundColor: "#fffaf5",
    shadowColor: "#ea580c",
    shadowOpacity: 0.18,
    elevation: 3,
  },
  customizeTileCheckSquare: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  customizeTileCheckSquareSelected: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  customizeTileName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  customizeTileNameSelected: {
    color: "#0f172a",
    fontWeight: "900",
  },
  customizeTilePriceBadge: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  customizeTilePriceBadgeSelected: {
    backgroundColor: "#ffedd5",
  },
  customizeTilePriceText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ea580c",
  },
  customizeTilePriceTextSelected: {
    color: "#c2410c",
  },

  /* Bottom Floating Bar: Soft Peach Pill (-) Qty (+) | Vivid Orange "🛒 Add to Cart $X.XX" */
  customizeBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    alignItems: "flex-end",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  customizeBottomBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 18,
  },
  customizeQtyControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: "#ffedd5",
    padding: 8,
    gap: 12,
  },
  customizeQtyBtnMinus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  customizeQtyBtnPlus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  customizeQtyVal: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    minWidth: 38,
    textAlign: "center",
  },
  customizeBottomDivider: {
    width: 2,
    height: 48,
    backgroundColor: "#e2e8f0",
  },
  customizeAddToCartBtn: {
    minWidth: 300,
    paddingHorizontal: 36,
    height: 66,
    backgroundColor: "#ea580c",
    borderRadius: 33,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  customizeAddToCartBadge: {
    position: "absolute",
    top: -10,
    right: -6,
    backgroundColor: "#ffffff",
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    borderWidth: 2,
    borderColor: "#ea580c",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  customizeAddToCartBadgeText: {
    color: "#ea580c",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  customizeAddToCartBtnText: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  /* ── TABLE SELECTION MODAL ── */
  tableModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  tableModalContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    width: "95%",
    maxWidth: 920,
    maxHeight: "92%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
    display: "flex",
    flexDirection: "column",
  },
  tableModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tableModalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },
  tableModalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
  },
  tableModalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tableModalCloseText: {
    fontSize: 18,
    color: "#ffffff",
    fontWeight: "700",
  },
  /* ── TWO-OPTION CHECKOUT CHOICE (SIDE BY SIDE HORIZONTAL) ── */
  checkoutChoiceContainer: {
    paddingHorizontal: 28,
    paddingVertical: 28,
    flexDirection: "row",
    gap: 16,
    alignItems: "stretch",
  },
  checkoutChoiceCard: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 24,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 180,
  },
  checkoutChoiceCardHighlight: {
    borderColor: "#fdba74",
    backgroundColor: "#fffaf5",
    shadowColor: "#ea580c",
    shadowOpacity: 0.1,
  },
  checkoutChoiceCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  checkoutChoiceIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutChoiceTextWrap: {
    width: "100%",
  },
  checkoutChoiceTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
  },
  checkoutChoiceDescription: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
    fontWeight: "500",
  },
  /* ── DIRECT TENT NUMBER INPUT ── */
  tableDirectInputBody: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
    alignItems: "center",
  },
  tentKeypadTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  tentDisplayBox: {
    width: "100%",
    maxWidth: 480,
    height: 72,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tentDisplayText: {
    fontSize: 38,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 3,
  },
  tentDisplayPlaceholder: {
    color: "#94a3b8",
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 0,
  },
  tentKeypadGrid: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  tentKeypadRow: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#cbd5e1",
  },
  tentKeypadKey: {
    flex: 1,
    height: 82,
    borderRightWidth: 1.5,
    borderRightColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  tentKeypadKeyText: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1e293b",
  },
  tentKeypadActionKey: {
    backgroundColor: "#f8fafc",
  },
  tentKeypadClearText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ea580c",
  },
  tentInputLabel: {
    alignSelf: "flex-start",
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
  },
  tableDirectInputBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  tableDirectInputBoxError: {
    borderColor: "#ef4444",
  },
  tableDirectSearchIcon: {
    marginRight: 12,
  },
  tableDirectTextInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 8,
    height: "100%",
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },
  tableDirectClearBtn: {
    padding: 4,
    marginLeft: 8,
  },
  tableInstructionBadge: {
    marginTop: 20,
    backgroundColor: "#fff7ed",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tableInstructionBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ea580c",
    textAlign: "center",
  },
  tableErrorBadge: {
    marginTop: 20,
    backgroundColor: "#fee2e2",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  tableErrorBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#dc2626",
    textAlign: "center",
  },
  tentContinueBtn: {
    marginTop: 24,
    width: "100%",
    maxWidth: 480,
    height: 58,
    borderRadius: 16,
    backgroundColor: "#ea580c",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  tentContinueBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
  },
  tableModalFooter: {
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    alignItems: "flex-end",
  },
  tableBackToCartBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#ea580c",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tableBackToCartBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
  tableCancelBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  tableCancelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },
});
