import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/Fonts";
import { useAuthStore } from "@/stores/authStore";
import { useOrderContextStore } from "@/stores/orderContextStore";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/constants/Config";
import { useGeneralSettingsStore } from "@/stores/generalSettingsStore";

// Local image assets matching the exact reference design
const DINE_IN_IMG = require("../assets/images/order_type_dine_in.jpg");
const TAKE_AWAY_IMG = require("../assets/images/order_type_takeaway.jpg");
const QUICK_SERVE_IMG = require("../assets/images/order_type_quickserve.jpg");
const BG_DISHES_IMG = require("../assets/images/order_type_bg.jpg");

interface OrderCardProps {
  type: "DINE_IN" | "TAKEAWAY" | "QUICK_SERVE";
  title: string;
  subtitle: string;
  image: any;
  accentColor: string;
  accentGradient: [string, string];
  iconName: keyof typeof Ionicons.glyphMap;
  features: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }>;
  buttonText: string;
  onPress: () => void;
  isHovered: boolean;
  onHoverIn: () => void;
  onHoverOut: () => void;
  isDesktop: boolean;
  isTablet: boolean;
  isMobile: boolean;
  isTabletPortrait: boolean;
}

function OrderCard({
  type,
  title,
  subtitle,
  image,
  accentColor,
  accentGradient,
  iconName,
  features,
  buttonText,
  onPress,
  isHovered,
  onHoverIn,
  onHoverOut,
  isDesktop,
  isTablet,
  isMobile,
  isTabletPortrait,
}: OrderCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isDesktop && styles.cardDesktop,
        isTablet && !isTabletPortrait && styles.cardTablet,
        isTabletPortrait && styles.cardTabletPortrait,
        isMobile && styles.cardMobile,
        isHovered && styles.cardHovered,
        pressed ? styles.cardPressed : null,
      ]}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
    >
      {/* Top Banner Image with Wave Curve */}
      <View style={[styles.cardImageContainer, isMobile && styles.cardImageContainerMobile]}>
        <Image source={image} style={styles.cardImage} resizeMode="cover" />

        {/* Organic S-Curve Wave at the bottom of the photo */}
        <View style={styles.waveSvgWrapper}>
          <Svg viewBox="0 0 360 38" style={styles.waveSvg} preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id={`grad-${type}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={accentGradient[0]} />
                <Stop offset="100%" stopColor={accentGradient[1]} />
              </SvgLinearGradient>
            </Defs>
            {/* Colored wavy accent ribbon */}
            <Path
              d="M0,10 C85,26 140,2 220,18 C285,28 320,12 360,20 L360,38 L0,38 Z"
              fill={`url(#grad-${type})`}
            />
            {/* Crisp white cutout forming the card body transition */}
            <Path
              d="M0,18 C85,34 140,10 220,26 C285,36 320,20 360,28 L360,38 L0,38 Z"
              fill="#FFFFFF"
            />
          </Svg>
        </View>
      </View>

      {/* Floating Center Icon Badge */}
      <View style={styles.iconCircleWrapper}>
        <View style={[styles.iconCircleBadge, { borderColor: accentColor }]}>
          <Ionicons name={iconName} size={24} color={accentColor} />
        </View>
      </View>

      {/* Card Content */}
      <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={[styles.titleUnderline, { backgroundColor: accentColor }]} />
        <Text style={styles.cardSubtitle}>{subtitle}</Text>

        {/* Feature Badges Row */}
        <View style={styles.featureChipsRow}>
          {features.map((feat, idx) => (
            <View key={idx} style={styles.chip}>
              <Ionicons name={feat.icon} size={12.5} color={accentColor} />
              <Text style={styles.chipText}>{feat.text}</Text>
            </View>
          ))}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: accentColor }]}
          onPress={onPress}
          activeOpacity={0.88}
        >
          <Text style={styles.actionButtonText}>{buttonText}</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

