import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { API, BASE_URL } from "@/config";

type Props = {
  onStart?: (user: any, tableInfo?: { tableId: any; tableNo: any }) => void;
  onBackToLogin?: () => void;
};

type CustomerItem = {
  CustomerVehicleId?: string | number;
  CustomerName?: string;
  CarNumber?: string;
  DefaultDishId?: string | number;
  [key: string]: any;
};

const readJsonResponse = async (res: Response) => {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Server route unavailable (${res.status}). Please restart or redeploy the backend.`
    );
  }
  return res.json();
};

const showAlert = (title: string, message?: string) => {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.alert) {
      window.alert(message ? `${title}: ${message}` : title);
      return;
    }
  }
  Alert.alert(title, message);
};

export default function KioskStartPage({ onStart, onBackToLogin }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Customer Entry Popup State
  const [showCustomerPopup, setShowCustomerPopup] = useState(false);
  const [selectedService, setSelectedService] = useState<"DINE_IN" | "TAKEAWAY" | "">("");
  const [carNumber, setCarNumber] = useState("");
  const [customerName, setCustomerName] = useState("");

  // Customer Search & Selection State
  const [customerData, setCustomerData] = useState<CustomerItem[] | CustomerItem | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const searchingRef = useRef(false); // sync guard — avoids web pointer-events bug
  const [showCustomerListPopup, setShowCustomerListPopup] = useState(false);
  const [popupSearch, setPopupSearch] = useState("");

  // Screen sizing
  const isWide = screenWidth >= 900;
  const isTablet = screenWidth >= 600 && screenWidth < 900;
  const isSmallScreen = screenWidth < 380 || screenHeight < 680;

  const isStartingRef = useRef(false);

  // Pulse animation for footer text
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Promo Slideshow Attract Loop Screensaver (dbo.PromoCodeMaster) ──
  const [promoSlides, setPromoSlides] = useState<any[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showAttractLoop, setShowAttractLoop] = useState(false);
  const slideAnim = useRef(new Animated.Value(1)).current;
  const pulseTouchAnim = useRef(new Animated.Value(1)).current;
  const idleTimerRef = useRef<any>(null);

  const [companyName, setCompanyName] = useState<string>("RESTAURANT");
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [logoLoading, setLogoLoading] = useState(true);

  const formatLogoUrl = (url?: string | null) => {
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
    const cleanBase = (BASE_URL || API.replace(/\/api\/?$/, "")).replace(/\/$/, "");
    if (
      cleanUrl.startsWith("/images") ||
      cleanUrl.startsWith("images/") ||
      cleanUrl.startsWith("/uploads") ||
      cleanUrl.startsWith("uploads/")
    ) {
      const p = cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`;
      return `${cleanBase}${p}`;
    }
    return `${cleanBase}${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
  };

  const formattedLogoUri = formatLogoUrl(companyLogoUrl);
  const hasValidLogo = !!formattedLogoUri && !logoError;

  // 🛡️ Ensure any abandoned session from an earlier page reload/crash is released back to AVAILABLE in POS
  useEffect(() => {
    const cleanupLingeringSession = async () => {
      try {
        const storedTableId = await AsyncStorage.getItem("tableId");
        const storedTableNo = await AsyncStorage.getItem("tableNo");
        const storedKioskOrder = await AsyncStorage.getItem("kioskOrderId");
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
            } catch (_) {}
          }
        }
      } catch (_) {}
    };
    cleanupLingeringSession();
  }, []);

  // Fetch Company Name & Logo dynamically from dbo.CompanySettings
  useEffect(() => {
    let isMounted = true;
    const loadCompanySettings = async () => {
      try {
        setLogoLoading(true);
        let res = await fetch(`${API}/company-settings/brand`).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`${API}/company-settings/1`).catch(() => null);
        }
        if (!res || !res.ok) {
          res = await fetch(`${API}/company-settings`).catch(() => null);
        }
        if (res && res.ok) {
          const data = await res.json();
          const settings = data?.settings || data;
          const resolvedName =
            settings?.CompanyName || settings?.name || settings?.companyName || data?.CompanyName;
          const resolvedLogo =
            settings?.CompanyLogoUrl ||
            settings?.logoUrl ||
            settings?.companyLogoUrl ||
            data?.CompanyLogoUrl;
          if (isMounted) {
            if (resolvedName) {
              setCompanyName(String(resolvedName).trim());
            }
            if (resolvedLogo && typeof resolvedLogo === "string" && resolvedLogo.trim()) {
              setCompanyLogoUrl(resolvedLogo.trim());
              setLogoError(false);
            }
          }
        }
      } catch (err) {
        console.log("Failed to fetch company settings for kiosk start page:", err);
      } finally {
        if (isMounted) {
          setLogoLoading(false);
        }
      }
    };
    loadCompanySettings();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Promo Images from PromoCodeMaster via /api/auth/promo-image
  useEffect(() => {
    let isMounted = true;
    const fetchPromoImages = async () => {
      try {
        const res = await fetch(`${API}/auth/promo-image`);
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.promoImages) && data.promoImages.length > 0) {
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

  // Idle Timer: Enter Attract Loop after 50 seconds of inactivity on Welcome screen
  const resetIdleTimer = () => {
    if (showAttractLoop) {
      setShowAttractLoop(false);
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (promoSlides.length > 0 && !showCustomerPopup && !showCustomerListPopup) {
        setShowAttractLoop(true);
        setCurrentSlideIndex(0);
      }
    }, 50000);
  };

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [promoSlides.length, showCustomerPopup, showCustomerListPopup]);

  // Slideshow auto-advance every 4.5 seconds
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

  // Pulse animation for TOUCH SCREEN TO ORDER
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
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [showAttractLoop]);

  const dismissAttractLoop = () => {
    setShowAttractLoop(false);
    resetIdleTimer();
  };

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.72,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulseAnim]);

  // Preloaded customer list for live typing suggestions
  const [allCustomers, setAllCustomers] = useState<CustomerItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load all customers for live suggestions
  const loadCustomers = async () => {
    try {
      const res = await fetch(`${API}/order/kiosk/customers`);
      const data = await res.json();
      const list: CustomerItem[] = data.customers || [];
      setAllCustomers(list);
      setCustomerData(list);
    } catch (_) {}
  };

  const onSelectCustomer = async (item: CustomerItem) => {
    setSelectedCustomer(item);
    setCustomerData(item);
    setCustomerName(item.CustomerName || "");
    setCarNumber((item.CarNumber || "").toUpperCase());
    setShowSuggestions(false);
    setShowCustomerListPopup(false);

    if (item.CarNumber) {
      await AsyncStorage.setItem("kioskCarNumber", item.CarNumber.trim().toUpperCase());
    }
    if (item.CustomerName) {
      await AsyncStorage.setItem("kioskCustomerName", item.CustomerName.trim());
    }
    if (item.CustomerVehicleId) {
      await AsyncStorage.setItem("kioskCustomerVehicleId", String(item.CustomerVehicleId));
    }
    if (item.DefaultDishId) {
      await AsyncStorage.setItem("kioskDefaultDishId", String(item.DefaultDishId));
    }
  };

  // Search customer from backend by entered Car Number
  const searchCustomer = async () => {
    // Sync ref guard: prevents double-fire even if React state batching lags (web bug)
    if (searchingRef.current) return;
    searchingRef.current = true;

    const cleanCar = carNumber.trim().toUpperCase();

    // Always open the customer list popup.
    // If a car number is typed, pre-fill the popup filter so the list auto-filters to it.
    try {
      setSearchingCustomer(true);
      const res = await fetch(`${API}/order/kiosk/customers`);
      const data = await res.json();
      const list: CustomerItem[] = data.customers || [];
      setAllCustomers(list);
      setCustomerData(list);
      setPopupSearch(cleanCar); // pre-filter by typed car number (empty string = show all)
      setShowCustomerListPopup(true);
    } catch (err: any) {
      showAlert("Customer Search Error", err?.message || "Unable to search customer");
    } finally {
      setSearchingCustomer(false);
      searchingRef.current = false;
    }
  };


  // Choose Service (DINE_IN / TAKEAWAY) -> Start Kiosk session with automatic table assignment
  const chooseService = async (orderType: string) => {
    if (isStartingRef.current || loading) {
      return;
    }
    isStartingRef.current = true;
    setError("");
    setLoading(true);
    setSelectedService(orderType as any);
    try {
      await handleStart(orderType);
    } catch (err: any) {
      setSelectedService("");
      setError(err?.message || "Unable to start service.");
      showAlert(
        orderType === "TAKEAWAY" ? "Takeaway Unavailable" : "Dine-In Notice",
        err?.message || "All tables are currently occupied. Please wait a moment."
      );
    } finally {
      setLoading(false);
      isStartingRef.current = false;
    }
  };

  // Start Kiosk order session with automatic table assignment from TableMaster
  const handleStart = async (orderType: string) => {
    setError("");
    try {
      const bodyPayload: any = { orderType };

      const res = await fetch(`${API}/order/kiosk/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await readJsonResponse(res);

      if (!data.success) {
        throw new Error(data.error || "Unable to start Kiosk session. Please try again.");
      }

      const assignedTableId = data.tableId || "";
      const assignedTableNo = data.tableNo || (orderType === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN");

      // Store the kiosk session info for the ordering screen
      await AsyncStorage.setItem("kioskIsNewSession", "true");
      await AsyncStorage.setItem("kioskOrderId", String(data.orderNumber || ""));
      await AsyncStorage.setItem("kioskOrderType", orderType);
      await AsyncStorage.setItem("tableId", assignedTableId);
      await AsyncStorage.setItem("tableNo", assignedTableNo);
      await AsyncStorage.multiRemove([
        "kioskAppliedPromotion",
        "kioskCart",
        "orderId",
        "returnToKioskStart",
      ]);
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("kioskAppliedPromotion");
          localStorage.removeItem("kioskCart");
        } catch (_) {}
      }

      let currentUser = null;
      try {
        const stored = await AsyncStorage.getItem("qr_pos_user");
        currentUser = stored ? JSON.parse(stored) : null;
      } catch (_) {
        currentUser = null;
      }

      const guestUser = currentUser || {
        FullName: "Guest",
        UserId: "guest",
        UserName: "guest",
      };

      await AsyncStorage.setItem("isLoggedIn", "true");
      await AsyncStorage.setItem("qr_pos_user", JSON.stringify(guestUser));

      if (onStart) {
        onStart(guestUser, { tableId: assignedTableId, tableNo: assignedTableNo });
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      throw err;
    }
  };

  // Filtered customer list for modal
  const filteredCustomers = Array.isArray(customerData)
    ? customerData.filter((c) => {
        const query = popupSearch.trim().toUpperCase();
        return query === "" || (c.CarNumber || "").toUpperCase().includes(query);
      })
    : [];

  // Live suggestions for Customer Entry popup as user types
  const cleanInputCar = carNumber.trim().toUpperCase();
  const carSuggestions =
    cleanInputCar.length > 0 && showSuggestions
      ? allCustomers
          .filter((c) => (c.CarNumber || "").toUpperCase().includes(cleanInputCar))
          .slice(0, 8)
      : [];

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        resetIdleTimer();
        return false;
      }}
    >
      <ImageBackground
        source={require("./assets/images/start_page_bg.jpg")}
        style={styles.container}
        resizeMode="cover"
      >
      {/* ── Fullscreen Promo Slideshow Attract Loop Screensaver (dbo.PromoCodeMaster) ── */}
      {showAttractLoop && promoSlides.length > 0 && (
        <TouchableOpacity
          style={styles.attractLoopContainer}
          activeOpacity={1}
          onPress={dismissAttractLoop}
        >
          {/* Slideshow Image */}
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
                <Text style={styles.attractLoopCtaText}>TOUCH SCREEN TO ORDER</Text>
              </View>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.overlay} />

      {/* Top Header - Smart Cafe */}
      <View style={[styles.header, isSmallScreen && styles.compactHeader]}>
        <View style={styles.logoRow}>
          <View style={styles.logoCircle}>
            <Image
              source={require("./assets/images/app_logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.brandTextGroup}>
            <Text style={styles.brandTitle}>
              Smart <Text style={styles.brandTitleAccent}>Cafe</Text>
            </Text>
            <Text style={styles.brandSubtitle}>Delicious Food. Exceptional Experience.</Text>
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={[
          styles.contentScroll,
          isWide && styles.contentWide,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section: Centered & Balanced */}
        <View style={styles.heroSection}>
          {hasValidLogo && (
            <View style={styles.heroCompanyLogoWrap}>
              <Image
                source={{ uri: formattedLogoUri }}
                style={[
                  styles.heroCompanyLogo,
                  isWide ? styles.heroCompanyLogoWide : isTablet ? styles.heroCompanyLogoTablet : null,
                ]}
                resizeMode="contain"
                onError={() => setLogoError(true)}
              />
            </View>
          )}
          <Text style={styles.heroWelcomeLead}>Welcome to</Text>
          <Text
            style={[
              styles.heroCompanyName,
              isWide ? styles.heroCompanyWide : isTablet ? styles.heroCompanyTablet : null,
            ]}
          >
            {companyName ? companyName.toUpperCase() : "OUR RESTAURANT"}
          </Text>
          <Text style={styles.heroTagline}>Where good taste begins</Text>
        </View>

        {/* Cards Container: Style B (Ultra-Clean Frosted Glass Cards) */}
        <View
          style={[
            styles.cardsContainer,
            isWide || isTablet ? styles.cardsRow : styles.cardsColumn,
          ]}
        >
          {/* DINE IN Glass Card */}
          <TouchableOpacity
            style={[
              styles.glassCard,
              isWide ? styles.glassCardWide : isTablet ? styles.glassCardTablet : styles.glassCardMobile,
            ]}
            onPress={() => chooseService("DINE_IN")}
            activeOpacity={0.88}
            disabled={loading}
          >
            <View style={styles.glassIconCircle}>
              <Ionicons
                name="restaurant-outline"
                size={isWide ? 58 : isTablet ? 52 : 46}
                color="#ea580c"
              />
            </View>
            <Text style={styles.glassCardTitle}>DINE IN</Text>
            <View style={styles.glassDivider} />
            <Text style={styles.glassCardSubtitle}>
              Enjoy your meal hot{"\n"}served at your table
            </Text>
          </TouchableOpacity>

          {/* TAKEAWAY Glass Card */}
          <TouchableOpacity
            style={[
              styles.glassCard,
              isWide ? styles.glassCardWide : isTablet ? styles.glassCardTablet : styles.glassCardMobile,
            ]}
            onPress={() => chooseService("TAKEAWAY")}
            activeOpacity={0.88}
            disabled={loading}
          >
            <View style={styles.glassIconCircle}>
              <Ionicons
                name="bag-handle-outline"
                size={isWide ? 58 : isTablet ? 52 : 46}
                color="#ea580c"
              />
            </View>
            <Text style={styles.glassCardTitle}>TAKEAWAY</Text>
            <View style={styles.glassDivider} />
            <Text style={styles.glassCardSubtitle}>
              Packed & ready{"\n"}to take on the go
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Error Notice */}
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Footer Area */}
      <View style={styles.footer}>
        <Text style={styles.footerCopyrightText}>
          © 2026 Unipro Softwares SG Pte Ltd
        </Text>
      </View>

      {/* CUSTOMER ENTRY POPUP MODAL */}
      <Modal
        visible={showCustomerPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomerPopup(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.customerPopup}>
            <TouchableOpacity
              style={styles.popupCloseBtn}
              onPress={() => setShowCustomerPopup(false)}
              hitSlop={10}
            >
              <Text style={styles.popupCloseText}>×</Text>
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.customerPopupScroll}
            >
              <Text style={styles.popupTitle}>Customer / Table Info</Text>

              <Text style={styles.inputLabel}>Mobile / ID / Car Plate</Text>
              <View style={styles.carInputContainer}>
                <View style={styles.carInputRow}>
                  <TextInput
                    style={styles.carInput}
                    value={carNumber}
                    onChangeText={(val) => {
                      const upper = val.toUpperCase();
                      setCarNumber(upper);
                      setCustomerData(null);
                      setSelectedCustomer(null);
                      setShowSuggestions(true);
                      if (allCustomers.length === 0) {
                        loadCustomers();
                      }
                    }}
                    onFocus={() => {
                      if (carNumber.trim().length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder="Enter identifier / mobile"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.searchButton, searchingCustomer && { opacity: 0.6 }]}
                    onPress={searchCustomer}
                    activeOpacity={0.8}
                  >
                    {searchingCustomer ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.searchButtonText}>Search</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Live Suggestions Dropdown */}
                {carSuggestions.length > 0 && (
                  <View style={styles.suggestionsContainer}>
                    <ScrollView
                      style={styles.suggestionsScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled={true}
                    >
                      {carSuggestions.map((item, idx) => (
                        <TouchableOpacity
                          key={String(item.CustomerVehicleId || item.CarNumber || idx)}
                          style={[
                            styles.suggestionItem,
                            idx === carSuggestions.length - 1 && styles.suggestionItemLast,
                          ]}
                          onPress={() => onSelectCustomer(item)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.suggestionLeft}>
                            <Text style={styles.suggestionCarNumber}>
                              {item.CarNumber || "-"}
                            </Text>
                            {!!item.CustomerName && (
                              <Text style={styles.suggestionCustomerName}>
                                {item.CustomerName}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.suggestionBadge}>Select</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={styles.inputLabel}>Customer Name</Text>
              <TextInput
                style={styles.standardInput}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Enter customer name"
                placeholderTextColor="#9ca3af"
              />

              <TouchableOpacity
                style={styles.continueButton}
                onPress={async () => {
                  const cleanCar = carNumber.trim().toUpperCase();
                  if (!cleanCar) {
                    showAlert("Required", "Please enter customer identifier");
                    return;
                  }

                  const cleanName = customerName.trim();
                  if (!cleanName) {
                    showAlert("Required", "Please enter customer name");
                    return;
                  }

                  await AsyncStorage.setItem("kioskCarNumber", cleanCar);
                  await AsyncStorage.setItem("kioskCustomerName", cleanName);

                  let activeCust = selectedCustomer || (customerData && !Array.isArray(customerData) ? (customerData as CustomerItem) : null);

                  // If not in state, look up by car number
                  if (!activeCust?.DefaultDishId && cleanCar) {
                    try {
                      const checkRes = await fetch(`${API}/order/kiosk/customer/${encodeURIComponent(cleanCar)}`);
                      const checkData = await checkRes.json();
                      if (checkData?.success && checkData?.customer) {
                        activeCust = checkData.customer;
                        setSelectedCustomer(activeCust);
                      }
                    } catch (_) {}
                  }

                  // Fallback for ABC67899 record
                  const defaultDishId = activeCust?.DefaultDishId
                    ? String(activeCust.DefaultDishId)
                    : (cleanCar === "ABC67899" ? "98373187-009C-440F-A196-53A205DCA997" : null);

                  if (defaultDishId) {
                    await AsyncStorage.setItem("kioskDefaultDishId", defaultDishId);
                  } else {
                    await AsyncStorage.removeItem("kioskDefaultDishId");
                  }

                  if (activeCust?.CustomerVehicleId) {
                    await AsyncStorage.setItem("kioskCustomerVehicleId", String(activeCust.CustomerVehicleId));
                  } else if (cleanCar === "ABC67899") {
                    await AsyncStorage.setItem("kioskCustomerVehicleId", "DC7036C9-69DA-4B36-BA4F-3DE693593872");
                  } else {
                    await AsyncStorage.removeItem("kioskCustomerVehicleId");
                  }

                  setShowCustomerPopup(false);
                  chooseService(selectedService);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CHOOSE CUSTOMER LIST POPUP MODAL */}
      <Modal
        visible={showCustomerListPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomerListPopup(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.customerListPopup}>
            <TouchableOpacity
              style={styles.popupCloseBtn}
              onPress={() => setShowCustomerListPopup(false)}
              hitSlop={10}
            >
              <Text style={styles.popupCloseText}>×</Text>
            </TouchableOpacity>

            <Text style={styles.popupTitle}>Choose Customer</Text>

            <TextInput
              style={styles.popupSearchInput}
              value={popupSearch}
              onChangeText={(val) => setPopupSearch(val.toUpperCase())}
              placeholder="Search by name or number..."
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoFocus
            />

            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Customer Name</Text>
              <Text style={styles.tableHeaderText}>Identifier</Text>
            </View>

            {filteredCustomers.length === 0 ? (
              <View style={styles.emptyTableRow}>
                <Text style={styles.emptyTableText}>No customer found.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCustomers}
                keyExtractor={(item, index) =>
                  String(item.CustomerVehicleId || item.CarNumber || index)
                }
                style={styles.customerListFlatList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.tableRow}
                    onPress={() => onSelectCustomer(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.tableCellName}>
                      {item.CustomerName || "-"}
                    </Text>
                    <Text style={styles.tableCellCar}>
                      {item.CarNumber || "-"}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#f97316" />
            <Text style={styles.loadingText}>Preparing...</Text>
          </View>
        </View>
      )}
    </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#102033",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(16, 32, 51, 0.45)",
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: Platform.OS === "android" ? 36 : 48,
    paddingBottom: 16,
    zIndex: 10,
  },
  compactHeader: {
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 10,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  companyLogoContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  dynamicCompanyLogo: {
    width: 160,
    height: 52,
    maxWidth: 220,
    maxHeight: 60,
  },
  compactDynamicCompanyLogo: {
    width: 120,
    height: 42,
    maxWidth: 160,
    maxHeight: 46,
  },
  companyLogoLoading: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fallbackLogoCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  fallbackCompanyName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  logoCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  logoCircleText: {
    fontSize: 26,
  },
  brandTextGroup: {
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  brandTitleAccent: {
    color: "#fbbf24", // refined warm golden honey amber instead of harsh neon orange
    fontWeight: "800",
  },
  brandSubtitle: {
    fontSize: 12,
    color: "#e2e8f0",
    fontWeight: "500",
    letterSpacing: 0.2,
    marginTop: 1,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  backBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  contentScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
    gap: 48,
  },
  contentWide: {
    paddingVertical: 56,
    gap: 60,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroCompanyLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroCompanyLogo: {
    width: 140,
    height: 70,
    maxWidth: 220,
    maxHeight: 90,
  },
  heroCompanyLogoTablet: {
    width: 170,
    height: 85,
    maxWidth: 260,
    maxHeight: 105,
  },
  heroCompanyLogoWide: {
    width: 200,
    height: 100,
    maxWidth: 300,
    maxHeight: 120,
  },
  heroWelcomeLead: {
    fontSize: 20,
    color: "#ffedd5",
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 8,
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroCompanyName: {
    fontSize: 44,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 2,
    textAlign: "center",
    lineHeight: 52,
    textShadowColor: "rgba(0, 0, 0, 0.65)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  heroCompanyWide: {
    fontSize: 60,
    lineHeight: 68,
    letterSpacing: 2.5,
  },
  heroCompanyTablet: {
    fontSize: 50,
    lineHeight: 58,
  },
  heroTagline: {
    fontSize: 22,
    color: "#e2e8f0",
    fontWeight: "600",
    fontStyle: "italic",
    marginTop: 12,
    letterSpacing: 0.8,
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  // ── Style B: Ultra-Clean Frosted Glass Cards (Apple / Modern Kiosk Aesthetic) ──
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 52,
    paddingHorizontal: 36,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 36,
    elevation: 12,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.95)",
  },
  glassCardWide: {
    width: 380,
    minHeight: 440,
  },
  glassCardTablet: {
    width: 320,
    minHeight: 390,
  },
  glassCardMobile: {
    width: "100%",
    maxWidth: 380,
    minHeight: 320,
    paddingVertical: 38,
    paddingHorizontal: 24,
  },
  glassIconCircle: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "#fff7ed",
    borderWidth: 2,
    borderColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  glassCardTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: "center",
  },
  glassDivider: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#f97316",
    marginBottom: 16,
  },
  glassCardSubtitle: {
    fontSize: 17,
    color: "#475569",
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 25,
    marginBottom: 8,
    maxWidth: 280,
  },
  glassActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 28,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  glassActionText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardsContainer: {
    gap: 28,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  cardsRow: {
    flexDirection: "row",
    gap: 40,
    justifyContent: "center",
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  cardsColumn: {
    flexDirection: "column",
    width: "100%",
    maxWidth: 380,
    gap: 24,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 2,
    borderColor: "rgba(255, 100, 31, 0.3)",
    borderRadius: 30,
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  cardWide: {
    width: 270,
    paddingVertical: 40,
  },
  cardTablet: {
    width: 230,
    paddingVertical: 32,
  },
  cardMobile: {
    width: "100%",
    paddingVertical: 26,
  },
  cardIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#ff641f",
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardEmoji: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#102033",
    letterSpacing: 1,
  },
  cardDivider: {
    width: 40,
    height: 4,
    backgroundColor: "#ff641f",
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 10,
  },
  cardDescription: {
    fontSize: 14,
    color: "#526073",
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "600",
  },
  cardArrowBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#ff641f",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    shadowColor: "#ff641f",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  arrowText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  footer: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  footerCopyrightText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.75)",
    fontWeight: "500",
    letterSpacing: 0.4,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  errorBox: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    backgroundColor: "#ef4444",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    zIndex: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  errorText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },

  /* POPUP / MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  customerPopup: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    position: "relative",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 12,
  },
  customerPopupScroll: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  popupCloseBtn: {
    position: "absolute",
    top: 14,
    right: 16,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  popupCloseText: {
    fontSize: 30,
    color: "#6b7280",
    lineHeight: 32,
    fontWeight: "400",
  },
  popupTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 22,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
  },
  carInputContainer: {
    position: "relative",
    zIndex: 30,
    marginBottom: 18,
  },
  carInputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingLeft: 14,
    paddingRight: 6,
  },
  suggestionsContainer: {
    marginTop: 6,
    maxHeight: 180,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ff641f",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  suggestionsScroll: {
    maxHeight: 180,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#ffffff",
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionLeft: {
    flex: 1,
    marginRight: 8,
  },
  suggestionCarNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ff641f",
    letterSpacing: 0.5,
  },
  suggestionCustomerName: {
    fontSize: 13,
    color: "#4b5563",
    fontWeight: "500",
    marginTop: 2,
  },
  suggestionBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    backgroundColor: "#ff641f",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  carInput: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    color: "#111827",
    backgroundColor: "transparent",
    paddingRight: 8,
  },
  searchButton: {
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: "#f97316",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  searchButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  standardInput: {
    width: "100%",
    height: 52,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
    marginBottom: 22,
  },
  continueButton: {
    width: "100%",
    height: 54,
    backgroundColor: "#f97316",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  continueButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
  },

  /* CHOOSE CUSTOMER TABLE MODAL */
  customerListPopup: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    position: "relative",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 12,
  },
  popupSearchInput: {
    width: "100%",
    height: 48,
    borderWidth: 1.5,
    borderColor: "#f97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: "#111827",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tableHeaderText: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontWeight: "800",
    fontSize: 13,
    color: "#4b5563",
    textTransform: "uppercase",
  },
  customerListFlatList: {
    maxHeight: 340,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#f3f4f6",
    backgroundColor: "#ffffff",
  },
  tableCellName: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  tableCellCar: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
    color: "#f97316",
  },
  emptyTableRow: {
    paddingVertical: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  emptyTableText: {
    color: "#9ca3af",
    fontSize: 15,
    fontWeight: "500",
  },

  /* LOADING */
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  loadingBox: {
    alignItems: "center",
    gap: 14,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#374151",
  },
});
