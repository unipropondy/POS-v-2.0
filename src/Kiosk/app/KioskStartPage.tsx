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
import { API } from "@/config";

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

  // Takeaway Table Selection State
  const [showTakeawayTableModal, setShowTakeawayTableModal] = useState(false);
  const [takeawayTables, setTakeawayTables] = useState<any[]>([]);
  const [loadingTakeawayTables, setLoadingTakeawayTables] = useState(false);
  const [selectedTakeawayTable, setSelectedTakeawayTable] = useState<any | null>(null);
  const [takeawayTableError, setTakeawayTableError] = useState("");

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

  // Fetch Company Name dynamically from dbo.CompanySettings
  useEffect(() => {
    let isMounted = true;
    const loadCompanySettings = async () => {
      try {
        const res = await fetch(`${API}/company-settings/1`);
        const data = await res.json();
        const settings = data?.settings || data;
        const resolvedName = settings?.CompanyName || settings?.name || settings?.companyName;
        if (isMounted && resolvedName) {
          setCompanyName(String(resolvedName).trim());
        }
      } catch (err) {
        console.log("Failed to fetch company settings for kiosk start page:", err);
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


  // Fetch available Takeaway tables dynamically from TableMaster
  const fetchTakeawayTables = async () => {
    setLoadingTakeawayTables(true);
    setTakeawayTableError("");
    try {
      const res = await fetch(`${API}/order/kiosk/available-tables?orderType=TAKEAWAY&section=4`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.tables)) {
        setTakeawayTables(data.tables);
        if (data.tables.length === 0) {
          setTakeawayTableError("All Takeaway tables are currently occupied. Please wait a moment.");
        }
      } else {
        setTakeawayTables([]);
        setTakeawayTableError(data?.error || "No available Takeaway tables found.");
      }
    } catch (err: any) {
      console.error("Error fetching takeaway tables:", err);
      setTakeawayTables([]);
      setTakeawayTableError("Unable to load Takeaway tables. Please check your network connection.");
    } finally {
      setLoadingTakeawayTables(false);
    }
  };

  // Open Takeaway Table Picker
  const handleOpenTakeawayTablePicker = async () => {
    setSelectedTakeawayTable(null);
    setShowTakeawayTableModal(true);
    await fetchTakeawayTables();
  };

  // Confirm Takeaway Table selection and start Kiosk order
  const handleConfirmTakeawayTable = async (tableToUse?: any) => {
    const target = tableToUse || selectedTakeawayTable;
    if (!target) {
      setTakeawayTableError("Please select a Takeaway table to proceed.");
      return;
    }
    setShowTakeawayTableModal(false);
    chooseService("TAKEAWAY", target);
  };

  // Choose Service (DINE_IN / TAKEAWAY) -> Start Kiosk session
  const chooseService = async (orderType: string, chosenTable?: any) => {
    if (orderType === "TAKEAWAY" && !chosenTable) {
      handleOpenTakeawayTablePicker();
      return;
    }
    if (isStartingRef.current || loading) {
      return;
    }
    isStartingRef.current = true;
    setError("");
    setLoading(true);
    try {
      await handleStart(orderType, chosenTable);
    } catch (err: any) {
      setError(err?.message || "Unable to start service.");
    } finally {
      setLoading(false);
      isStartingRef.current = false;
    }
  };

  // Start Kiosk order session with optional chosen table
  const handleStart = async (orderType: string, chosenTable?: any) => {
    setError("");
    try {
      const bodyPayload: any = { orderType };
      if (chosenTable) {
        bodyPayload.tableId = chosenTable.TableId;
        bodyPayload.tableNo = chosenTable.TableNumber || chosenTable.TableNo;
      }

      const res = await fetch(`${API}/order/kiosk/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await readJsonResponse(res);

      if (!data.success) {
        throw new Error(data.error || "Unable to start Kiosk session. Please try again.");
      }

      const assignedTableId = data.tableId || chosenTable?.TableId || "";
      const assignedTableNo = data.tableNo || chosenTable?.TableNumber || chosenTable?.TableNo || orderType;

      // Store the kiosk session info for the ordering screen
      await AsyncStorage.setItem("kioskOrderId", String(data.orderNumber || ""));
      await AsyncStorage.setItem("kioskOrderType", orderType);
      await AsyncStorage.setItem("tableId", assignedTableId);
      await AsyncStorage.setItem("tableNo", assignedTableNo);
      await AsyncStorage.multiRemove(["orderId", "returnToKioskStart"]);

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

      {/* Top Header - Restored to Smart Cafe */}
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
              <Ionicons name="restaurant-outline" size={38} color="#ea580c" />
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
              <Ionicons name="bag-handle-outline" size={38} color="#ea580c" />
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

      {/* ── TAKEAWAY TABLE SELECTION POPUP MODAL ── */}
      <Modal
        visible={showTakeawayTableModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTakeawayTableModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.takeawayTableModal}>
            {/* Modal Header */}
            <View style={styles.takeawayModalHeader}>
              <View style={styles.takeawayModalTitleRow}>
                <View style={styles.takeawayModalIconCircle}>
                  <Ionicons name="bag-handle" size={24} color="#ea580c" />
                </View>
                <View>
                  <Text style={styles.takeawayModalTitle}>Select Takeaway Table</Text>
                  <Text style={styles.takeawayModalSubtitle}>
                    Choose an available counter / takeaway slot for your order
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.popupCloseBtn}
                onPress={() => setShowTakeawayTableModal(false)}
                hitSlop={10}
              >
                <Text style={styles.popupCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Error Message if Any */}
            {!!takeawayTableError && (
              <View style={styles.takeawayErrorBadge}>
                <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
                <Text style={styles.takeawayErrorText}>{takeawayTableError}</Text>
              </View>
            )}

            {/* Table Grid / Loading State */}
            {loadingTakeawayTables ? (
              <View style={styles.takeawayLoadingWrap}>
                <ActivityIndicator size="large" color="#ea580c" />
                <Text style={styles.takeawayLoadingText}>Loading available takeaway tables...</Text>
              </View>
            ) : takeawayTables.length === 0 ? (
              <View style={styles.takeawayEmptyWrap}>
                <Ionicons name="restaurant-outline" size={48} color="#94a3b8" />
                <Text style={styles.takeawayEmptyTitle}>No Takeaway Tables Available</Text>
                <Text style={styles.takeawayEmptyDesc}>
                  All Takeaway slots are currently occupied. Please wait for staff or try again in a few moments.
                </Text>
                <TouchableOpacity
                  style={styles.takeawayRefreshBtn}
                  onPress={fetchTakeawayTables}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={18} color="#ffffff" />
                  <Text style={styles.takeawayRefreshBtnText}>Refresh Availability</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                style={styles.takeawayTablesScroll}
                contentContainerStyle={styles.takeawayTablesGrid}
                showsVerticalScrollIndicator={false}
              >
                {takeawayTables.map((tbl) => {
                  const isSelected = selectedTakeawayTable?.TableId === tbl.TableId;
                  const displayLabel = tbl.TableNo || tbl.TableNumber || "TW";
                  return (
                    <TouchableOpacity
                      key={tbl.TableId || displayLabel}
                      style={[
                        styles.takeawayTableCard,
                        isSelected && styles.takeawayTableCardSelected,
                      ]}
                      onPress={() => setSelectedTakeawayTable(tbl)}
                      activeOpacity={0.78}
                    >
                      <View
                        style={[
                          styles.takeawayCardIconWrap,
                          isSelected && styles.takeawayCardIconWrapSelected,
                        ]}
                      >
                        <Ionicons
                          name="bag-handle-outline"
                          size={24}
                          color={isSelected ? "#ffffff" : "#ea580c"}
                        />
                      </View>
                      <Text
                        style={[
                          styles.takeawayTableCardLabel,
                          isSelected && styles.takeawayTableCardLabelSelected,
                        ]}
                      >
                        {displayLabel}
                      </Text>
                      <View style={styles.takeawayAvailablePill}>
                        <View style={styles.takeawayAvailableDot} />
                        <Text style={styles.takeawayAvailableText}>Available</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Modal Footer Actions */}
            <View style={styles.takeawayModalFooter}>
              <TouchableOpacity
                style={styles.takeawayCancelBtn}
                onPress={() => setShowTakeawayTableModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.takeawayCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.takeawayProceedBtn,
                  (!selectedTakeawayTable || loadingTakeawayTables) && styles.takeawayProceedBtnDisabled,
                ]}
                onPress={() => handleConfirmTakeawayTable()}
                disabled={!selectedTakeawayTable || loadingTakeawayTables}
                activeOpacity={0.85}
              >
                <Text style={styles.takeawayProceedBtnText}>
                  {selectedTakeawayTable
                    ? `Continue with ${selectedTakeawayTable.TableNo || selectedTakeawayTable.TableNumber}`
                    : "Select a Table"}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 28,
  },
  contentWide: {
    paddingVertical: 36,
    gap: 40,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroWelcomeLead: {
    fontSize: 16,
    color: "#ffedd5",
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 4,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroCompanyName: {
    fontSize: 34,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: 1.5,
    textAlign: "center",
    lineHeight: 40,
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  heroCompanyWide: {
    fontSize: 48,
    lineHeight: 54,
  },
  heroCompanyTablet: {
    fontSize: 40,
    lineHeight: 46,
  },
  heroTagline: {
    fontSize: 16,
    color: "#cbd5e1",
    fontWeight: "500",
    fontStyle: "italic",
    marginTop: 8,
    letterSpacing: 0.5,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Style B: Ultra-Clean Frosted Glass Cards (Apple / Modern Kiosk Aesthetic) ──
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 28,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
  },
  glassCardWide: {
    width: 290,
  },
  glassCardTablet: {
    width: 250,
  },
  glassCardMobile: {
    width: "100%",
  },
  glassIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff7ed",
    borderWidth: 1.5,
    borderColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  glassCardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 1,
    marginBottom: 6,
  },
  glassDivider: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#f97316",
    marginBottom: 12,
  },
  glassCardSubtitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  glassActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  glassActionText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardsContainer: {
    gap: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardsRow: {
    flexDirection: "row",
    gap: 32,
  },
  cardsColumn: {
    flexDirection: "column",
    width: "100%",
    maxWidth: 320,
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

  /* ── TAKEAWAY TABLE SELECTION MODAL STYLES ── */
  takeawayTableModal: {
    width: "100%",
    maxWidth: 600,
    maxHeight: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    position: "relative",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 12,
  },
  takeawayModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  takeawayModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  takeawayModalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  takeawayModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  takeawayModalSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  takeawayErrorBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
    gap: 8,
  },
  takeawayErrorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  takeawayLoadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  takeawayLoadingText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  takeawayEmptyWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  takeawayEmptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
    marginTop: 8,
  },
  takeawayEmptyDesc: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },
  takeawayRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ea580c",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  takeawayRefreshBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  takeawayTablesScroll: {
    maxHeight: 380,
    marginBottom: 16,
  },
  takeawayTablesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingVertical: 4,
  },
  takeawayTableCard: {
    width: "30.5%",
    minWidth: 110,
    flexGrow: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  takeawayTableCardSelected: {
    borderColor: "#ea580c",
    backgroundColor: "#fff7ed",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  takeawayCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  takeawayCardIconWrapSelected: {
    backgroundColor: "#ea580c",
  },
  takeawayTableCardLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
  },
  takeawayTableCardLabelSelected: {
    color: "#ea580c",
  },
  takeawayAvailablePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  takeawayAvailableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  takeawayAvailableText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  takeawayModalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  takeawayCancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  takeawayCancelBtnText: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 14,
  },
  takeawayProceedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#ea580c",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  takeawayProceedBtnDisabled: {
    backgroundColor: "#cbd5e1",
    shadowOpacity: 0,
    elevation: 0,
  },
  takeawayProceedBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
});