export default function OrderTypeSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { user, logout } = useAuthStore();
  const toast = useToast();
  const { settings, fetchSettings } = useGeneralSettingsStore();

  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Dynamic company settings from Receipt/Company settings API
  const [companyInfo, setCompanyInfo] = useState<{
    CompanyName?: string;
    CompanyLogoUrl?: string;
  } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings && settings.enableQuickServe === false) {
      router.replace("/(tabs)/category" as any);
    }
  }, [settings?.enableQuickServe]);

  useEffect(() => {
    fetch(`${API_URL}/api/company-settings/1`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && data.settings) {
          setCompanyInfo(data.settings);
        }
      })
      .catch((err) => console.log("Error fetching company settings:", err));
  }, []);

  // Live clock and date update (Singapore Time, UTC+8)
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateOptions: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Singapore",
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      };
      const formattedDate = now
        .toLocaleDateString("en-US", dateOptions)
        .replace(/[\u202F\u00A0\uFEFF]/g, " ");
      setCurrentDate(formattedDate);

      const timeOptions: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };
      const formattedTime = now
        .toLocaleTimeString("en-US", timeOptions)
        .replace(/[\u202F\u00A0\uFEFF]/g, " ");
      setCurrentTime(formattedTime);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (settings && settings.enableQuickServe === false) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F8FAFC", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  // Handlers for Order Types
  const handleDineIn = () => {
    useOrderContextStore.getState().setServiceMode("DINE_IN");
    useOrderContextStore.getState().setActiveSection("SECTION_1");
    useOrderContextStore.getState().setOrderContext({
      orderType: "DINE_IN",
      section: "SECTION_1",
    });
    router.push({
      pathname: "/(tabs)/category",
      params: { section: "SECTION_1" },
    });
  };

  const handleTakeAway = () => {
    const takeawayNo = `TW-${Math.floor(1000 + Math.random() * 9000)}`;
    useOrderContextStore.getState().setServiceMode("TAKEAWAY");
    useOrderContextStore.getState().setActiveSection("TAKEAWAY");
    useOrderContextStore.getState().setOrderContext({
      orderType: "TAKEAWAY",
      section: "TAKEAWAY",
      takeawayNo,
    });
    router.push({
      pathname: "/(tabs)/category",
      params: { section: "TAKEAWAY" },
    });
  };

  const handleQuickServe = () => {
    const token = `QS-${Math.floor(1000 + Math.random() * 9000)}`;
    useOrderContextStore.getState().setOrderContext({
      orderType: "TAKEAWAY",
      takeawayNo: token,
    });
    router.push("/quick-serve" as any);
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    router.replace("/login" as any);
  };

  const isMobile = width < 680;
  const isTablet = width >= 680 && width <= 1080;
  const isDesktop = width > 1080;
  const isTabletPortrait = isTablet && !isLandscape;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* HEADER BAR */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        {/* Left: Receipt Settings Logo & Name */}
        <View style={styles.headerLeft}>
          {companyInfo?.CompanyLogoUrl ? (
            <Image
              source={{ uri: companyInfo.CompanyLogoUrl }}
              style={[styles.headerCompanyLogo, isMobile && styles.headerCompanyLogoMobile]}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.headerLogoCircle, isMobile && styles.headerLogoCircleMobile]}>
              <Ionicons name="restaurant" size={isMobile ? 18 : 22} color="#7C2D12" />
            </View>
          )}

          <View style={styles.brandTitleContainer}>
            <Text
              style={[styles.brandTitle, isMobile && styles.brandTitleMobile]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {companyInfo?.CompanyName || "My Restaurant"}
            </Text>
            <Text style={[styles.brandSubtitle, isMobile && styles.brandSubtitleMobile]}>
              RESTAURANT SYSTEM
            </Text>
          </View>
        </View>

        {/* Center: Date & Time Display Badge */}
        {!isMobile && (
          <View style={styles.headerCenter}>
            <View style={styles.dateTimeBadge}>
              <View style={styles.badgeItem}>
                <Ionicons name="calendar-outline" size={14} color="#F97316" />
                <Text style={styles.dateTimeText}>{currentDate}</Text>
              </View>
              <View style={styles.dateTimeDivider} />
              <View style={styles.badgeItem}>
                <Ionicons name="time-outline" size={14} color="#F97316" />
                <Text style={styles.dateTimeText}>{currentTime}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Right: User Avatar & Dropdown Caret */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.userInfo, isMobile && styles.userInfoMobile]}
            onPress={() => setShowUserMenu(!showUserMenu)}
            activeOpacity={0.8}
          >
            <View style={[styles.avatarCircle, isMobile && styles.avatarCircleMobile]}>
              <Ionicons name="person" size={isMobile ? 13 : 15} color="#475569" />
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.userTextContainer}>
              <Text style={[styles.userName, isMobile && styles.userNameMobile]} numberOfLines={1}>
                {user?.userName || "123"}
              </Text>
              <Text style={[styles.userRole, isMobile && styles.userRoleMobile]}>
                {user?.role || "ADMIN"}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 5 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* USER DROPDOWN POPUP */}
      {showUserMenu && (
        <Pressable style={styles.userMenuBackdrop} onPress={() => setShowUserMenu(false)}>
          <View style={styles.userMenuDropdown}>
            <View style={styles.userMenuHeader}>
              <Text style={styles.userMenuHeaderName}>{user?.userName || "123"}</Text>
              <Text style={styles.userMenuHeaderRole}>{user?.role || "ADMIN"}</Text>
            </View>
            <TouchableOpacity
              style={styles.userMenuItem}
              onPress={() => {
                setShowUserMenu(false);
                router.push("/general-settings" as any);
              }}
            >
              <Ionicons name="settings-outline" size={17} color="#475569" />
              <Text style={styles.userMenuItemText}>Settings</Text>
            </TouchableOpacity>
            <View style={styles.userMenuDivider} />
            <TouchableOpacity style={styles.userMenuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={17} color="#EF4444" />
              <Text style={[styles.userMenuItemText, { color: "#EF4444" }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* FULL ARTISAN GOURMET BACKGROUND WALLPAPER */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image
          source={BG_DISHES_IMG}
          style={styles.fullBgImage}
          resizeMode="cover"
        />
        <View style={styles.centerContrastWash} />
      </View>

      {/* MAIN CONTENT AREA */}
      {isDesktop ? (
        /* FIXED DESKTOP VIEW - PERFECT NO SCROLL FIT */
        <View style={styles.mainFixedContainer}>
          <View style={styles.fixedContentInner}>
            {/* HERO TITLE SECTION */}
            <View style={styles.heroSection}>
              <View style={styles.welcomePill}>
                <Ionicons name="sparkles" size={13} color="#F97316" />
                <Text style={styles.welcomePillText}>Select Service Mode</Text>
              </View>
              <Text style={styles.mainTitle}>
                Welcome to{" "}
                <Text style={{ color: "#F97316" }}>
                  {companyInfo?.CompanyName || "My Restaurant"}
                </Text>
              </Text>
              <Text style={styles.subTitle}>
                Choose your order fulfillment type below to start creating bills
              </Text>
            </View>

            {/* CARDS ROW */}
            <View style={styles.cardsRow}>
              {/* CARD 1: DINE IN */}
              <OrderCard
                type="DINE_IN"
                title="DINE IN"
                subtitle="Serve customers at designated tables with real-time status"
                image={DINE_IN_IMG}
                accentColor="#EF4444"
                accentGradient={["#FF2A42", "#DC2626"]}
                iconName="restaurant"
                features={[
                  { icon: "storefront-outline", text: "Table Management" },
                  { icon: "print-outline", text: "KOT Printing" },
                ]}
                buttonText="Start Dine In"
                onPress={handleDineIn}
                isHovered={hoveredCard === 1}
                onHoverIn={() => setHoveredCard(1)}
                onHoverOut={() => setHoveredCard(null)}
                isDesktop={isDesktop}
                isTablet={isTablet}
                isMobile={isMobile}
                isTabletPortrait={isTabletPortrait}
              />

              {/* CARD 2: TAKE AWAY */}
              <OrderCard
                type="TAKEAWAY"
                title="TAKE AWAY"
                subtitle="Quick order processing for carry-out & pickup orders"
                image={TAKE_AWAY_IMG}
                accentColor="#F97316"
                accentGradient={["#FB923C", "#EA580C"]}
                iconName="bag-handle"
                features={[
                  { icon: "ticket-outline", text: "Auto Token No." },
                  { icon: "flash", text: "Fast Checkout" },
                ]}
                buttonText="Start Take Away"
                onPress={handleTakeAway}
                isHovered={hoveredCard === 2}
                onHoverIn={() => setHoveredCard(2)}
                onHoverOut={() => setHoveredCard(null)}
                isDesktop={isDesktop}
                isTablet={isTablet}
                isMobile={isMobile}
                isTabletPortrait={isTabletPortrait}
              />

              {/* CARD 3: QUICK SERVE */}
              {settings.enableQuickServe !== false && (
                <OrderCard
                  type="QUICK_SERVE"
                  title="QUICK SERVE"
                  subtitle="Rapid billing for high-volume walk-in counters"
                  image={QUICK_SERVE_IMG}
                  accentColor="#10B981"
                  accentGradient={["#34D399", "#059669"]}
                  iconName="flash"
                  features={[
                    { icon: "card-outline", text: "Instant Pay" },
                    { icon: "print-outline", text: "Direct KOT" },
                  ]}
                  buttonText="Start Quick Serve"
                  onPress={handleQuickServe}
                  isHovered={hoveredCard === 3}
                  onHoverIn={() => setHoveredCard(3)}
                  onHoverOut={() => setHoveredCard(null)}
                  isDesktop={isDesktop}
                  isTablet={isTablet}
                  isMobile={isMobile}
                  isTabletPortrait={isTabletPortrait}
                />
              )}
            </View>
          </View>
        </View>
      ) : (
        /* SCROLLABLE LAYOUT FOR MOBILE AND TABLETS */
        <ScrollView
          style={styles.mobileScrollView}
          contentContainerStyle={[
            styles.mobileScrollContent,
            isTablet && styles.tabletScrollContent,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* HERO TITLE SECTION */}
          <View style={[styles.heroSection, isMobile && styles.heroSectionMobile]}>
            <View style={styles.welcomePill}>
              <Ionicons name="sparkles" size={12} color="#F97316" />
              <Text style={styles.welcomePillText}>Select Service Mode</Text>
            </View>
            <Text style={[styles.mainTitle, isMobile && styles.mainTitleMobile]}>
              Welcome to{" "}
              <Text style={{ color: "#F97316" }}>
                {companyInfo?.CompanyName || "My Restaurant"}
              </Text>
            </Text>
            <Text style={[styles.subTitle, isMobile && styles.subTitleMobile]}>
              Choose your order fulfillment type below to start creating bills
            </Text>
          </View>

          {/* CARDS CONTAINER */}
          <View
            style={[
              styles.cardsRow,
              isMobile && styles.cardsColumnMobile,
              isTablet && !isTabletPortrait && styles.cardsRowTablet,
              isTabletPortrait && styles.cardsColumnTabletPortrait,
            ]}
          >
            {/* CARD 1: DINE IN */}
            <OrderCard
              type="DINE_IN"
              title="DINE IN"
              subtitle="Serve customers at designated tables with real-time status"
              image={DINE_IN_IMG}
              accentColor="#EF4444"
              accentGradient={["#FF2A42", "#DC2626"]}
              iconName="restaurant"
              features={[
                { icon: "storefront-outline", text: "Table Management" },
                { icon: "print-outline", text: "KOT Printing" },
              ]}
              buttonText="Start Dine In"
              onPress={handleDineIn}
              isHovered={false}
              onHoverIn={() => {}}
              onHoverOut={() => {}}
              isDesktop={isDesktop}
              isTablet={isTablet}
              isMobile={isMobile}
              isTabletPortrait={isTabletPortrait}
            />

            {/* CARD 2: TAKE AWAY */}
            <OrderCard
              type="TAKEAWAY"
              title="TAKE AWAY"
              subtitle="Quick order processing for carry-out & pickup orders"
              image={TAKE_AWAY_IMG}
              accentColor="#F97316"
              accentGradient={["#FB923C", "#EA580C"]}
              iconName="bag-handle"
              features={[
                { icon: "ticket-outline", text: "Auto Token No." },
                { icon: "flash", text: "Fast Checkout" },
              ]}
              buttonText="Start Take Away"
              onPress={handleTakeAway}
              isHovered={false}
              onHoverIn={() => {}}
              onHoverOut={() => {}}
              isDesktop={isDesktop}
              isTablet={isTablet}
              isMobile={isMobile}
              isTabletPortrait={isTabletPortrait}
            />

            {/* CARD 3: QUICK SERVE */}
            {settings.enableQuickServe !== false && (
              <OrderCard
                type="QUICK_SERVE"
                title="QUICK SERVE"
                subtitle="Rapid billing for high-volume walk-in counters"
                image={QUICK_SERVE_IMG}
                accentColor="#10B981"
                accentGradient={["#34D399", "#059669"]}
                iconName="flash"
                features={[
                  { icon: "card-outline", text: "Instant Pay" },
                  { icon: "print-outline", text: "Direct KOT" },
                ]}
                buttonText="Start Quick Serve"
                onPress={handleQuickServe}
                isHovered={false}
                onHoverIn={() => {}}
                onHoverOut={() => {}}
                isDesktop={isDesktop}
                isTablet={isTablet}
                isMobile={isMobile}
                isTabletPortrait={isTabletPortrait}
              />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FDFDFD",
  },
  header: {
    height: 64,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: "0 2px 12px rgba(15, 23, 42, 0.04)",
      },
    }),
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerCompanyLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    marginRight: 12,
  },
  headerLogoCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFBEB",
    borderWidth: 1.5,
    borderColor: "#D97706",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerLogoCircleMobile: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },
  brandTitleContainer: {
    justifyContent: "center",
  },
  brandTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 18.5,
    color: "#0F172A",
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 9.5,
    color: "#64748B",
    letterSpacing: 1.8,
    marginTop: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  badgeItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateTimeText: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 13,
    color: "#334155",
    marginLeft: 6,
  },
  dateTimeDivider: {
    width: 1,
    height: 14,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  userTextContainer: {
    justifyContent: "center",
  },
  userName: {
    fontFamily: Fonts.bold || "System",
    fontSize: 13,
    color: "#1E293B",
  },
  userRole: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 10,
    color: "#64748B",
    marginTop: -1,
  },
  userMenuBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  userMenuDropdown: {
    position: "absolute",
    top: 70,
    right: 28,
    width: 190,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
      },
    }),
  },
  userMenuHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  userMenuHeaderName: {
    fontFamily: Fonts.bold || "System",
    fontSize: 13.5,
    color: "#0F172A",
  },
  userMenuHeaderRole: {
    fontFamily: Fonts.medium || "System",
    fontSize: 10.5,
    color: "#64748B",
  },
  userMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  userMenuItemText: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 13,
    color: "#334155",
  },
  userMenuDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 4,
  },

  /* Full-bleed Gourmet Background Wallpaper */
  fullBgImage: {
    width: "100%",
    height: "100%",
  },
  centerContrastWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },

  /* Fixed Desktop Layout */
  mainFixedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 10,
  },
  fixedContentInner: {
    width: "100%",
    maxWidth: 1140,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 18,
  },
  welcomePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 13,
    paddingVertical: 4.5,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#FFEDD5",
    marginBottom: 8,
  },
  welcomePillText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 11.8,
    color: "#F97316",
    letterSpacing: 0.3,
  },
  mainTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 29,
    color: "#0F172A",
    letterSpacing: 0.35,
    textAlign: "center",
    marginBottom: 4,
  },
  subTitle: {
    fontFamily: Fonts.medium || "System",
    fontSize: 13.8,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 480,
  },

  /* Cards Row & Grid */
  cardsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "stretch",
    gap: 24,
    width: "100%",
    maxWidth: 1140,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 9 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: "0 9px 28px rgba(15, 23, 42, 0.08)",
        transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
      },
    }),
  },
  cardDesktop: {
    flex: 1,
    minWidth: 290,
    maxWidth: 335,
  },
  cardHovered: {
    ...Platform.select({
      web: {
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.13)",
        transform: "translateY(-6px)",
      },
    }),
  },
  cardPressed: {
    opacity: 0.96,
  },

  /* Card Image Banner & Wave */
  cardImageContainer: {
    width: "100%",
    height: 125,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
  },
  cardImageContainerMobile: {
    height: 110,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  waveSvgWrapper: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 38,
    zIndex: 5,
  },
  waveSvg: {
    width: "100%",
    height: 38,
  },

  /* Floating Center Badge */
  iconCircleWrapper: {
    alignItems: "center",
    marginTop: -28,
    zIndex: 10,
  },
  iconCircleBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 3.5,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3.5 },
        shadowOpacity: 0.13,
        shadowRadius: 7,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: "0 5px 14px rgba(0, 0, 0, 0.11)",
      },
    }),
  },

  /* Card Content Body */
  cardContent: {
    paddingTop: 8,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  cardContentMobile: {
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  cardTitle: {
    fontFamily: Fonts.extraBold || "System",
    fontSize: 19.5,
    color: "#0F172A",
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  titleUnderline: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontFamily: Fonts.regular || "System",
    fontSize: 12.2,
    color: "#64748B",
    marginBottom: 12,
    textAlign: "center",
    lineHeight: 17,
    height: 34,
  },
  featureChipsRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipText: {
    fontFamily: Fonts.semiBold || "System",
    fontSize: 11.2,
    color: "#334155",
  },
  actionButton: {
    width: "100%",
    height: 42,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3.5 },
        shadowOpacity: 0.14,
        shadowRadius: 7,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.11)",
      },
    }),
  },
  actionButtonText: {
    fontFamily: Fonts.bold || "System",
    fontSize: 14.5,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  /* Mobile and Tablet Styles */
  headerMobile: {
    height: 56,
    paddingHorizontal: 16,
  },
  headerCompanyLogoMobile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 8,
  },
  brandTitleMobile: {
    fontSize: 16,
  },
  brandSubtitleMobile: {
    fontSize: 8.5,
    letterSpacing: 1.2,
  },
  userInfoMobile: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  avatarCircleMobile: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  userNameMobile: {
    fontSize: 11.5,
  },
  userRoleMobile: {
    fontSize: 9.5,
  },
  mobileScrollView: {
    flex: 1,
    width: "100%",
  },
  mobileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: "center",
  },
  tabletScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
  },
  heroSectionMobile: {
    marginBottom: 18,
  },
  mainTitleMobile: {
    fontSize: 24,
    lineHeight: 30,
  },
  subTitleMobile: {
    fontSize: 12.5,
    lineHeight: 17,
    maxWidth: 320,
  },
  cardsColumnMobile: {
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    gap: 18,
  },
  cardsRowTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "stretch",
    gap: 20,
    width: "100%",
  },
  cardsColumnTabletPortrait: {
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    gap: 18,
  },
  cardMobile: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
  },
  cardTablet: {
    width: "46%",
    minWidth: 290,
    maxWidth: 420,
    borderRadius: 20,
  },
  cardTabletPortrait: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 20,
  },
});
