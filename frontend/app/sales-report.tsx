import { API_URL } from "@/constants/Config";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import { BlurView } from "expo-blur";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import BillPrompt from "../components/BillPrompt";
import CalendarPicker from "../components/CalendarPicker";
import { useToast } from "../components/Toast";
import TransactionCard from "../components/TransactionCard";
import UniversalPrinter from "../components/UniversalPrinter";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { getSingaporeDateString, parseDatabaseDate, formatToSingaporeDate } from "../utils/timezoneHelper";
import { useAuthStore } from "../stores/authStore";

type FilterType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";
type DetailReportType = "CATEGORY" | "DISH" | "SETTLEMENT" | "ARTIST_TARGET";
type EmailValidationResult = {
  normalized: string;
  isValid: boolean;
  error?: string;
  suggestion?: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "protonmail.com",
];
const KNOWN_DOMAIN_TYPOS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "hotnail.com": "hotmail.com",
};

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function suggestEmailDomain(email: string): string | undefined {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return undefined;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return undefined;
  if (KNOWN_DOMAIN_TYPOS[domain]) return `${local}@${KNOWN_DOMAIN_TYPOS[domain]}`;
  let bestDomain = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = levenshteinDistance(domain, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDomain = candidate;
    }
  }
  if (!bestDomain || bestDistance > 2) return undefined;
  return `${local}@${bestDomain}`;
}

function validateRecipientEmail(raw: string): EmailValidationResult {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { normalized, isValid: false, error: "Email address is required." };
  }
  const at = normalized.indexOf("@");
  const domain = at > 0 ? normalized.slice(at + 1) : "";
  if (KNOWN_DOMAIN_TYPOS[domain]) {
    return {
      normalized,
      isValid: false,
      error: "Email domain looks misspelled.",
      suggestion: `${normalized.slice(0, at)}@${KNOWN_DOMAIN_TYPOS[domain]}`,
    };
  }
  if (!EMAIL_REGEX.test(normalized)) {
    return {
      normalized,
      isValid: false,
      error: "Please enter a valid email address.",
      suggestion: suggestEmailDomain(normalized),
    };
  }
  return {
    normalized,
    isValid: true,
    suggestion: suggestEmailDomain(normalized),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SalesReport() {
  const router = useRouter();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isSalesReportUser = user?.userGroupId === "DFCF23EE-F6F4-4885-8D26-0056C657595F";
  const { width: SCREEN_W } = useWindowDimensions();
  const [sales, setSales] = useState<any[]>([]);
  const [dbPaymentModes, setDbPaymentModes] = useState<any[]>([
    { payMode: "CASH", description: "CASH" },
    { payMode: "CARD", description: "CARD" },
    { payMode: "NETS", description: "NETS" },
    { payMode: "PAYNOW", description: "PAY NOW" },
    { payMode: "GRAB", description: "GRAB" },
    { payMode: "FOODPANDA", description: "FOODPANDA" },
    { payMode: "MEMBER", description: "MEMBER" },
    { payMode: "CREDIT", description: "CREDIT" },
  ]);
  const [summary, setSummary] = useState<any>(null);
  const todayDate = getSingaporeDateString();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [activeBusinessDate, setActiveBusinessDate] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("DAILY");
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any[]>([]);
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const [orderRewards, setOrderRewards] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activePaymentModes, setActivePaymentModes] = useState<string[]>([
    "CASH",
    "CARD",
    "NETS",
    "PAYNOW",
    "GRAB",
    "FOODPANDA",
    "VOID",
    "MEMBER",
    "CREDIT",
  ]);
  const [activeOrderTypes, setActiveOrderTypes] = useState<string[]>([
    "DINE-IN",
    "TAKEAWAY",
  ]);
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "HIGHEST">("NEWEST");
  const [detailReportType, setDetailReportType] =
    useState<DetailReportType | null>(null);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [dishReport, setDishReport] = useState<any[]>([]);
  const [settlementReport, setSettlementReport] = useState<any[]>([]);
  const [artistTargetReport, setArtistTargetReport] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [isReprinting, setIsReprinting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"SINGLE" | "START" | "END">(
    "SINGLE",
  );
  const [showCancelledOrders, setShowCancelledOrders] = useState(true);

  const finalBillAmount = selectedOrder
    ? Number(selectedOrder.SubTotal || 0) -
      Number(selectedOrder.DiscountAmount || 0) +
      Number(selectedOrder.ServiceCharge || 0) +
      Number(selectedOrder.TakeawayCharge || 0) +
      Number(selectedOrder.TotalTax || 0)
    : 0;

  // --- DOWNLOAD MODAL STATES ---
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [downloadFilter, setDownloadFilter] = useState<FilterType>("DAILY");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadRangeStart, setDownloadRangeStart] = useState<string | null>(null);
  const [downloadRangeEnd, setDownloadRangeEnd] = useState<string | null>(null);
  const [showDownloadDatePicker, setShowDownloadDatePicker] = useState(false);
  const [downloadPickerMode, setDownloadPickerMode] = useState<"START" | "END">("START");
  const [emailAddress, setEmailAddress] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailFieldTouched, setEmailFieldTouched] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const emailValidation = useMemo(
    () => validateRecipientEmail(emailAddress),
    [emailAddress],
  );
  const showEmailValidationError =
    emailFieldTouched && !!emailAddress && !emailValidation.isValid;

  useEffect(() => {
    const loadState = async () => {
      try {
        const savedFilter = await AsyncStorage.getItem("sales_selected_filter");
        const savedModes = await AsyncStorage.getItem("sales_payment_modes");
        const savedTypes = await AsyncStorage.getItem("sales_order_types");
        const savedSort = await AsyncStorage.getItem("sales_sort_order");
        const savedDownloadFilter = await AsyncStorage.getItem("sales_download_filter");
        const savedBusinessDate = await AsyncStorage.getItem("selected_business_date");

        if (savedBusinessDate) {
          setSelectedDate(savedBusinessDate);
          setActiveBusinessDate(savedBusinessDate);
        }

        if (
          savedFilter &&
          ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(savedFilter)
        ) {
          setSelectedFilter(savedFilter as FilterType);
        }
        if (
          savedDownloadFilter &&
          ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"].includes(savedDownloadFilter)
        ) {
          setDownloadFilter(savedDownloadFilter as FilterType);
        }
        if (savedModes) setActivePaymentModes(JSON.parse(savedModes));
        if (savedTypes) setActiveOrderTypes(JSON.parse(savedTypes));
        if (savedSort) setSortOrder(savedSort as "NEWEST" | "HIGHEST");

        try {
          const res = await fetch(`${API_URL}/api/settlement/active-day`);
          const data = await res.json();
          if (data.success && data.active && data.startDate) {
            setSelectedDate(data.startDate);
            setActiveBusinessDate(data.startDate);
            await AsyncStorage.setItem("selected_business_date", data.startDate);
          } else {
            setActiveBusinessDate(null);
            await AsyncStorage.removeItem("selected_business_date");
          }
        } catch (err) {
          console.error("Failed to fetch active business day:", err);
        }
      } catch (e) {
        console.error("Load state error:", e);
      }
    };
    loadState();
  }, []);

  useEffect(() => {
    if (activeBusinessDate) {
      setSelectedDate(activeBusinessDate);
    }
  }, [activeBusinessDate]);

  useEffect(() => {
    const saveState = async () => {
      try {
        await AsyncStorage.setItem("sales_selected_filter", selectedFilter);
        await AsyncStorage.setItem("sales_download_filter", downloadFilter);
        await AsyncStorage.setItem("sales_payment_modes", JSON.stringify(activePaymentModes));
        await AsyncStorage.setItem("sales_order_types", JSON.stringify(activeOrderTypes));
        await AsyncStorage.setItem("sales_sort_order", sortOrder);
      } catch (e) {
        console.error("Save state error:", e);
      }
    };
    saveState();
  }, [selectedFilter, downloadFilter, activePaymentModes, activeOrderTypes, sortOrder]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [selectedDate, selectedFilter, rangeStart, rangeEnd])
  );

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sales/payment-methods`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDbPaymentModes(data);
        const stored = await AsyncStorage.getItem("sales_payment_modes");
        const defaultModes = data.map((m: any) => m.payMode.toUpperCase().trim());
        if (!defaultModes.includes("VOID")) {
          defaultModes.push("VOID");
        }
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const merged = [...parsed];
              defaultModes.forEach(mode => {
                if (!merged.includes(mode)) {
                  merged.push(mode);
                }
              });
              setActivePaymentModes((prev) => {
                if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
                return merged;
              });
              return;
            }
          } catch (e) {}
        }
        setActivePaymentModes((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(defaultModes)) return prev;
          return defaultModes;
        });
      }
    } catch (error) {
      console.error("Failed to fetch payment methods in report:", error);
    }
  };

  const fetchData = async () => {
    try {
      if (sales.length === 0) setLoading(true);

      try {
        const res = await fetch(`${API_URL}/api/settlement/active-day`);
        const data = await res.json();
        if (data.success && data.active && data.startDate) {
          setActiveBusinessDate(data.startDate);
          if (selectedDate === todayDate && selectedDate !== data.startDate) {
            setSelectedDate(data.startDate);
            return;
          }
        } else {
          setActiveBusinessDate(null);
        }
      } catch (err) {
        console.error("Failed to fetch active business day in fetchData:", err);
      }

      await Promise.all([fetchSales(), fetchSummary(), fetchPaymentMethods()]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDetailReport = useCallback(
    async (reportType: DetailReportType, filterType = selectedFilter) => {
      try {
        setLoadingReport(true);
        const reportFilter = filterType.toLowerCase();
        const params = new URLSearchParams({
          filter: reportFilter,
          date: selectedDate,
          t: Date.now().toString(),
        });
        if (filterType === "CUSTOM" && rangeStart && rangeEnd) {
          params.append("startDate", rangeStart);
          params.append("endDate", rangeEnd);
        }

        const endpoint =
          reportType === "CATEGORY"
            ? "category"
            : reportType === "DISH"
              ? "dish"
              : reportType === "ARTIST_TARGET"
                ? "artist-target"
                : "settlement";
        console.log("[SalesReport] Fetching report", {
          reportType,
          filterType: reportFilter,
        });
        const response = await fetch(
          `${API_URL}/api/reports/${endpoint}?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error(`Unable to load ${endpoint} report`);
        }

        const data = await response.json();
        console.log("[SalesReport] API response", {
          reportType,
          filterType: reportFilter,
          rows: Array.isArray(data) ? data.length : 0,
          data,
        });

        if (reportType === "CATEGORY") {
          setCategoryReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                CategoryName:
                  row.categoryName || row.CategoryName || "Unmapped",
                Sold: row.totalQty ?? row.totalQuantitySold ?? 0,
                Voided: row.voidQty ?? 0,
                SalesAmount: row.totalAmount ?? row.totalSalesAmount ?? 0,
              }))
              : [],
          );
          setDishReport([]);
          setSettlementReport([]);
          setArtistTargetReport([]);
        } else if (reportType === "DISH") {
          setDishReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                DishName: row.dishName || row.DishName || "Unknown Dish",
                CategoryName:
                  row.categoryName || row.CategoryName || "Unmapped",
                SubCategoryName:
                  row.subCategoryName || row.SubCategoryName || "Unmapped",
                Sold: row.totalQty ?? row.quantitySold ?? 0,
                Voided: row.voidQty ?? 0,
                SalesAmount: row.totalAmount ?? row.totalSalesAmount ?? 0,
              }))
              : [],
          );
          setCategoryReport([]);
          setSettlementReport([]);
          setArtistTargetReport([]);
        } else if (reportType === "ARTIST_TARGET") {
          setArtistTargetReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                CustomerName: row.CustomerName || "Unknown Artist",
                Amount: row.Amount ?? 0,
                FromDate: row.FromDate,
                ToDate: row.ToDate,
                TargetAmount: row.TargetAmount ?? 0,
                Achieved: row.Achieved ?? 0,
                Left: row.Left ?? 0,
                Status: row.Status || "Not Achieved",
              }))
              : [],
          );
          setCategoryReport([]);
          setDishReport([]);
          setSettlementReport([]);
        } else {
          setSettlementReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                Paymode: row.Paymode || "Unknown",
                SysAmount: row.SysAmount ?? 0,
                ManualAmount: row.ManualAmount ?? 0,
                SortageOrExces: row.SortageOrExces ?? 0,
                ReceiptCount: row.ReceiptCount ?? 0,
              }))
              : [],
          );
          setCategoryReport([]);
          setDishReport([]);
          setArtistTargetReport([]);
        }
      } catch (error) {
        console.error("Detail report fetch error:", error);
        setCategoryReport([]);
        setDishReport([]);
        setSettlementReport([]);
        setArtistTargetReport([]);
      } finally {
        setLoadingReport(false);
      }
    },
    [selectedFilter, selectedDate],
  );

  const handleReportPress = (reportType: DetailReportType) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (detailReportType === reportType) {
      fetchDetailReport(reportType);
      return;
    }
    setDetailReportType(reportType);
  };

  useEffect(() => {
    if (detailReportType) {
      fetchDetailReport(detailReportType, selectedFilter);
    }
  }, [selectedFilter, detailReportType, fetchDetailReport]);

  const fetchSales = async () => {
    try {
      let startStr = selectedDate;
      let endStr = selectedDate;

      if (selectedFilter === "WEEKLY") {
        const start = new Date(selectedDate);
        start.setDate(start.getDate() - 6);
        startStr = getSingaporeDateString(start);
      } else if (selectedFilter === "MONTHLY") {
        const start = new Date(selectedDate);
        start.setDate(1);
        startStr = getSingaporeDateString(start);
        
        const end = new Date(selectedDate);
        const today = new Date();
        const endOfMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0);
        if (endOfMonth > today) {
          end.setTime(today.getTime());
        } else {
          end.setTime(endOfMonth.getTime());
        }
        endStr = getSingaporeDateString(end);
      } else if (selectedFilter === "YEARLY") {
        const start = new Date(selectedDate);
        start.setFullYear(start.getFullYear() - 1);
        startStr = getSingaporeDateString(start);
      } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
        startStr = rangeStart;
        endStr = rangeEnd;
      }

      const response = await fetch(`${API_URL}/api/sales/all?startDate=${startStr}&endDate=${endStr}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to fetch sales");
      const data = await response.json();
      if (Array.isArray(data)) {
        // Deduplicate sales by SettlementID to prevent duplicate key errors
        const uniqueSales = Array.from(
          new Map(data.map((s: any) => [s.SettlementID, s])).values()
        );
        setSales(uniqueSales);
      } else {
        setSales([]);
      }
    } catch (error) {
      console.error("Sales fetch error:", error);
      setSales([]);
    }
  };

  const fetchSummary = async () => {
    try {
      let startStr = selectedDate;
      let endStr = selectedDate;

      if (selectedFilter === "WEEKLY") {
        const start = new Date(selectedDate);
        start.setDate(start.getDate() - 6);
        startStr = getSingaporeDateString(start);
      } else if (selectedFilter === "MONTHLY") {
        const start = new Date(selectedDate);
        start.setDate(1);
        startStr = getSingaporeDateString(start);
        
        const end = new Date(selectedDate);
        const today = new Date();
        const endOfMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0);
        if (endOfMonth > today) {
          end.setTime(today.getTime());
        } else {
          end.setTime(endOfMonth.getTime());
        }
        endStr = getSingaporeDateString(end);
      } else if (selectedFilter === "YEARLY") {
        const start = new Date(selectedDate);
        start.setFullYear(start.getFullYear() - 1);
        startStr = getSingaporeDateString(start);
      } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
        startStr = rangeStart;
        endStr = rangeEnd;
      }
      const url = `${API_URL}/api/sales/range?startDate=${startStr}&endDate=${endStr}`;
      const response = await fetch(url);
      const data = await response.json();
      setSummary(Array.isArray(data) ? data[0] : data);
    } catch (error) {
      console.error("Summary fetch error:", error);
      setSummary(null);
    }
  };

  const fetchReportData = async () => {
    const endObj = new Date();
    const startObj = new Date();

    if (downloadFilter === "WEEKLY") {
      startObj.setDate(startObj.getDate() - 6);
    } else if (downloadFilter === "MONTHLY") {
      startObj.setDate(1);
      const today = new Date();
      const endOfMonth = new Date(endObj.getFullYear(), endObj.getMonth() + 1, 0);
      if (endOfMonth > today) {
        endObj.setTime(today.getTime());
      } else {
        endObj.setTime(endOfMonth.getTime());
      }
    } else if (downloadFilter === "YEARLY") {
      startObj.setFullYear(startObj.getFullYear() - 1);
    } else if (downloadFilter === "CUSTOM" && downloadRangeStart && downloadRangeEnd) {
      startObj.setTime(new Date(downloadRangeStart).getTime());
      endObj.setTime(new Date(downloadRangeEnd).getTime());
    }

    const startStr = getSingaporeDateString(startObj);
    const endStr = getSingaporeDateString(endObj);

    const userName = await AsyncStorage.getItem("userName") || "SR";

    const summaryUrl = `${API_URL}/api/sales/day-end-summary?startDate=${startStr}&endDate=${endStr}`;
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();

    if (!summaryData.success) {
      throw new Error("Failed to fetch report data");
    }

    // We fetch dish report for item-wise data
    const dishUrl = `${API_URL}/api/reports/dish?filter=custom&date=${startStr}`;
    // wait, api/reports/dish expects a filter like daily, weekly, monthly, yearly, custom
    // and for custom it might use the same logic?
    // actually, api/reports/dish uses getReportDateWhereSql, which doesn't fully support custom dates unless handled.
    // I'll just pass the filter if it's not custom, otherwise pass daily for now or omit items.
    let items: any[] = [];
    try {
      const dishFilter = downloadFilter === "CUSTOM" ? "daily" : downloadFilter.toLowerCase();
      const dRes = await fetch(`${API_URL}/api/reports/dish?filter=${dishFilter}&date=${startStr}`);
      const dData = await dRes.json();
      if (Array.isArray(dData)) {
        items = dData.map((d: any) => ({
          name: d.dishName || d.DishName,
          quantity: d.totalQty,
          price: d.totalAmount / (d.totalQty || 1),
          revenue: d.totalAmount,
          category: d.categoryName || d.CategoryName || "Unmapped",
          subcategory: d.subCategoryName || d.SubCategoryName || "Unmapped",
          voidQty: d.voidQty || 0,
        }));
      }
    } catch (e) {
      console.warn("Failed to fetch item wise data for report", e);
    }

    const paymentBreakdown: any[] = [];
    let memberPaymentsCollected = 0;
    let creditPaymentsCollected = 0;
    // Track credit *sales* (deferred revenue — not yet collected at point of sale)
    // so they can be excluded from Total Collections to prevent double-counting
    // when the same credit bill is also paid within the report period.
    let creditSalesTotal = 0;
    summaryData.paymodeDetail?.forEach((p: any) => {
      const paymodeName = String(p.Paymode || 'CASH').toUpperCase();
      if (paymodeName.startsWith('MEMBER PAYMENT')) {
        memberPaymentsCollected += p.Amount || 0;
        paymentBreakdown.push({
          name: p.Paymode,
          qty: p.ReceiptCount || 0,
          amount: p.Amount || 0
        });
      } else if (paymodeName.startsWith('CREDIT PAYMENT')) {
        creditPaymentsCollected += p.Amount || 0;
        paymentBreakdown.push({
          name: p.Paymode,
          qty: p.ReceiptCount || 0,
          amount: p.Amount || 0
        });
      } else {
        // Capture credit sales (paymode = 'CREDIT') separately
        if (paymodeName === 'CREDIT') {
          creditSalesTotal += p.Amount || 0;
        }
        paymentBreakdown.push({
          name: p.Paymode,
          qty: p.ReceiptCount || 0,
          amount: p.Amount || 0
        });
      }
    });

    const sa = summaryData.salesAnalysis || {};
    const vd = summaryData.voidDetail || {};

    return {
      filterType: downloadFilter,
      period: downloadFilter === "DAILY" ? startStr : `${startStr} to ${endStr}`,
      companyName: summaryData.orgInfo?.Name || 'AL-HAZIMA RESTAURANT PTE LTD',
      companyAddress: summaryData.orgInfo?.Address1_Line1 || 'No 4, Cheong Chin Nam Road, SINGAPORE 599729',
      companyPhone: summaryData.orgInfo?.Address1_Telephone1 || '65130000',
      cashierName: userName,

      // Match backend generatePdfDocDefinition expectations
      netSales: sa.baseSales || 0,
      serviceCharge: sa.totalServiceCharge || 0,
      taxCollected: sa.totalTax || 0,
      roundedBy: sa.roundOff || 0,
      totalRevenue: sa.totalSales || 0,
      totalSales: sa.totalSales || 0,
      totalDiscount: sa.totalDiscount || 0,
      memberPaymentsCollected: Number(memberPaymentsCollected),
      creditPaymentsCollected: Number(creditPaymentsCollected),
      // Total Collections = actual cash/card received.
      // Credit *sales* are deferred revenue (not collected at point of sale),
      // so subtract them before adding credit payment collections.
      totalCollections: (Number(sa.totalSales || 0) - creditSalesTotal) + Number(memberPaymentsCollected) + Number(creditPaymentsCollected),

      totalOrders: sa.billCount || 0,
      totalItems: items.reduce((acc, curr) => acc + curr.quantity, 0),

      voidQty: vd.voidQty || 0,
      voidAmount: vd.voidAmount || 0,

      cancelledCount: summaryData.cancelledDetail?.count || 0,
      cancelledAmount: summaryData.cancelledDetail?.amount || 0,

      paymentBreakdown,
      cancelledOrders: summaryData.cancelledOrders || [],
      items: items.length > 0 ? items.map(i => ({
        name: i.name,
        qty: i.quantity,
        amount: i.revenue,
        category: i.category,
        subcategory: i.subcategory,
        voidQty: i.voidQty,
      })) : undefined
    };
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      const reportData = await fetchReportData();
      const filename = `Sales_Report_${downloadFilter}_${format(new Date(), "yyyy-MM-dd")}.pdf`;

      const response = await fetch(`${API_URL}/api/export/download-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData }),
      });
      if (!response.ok) throw new Error("Failed to generate PDF");

      const arrayBuffer = await response.arrayBuffer();

      if (Platform.OS === "web") {
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const uri = `${FileSystemLegacy.documentDirectory}${filename}`;
        await FileSystemLegacy.writeAsStringAsync(uri, arrayBufferToBase64(arrayBuffer), {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        } else {
          alert("Downloaded to: " + uri);
        }
      }

      setShowDownloadPanel(false);
    } catch (error) {
      console.error("Download error:", error);
      alert("An error occurred while generating the PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleEmailPdf = async () => {
    const emailCheck = validateRecipientEmail(emailAddress);
    if (!emailCheck.isValid) {
      setEmailFieldTouched(true);
      setEmailSuggestion(emailCheck.suggestion || null);
      showToast({
        type: "error",
        message: emailCheck.error || "Please enter a valid email address",
        subtitle: emailCheck.suggestion
          ? `Did you mean ${emailCheck.suggestion} ?`
          : undefined,
      });
      return;
    }

    try {
      setIsSendingEmail(true);
      const reportData = await fetchReportData();

      const response = await fetch(`${API_URL}/api/export/email-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData, email: emailCheck.normalized }),
      });

      const rawText = await response.text();
      let data: {
        success?: boolean;
        error?: string;
        details?: string;
        message?: string;
        email?: string;
        status?: string;
        code?: string;
        suggestion?: string;
      } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          showToast({
            type: "error",
            message: "Server returned an invalid response",
            subtitle: rawText.slice(0, 220),
            duration: 6000,
          });
          return;
        }
      }

      if (!response.ok || !data.success) {
        const mailNotConfigured =
          response.status === 503 && data.code === "MAIL_NOT_CONFIGURED";
        const invalidRecipient =
          response.status === 400 && data.code === "INVALID_RECIPIENT";
        if (data.suggestion) {
          setEmailSuggestion(data.suggestion);
        }
        showToast({
          type: "error",
          message:
            mailNotConfigured
              ? "Email not configured on server"
              : invalidRecipient
                ? "Recipient email address does not exist."
                : data.error || `Request failed (${response.status})`,
          subtitle: mailNotConfigured
            ? data.details ||
            "Add EMAIL_USER + EMAIL_PASS (or SMTP_*) in Railway Variables, then redeploy."
            : invalidRecipient
              ? data.details || data.suggestion
              : data.details,
          duration: mailNotConfigured ? 12000 : 7000,
        });
        return;
      }

      const effectiveEmail = data.email || emailCheck.normalized;
      showToast({
        type: "success",
        message: "Sales report sent successfully",
        subtitle: effectiveEmail ? `Sent to: ${effectiveEmail}` : undefined,
        duration: 5000,
      });
      setShowDownloadPanel(false);
      setEmailAddress("");
      setEmailFieldTouched(false);
      setEmailSuggestion(null);
    } catch (error: unknown) {
      console.error("Email error:", error);
      const msg =
        error instanceof Error
          ? error.message
          : "Network or server error while sending the email.";
      showToast({ type: "error", message: msg, duration: 5500 });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const onRefresh = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await fetchData();
    if (detailReportType) {
      await fetchDetailReport(detailReportType);
    }
  };

  const formatOrderId = (order: any) => {
    if (!order) return "";
    if (order.OrderType === "LEDGER" && order.CreditOrderNo) {
      return order.CreditOrderNo;
    }
    const rawId = String(order.OrderId || order.BillNo || "");
    // If the ID already has a dash or contains alphabetical/special characters (like ORD270524), return it as-is
    if (rawId.includes("-") || !/^\d+$/.test(rawId)) return rawId;

    const d = order.SettlementDate
      ? parseDatabaseDate(order.SettlementDate)
      : new Date();
    const datePart =
      d.getFullYear().toString() +
      (d.getMonth() + 1).toString().padStart(2, "0") +
      d.getDate().toString().padStart(2, "0");
    return `${datePart}-${rawId.padStart(4, "0")}`;
  };

  const formatCurrency = (amount: number) => {
    return `$${amount?.toFixed(2) || "0.00"}`;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    // Preserve the local date without converting to UTC
    setSelectedDate(getSingaporeDateString(newDate));
  };


  const dateScopedSales = useMemo(() => {
    let result = sales;

    if (selectedFilter === "DAILY") {
      result = sales.filter((s) => {
        const dateToUse = s.BusinessDate || s.SettlementDate;
        if (!dateToUse) return false;
        const itemDate = getSingaporeDateString(parseDatabaseDate(dateToUse));
        return itemDate === selectedDate;
      });
    } else if (selectedFilter === "WEEKLY") {
      const parts = selectedDate.split("-");
      // Use local date values to calculate weekly range bound
      const end = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
      );
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      
      const startStr = getSingaporeDateString(start);
      const endStr = selectedDate;

      result = sales.filter((s) => {
        const dateToUse = s.BusinessDate || s.SettlementDate;
        if (!dateToUse) return false;
        const saleDateStr = getSingaporeDateString(parseDatabaseDate(dateToUse));
        return saleDateStr >= startStr && saleDateStr <= endStr;
      });
    } else if (selectedFilter === "MONTHLY") {
      const parts = selectedDate.split("-");
      const yearNum = Number(parts[0]);
      const monthNum = Number(parts[1]);
      const lastDay = new Date(yearNum, monthNum, 0).getDate();
      
      const startStr = `${parts[0]}-${parts[1]}-01`;
      const endStr = `${parts[0]}-${parts[1]}-${String(lastDay).padStart(2, "0")}`;

      result = sales.filter((s) => {
        const dateToUse = s.BusinessDate || s.SettlementDate;
        if (!dateToUse) return false;
        const saleDateStr = getSingaporeDateString(parseDatabaseDate(dateToUse));
        return saleDateStr >= startStr && saleDateStr <= endStr;
      });
    } else if (selectedFilter === "YEARLY") {
      const parts = selectedDate.split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      const startStr = `${year - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const endStr = selectedDate;

      result = sales.filter((s) => {
        const dateToUse = s.BusinessDate || s.SettlementDate;
        if (!dateToUse) return false;
        const saleDateStr = getSingaporeDateString(parseDatabaseDate(dateToUse));
        return saleDateStr >= startStr && saleDateStr <= endStr;
      });
    } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
      result = sales.filter((s) => {
        const dateToUse = s.BusinessDate || s.SettlementDate;
        if (!dateToUse) return false;
        const saleDateStr = getSingaporeDateString(parseDatabaseDate(dateToUse));
        return saleDateStr >= rangeStart && saleDateStr <= rangeEnd;
      });
    }

    return result;
  }, [sales, selectedFilter, selectedDate, rangeStart, rangeEnd]);

  const groupedSales = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const orderOfSettlements: string[] = [];
    dateScopedSales.forEach((row) => {
      if (!row.SettlementID) return;
      if (!groups[row.SettlementID]) {
        groups[row.SettlementID] = [];
        orderOfSettlements.push(row.SettlementID);
      }
      groups[row.SettlementID].push(row);
    });

    const grouped: any[] = [];
    orderOfSettlements.forEach((settlementId) => {
      const group = groups[settlementId];
      let row = { ...group[0] };

      if (group.length > 1) {
        const totalSysAmount = group.reduce((sum, r) => sum + (r.SysAmount || 0), 0);
        const totalManualAmount = group.reduce((sum, r) => sum + (r.ManualAmount || 0), 0);
        const payModes = group.map((r) => String(r.PayMode || "CASH").trim()).filter(Boolean);
        const uniquePayModes = Array.from(new Set(payModes));

        row.PayMode = uniquePayModes.join(" + ");
        row.SysAmount = totalSysAmount;
        row.ManualAmount = totalManualAmount;
        row.isSplit = false;
        row.splitNo = "";
      } else {
        const splitMatch = row.BillNo && row.BillNo.match(/-S(\d+)$/i);
        if (splitMatch) {
          row.isSplit = true;
          row.splitNo = 'S' + splitMatch[1];
        } else {
          row.isSplit = false;
          row.splitNo = "";
        }
      }
      grouped.push(row);
    });
    return grouped;
  }, [dateScopedSales]);

  const baseFilteredSales = useMemo(() => {
    return groupedSales.filter((s) => {
      const modeUpper = s.PayMode?.toUpperCase().trim() || "";
      const isUpiMode = modeUpper.includes("UPI") || modeUpper.includes("GPAY");
      const typeUpper = s.OrderType?.toUpperCase().trim() || "";

      // Support checking components of combined payment modes (e.g. "CASH + NETS")
      const splitModes = modeUpper.includes("+") ? modeUpper.split("+").map((m: string) => m.trim()) : [modeUpper];

      const modeMatch =
        splitModes.some((m: string) => activePaymentModes.includes(m)) ||
        (activePaymentModes.includes("UPI") && isUpiMode) ||
        (showCancelledOrders && s.IsCancelled) ||
        (typeUpper === 'LEDGER' && (
          splitModes.some((m: string) => activePaymentModes.includes(m)) ||
          (s.OrderId?.toLowerCase().includes("member") && activePaymentModes.includes("MEMBER")) ||
          (s.OrderId?.toLowerCase().includes("credit") && activePaymentModes.includes("CREDIT"))
        ));
      const typeMatch =
        typeUpper === 'LEDGER' ||
        activeOrderTypes.length === 2 ||
        (s.OrderType
          ? activeOrderTypes.includes(typeUpper)
          : activeOrderTypes.includes("DINE-IN"));
      return modeMatch && typeMatch;
    });
  }, [
    groupedSales,
    activePaymentModes,
    activeOrderTypes,
    showCancelledOrders,
  ]);

  const filteredSales = useMemo(() => {
    const filtered = baseFilteredSales.filter((s) => {
      return showCancelledOrders || !s.IsCancelled;
    });

    if (sortOrder === "NEWEST") {
      return [...filtered].sort(
        (a, b) =>
          new Date(b.SettlementDate).getTime() -
          new Date(a.SettlementDate).getTime(),
      );
    } else {
      return [...filtered].sort((a, b) => b.SysAmount - a.SysAmount);
    }
  }, [baseFilteredSales, showCancelledOrders, sortOrder]);

  const filteredMetrics = useMemo(() => {
    return dateScopedSales.reduce(
      (acc, s) => {
        const isSubsequentSplit = s.SettlementID && s.SettlementID.includes("-") && s.SettlementID.split("-").length > 5 && s.SettlementID.split("-").pop().match(/^\d+$/);

        if (s.IsCancelled) {
          if (!isSubsequentSplit) {
            acc.CancelledCount += 1;
            acc.CancelledAmount += s.VoidAmount || 0;
          }
          return acc;
        }

        if (s.OrderType === 'LEDGER') {
          if (s.OrderId === 'Credit Payment Collected') {
            acc.CreditPaymentsCollected += s.SysAmount || 0;
          } else {
            acc.MemberPaymentsCollected += s.SysAmount || 0;
          }
          return acc;
        }

        acc.TotalSales += s.SysAmount || 0;
        if (!isSubsequentSplit) {
          acc.TotalTransactions += 1;
          acc.TotalItems += (s.ReceiptCount || 0);
          acc.TotalVoids += s.VoidQty || 0;
          acc.TotalVoidAmount += s.VoidAmount || 0;
          acc.ServiceCharge += Number(s.ServiceCharge) || 0;
          acc.TotalTax += Number(s.TotalTax) || 0;
        }

        const mode = s.PayMode?.trim().toUpperCase() || "";
        const isUpi = mode.includes("UPI") || mode.includes("GPAY");
        if (mode === "CASH") acc.Cash += s.SysAmount;
        else if (mode === "CARD") acc.Card += s.SysAmount;
        else if (mode === "NETS") acc.Nets += s.SysAmount;
        else if (mode === "PAYNOW") acc.PayNow += s.SysAmount;
        else if (mode === "GRAB") acc.Grab += s.SysAmount;
        else if (mode === "FOODPANDA") acc.Foodpanda += s.SysAmount;
        else if (isUpi) acc.Upi += s.SysAmount;
        else if (mode === "MEMBER") {
          acc.Member += s.SysAmount;
          // Members are PREPAID — never accumulate outstanding
        } else if (mode === "CREDIT") {
          acc.Credit += s.SysAmount;
          acc.CreditOutstanding += Number(s.OutstandingAmount) || 0;
        }

        return acc;
      },
      {
        TotalSales: 0,
        TotalTransactions: 0,
        TotalItems: 0,
        Cash: 0,
        Card: 0,
        Nets: 0,
        PayNow: 0,
        Grab: 0,
        Foodpanda: 0,
        Upi: 0,
        Member: 0,
        Credit: 0,
        TotalVoids: 0,
        TotalVoidAmount: 0,
        CancelledCount: 0,
        CancelledAmount: 0,
        MemberPaymentsCollected: 0,
        CreditPaymentsCollected: 0,
        MemberOutstanding: 0,
        CreditOutstanding: 0,
        ServiceCharge: 0,
        TotalTax: 0,
      },
    );
  }, [dateScopedSales]);

  const avgOrder = useMemo(() => {
    if (!filteredMetrics.TotalTransactions) return 0;
    return filteredMetrics.TotalSales / filteredMetrics.TotalTransactions;
  }, [filteredMetrics]);

  const PAYMODE_COLORS: Record<string, string> = {
    CASH: "#22c55e",
    CARD: "#818cf8",
    NETS: "#3b82f6",
    PAYNOW: "#f59e0b",
    GRAB: "#00b14f",
    FOODPANDA: "#d70f64",
    UPI: "#f59e0b",
    MEMBER: "#ec4899",
    CREDIT: "#e11d48",
  };

  const getPayModeColor = (mode: string) => {
    const m = mode.toUpperCase().trim();
    if (PAYMODE_COLORS[m]) return PAYMODE_COLORS[m];
    let hash = 0;
    for (let i = 0; i < m.length; i++) {
      hash = m.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
  };

  const PAYMODE_ICONS: Record<string, string> = {
    CASH: "💵",
    CARD: "💳",
    NETS: "🔳",
    PAYNOW: "📱",
    GRAB: "💚",
    FOODPANDA: "🐼",
    UPI: "📱",
    MEMBER: "👤",
    CREDIT: "🏷️",
  };

  const getPayModeIconChar = (mode: string) => {
    const m = mode.toUpperCase().trim();
    return PAYMODE_ICONS[m] || "💳";
  };

  const paymentBreakdownMetrics = useMemo<Record<string, number>>(() => {
    const filteredByTypes = dateScopedSales.filter((s) => {
      const typeUpper = s.OrderType?.toUpperCase().trim() || "";
      const typeMatch =
        activeOrderTypes.length === 2 ||
        (s.OrderType
          ? activeOrderTypes.includes(typeUpper) || typeUpper === 'LEDGER'
          : activeOrderTypes.includes("DINE-IN"));
      return typeMatch;
    });

    const initialAcc: Record<string, number> = {};
    dbPaymentModes.forEach((m) => {
      initialAcc[m.payMode.toUpperCase().trim()] = 0;
    });
    initialAcc["CREDIT_OUTSTANDING"] = 0;

    return filteredByTypes.reduce(
      (acc, s) => {
        if (s.IsCancelled) {
          return acc;
        }

        if (s.OrderType === 'LEDGER') {
          return acc;
        }

        const salePayMode = s.PayMode?.trim().toUpperCase() || "";
        // First pass: try exact match
        let matchedMode = dbPaymentModes.find((m) => {
          const dbName = String(m.payMode || "").toUpperCase().trim();
          const dbDesc = String(m.description || "").toUpperCase().trim();
          return salePayMode === dbName || salePayMode === dbDesc;
        });

        // Second pass: if no exact match, try greedy/wildcard match
        if (!matchedMode) {
          matchedMode = dbPaymentModes.find((m) => {
            const dbName = String(m.payMode || "").toUpperCase().trim();
            if ((dbName === "PAYNOW" || dbName === "PAY NOW" || dbName === "UPI" || dbName === "GPAY") &&
                (salePayMode.includes("PAYNOW") || salePayMode.includes("PAY NOW") || salePayMode.includes("UPI") || salePayMode.includes("GPAY"))) {
              return true;
            }
            if ((dbName === "CASH" || dbName === "CAS") && (salePayMode === "CASH" || salePayMode === "CAS")) {
              return true;
            }
            return false;
          });
        }

        if (matchedMode) {
          const key = matchedMode.payMode.toUpperCase().trim();
          acc[key] = (acc[key] || 0) + s.SysAmount;
          if (key === "CREDIT") {
            acc["CREDIT_OUTSTANDING"] = (acc["CREDIT_OUTSTANDING"] || 0) + (Number(s.OutstandingAmount) || 0);
          }
        } else {
          const key = salePayMode || "CASH";
          acc[key] = (acc[key] || 0) + s.SysAmount;
        }

        return acc;
      },
      initialAcc
    );
  }, [dateScopedSales, activeOrderTypes, dbPaymentModes]);

  const displayedBreakdownModes = useMemo(() => {
    const modes = dbPaymentModes.filter(m => m.active === 1 || m.Active === 1 || m.active === true || m.Active === true);
    Object.entries(paymentBreakdownMetrics).forEach(([key, val]) => {
      if (key === "CREDIT_OUTSTANDING") return;
      if (val > 0) {
        const alreadyExists = modes.some(m => m.payMode.toUpperCase().trim() === key);
        if (!alreadyExists) {
          const matchedDbMode = dbPaymentModes.find(m => m.payMode.toUpperCase().trim() === key);
          if (matchedDbMode) {
            modes.push(matchedDbMode);
          } else {
            modes.push({
              payMode: key,
              description: key,
            });
          }
        }
      }
    });
    return modes;
  }, [dbPaymentModes, paymentBreakdownMetrics]);

  const paymentBreakdownTotal = useMemo(() => {
    return Object.entries(paymentBreakdownMetrics).reduce((sum, [key, val]) => {
      if (key === "CREDIT_OUTSTANDING") return sum;
      return sum + val;
    }, 0);
  }, [paymentBreakdownMetrics]);

  const paymentMix = useMemo(() => {
    const mix: Record<string, number> = {};
    if (!paymentBreakdownTotal) return mix;
    Object.entries(paymentBreakdownMetrics).forEach(([key, val]) => {
      if (key !== "CREDIT_OUTSTANDING") {
        mix[key] = (val / paymentBreakdownTotal) * 100;
      }
    });
    return mix;
  }, [paymentBreakdownMetrics, paymentBreakdownTotal]);

  const paymentMixCenterRows = useMemo(() => {
    const rows: { key: string; pct: number; color: string }[] = [];
    displayedBreakdownModes.forEach((m) => {
      const key = m.payMode.toUpperCase().trim();
      const val = paymentBreakdownMetrics[key] || 0;
      if (val > 0) {
        rows.push({
          key,
          pct: paymentMix[key] || 0,
          color: getPayModeColor(key),
        });
      }
    });
    return rows.sort((a, b) => b.pct - a.pct);
  }, [displayedBreakdownModes, paymentBreakdownMetrics, paymentMix]);

  const togglePaymentMode = (mode: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActivePaymentModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const handleBreakdownPress = (payMode: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const modeKey = payMode.toUpperCase().trim();
    const isOnlyActive = activePaymentModes.length === 1 && activePaymentModes[0] === modeKey;
    if (isOnlyActive) {
      setActivePaymentModes([...displayedBreakdownModes.map(m => m.payMode.toUpperCase().trim()), "VOID"]);
    } else {
      setActivePaymentModes([modeKey]);
    }
  };

  const toggleOrderType = (type: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveOrderTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const displayedPayments = useMemo(() => {
    if (!orderPayments || orderPayments.length === 0) return [];

    // Calculate total of payments
    const totalPayments = orderPayments.reduce((sum, p) => sum + Number(p.Amount || 0), 0);
    const targetTotal = Number(selectedOrder?.SysAmount || 0);

    // If there is a discrepancy within 0.10, adjust the last row to prevent rounding discrepancies in display
    const diff = targetTotal - totalPayments;
    if (Math.abs(diff) > 0 && Math.abs(diff) < 0.10 && orderPayments.length > 0) {
      const adjusted = [...orderPayments];
      const lastIndex = adjusted.length - 1;
      adjusted[lastIndex] = {
        ...adjusted[lastIndex],
        Amount: Number((Number(adjusted[lastIndex].Amount || 0) + diff).toFixed(2))
      };
      return adjusted;
    }

    return orderPayments;
  }, [orderPayments, selectedOrder]);

  const payModeText = useMemo(() => {
    if (selectedOrder?.IsCancelled) return "CANCELLED";
    if (displayedPayments && displayedPayments.length > 0) {
      const names = displayedPayments.map(p => (p.PayModeName || 'CASH').trim().toUpperCase());
      const uniqueNames = Array.from(new Set(names));
      return uniqueNames.join(" + ");
    }
    return (selectedOrder?.PayMode || "CASH").toUpperCase();
  }, [displayedPayments, selectedOrder]);

  const fetchOrderDetails = async (settlementId: string, currentOrder: any) => {
    try {
      setLoadingDetails(true);
      setOrderPayments([]);
      setOrderRewards(null);
      const [itemsRes, paymentsRes, rewardsRes] = await Promise.all([
        fetch(`${API_URL}/api/sales/detail/${settlementId}`),
        fetch(`${API_URL}/api/sales/detail/${settlementId}/payments`),
        fetch(`${API_URL}/api/sales/detail/${settlementId}/rewards`),
      ]);

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        if (Array.isArray(data) && data.length > 0) {
          const parsedData = data.map((item: any) => {
            let comboSelections = undefined;
            const comboJson = item.ComboDetailsJSON || item.comboDetailsJSON;
            if (comboJson) {
              try {
                const parsed = typeof comboJson === "string" ? JSON.parse(comboJson) : comboJson;
                comboSelections = Array.isArray(parsed) ? parsed : parsed?.groups;
              } catch (e) {
                console.error("Error parsing ComboDetailsJSON:", e);
              }
            }
            return {
              ...item,
              comboSelections,
              isCombo: !!comboSelections && comboSelections.length > 0,
            };
          });
          setOrderDetails(parsedData);
        } else {
          setOrderDetails([
            {
              DishName: currentOrder?.IsCancelled
                ? "Items not captured (Legacy Cancelled Order)"
                : (currentOrder?.OrderType === 'LEDGER' ? (currentOrder?.OrderId || "Member Outstanding Payment") : "Item info not available"),
              Qty: currentOrder?.OrderType === 'LEDGER' ? 1 : 0,
              Price: currentOrder?.OrderType === 'LEDGER' ? currentOrder?.SysAmount : 0
            },
          ]);
        }
      }

      if (paymentsRes.ok) {
        const pData = await paymentsRes.json();
        if (Array.isArray(pData)) {
          setOrderPayments(pData);
        }
      }

      if (rewardsRes.ok) {
        const rData = await rewardsRes.json();
        if (rData) {
          setOrderRewards(rData);
        }
      }
    } catch (e) {
      console.error("Detail fetch error:", e);
      setOrderDetails([]);
      setOrderPayments([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOrderPress = (order: any) => {
    setOrderDetails([]);
    setOrderPayments([]);
    setOrderRewards(null);
    setSelectedOrder(order);
    fetchOrderDetails(order.SettlementID, order);
  };

  const handleReprint = async () => {
    if (!selectedOrder || orderDetails.length === 0) return;

    setIsReprinting(true);
    setShowPrintPrompt(false);

    try {
      const userId = (await AsyncStorage.getItem("userId")) || "1";

      const mappedItems = orderDetails.map((item) => ({
        name: item.DishName,
        price: item.Price,
        qty: item.Qty,
        status: item.Status || "NORMAL",
        discountAmount: item.DiscountAmount || 0,
        discountType: item.DiscountType || "fixed",
        modifiers: item.modifiers || [],
      }));

      const isPercentage = selectedOrder.DiscountType === "percentage";
      const discountValue = isPercentage
        ? Number(selectedOrder.DiscountPercentage ?? 0)
        : Number(selectedOrder.DiscountAmount ?? 0);

      const discountInfo = {
        applied: Number(selectedOrder.DiscountAmount ?? 0) > 0,
        type: (selectedOrder.DiscountType || "fixed") as "fixed" | "percentage",
        value: discountValue,
        amount: Number(selectedOrder.DiscountAmount ?? 0),
        subtotal: Number(selectedOrder.SubTotal ?? 0),
      };

      const saleData = {
        invoiceNumber: formatOrderId(selectedOrder),
        tableNo: selectedOrder.TableNo ?? "",
        total: selectedOrder.SysAmount,
        paymentMethod: selectedOrder.PayMode || "CASH",
        cashPaid: selectedOrder.SysAmount,
        change: 0,
        items: mappedItems,
        roundOff: Number(selectedOrder.RoundedBy ?? 0),
        date: selectedOrder.SettlementDate || new Date(),
        isReprint: true,
        // Sunmi template details
        discountAmount: Number(selectedOrder.DiscountAmount ?? 0),
        discountType: selectedOrder.DiscountType || null,
        discountValue: discountValue,
        subTotal: Number(selectedOrder.SubTotal ?? 0),
        serviceCharge: Number(selectedOrder.ServiceCharge ?? 0),
        takeawayCharge: Number(selectedOrder.TakeawayCharge ?? 0),
        payments: displayedPayments.map(p => ({
          payMode: p.PayModeName,
          payModeName: p.PayModeName,
          amount: p.Amount,
          referenceNo: p.ReferenceNo
        })),
        rewardPointsEarned: String(orderRewards?.PointsEarned || 0),
        memberRewardBalance: String(orderRewards?.RewardCredit || 0),
      };

      await UniversalPrinter.smartPrint(saleData, userId, {}, discountInfo, undefined, true);
    } catch (error) {
      console.error("Reprint error:", error);
    } finally {
      setIsReprinting(false);
    }
  };

  const renderMetricTile = (
    label: string,
    value: string | number,
    icon: any,
    color: string,
    fullWidth?: boolean,
  ) => (
    <View style={[styles.metricTile, { borderLeftColor: color }, fullWidth && { width: '100%' }]}>
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={14} color={Theme.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );

  const renderDetailReport = () => {
    if (!detailReportType) {
      return null;
    }

    const isSettlement = detailReportType === "SETTLEMENT";
    const isArtistTarget = detailReportType === "ARTIST_TARGET";
    const rows = isSettlement
      ? settlementReport
      : isArtistTarget
        ? artistTargetReport
        : detailReportType === "CATEGORY"
          ? categoryReport
          : dishReport;
    const isDishReport = detailReportType === "DISH";

    return (
      <View style={styles.detailReportCard}>
        <View style={styles.detailReportHeader}>
          {/* Spacer to balance the actions on the right for exact centering */}
          <View style={{ width: 62 }} />
          <View style={styles.reportTitleContainer}>
            <Text style={styles.cardTitle}>
              {isSettlement
                ? "SETTLEMENT DETAILS REPORT"
                : isArtistTarget
                  ? "ARTIST TARGET REPORT"
                  : isDishReport
                    ? "ITEM SALES REPORT"
                    : "CATEGORY SALES REPORT"}
            </Text>
            <Text style={styles.reportSubText}>
              {rows.length} rows for the selected period
            </Text>
          </View>
          <View style={styles.reportHeaderActions}>
            <Ionicons
              name={
                isSettlement
                  ? "wallet-outline"
                  : isArtistTarget
                    ? "ribbon-outline"
                    : isDishReport
                      ? "restaurant-outline"
                      : "albums-outline"
              }
              size={18}
              color={Theme.primary}
            />
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setDetailReportType(null);
                setCategoryReport([]);
                setDishReport([]);
                setSettlementReport([]);
                setArtistTargetReport([]);
              }}
              style={styles.reportCloseBtn}
            >
              <Ionicons name="close" size={18} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>

        {loadingReport ? (
          <View style={styles.reportLoading}>
            <ActivityIndicator color={Theme.primary} />
            <Text style={styles.reportSubText}>Loading report...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyReport}>
            <Ionicons
              name="document-text-outline"
              size={32}
              color={Theme.textMuted}
            />
            <Text style={styles.emptyChartText}>No report data</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ minWidth: "100%" }}
          >
            <View style={[styles.reportTable, isArtistTarget && { minWidth: 700 }, isDishReport && { minWidth: 600 }]}>
              <View style={styles.reportTableHeader}>
                <Text style={[styles.reportCell, styles.snoCell]}>S/N</Text>
                {isSettlement ? (
                  <>
                    <Text style={[styles.reportCell, styles.paymodeCell]}>
                      Paymode
                    </Text>
                    <Text style={[styles.reportCell, styles.sysAmtCell]}>
                      Sys Amt
                    </Text>
                    <Text style={[styles.reportCell, styles.manualAmtCell]}>
                      Manual Amt
                    </Text>
                    <Text style={[styles.reportCell, styles.diffCell]}>
                      Diff
                    </Text>
                    <Text style={[styles.reportCell, styles.qtyCell]}>Qty</Text>
                  </>
                ) : isArtistTarget ? (
                  <>
                    <Text style={[styles.reportCell, styles.dishNameCell, { textAlign: "left" }]}>
                      Artist Name
                    </Text>
                    <Text style={[styles.reportCell, styles.paymodeCell, { textAlign: "center" }]}>
                      From Date
                    </Text>
                    <Text style={[styles.reportCell, styles.paymodeCell, { textAlign: "center" }]}>
                      To Date
                    </Text>
                    <Text style={[styles.reportCell, styles.sysAmtCell, { textAlign: "right" }]}>
                      Target
                    </Text>
                    <Text style={[styles.reportCell, styles.sysAmtCell, { textAlign: "right" }]}>
                      Achieved
                    </Text>
                    <Text style={[styles.reportCell, styles.sysAmtCell, { textAlign: "right" }]}>
                      Left
                    </Text>
                    <Text style={[styles.reportCell, styles.paymodeCell, { textAlign: "center" }]}>
                      Status
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.reportCell,
                        isDishReport
                          ? styles.dishNameCell
                          : styles.categoryNameCell,
                      ]}
                    >
                      {isDishReport ? "Item" : "Category"}
                    </Text>

                    {isDishReport && (
                      <Text
                        style={[
                          styles.reportCell,
                          styles.categoryNameCell,
                        ]}
                      >
                        Category
                      </Text>
                    )}

                    <Text
                      style={[
                        styles.reportCell,
                        styles.qtyCell,
                        { textAlign: "center" },
                      ]}
                    >
                      QTY
                    </Text>
                    <Text
                      style={[
                        styles.reportCell,
                        styles.qtyCell,
                        { textAlign: "center", color: "#ef4444" },
                      ]}
                    >
                      VOID
                    </Text>
                    <Text style={[styles.reportCell, styles.amountCell]}>
                      Sales
                    </Text>
                  </>
                )}
              </View>
              {(() => {
                if (isArtistTarget) {
                  return rows.slice(0, 100).map((row, idx) => (
                    <View
                      key={`artist-target-${idx}`}
                      style={[
                        styles.reportTableRow,
                        idx % 2 === 0 && styles.reportTableRowAlt,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.snoCell,
                        ]}
                      >
                        {idx + 1}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.dishNameCell,
                          { textAlign: "left" }
                        ]}
                      >
                        {row.CustomerName}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.paymodeCell,
                          { textAlign: "center" }
                        ]}
                      >
                        {row.FromDate ? formatToSingaporeDate(row.FromDate, { day: "numeric", month: "numeric", year: "numeric" }) : "N/A"}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.paymodeCell,
                          { textAlign: "center" }
                        ]}
                      >
                        {row.ToDate ? formatToSingaporeDate(row.ToDate, { day: "numeric", month: "numeric", year: "numeric" }) : "N/A"}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.sysAmtCell,
                          { color: Theme.success, fontWeight: "bold", textAlign: "right" }
                        ]}
                      >
                        {formatCurrency(Number(row.Amount || 0))}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.sysAmtCell,
                          { color: Theme.primary, fontWeight: "600", textAlign: "right" }
                        ]}
                      >
                        {formatCurrency(Number(row.Achieved || 0))}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.sysAmtCell,
                          { color: Number(row.Left || 0) > 0 ? "#dc2626" : Theme.success, fontWeight: "600", textAlign: "right" }
                        ]}
                      >
                        {formatCurrency(Number(row.Left || 0))}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.paymodeCell,
                          { 
                            color: row.Status === "Achieved" ? Theme.success : "#dc2626", 
                            fontWeight: "bold", 
                            textAlign: "center" 
                          }
                        ]}
                      >
                        {row.Status || "Not Achieved"}
                      </Text>
                    </View>
                   ));
                }

                if (isSettlement || !isDishReport) {
                  return rows.slice(0, 100).map((row, idx) => (
                    <View
                      key={`${detailReportType}-${idx}`}
                      style={[
                        styles.reportTableRow,
                        idx % 2 === 0 && styles.reportTableRowAlt,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.snoCell,
                        ]}
                      >
                        {idx + 1}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.categoryNameCell,
                        ]}
                      >
                        {row.CategoryName}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.qtyCell,
                        ]}
                      >
                        {Number(row.Sold || 0).toFixed(0)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.qtyCell,
                          { color: "#dc2626" },
                        ]}
                      >
                        {Number(row.Voided || 0).toFixed(0)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.amountCell,
                          { color: Theme.success, fontWeight: "bold" },
                        ]}
                      >
                        {formatCurrency(Number(row.SalesAmount || 0))}
                      </Text>
                    </View>
                  ));
                }

                // Group dishReport by category
                const groups: { [key: string]: any[] } = {};
                rows.forEach((row) => {
                  const cat = row.CategoryName || "Unmapped";
                  if (!groups[cat]) {
                    groups[cat] = [];
                  }
                  groups[cat].push(row);
                });

                // Sort category names alphabetically
                const sortedCategories = Object.keys(groups).sort((a, b) =>
                  a.localeCompare(b, undefined, { sensitivity: "base" })
                );

                let globalIdx = 0;
                return sortedCategories.map((category) => {
                  const groupRows = groups[category]!;
                  const catQty = groupRows.reduce((sum, r) => sum + Number(r.Sold || 0), 0);
                  const catVoid = groupRows.reduce((sum, r) => sum + Number(r.Voided || 0), 0);
                  const catSales = groupRows.reduce((sum, r) => sum + Number(r.SalesAmount || 0), 0);

                  return (
                    <View key={`cat-group-${category}`} style={{ width: "100%" }}>
                      {/* Sticky-like Category Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: Theme.primary + "12",
                          borderBottomWidth: 1.5,
                          borderBottomColor: Theme.primary + "40",
                          alignItems: "center",
                        }}
                      >
                        <View style={styles.snoCell} />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.dishNameCell,
                            {
                              fontFamily: Fonts.black,
                              fontSize: 13,
                              color: Theme.primary,
                              textAlign: "left",
                              textTransform: "uppercase",
                            },
                          ]}
                        >
                          ▼ {category}
                        </Text>

                        <Text
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.categoryNameCell,
                            { fontFamily: Fonts.black, fontSize: 13, color: Theme.textMuted },
                          ]}
                        >
                          -
                        </Text>

                        <Text
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.qtyCell,
                            { fontFamily: Fonts.black, fontSize: 13, color: Theme.textPrimary },
                          ]}
                        >
                          {catQty}
                        </Text>
                        <Text
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.qtyCell,
                            { fontFamily: Fonts.black, fontSize: 13, color: "#dc2626" },
                          ]}
                        >
                          {catVoid}
                        </Text>
                        <Text
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.amountCell,
                            { fontFamily: Fonts.black, fontSize: 13, color: Theme.success },
                          ]}
                        >
                          {formatCurrency(catSales)}
                        </Text>
                      </View>

                      {groupRows.map((row, rowIdx) => {
                        const currentSno = ++globalIdx;
                        return (
                          <View
                            key={`dish-${category}-${rowIdx}`}
                            style={[
                              styles.reportTableRow,
                              rowIdx % 2 === 0 && styles.reportTableRowAlt,
                            ]}
                          >
                            <Text
                              style={[
                                styles.reportCell,
                                styles.reportCellText,
                                styles.snoCell,
                              ]}
                            >
                              {currentSno}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.reportCell,
                                styles.reportCellText,
                                styles.dishNameCell,
                              ]}
                            >
                              {row.DishName}
                            </Text>

                            <Text
                              numberOfLines={1}
                              style={[
                                styles.reportCell,
                                styles.reportCellText,
                                styles.categoryNameCell,
                              ]}
                            >
                              {row.SubCategoryName}
                            </Text>

                            <Text
                              style={[
                                styles.reportCell,
                                styles.reportCellText,
                                styles.qtyCell,
                              ]}
                            >
                              {Number(row.Sold || 0).toFixed(0)}
                            </Text>
                            <Text
                              style={[
                                styles.reportCell,
                                styles.reportCellText,
                                styles.qtyCell,
                                { color: "#dc2626" },
                              ]}
                            >
                              {Number(row.Voided || 0).toFixed(0)}
                            </Text>
                            <Text
                              style={[
                                styles.reportCell,
                                styles.reportCellText,
                                styles.amountCell,
                                { color: Theme.success, fontWeight: "bold" },
                              ]}
                            >
                              {formatCurrency(Number(row.SalesAmount || 0))}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                });
              })()}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <>
      {/* Dashboard Header moved here for better scroll integration */}
      <View style={styles.dashboardHeader}>
        {isSalesReportUser ? (
          <TouchableOpacity onPress={() => logout()} style={styles.backBtn}>
            <Ionicons name="log-out" size={20} color={Theme.danger} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)/category" as any);
              }
            }} 
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color={Theme.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.headerContent}>
          <Text style={styles.dashboardYear}>{new Date().getFullYear()}</Text>
          <Text style={styles.dashboardTitle}>SALES ANALYTICS 📊</Text>
          <Text style={styles.dashboardSubtitle}>
            Real-time insights for better sales analytics 🚀
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setShowDownloadPanel(true)}
            style={styles.filterMenuBtn}
          >
            <Ionicons name="download-outline" size={20} color={Theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowFilterPanel(true)}
            style={styles.filterMenuBtn}
          >
            <Ionicons name="filter-outline" size={20} color={Theme.primary} />
          </TouchableOpacity>
        </View>
      </View>



      {/* Filter Toggles */}
      <View style={styles.filterBar}>
        {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as FilterType[]).map(
          (f) => (
            <Pressable
              key={f}
              onPress={() => {
                setSelectedFilter(f as FilterType);
                setPickerMode('SINGLE');
              }}
              style={({ pressed }) => [
                styles.filterBtn,
                selectedFilter === f && styles.activeFilterBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === f && styles.activeFilterText,
                ]}
              >
                {f}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      {/* Date Navigation */}
      {selectedFilter !== "CUSTOM" ? (
        <View style={styles.dateControl}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPickerMode("SINGLE");
              setShowDatePicker(true);
            }}
            style={styles.dateDisplay}
          >
            <Text style={styles.dateText}>{selectedDate}</Text>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={Theme.primary}
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeDate(1)} style={styles.navBtn}>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Theme.textPrimary}
            />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.dateControl}>
          <TouchableOpacity
            onPress={() => {
              setPickerMode("START");
              setShowDatePicker(true);
            }}
            style={[
              styles.dateDisplay,
              { flex: 1 },
              pickerMode === "START" && { borderColor: Theme.primary },
            ]}
          >
            <View>
              <Text style={styles.rangeLabel}>FROM DATE</Text>
              <Text style={styles.dateText}>
                {rangeStart ? format(new Date(rangeStart), "dd-MM-yy") : "Select"}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={{ width: 10 }} />
          <TouchableOpacity
            onPress={() => {
              setPickerMode("END");
              setShowDatePicker(true);
            }}
            style={[
              styles.dateDisplay,
              { flex: 1 },
              pickerMode === "END" && { borderColor: Theme.primary },
            ]}
          >
            <View>
              <Text style={styles.rangeLabel}>TO DATE</Text>
              <Text style={styles.dateText}>
                {rangeEnd ? format(new Date(rangeEnd), "dd-MM-yy") : "Select"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}



      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        {renderMetricTile(
          "Total Sales",
          formatCurrency(filteredMetrics.TotalSales),
          "card-outline",
          Theme.success,
        )}
        {renderMetricTile(
          "Member Collections",
          // filteredMetrics.Member = member POS sales (prepaid wallet deductions)
          // filteredMetrics.MemberPaymentsCollected = LEDGER credit-account payment collections
          // Both represent cash received via member accounts
          formatCurrency(filteredMetrics.Member + filteredMetrics.MemberPaymentsCollected),
          "cash-outline",
          Theme.primary,
        )}
        {renderMetricTile(
          "Credit Collections",
          formatCurrency(filteredMetrics.CreditPaymentsCollected),
          "cash-outline",
          Theme.warning,
        )}
        {renderMetricTile(
          "Total Collections",
          // Exclude credit *sales* from TotalSales — they are deferred revenue (not collected at
          // point of sale). Add credit/member *payment* collections separately so a credit bill
          // paid within the same period is never counted twice.
          formatCurrency(
            (filteredMetrics.TotalSales - filteredMetrics.Credit) +
            filteredMetrics.MemberPaymentsCollected +
            filteredMetrics.CreditPaymentsCollected
          ),
          "wallet-outline",
          "#22c55e",
        )}
        {renderMetricTile(
          "Service Charge",
          formatCurrency(filteredMetrics.ServiceCharge),
          "calculator-outline",
          Theme.primary,
        )}
        {renderMetricTile(
          "GST",
          formatCurrency(filteredMetrics.TotalTax),
          "receipt-outline",
          Theme.warning,
        )}
        {renderMetricTile(
          "Total Orders",
          filteredMetrics.TotalTransactions + filteredMetrics.CancelledCount,
          "receipt-outline",
          Theme.warning,
        )}
        {renderMetricTile(
          "Items Sold",
          filteredMetrics.TotalItems,
          "fast-food-outline",
          "#ec4899",
        )}
        {renderMetricTile(
          "Total Voids",
          `${filteredMetrics.TotalVoids} (${formatCurrency(filteredMetrics.TotalVoidAmount)})`,
          "trash-outline",
          "#ef4444",
        )}
        {renderMetricTile(
          "Cancelled Orders",
          `${filteredMetrics.CancelledCount} (${formatCurrency(filteredMetrics.CancelledAmount)})`,
          "close-circle-outline",
          Theme.danger,
        )}
      </View>

      <View style={styles.reportSwitchRow}>
        <TouchableOpacity
          onPress={() => handleReportPress("CATEGORY")}
          style={[
            styles.reportSwitchBtn,
            detailReportType === "CATEGORY" && styles.activeReportSwitchBtn,
          ]}
        >
          <Ionicons
            name="albums-outline"
            size={16}
            color={detailReportType === "CATEGORY" ? "#fff" : Theme.primary}
          />
          <Text
            style={[
              styles.reportSwitchText,
              detailReportType === "CATEGORY" && styles.activeReportSwitchText,
            ]}
          >
            Category Sales Report
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleReportPress("DISH")}
          style={[
            styles.reportSwitchBtn,
            detailReportType === "DISH" && styles.activeReportSwitchBtn,
          ]}
        >
          <Ionicons
            name="restaurant-outline"
            size={16}
            color={detailReportType === "DISH" ? "#fff" : Theme.primary}
          />
          <Text
            style={[
              styles.reportSwitchText,
              detailReportType === "DISH" && styles.activeReportSwitchText,
            ]}
          >
            Item Sales Report
          </Text>
        </TouchableOpacity>
      </View>

      {renderDetailReport()}

      {/* Charts Section */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartsScrollContent}
      >
        <View style={styles.chartsContainer}>
          <View
            style={[
              styles.chartCard,
              {
                width:
                  SCREEN_W > 768 ? Math.max(300, (SCREEN_W - 64) / 3) : 300,
              },
            ]}
          >
            <View style={styles.chartCardHeader}>
              <Text style={styles.cardTitle}>PAYMENT CHANNEL MIX</Text>
              <Ionicons name="pie-chart" size={14} color={Theme.primary} />
            </View>
            <View style={styles.chartContainer}>
              {paymentBreakdownTotal > 0 ? (
                <View style={styles.pieChartWrapper}>
                  <PieChart
                    data={displayedBreakdownModes.map((m) => {
                      const key = m.payMode.toUpperCase().trim();
                      return {
                        value: paymentBreakdownMetrics[key] || 0,
                        color: getPayModeColor(key),
                        label: key,
                      };
                    }).filter((d) => d.value > 0)}
                    donut
                    radius={70}
                    innerRadius={50}
                    innerCircleColor={Theme.bgCard}
                    strokeColor={Theme.bgCard}
                    strokeWidth={2}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 9, fontFamily: Fonts.bold, color: Theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Total
                        </Text>
                        <Text style={{ fontSize: 13, fontFamily: Fonts.black, color: Theme.textPrimary, marginTop: 2 }}>
                          {formatCurrency(paymentBreakdownTotal)}
                        </Text>
                      </View>
                    )}
                  />

                  {/* Legend below the chart */}
                  <View style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 16,
                    paddingHorizontal: 4
                  }}>
                    {paymentMixCenterRows.map((row) => (
                      <View
                        key={row.key}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: Theme.bgMuted,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: Theme.border,
                          gap: 4
                        }}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: row.color }} />
                        <Text style={{ fontSize: 9, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                          {row.key}
                        </Text>
                        <Text style={{ fontSize: 9, fontFamily: Fonts.medium, color: row.color }}>
                          {row.pct.toFixed(0)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyChartPlaceholder}>
                  <Ionicons
                    name="pie-chart-outline"
                    size={40}
                    color={Theme.textMuted}
                  />
                  <Text style={styles.emptyChartText}>No sales data</Text>
                </View>
              )}
            </View>
          </View>
          <View
            style={[
              styles.chartCard,
              {
                width:
                  SCREEN_W > 768 ? Math.max(300, (SCREEN_W - 64) / 3) : 300,
              },
            ]}
          >
            <View style={styles.chartCardHeader}>
              <Text style={styles.cardTitle}>ORDER TYPES</Text>
              <Ionicons name="layers-outline" size={14} color={Theme.primary} />
            </View>
            <View style={styles.orderTypeStats}>
              {(() => {
                // Use dateScopedSales (date-only filtered) so payment mode filters
                // don't distort the order type split counts
                const activeSales = dateScopedSales.filter(s => !s.IsCancelled);
                const isTakeaway = (s: any) =>
                  s.OrderType === "TAKEAWAY" ||
                  s.Section === "TAKEAWAY" ||
                  (!s.OrderType && s.TableNo && String(s.TableNo).startsWith("TW-"));
                const takeaway = activeSales.filter(isTakeaway).length;
                const dineIn = activeSales.filter(
                  (s) => !isTakeaway(s),
                ).length;
                const total = dineIn + takeaway;
                return (
                  <>
                    <View style={styles.statRow}>
                      <View style={styles.statLabel}>
                        <Text style={styles.statIcon}>🪑</Text>
                        <Text style={styles.statName}>Dine-In</Text>
                      </View>
                      <Text
                        style={[styles.statValue, { color: Theme.primary }]}
                      >
                        {total > 0 ? ((dineIn / total) * 100).toFixed(0) : 0}%
                      </Text>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statLabel}>
                        <Text style={styles.statIcon}>🛍️</Text>
                        <Text style={styles.statName}>Takeaway</Text>
                      </View>
                      <Text
                        style={[styles.statValue, { color: Theme.warning }]}
                      >
                        {total > 0 ? ((takeaway / total) * 100).toFixed(0) : 0}%
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>

          <View
            style={[
              styles.chartCard,
              {
                width:
                  SCREEN_W > 768 ? Math.max(300, (SCREEN_W - 64) / 3) : 300,
              },
            ]}
          >
            <View style={styles.chartCardHeader}>
              <Text style={styles.cardTitle}>KEY METRICS</Text>
              <Ionicons
                name="bar-chart-outline"
                size={14}
                color={Theme.primary}
              />
            </View>
            <View style={styles.metricsStats}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Avg Check</Text>
                <Text style={styles.metricValueSmall}>
                  {formatCurrency(avgOrder)}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Conversion</Text>
                <Text style={styles.metricValueSmall}>
                  {filteredMetrics.TotalTransactions}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Avg Items</Text>
                <Text style={styles.metricValueSmall}>
                  {filteredMetrics.TotalTransactions > 0
                    ? (
                      filteredMetrics.TotalItems /
                      filteredMetrics.TotalTransactions
                    ).toFixed(1)
                    : 0}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Per Item</Text>
                <Text style={styles.metricValueSmall}>
                  {formatCurrency(
                    filteredMetrics.TotalItems > 0
                      ? filteredMetrics.TotalSales / filteredMetrics.TotalItems
                      : 0,
                  )}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Breakdown */}
      <View style={[styles.breakdownCard, SCREEN_W < 480 && { padding: 12, borderRadius: 16 }]}>
        <View style={styles.chartCardHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.cardTitle}>PAYMENT BREAKDOWN</Text>
            <Ionicons name="wallet-outline" size={14} color={Theme.primary} />
          </View>
          {activePaymentModes.length < (displayedBreakdownModes.length + 1) && (
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setActivePaymentModes([...displayedBreakdownModes.map(m => m.payMode.toUpperCase().trim()), "VOID"]);
              }}
              style={{
                backgroundColor: Theme.primary + "15",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: Theme.primary + "30",
              }}
            >
              <Text style={{ color: Theme.primary, fontFamily: Fonts.black, fontSize: 10, letterSpacing: 0.5 }}>
                SHOW ALL
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[
          styles.breakdownRow,
          {
            flexWrap: "wrap",
            justifyContent: "space-between",
            width: "100%",
            rowGap: SCREEN_W < 480 ? 8 : 10,
            columnGap: SCREEN_W < 480 ? 8 : 10
          }
        ]}>
          {displayedBreakdownModes.map((item, idx) => {
            const key = item.payMode.toUpperCase().trim();
            const label = item.description || item.payMode;
            const val = paymentBreakdownMetrics[key] || 0;
            const outstanding = key === "CREDIT" ? paymentBreakdownMetrics["CREDIT_OUTSTANDING"] : undefined;
            const icon = getPayModeIconChar(key);
            const color = getPayModeColor(key);

            const numColumns = SCREEN_W > 768 ? Math.max(6, displayedBreakdownModes.length) : (SCREEN_W > 480 ? 3 : 2);
            const layoutStyle = (SCREEN_W > 768
              ? { flex: 1, minWidth: 0 }
              : {
                  width: SCREEN_W > 480 ? "31.5%" : "48%",
                  minWidth: 0,
                  paddingHorizontal: 4,
                  paddingVertical: SCREEN_W < 480 ? 8 : 12
                }) as any;

            const isSomeFilterApplied = activePaymentModes.length < (displayedBreakdownModes.length + 1);
            const isThisActive = activePaymentModes.includes(key);
            const isActive = isSomeFilterApplied && isThisActive;
            const isInactive = isSomeFilterApplied && !isThisActive;

            return (
              <TouchableOpacity
                key={idx}
                activeOpacity={0.7}
                onPress={() => handleBreakdownPress(item.payMode)}
                style={[
                  styles.breakdownItem,
                  layoutStyle,
                  {
                    borderColor: hexToRgba(color, 0.25),
                    borderWidth: 1,
                    backgroundColor: "#ffffff",
                  },
                  isActive && {
                    borderColor: color,
                    borderWidth: 2,
                    backgroundColor: hexToRgba(color, 0.04),
                    ...Theme.shadowSm,
                  },
                  isInactive && {
                    opacity: 0.4,
                    borderColor: Theme.border,
                  }
                ]}
              >
                <Text style={[styles.breakdownIcon, SCREEN_W < 480 && { fontSize: 20 }]}>{icon}</Text>
                <Text style={[styles.breakdownLabel, SCREEN_W < 480 && { fontSize: 8 }]}>{label}</Text>
                <Text
                  style={[styles.breakdownValue, { color: color }, SCREEN_W < 480 && { fontSize: 10.5 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCurrency(val)}
                </Text>
                {outstanding !== undefined && (
                  <Text
                    style={{ fontSize: SCREEN_W < 480 ? 8 : 9, fontFamily: Fonts.bold, color: Theme.textMuted, marginTop: 1 }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    Pending: {formatCurrency(outstanding)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 1, backgroundColor: Theme.border, marginVertical: 16, opacity: 0.5 }} />

        <View style={{
          backgroundColor: Theme.bgCard,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: Theme.border,
          padding: SCREEN_W < 480 ? 12 : 16,
          gap: SCREEN_W < 480 ? 10 : 12,
          ...Theme.shadowSm
        }}>
          <Text style={{ fontFamily: Fonts.black, fontSize: SCREEN_W < 480 ? 10 : 11, color: Theme.textSecondary, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>
            Reconciliation Summary
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: Fonts.extraBold, fontSize: SCREEN_W < 480 ? 12 : 13, color: Theme.textPrimary }}>Total Sales Volume</Text>
            <Text 
              style={{ fontFamily: Fonts.black, fontSize: SCREEN_W < 480 ? 13 : 14, color: Theme.textPrimary, textAlign: "right" }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(paymentBreakdownTotal)}
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: Theme.border, opacity: 0.3 }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontFamily: Fonts.bold, fontSize: SCREEN_W < 480 ? 12 : 13, color: "#ec4899" }}>Member Accounts</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text 
                style={{ fontFamily: Fonts.bold, fontSize: SCREEN_W < 480 ? 11 : 12, color: Theme.success, textAlign: "right" }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Sales: {formatCurrency(paymentBreakdownMetrics.MEMBER || 0)}
              </Text>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: Theme.border, opacity: 0.3 }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontFamily: Fonts.bold, fontSize: SCREEN_W < 480 ? 12 : 13, color: "#e11d48" }}>Credit Customers</Text>
              <Text style={{ fontFamily: Fonts.medium, fontSize: SCREEN_W < 480 ? 8 : 9, color: Theme.textMuted, marginTop: 1 }}>Collections vs New Outstanding</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text 
                style={{ fontFamily: Fonts.bold, fontSize: SCREEN_W < 480 ? 11 : 12, color: Theme.success, textAlign: "right" }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Collected: {formatCurrency(filteredMetrics.CreditPaymentsCollected)}
              </Text>
              <Text 
                style={{ fontFamily: Fonts.bold, fontSize: SCREEN_W < 480 ? 11 : 12, color: "#e11d48", marginTop: 1, textAlign: "right" }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Pending: {formatCurrency(filteredMetrics.CreditOutstanding)}
              </Text>
            </View>
          </View>

          <View style={{ backgroundColor: Theme.success + "10", borderRadius: 12, padding: SCREEN_W < 480 ? 10 : 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, borderWidth: 1, borderColor: Theme.success + "20" }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontFamily: Fonts.black, fontSize: SCREEN_W < 480 ? 11.5 : 13, color: Theme.success }}>Total Collections Volume</Text>
              <Text style={{ fontFamily: Fonts.medium, fontSize: SCREEN_W < 480 ? 8 : 9, color: Theme.textMuted, marginTop: 1 }}>Cash Received (excl. Credit Sales) + Payments Collected</Text>
            </View>
            <Text 
              style={{ fontFamily: Fonts.black, fontSize: SCREEN_W < 480 ? 15 : 18, color: Theme.success, textAlign: "right" }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(
                (paymentBreakdownTotal - (paymentBreakdownMetrics.CREDIT || 0)) +
                filteredMetrics.MemberPaymentsCollected +
                filteredMetrics.CreditPaymentsCollected
              )}
            </Text>
          </View>
        </View>
      </View>

      {/* Recent Transactions Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>RECENT TRANSACTIONS</Text>
        <TouchableOpacity onPress={() => fetchData()}>
          <Text style={styles.seeAllText}>REFRESH</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>

          <FlatList
            data={filteredSales}
            renderItem={({ item }: { item: any }) => (
              <TransactionCard
                item={item}
                onPress={handleOrderPress}
                formatOrderId={formatOrderId}
                formatCurrency={formatCurrency}
              />
            )}
            keyExtractor={(item: any) => item.SettlementID}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 10, paddingHorizontal: 8 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Theme.primary}
              />
            }
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== "web"}
          />

          {/* Modal Overlay */}
          <Modal visible={!!selectedOrder} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.modalDismiss}
                onPress={() => {
                  setSelectedOrder(null);
                  setOrderDetails([]);
                }}
              />
              <View style={styles.modalContent}>
                <View
                  style={[styles.modalHeader, { alignItems: "flex-start" }]}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={[
                          styles.modalTitle,
                          { fontSize: SCREEN_W < 450 ? 14 : 16 },
                        ]}
                      >
                        Order #{formatOrderId(selectedOrder)}
                      </Text>
                      <View
                        style={[
                          styles.paidBadgeSmall,
                          {
                            backgroundColor: selectedOrder?.IsCancelled ? Theme.danger + "15" : Theme.primary + "15",
                            borderColor: selectedOrder?.IsCancelled ? Theme.danger + "30" : Theme.primary + "30",
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 6,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selectedOrder?.IsCancelled ? Theme.danger : Theme.primary,
                            fontFamily: Fonts.black,
                            fontSize: 9,
                          }}
                        >
                          {payModeText}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginTop: 6,
                        gap: 10,
                      }}
                    >
                      <Text style={[styles.modalSub, { fontSize: 10 }]}>
                        {(() => {
                          const dateObj = parseDatabaseDate(selectedOrder?.SettlementDate);
                          if (!dateObj || isNaN(dateObj.getTime())) return "N/A";
                          const datePart = new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'Asia/Singapore',
                            day: 'numeric',
                            month: 'numeric',
                            year: 'numeric'
                          }).format(dateObj);
                          const timePart = new Intl.DateTimeFormat('en-US', {
                            timeZone: 'Asia/Singapore',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          }).format(dateObj);
                          return `${datePart}, ${timePart}`;
                        })()}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name={
                            selectedOrder?.OrderType === "TAKEAWAY"
                              ? "bag-handle"
                              : "restaurant"
                          }
                          size={11}
                          color={Theme.textMuted}
                        />
                        <Text
                          style={[
                            styles.modalSub,
                            {
                              color: Theme.textPrimary,
                              fontFamily: Fonts.bold,
                              fontSize: 10,
                            },
                          ]}
                        >
                          {selectedOrder?.OrderType === "TAKEAWAY"
                            ? "Takeaway"
                            : `Table ${selectedOrder?.TableNo || "N/A"}${selectedOrder?.Section ? ` • ${selectedOrder.Section}` : ""}`}
                        </Text>
                        {selectedOrder?.SER_NAME && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: Theme.primaryLight,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                            }}
                          >
                            <Ionicons
                              name="person"
                              size={9}
                              color={Theme.primary}
                            />
                            <Text
                              style={{
                                color: Theme.primary,
                                fontFamily: Fonts.bold,
                                fontSize: 9,
                              }}
                            >
                              {selectedOrder.SER_NAME}
                            </Text>
                          </View>
                        )}
                      </View>
                      {(selectedOrder?.GuestName || selectedOrder?.Pax) && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                            marginTop: 6,
                            gap: 10,
                          }}
                        >
                          {selectedOrder?.GuestName && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="person-outline" size={11} color={Theme.textSecondary} />
                              <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                                Guest: {selectedOrder.GuestName}
                              </Text>
                            </View>
                          )}
                          {selectedOrder?.Pax && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="people-outline" size={11} color={Theme.textSecondary} />
                              <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                                {selectedOrder.Pax} Pax
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedOrder(null)}
                    style={{ marginLeft: 10 }}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {/* 🚨 CANCELLED BANNER - Compact Version */}
                {selectedOrder?.IsCancelled ? (
                  <View style={styles.cancelledOrderBadge}>
                    <View style={styles.cancelledBadgeMain}>
                      <Ionicons name="alert-circle" size={16} color={Theme.danger} />
                      <Text style={styles.cancelledBadgeText}>ORDER CANCELLED</Text>
                      <View style={styles.cancelledReasonBadge}>
                        <Text style={styles.cancelledReasonText}>{selectedOrder.CancellationReason || "No reason"}</Text>
                      </View>
                    </View>
                    <View style={styles.cancelledDetailRow}>
                      <Text style={styles.cancelledDetailText}>By: {selectedOrder.CancelledByUserName || "SYSTEM"}</Text>
                      <Text style={styles.cancelledDetailText}>
                        Date: {(() => {
                          if (!selectedOrder.CancelledDate) return "N/A";
                          const dateObj = parseDatabaseDate(selectedOrder.CancelledDate);
                          const datePart = new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'Asia/Singapore',
                            day: 'numeric',
                            month: 'numeric',
                            year: 'numeric'
                          }).format(dateObj);
                          const timePart = new Intl.DateTimeFormat('en-US', {
                            timeZone: 'Asia/Singapore',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          }).format(dateObj);
                          return `${datePart}, ${timePart}`;
                        })()}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.modalDivider} />
                <ScrollView
                  style={styles.itemsList}
                  showsVerticalScrollIndicator={false}
                >
                  {selectedOrder?.isMerged && (
                    <View style={styles.detailMergeContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Ionicons name="git-merge-outline" size={14} color="#ea580c" />
                        <Text style={styles.detailMergeTitle}>Merged Tables & Bills</Text>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
                        style={{ width: '100%' }}
                      >
                        {selectedOrder.mergedDetails?.split(', ').filter(Boolean).map((detail: string, index: number) => (
                          <View key={index} style={styles.childBillBadge}>
                            <Text style={styles.childBillBadgeText}>{detail}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {selectedOrder?.isSplit && (
                    <View style={styles.detailSplitContainer}>
                      <Ionicons name="cut-outline" size={14} color="#2563eb" />
                      <Text style={styles.detailSplitText}>
                        Split Bill Payment: <Text style={{ fontFamily: Fonts.black }}>{selectedOrder.splitNo}</Text>
                      </Text>
                    </View>
                  )}
                  {loadingDetails ? (
                    <View style={{ paddingVertical: 20 }}>
                      <ActivityIndicator color={Theme.primary} />
                    </View>
                  ) : (
                    orderDetails.map((item, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.orderItemRow,
                          idx !== orderDetails.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: Theme.border + "30",
                            paddingBottom: 12,
                          },
                          item.Status === "VOIDED" && {
                            backgroundColor: "#fff1f2",
                            marginHorizontal: -12,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            opacity: 0.8,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.qtyBadgeSmall,
                            {
                              backgroundColor:
                                item.Status === "VOIDED"
                                  ? "#fecaca"
                                  : Theme.primary + "10",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.orderItemQty,
                              {
                                width: "auto",
                                color:
                                  item.Status === "VOIDED"
                                    ? "#991b1b"
                                    : Theme.primary,
                              },
                            ]}
                          >
                            {item.Qty}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.orderItemName,
                              item.Status === "VOIDED" && {
                                textDecorationLine: "line-through",
                                color: "#991b1b",
                              },
                            ]}
                          >
                            {item.DishName}
                            {item.Status === "VOIDED" && (
                              <Text
                                style={{
                                  color: "#dc2626",
                                  fontSize: 9,
                                  fontFamily: Fonts.black,
                                  textDecorationLine: "none",
                                }}
                              >
                                {" "}[VOID]
                              </Text>
                            )}
                          </Text>
                          {item.SongName ? (
                            <Text
                              style={{
                                fontSize: 11,
                                color: "#666",
                                marginTop: 2,
                              }}
                            >
                              🎵 {item.SongName}
                            </Text>
                          ) : null}
                          {item.modifiers &&
                            Array.isArray(item.modifiers) &&
                            item.modifiers.filter((m: any) => {
                              const name = (m.ModifierName || m.modifierName || m.name || "").trim();
                              return name.length > 0;
                            }).length > 0 && (
                              <View style={styles.modifierPillsContainer}>
                                {item.modifiers
                                  .filter((m: any) => {
                                    const name = (m.ModifierName || m.modifierName || m.name || "").trim();
                                    return name.length > 0;
                                  })
                                  .map((m: any, mIdx: number) => {
                                    const amt = Number(m.Amount || m.amount || 0);
                                    const displayName = (m.ModifierName || m.name || "").replace(/^INSTR:\s*/i, "").trim();
                                    return (
                                      <View key={mIdx} style={styles.modifierPill}>
                                        <Text style={styles.modifierPillText}>
                                          + {displayName}
                                          {amt > 0 ? ` ($${amt.toFixed(2)})` : ""}
                                        </Text>
                                      </View>
                                    );
                                  })}
                              </View>
                            )}
                          {item.isCombo && item.comboSelections && Array.isArray(item.comboSelections) && (
                            <View style={{ marginTop: 6, gap: 4, paddingLeft: 4 }}>
                              {item.comboSelections
                                .filter((group: any) => group.items && group.items.length > 0)
                                .map((group: any, gIdx: number) => (
                                  <View key={`g-${gIdx}`} style={{ marginTop: 2 }}>
                                    <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: Theme.primary }}>
                                      {group.groupName}:
                                    </Text>
                                    {(group.items || []).map((opt: any, oIdx: number) => {
                                      const effectiveAdd = (parseFloat(opt.surcharge || 0) + parseFloat(opt.dishPrice || 0));
                                      return (
                                        <Text key={`o-${oIdx}`} style={{ fontSize: 11, color: Theme.textSecondary || "#666", paddingLeft: 8, marginTop: 1 }}>
                                          ↳ {opt.name}{effectiveAdd > 0 ? ` (+$${effectiveAdd.toFixed(2)})` : ""}
                                        </Text>
                                      );
                                    })}
                                  </View>
                                ))}
                            </View>
                          )}
                          {/* Unit price row — strikethrough if item has discount */}
                          {item.DiscountAmount > 0 ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <Text style={{ color: Theme.textMuted, fontSize: 10, fontFamily: Fonts.bold, textDecorationLine: "line-through" }}>
                                UNIT: ${(item.Price || 0).toFixed(2)}
                              </Text>
                              {/* Discounted unit price */}
                              {(() => {
                                const discountedUnit =
                                  item.DiscountType === "percentage"
                                    ? item.Price * (1 - item.DiscountAmount / 100)
                                    : Math.max(0, item.Price - item.DiscountAmount);
                                const badge =
                                  item.DiscountType === "percentage"
                                    ? `-${item.DiscountAmount}%`
                                    : `-$${item.DiscountAmount.toFixed(2)}`;
                                return (
                                  <>
                                    <Text style={{ color: Theme.success, fontSize: 10, fontFamily: Fonts.black }}>
                                      ${discountedUnit.toFixed(2)}
                                    </Text>
                                    <View style={{ backgroundColor: Theme.success + "15", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                                      <Text style={{ color: Theme.success, fontSize: 9, fontFamily: Fonts.black }}>{badge}</Text>
                                    </View>
                                  </>
                                );
                              })()}
                            </View>
                          ) : (
                            <Text style={{ color: Theme.textMuted, fontSize: 10, fontFamily: Fonts.bold }}>
                              UNIT: ${(item.Price || 0).toFixed(2)}
                            </Text>
                          )}
                        </View>
                        {/* Line total */}
                        {item.DiscountAmount > 0 ? (
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={{ color: Theme.textMuted, fontSize: 10, fontFamily: Fonts.bold, textDecorationLine: "line-through" }}>
                              ${(item.Price * item.Qty).toFixed(2)}
                            </Text>
                            <Text style={[styles.orderItemPrice, { color: Theme.success }]}>
                              {item.DiscountType === "percentage"
                                ? `$${(item.Price * (1 - item.DiscountAmount / 100) * item.Qty).toFixed(2)}`
                                : `$${(Math.max(0, item.Price - item.DiscountAmount) * item.Qty).toFixed(2)}`}
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.orderItemPrice,
                              item.Status === "VOIDED" && {
                                textDecorationLine: "line-through",
                                color: "#991b1b",
                              },
                            ]}
                          >
                            ${(item.Price * item.Qty).toFixed(2)}
                          </Text>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Member / Credit Customer Info */}
                {selectedOrder?.CustomerName && (
                  <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 13, fontFamily: Fonts.black, color: Theme.textPrimary }}>
                      {String(selectedOrder.PayMode || '').toUpperCase().includes("MEMBER") ? "Member" : "Credit Customer"}: {selectedOrder.CustomerName}
                    </Text>
                  </View>
                )}

                {/* Payment Details Breakdown */}
                {displayedPayments.length > 0 && (
                  <View style={{ marginTop: 12, marginBottom: 4, paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: Theme.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Payment Details
                    </Text>
                    {displayedPayments.map((pm, idx) => (
                      <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13, fontFamily: Fonts.semiBold, color: Theme.textPrimary }}>
                          {pm.PayModeName || 'CASH'}
                          {pm.ReferenceNo ? ` (${pm.ReferenceNo})` : ''}
                        </Text>
                        <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                          {formatCurrency(pm.Amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.modalDivider} />
                {/* Bill-level breakdown: Subtotal → Discount → Total */}
                <View style={{ backgroundColor: Theme.primary + "05", padding: 12, borderRadius: 12, marginBottom: 16, gap: 6 }}>
                  {/* Show subtotal + discount rows only when a bill discount was applied */}
                  {/* Show subtotal row when discount, service charge, or tax is applied */}
                  {(selectedOrder?.DiscountAmount > 0 || Number(selectedOrder?.ServiceCharge) > 0 || Number(selectedOrder?.TotalTax) > 0 || Number(selectedOrder?.TakeawayCharge) > 0) && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Theme.textSecondary }}>Subtotal</Text>
                      <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                        {formatCurrency(selectedOrder?.SubTotal)}
                      </Text>
                    </View>
                  )}
                  {selectedOrder?.DiscountAmount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Theme.success }}>Discount</Text>
                        {selectedOrder?.DiscountType && (
                          <View style={{ backgroundColor: Theme.success + "15", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, fontFamily: Fonts.black, color: Theme.success }}>
                              {selectedOrder.DiscountType === "percentage"
                                ? `${selectedOrder.DiscountAmount}%`
                                : "FIXED"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: Theme.success }}>
                        -{formatCurrency(selectedOrder?.DiscountAmount)}
                      </Text>
                    </View>
                  )}
                  {Number(selectedOrder?.ServiceCharge) > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Theme.textSecondary }}>Item Service Charge</Text>
                      <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                        {formatCurrency(selectedOrder?.ServiceCharge)}
                      </Text>
                    </View>
                  )}
                  {Number(selectedOrder?.TakeawayCharge) > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Theme.textSecondary }}>Takeaway Charge</Text>
                      <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                        {formatCurrency(selectedOrder?.TakeawayCharge)}
                      </Text>
                    </View>
                  )}
                  {Number(selectedOrder?.TotalTax) > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Theme.textSecondary }}>GST</Text>
                      <Text style={{ fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary }}>
                        {formatCurrency(selectedOrder?.TotalTax)}
                      </Text>
                    </View>
                  )}
                  {(selectedOrder?.DiscountAmount > 0 || Number(selectedOrder?.ServiceCharge) > 0 || Number(selectedOrder?.TotalTax) > 0 || Number(selectedOrder?.TakeawayCharge) > 0) && (
                    <View style={{ height: 1, backgroundColor: Theme.border + "50", marginVertical: 2 }} />
                  )}
                  {/* Final total + paid badge */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View>
                      <Text style={[styles.totalLabel, { fontSize: 10, color: Theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }]}>
                        Total Amount
                      </Text>
                      <Text style={[styles.totalValue, { fontSize: 22 }]}>
                        {formatCurrency(finalBillAmount)}
                      </Text>
                    </View>
                    {(() => {
                      const isMemberOrder = String(selectedOrder?.PayMode || "").toUpperCase().trim() === "MEMBER";
                      return (
                        <View style={[
                          styles.paidBadgeSmall,
                          {
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: selectedOrder?.IsCancelled
                              ? Theme.danger + "20"
                              : isMemberOrder
                                ? Theme.success + "20"
                                : selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0
                                  ? Number(selectedOrder.OutstandingAmount) === Number(finalBillAmount)
                                    ? "#ef444420"
                                    : "#f59e0b20"
                                  : Theme.success + "20",
                            borderColor: selectedOrder?.IsCancelled
                              ? Theme.danger + "40"
                              : isMemberOrder
                                ? Theme.success + "40"
                                : selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0
                                  ? Number(selectedOrder.OutstandingAmount) === Number(finalBillAmount)
                                    ? "#ef444440"
                                    : "#f59e0b40"
                                  : Theme.success + "40"
                          }
                        ]}>
                          <Ionicons
                            name={
                              selectedOrder?.IsCancelled
                                ? "close-circle"
                                : isMemberOrder
                                  ? "checkmark-circle"
                                  : selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0
                                    ? Number(selectedOrder.OutstandingAmount) === Number(finalBillAmount)
                                      ? "alert-circle"
                                      : "time"
                                    : "checkmark-circle"
                            }
                            size={14}
                            color={
                              selectedOrder?.IsCancelled
                                ? Theme.danger
                                : isMemberOrder
                                  ? Theme.success
                                  : selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0
                                    ? Number(selectedOrder.OutstandingAmount) === Number(finalBillAmount)
                                      ? "#ef4444"
                                      : "#f59e0b"
                                    : Theme.success
                            }
                          />
                          <Text style={{
                            color: selectedOrder?.IsCancelled
                              ? Theme.danger
                              : isMemberOrder
                                ? Theme.success
                                : selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0
                                  ? Number(selectedOrder.OutstandingAmount) === Number(finalBillAmount)
                                    ? "#ef4444"
                                    : "#f59e0b"
                                  : Theme.success,
                            fontFamily: Fonts.black,
                            fontSize: 10,
                            marginLeft: 4
                          }}>
                            {selectedOrder?.IsCancelled
                              ? "CANCELLED"
                              : isMemberOrder
                                ? "PAID"
                                : selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0
                                  ? Number(selectedOrder.OutstandingAmount) === Number(finalBillAmount)
                                    ? "UNPAID"
                                    : "PARTIAL"
                                  : "PAID"}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                  {/* Paid / Pending details inside the modal */}
                  {(() => {
                    const isMemberOrder = String(selectedOrder?.PayMode || "").toUpperCase().trim() === "MEMBER";
                    if (selectedOrder?.OutstandingAmount !== undefined && Number(selectedOrder.OutstandingAmount) > 0 && !selectedOrder?.IsCancelled && !isMemberOrder) {
                      return (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Theme.border + "40", flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: Theme.textSecondary }}>
                            Paid: <Text style={{ color: Theme.success, fontFamily: Fonts.black }}>{formatCurrency(Number(finalBillAmount) - Number(selectedOrder.OutstandingAmount))}</Text>
                          </Text>
                          <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: Theme.textSecondary }}>
                            Pending: <Text style={{ color: "#ef4444", fontFamily: Fonts.black }}>{formatCurrency(Number(selectedOrder.OutstandingAmount))}</Text>
                          </Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedOrder(null);
                      setOrderDetails([]);
                    }}
                    style={[
                      styles.premiumPrimaryBtn,
                      { flex: 1, paddingVertical: 12 },
                    ]}
                  >
                    <Text
                      style={[styles.premiumPrimaryBtnText, { fontSize: 14 }]}
                    >
                      CLOSE
                    </Text>
                  </TouchableOpacity>

                  {!selectedOrder?.IsCancelled && (
                    <TouchableOpacity
                      disabled={loadingDetails || orderDetails.length === 0}
                      onPress={() => setShowPrintPrompt(true)}
                      style={[
                        styles.premiumSecondaryBtn,
                        { flex: 1.2, paddingVertical: 12 },
                        (loadingDetails || orderDetails.length === 0) && { opacity: 0.5 }
                      ]}
                    >
                      <Ionicons name="print" size={16} color={Theme.primary} />
                      <Text
                        style={[styles.premiumSecondaryBtnText, { fontSize: 14 }]}
                      >
                        {loadingDetails ? "LOADING..." : "REPRINT"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </Modal>

          {/* Sidebar Modal */}
          <Modal visible={showFilterPanel} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.sidebarDismiss}
                onPress={() => setShowFilterPanel(false)}
              />
              <View style={styles.sidebarContent}>
                <View style={styles.sidebarHeader}>
                  <Text style={styles.sidebarTitle}>ADVANCED FILTERS</Text>
                  <TouchableOpacity onPress={() => setShowFilterPanel(false)}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>PAYMENT MODES</Text>
                    <View style={styles.chipRow}>
                      {["CASH", "CARD", "NETS", "PAYNOW", "VOID", "MEMBER", "CREDIT"].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => togglePaymentMode(m)}
                          style={[
                            styles.chip,
                            activePaymentModes.includes(m) && styles.activeChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              activePaymentModes.includes(m) &&
                              styles.activeChipText,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>ORDER TYPE</Text>
                    <View style={styles.chipRow}>
                      {["DINE-IN", "TAKEAWAY"].map((t) => (
                        <TouchableOpacity
                          key={t}
                          onPress={() => toggleOrderType(t)}
                          style={[
                            styles.chip,
                            activeOrderTypes.includes(t) && styles.activeChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              activeOrderTypes.includes(t) &&
                              styles.activeChipText,
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>SORT BY</Text>
                    {[
                      {
                        id: "NEWEST",
                        label: "Newest First",
                        icon: "time-outline",
                      },
                      {
                        id: "HIGHEST",
                        label: "Highest Amount",
                        icon: "trending-up-outline",
                      },
                    ].map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setSortOrder(s.id as any)}
                        style={[
                          styles.sortBtn,
                          sortOrder === s.id && styles.activeSortBtn,
                        ]}
                      >
                        <Ionicons
                          name={s.icon as any}
                          size={18}
                          color={
                            sortOrder === s.id ? Theme.primary : Theme.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.sortText,
                            sortOrder === s.id && styles.activeSortText,
                          ]}
                        >
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>VISIBILITY</Text>
                    <TouchableOpacity
                      onPress={() => setShowCancelledOrders(!showCancelledOrders)}
                      style={[
                        styles.sortBtn,
                        showCancelledOrders && styles.activeSortBtn,
                      ]}
                    >
                      <Ionicons
                        name={showCancelledOrders ? "eye-outline" : "eye-off-outline"}
                        size={18}
                        color={showCancelledOrders ? Theme.primary : Theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.sortText,
                          showCancelledOrders && styles.activeSortText,
                        ]}
                      >
                        {showCancelledOrders ? "Showing Cancelled Orders" : "Hidden Cancelled Orders"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
                <View style={styles.sidebarFooter}>
                  <TouchableOpacity
                    onPress={() => {
                      setActivePaymentModes(["CASH", "CARD", "NETS", "PAYNOW", "VOID", "MEMBER", "CREDIT"]);
                      setActiveOrderTypes(["DINE-IN", "TAKEAWAY"]);
                      setSortOrder("NEWEST");
                      setShowCancelledOrders(true);
                    }}
                    style={styles.resetBtn}
                  >
                    <Text style={styles.resetText}>RESET ALL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowFilterPanel(false)}
                    style={styles.applyBtn}
                  >
                    <Text style={styles.applyText}>APPLY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <BillPrompt
            visible={showPrintPrompt}
            onClose={() => setShowPrintPrompt(false)}
            onSkip={() => setShowPrintPrompt(false)}
            onPrintBill={handleReprint}
            theme={Theme}
            t={{
              printBillReceipt: "Reprint Receipt?",
              totalAmount: "Total",
              printBillMessage:
                "Would you like to reprint the receipt for this order?",
              skipBill: "Cancel",
              printBill: "Print",
            }}
            total={String(selectedOrder?.SysAmount || 0)}
          />

          <Modal visible={showDownloadPanel} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <TouchableOpacity
                activeOpacity={1}
                style={styles.modalDismiss}
                onPress={() => !isDownloading && setShowDownloadPanel(false)}
              />
              <View style={[styles.downloadModalContent, { width: SCREEN_W > 600 ? 380 : "92%" }]}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Sales Report</Text>
                    <Text style={styles.modalSub}>Select period and download format</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => !isDownloading && setShowDownloadPanel(false)}
                    style={styles.modalCloseBtn}
                  >
                    <Ionicons name="close" size={20} color={Theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                  {/* Period Selection Card */}
                  <View style={styles.downloadSectionCard}>
                    <Text style={styles.downloadSectionLabel}>SELECT TIME PERIOD</Text>
                    <View style={styles.periodGrid}>
                      {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as FilterType[]).map((f) => (
                        <TouchableOpacity
                          key={f}
                          onPress={() => {
                            setDownloadFilter(f);
                            setDownloadPickerMode("START");
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          style={[
                            styles.periodBtn,
                            downloadFilter === f && styles.activePeriodBtn,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              f === "DAILY" ? "calendar-today" :
                                f === "WEEKLY" ? "calendar-week" :
                                  f === "MONTHLY" ? "calendar-month" :
                                    f === "YEARLY" ? "calendar-star" : "calendar-range"
                            }
                            size={18}
                            color={downloadFilter === f ? "#fff" : Theme.textSecondary}
                          />
                          <Text style={[styles.periodText, downloadFilter === f && styles.activePeriodText]}>
                            {f.charAt(0) + f.slice(1).toLowerCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {downloadFilter === "CUSTOM" && (
                      <View style={styles.customDateRow}>
                        <TouchableOpacity
                          onPress={() => {
                            setDownloadPickerMode("START");
                            setShowDownloadDatePicker(true);
                          }}
                          style={[styles.dateInput, downloadPickerMode === "START" && styles.activeDateInput]}
                        >
                          <Text style={styles.dateInputLabel}>FROM</Text>
                          <Text style={styles.dateInputValue}>
                            {downloadRangeStart ? format(new Date(downloadRangeStart), "dd MMM yyyy") : "Select"}
                          </Text>
                        </TouchableOpacity>
                        <Ionicons name="arrow-forward" size={16} color={Theme.textMuted} />
                        <TouchableOpacity
                          onPress={() => {
                            setDownloadPickerMode("END");
                            setShowDownloadDatePicker(true);
                          }}
                          style={[styles.dateInput, downloadPickerMode === "END" && styles.activeDateInput]}
                        >
                          <Text style={styles.dateInputLabel}>TO</Text>
                          <Text style={styles.dateInputValue}>
                            {downloadRangeEnd ? format(new Date(downloadRangeEnd), "dd MMM yyyy") : "Select"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Option A: Direct Download */}
                  <View style={styles.downloadOptionCard}>
                    <View style={styles.optionHeader}>
                      <View style={styles.optionIconBox}>
                        <Ionicons name="document-text" size={20} color={Theme.primary} />
                      </View>
                      <View>
                        <Text style={styles.optionTitle}>Direct Download</Text>
                        <Text style={styles.optionDesc}>Generate PDF and save to device</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={handleDownloadPdf}
                      disabled={isDownloading || isSendingEmail || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[Theme.primary, "#ff8c42"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.premiumActionBtn,
                          (isDownloading || isSendingEmail || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))) && { opacity: 0.5 }
                        ]}
                      >
                        {isDownloading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="cloud-download" size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.premiumActionBtnText}>Download PDF</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {/* Option B: Send to Email */}
                  <View style={styles.downloadOptionCard}>
                    <View style={styles.optionHeader}>
                      <View style={[styles.optionIconBox, { backgroundColor: '#e0f2fe' }]}>
                        <Ionicons name="mail" size={20} color="#0284c7" />
                      </View>
                      <View>
                        <Text style={styles.optionTitle}>Send via Email</Text>
                        <Text style={styles.optionDesc}>Receive report in your inbox</Text>
                      </View>
                    </View>

                    <View style={styles.emailInputWrapper}>
                      <Ionicons name="at" size={18} color={Theme.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[
                          styles.modernEmailInput,
                          showEmailValidationError && { borderColor: '#ef4444' },
                        ]}
                        placeholder="recipient@example.com"
                        placeholderTextColor={Theme.textMuted}
                        value={emailAddress}
                        onChangeText={(value) => {
                          setEmailAddress(value.toLowerCase());
                          if (!emailFieldTouched) setEmailFieldTouched(true);
                          const next = validateRecipientEmail(value);
                          setEmailSuggestion(next.suggestion || null);
                        }}
                        onBlur={() => {
                          setEmailFieldTouched(true);
                          const normalized = emailAddress.trim().toLowerCase();
                          if (normalized !== emailAddress) setEmailAddress(normalized);
                          const next = validateRecipientEmail(normalized);
                          setEmailSuggestion(next.suggestion || null);
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    {showEmailValidationError && (
                      <Text style={styles.errorHint}>{emailValidation.error}</Text>
                    )}

                    {!!emailSuggestion && !emailValidation.isValid && (
                      <TouchableOpacity
                        onPress={() => {
                          setEmailAddress(emailSuggestion);
                          setEmailFieldTouched(true);
                          setEmailSuggestion(null);
                        }}
                        style={styles.suggestionBox}
                      >
                        <Text style={styles.suggestionText}>Did you mean <Text style={{ color: Theme.primary, textDecorationLine: 'underline' }}>{emailSuggestion}</Text>?</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={handleEmailPdf}
                      disabled={isDownloading || isSendingEmail || !emailValidation.isValid || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={["#0284c7", "#38bdf8"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.premiumActionBtn,
                          (isDownloading || isSendingEmail || !emailValidation.isValid || (downloadFilter === "CUSTOM" && (!downloadRangeStart || !downloadRangeEnd || new Date(downloadRangeEnd) < new Date(downloadRangeStart)))) && { opacity: 0.5 }
                        ]}
                      >
                        {isSendingEmail ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.premiumActionBtnText}>Send to Email</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {showDownloadDatePicker && (
            <Modal transparent visible={showDownloadDatePicker} animationType="fade">
              <View style={styles.modalOverlay}>
                <TouchableOpacity
                  style={styles.modalDismiss}
                  onPress={() => setShowDownloadDatePicker(false)}
                />
                <View
                  style={[
                    styles.modalContent,
                    { width: SCREEN_W > 600 ? 330 : "85%" },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {downloadPickerMode === "START" ? "Select From Date" : "Select To Date"}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDownloadDatePicker(false)}>
                      <Ionicons name="close" size={24} color={Theme.danger} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker
                    selectedDate={
                      downloadPickerMode === "START" && downloadRangeStart
                        ? downloadRangeStart
                        : downloadPickerMode === "END" && downloadRangeEnd
                          ? downloadRangeEnd
                          : new Date().toISOString().split("T")[0]
                    }
                    rangeStart={downloadRangeStart}
                    rangeEnd={downloadRangeEnd}
                    isRangeMode={true}
                    onModeChange={() => { }}
                    onRangeChange={(start, end) => {
                      setDownloadRangeStart(start);
                      setDownloadRangeEnd(end);
                      if (start && end) {
                        setShowDownloadDatePicker(false);
                      }
                    }}
                    onDateChange={(date) => {
                      if (downloadPickerMode === "START") {
                        setDownloadRangeStart(date);
                      } else {
                        setDownloadRangeEnd(date);
                      }
                      setShowDownloadDatePicker(false);
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const today = new Date().toISOString().split("T")[0];
                      if (downloadPickerMode === "START") {
                        setDownloadRangeStart(today);
                      } else {
                        setDownloadRangeEnd(today);
                      }
                      setShowDownloadDatePicker(false);
                    }}
                    style={{ alignSelf: "center", marginTop: 15, paddingBottom: 5 }}
                  >
                    <Text style={{ color: Theme.primary, fontFamily: Fonts.black, fontSize: 13, textDecorationLine: "underline" }}>GO TO TODAY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {showDatePicker && (
            <Modal transparent visible={showDatePicker} animationType="fade">
              <View style={styles.modalOverlay}>
                <TouchableOpacity
                  style={styles.modalDismiss}
                  onPress={() => setShowDatePicker(false)}
                />
                <View
                  style={[
                    styles.modalContent,
                    { width: SCREEN_W > 600 ? 330 : "85%" },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {selectedFilter === "CUSTOM"
                        ? (rangeStart && !rangeEnd ? "Select End Date" : "Select Start Date")
                        : "Select Date"}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Ionicons name="close" size={24} color={Theme.danger} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker
                    selectedDate={
                      pickerMode === "START" && rangeStart
                        ? rangeStart
                        : pickerMode === "END" && rangeEnd
                          ? rangeEnd
                          : selectedDate
                    }
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    isRangeMode={selectedFilter === "CUSTOM"}
                    onModeChange={(isRange) => {
                      if (isRange) {
                        setSelectedFilter("CUSTOM");
                        setPickerMode("START");
                        if (!rangeStart) {
                          setRangeStart(selectedDate);
                          setRangeEnd(selectedDate);
                        }
                      } else {
                        setSelectedFilter("DAILY");
                        setPickerMode("SINGLE");
                      }
                    }}
                    onRangeChange={(start, end) => {
                      setRangeStart(start);
                      setRangeEnd(end);
                      if (start && end) {
                        setShowDatePicker(false);
                      }
                    }}
                    onDateChange={(date) => {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      const defaultDate = activeBusinessDate || new Date().toISOString().split("T")[0];
                      if (pickerMode === "SINGLE") {
                        setSelectedDate(defaultDate);
                      } else if (pickerMode === "START") {
                        setRangeStart(defaultDate);
                      } else {
                        setRangeEnd(defaultDate);
                      }
                      setShowDatePicker(false);
                    }}
                    style={{ alignSelf: "center", marginTop: 15, paddingBottom: 5 }}
                  >
                    <Text style={{ color: Theme.primary, fontFamily: Fonts.black, fontSize: 13, textDecorationLine: "underline" }}>GO TO TODAY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  overlay: { flex: 1, paddingHorizontal: 16 },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  headerContent: { flex: 1 },
  dashboardYear: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 11,
    marginBottom: 2,
    letterSpacing: 2,
    textTransform: "uppercase",
    opacity: 0.8,
  },
  dashboardTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 23,
  },
  dashboardSubtitle: {
    color: Theme.textSecondary,
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    marginTop: 3,
  },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  filterMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.primary + "18",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Theme.primary + "35",
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtnLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  badgeText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  filterBar: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 5,
    backgroundColor: Theme.bgNav,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 12,
  },
  activeFilterBtn: {
    backgroundColor: Theme.primary,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  filterText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  activeFilterText: { color: "#fff" },
  dateControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  dateDisplay: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  dateText: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  rangeLabel: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    marginBottom: -2,
  },
  selectRangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.primary + "10",
    borderWidth: 1,
    borderColor: Theme.primary + "20",
    marginLeft: 4,
  },
  selectRangeText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 11,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  metricTile: {
    width: "48%",
    padding: 16,
    borderRadius: 20,
    borderLeftWidth: 4,
    backgroundColor: Theme.bgCard,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  tileLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
  tileValue: { fontFamily: Fonts.black, fontSize: 20 },
  reportSwitchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  reportSwitchBtn: {
    flex: 1,
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    ...Theme.shadowSm,
  },
  activeReportSwitchBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  reportSwitchText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  activeReportSwitchText: { color: "#fff" },
  detailReportCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  detailReportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  reportTitleContainer: { flex: 1, alignItems: "center" },
  reportHeaderActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2", // Light red background
    borderWidth: 1,
    borderColor: "#fecaca", // Light red border
  },
  reportSubText: {
    color: Theme.textMuted,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 4,
  },
  reportLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyReport: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  reportTable: {
    width: "100%",
    minWidth: 360,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.bgCard,
  },
  reportTableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  reportTableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  reportTableRowAlt: {
    backgroundColor: Theme.bgMain,
  },
  reportCell: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 11,
    textTransform: "uppercase",
    textAlign: "center",
  },
  reportCellText: {
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 13,
    textTransform: "none",
    textAlign: "center",
  },
  snoCell: {
    width: 45,
    textAlign: "center",
    flexShrink: 0,
  },
  dishNameCell: {
    minWidth: 150,
    flex: 2,
    textAlign: "center",
  },
  categoryNameCell: {
    minWidth: 120,
    flex: 1.5,
    textAlign: "center",
  },
  subCategoryNameCell: {
    minWidth: 100,
    flex: 1,
    textAlign: "center",
  },
  qtyCell: {
    width: 70,
    textAlign: "center",
    flexShrink: 0,
  },
  amountCell: {
    width: 130,
    textAlign: "right",
    flexShrink: 0,
  },
  paymodeCell: {
    minWidth: 100,
    flex: 1,
    textAlign: "left",
  },
  sysAmtCell: {
    width: 90,
    textAlign: "right",
    flexShrink: 0,
  },
  manualAmtCell: {
    width: 90,
    textAlign: "right",
    flexShrink: 0,
  },
  diffCell: {
    width: 80,
    textAlign: "right",
    flexShrink: 0,
  },
  chartsScrollContent: {
    paddingRight: 16,
    marginBottom: 12,
  },
  chartsContainer: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 12,
  },
  chartCard: {
    flex: 1,
    padding: 20,
    borderRadius: 24,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 6,
  },
  chartCardWide: { width: "100%" },
  chartCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  pieChartWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  pieDonutCenter: { alignItems: "center", justifyContent: "center", gap: 4 },
  pieDonutCenterLine: { textAlign: "center" },
  pieDonutCenterPct: { fontFamily: Fonts.black, fontSize: 13 },
  pieDonutCenterTag: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  emptyChartPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyChartText: {
    color: Theme.textMuted,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  orderTypeStats: { gap: 12 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  statLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  statIcon: { fontSize: 20 },
  statName: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
  statValue: { fontFamily: Fonts.black, fontSize: 16 },
  metricsStats: { gap: 10 },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  metricLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  metricValueSmall: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 15,
  },
  breakdownCard: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  breakdownItem: {
    minWidth: 95,
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: Theme.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  breakdownIcon: { fontSize: 26 },
  breakdownLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  breakdownValue: { fontFamily: Fonts.black, fontSize: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 13,
    letterSpacing: 1,
  },
  seeAllText: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 12 },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  txIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Theme.primary + "18",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.primary + "25",
  },
  txOrderInfo: { flex: 4, paddingRight: 10 },
  txTitle: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
  txSmall: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 10,
    marginTop: 3,
  },
  txTimeInfo: { flex: 2.7, alignItems: "center" },
  txDatetime: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
    textAlign: "center",
  },
  txRightInfo: {
    flex: 2.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  txAmount: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 15,
    minWidth: 55,
    textAlign: "right",
  },
  voidTag: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  voidTagText: { color: "#dc2626", fontSize: 10, fontFamily: Fonts.black },
  paidBadgeSmall: {
    backgroundColor: Theme.success + "20",
    padding: 5,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.success + "40",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalContent: {
    width: "92%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 14,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  modalSub: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 12,
  },
  itemsList: { maxHeight: 220 },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  orderItemQty: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
    width: 25,
  },
  orderItemName: {
    flex: 1,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  orderItemPrice: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  totalLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  totalValue: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 22 },
  doneBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  doneBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  qtyBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 32,
  },
  searchInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  inputErrorBorder: {
    borderColor: "#ef4444",
  },
  inputErrorText: {
    color: "#ef4444",
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 8,
  },
  emailSuggestionText: {
    color: Theme.primary,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 6,
    textDecorationLine: "underline",
  },
  premiumPrimaryBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    ...Theme.shadowMd,
  },
  premiumPrimaryBtnText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  premiumSecondaryBtn: {
    backgroundColor: Theme.primary + "10",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1.5,
    borderColor: Theme.primary + "20",
  },
  premiumSecondaryBtnText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: "row-reverse",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sidebarDismiss: { flex: 1 },
  sidebarContent: {
    width: 320,
    height: "100%",
    backgroundColor: Theme.bgCard,
    padding: 24,
    paddingTop: 60,
    borderLeftWidth: 1,
    borderLeftColor: Theme.border,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  sidebarTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  sidebarSection: { marginBottom: 24 },
  sectionLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 12,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeChip: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  chipText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  activeChipText: { color: "#fff" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeSortBtn: {
    backgroundColor: Theme.primary + "10",
    borderColor: Theme.primary,
  },
  sortText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  activeSortText: { color: Theme.primary },
  sidebarFooter: { marginTop: "auto", gap: 12 },
  applyBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  applyText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  resetBtn: { paddingVertical: 14, alignItems: "center" },
  resetText: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 12 },
  modeToggleBar: {
    flexDirection: "row",
    backgroundColor: Theme.bgNav,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  activeModeToggleBtn: {
    backgroundColor: Theme.bgCard,
    ...Theme.shadowSm,
  },
  modeToggleText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textMuted,
  },
  activeModeToggleText: {
    color: Theme.primary,
  },
  inRangeDay: {
    backgroundColor: Theme.primary + "20",
    borderRadius: 0,
  },
  customCalendar: {
    paddingTop: 5,
  },
  pickerGrid: {
    paddingVertical: 10,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  pickerTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  pickerSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    backgroundColor: Theme.primary + "10",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  pickerItem: {
    width: "30%",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: Theme.bgNav,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activePickerItem: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  pickerItemText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  activePickerItemText: {
    color: "#fff",
    fontFamily: Fonts.black,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  calendarMonthText: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  calendarWeekText: {
    flex: 1,
    textAlign: "center",
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  calendarRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    margin: 1,
  },
  calendarDayText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  selectedDay: {
    backgroundColor: Theme.primary,
    ...Theme.shadowSm,
  },
  selectedDayText: {
    color: "#fff",
    fontFamily: Fonts.black,
  },
  todayDay: {
    backgroundColor: Theme.primary + "10",
    borderWidth: 1,
    borderColor: Theme.primary + "30",
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  otherMonthDayText: {
    color: Theme.textMuted,
  },
  cancelledOrderBadge: {
    backgroundColor: Theme.danger + "08",
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1.2,
    borderColor: Theme.danger + "25",
    padding: 12,
  },
  cancelledBadgeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  cancelledBadgeText: {
    color: Theme.danger,
    fontFamily: Fonts.black,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cancelledReasonBadge: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cancelledReasonText: {
    color: Theme.danger,
    fontFamily: Fonts.extraBold,
    fontSize: 10,
  },
  cancelledDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Theme.danger + "15",
    paddingTop: 8,
  },
  cancelledDetailText: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  downloadModalContent: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 12,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.bgNav,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
  },
  downloadSectionCard: {
    backgroundColor: Theme.bgNav,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  downloadSectionLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 7,
    letterSpacing: 1,
    marginBottom: 6,
  },
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  periodBtn: {
    flex: 1,
    minWidth: '18%',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: Theme.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activePeriodBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  periodText: {
    fontSize: 8,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  activePeriodText: {
    color: '#fff',
    fontFamily: Fonts.black,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  dateInput: {
    flex: 1,
    padding: 6,
    borderRadius: 6,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeDateInput: {
    borderColor: Theme.primary,
  },
  dateInputLabel: {
    fontSize: 6,
    fontFamily: Fonts.black,
    color: Theme.textMuted,
    marginBottom: 0,
  },
  dateInputValue: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  downloadOptionCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  optionIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Theme.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 11,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  optionDesc: {
    fontSize: 8,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  premiumActionBtn: {
    height: 34,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadowMd,
  },
  premiumActionBtnText: {
    color: '#fff',
    fontFamily: Fonts.black,
    fontSize: 12,
  },
  emailInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.bgNav,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  inputIcon: {
    marginRight: 4,
  },
  modernEmailInput: {
    flex: 1,
    height: 32,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: Theme.textPrimary,
  },
  errorHint: {
    color: '#ef4444',
    fontSize: 9,
    fontFamily: Fonts.medium,
    marginLeft: 4,
    marginBottom: 6,
  },
  suggestionBox: {
    backgroundColor: Theme.primary + '08',
    padding: 6,
    borderRadius: 6,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: Theme.primary,
  },
  suggestionText: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
  },
  detailMergeContainer: {
    backgroundColor: '#fff7ed',
    borderColor: '#ffedd5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  detailMergeTitle: {
    color: '#ea580c',
    fontSize: 11,
    fontFamily: Fonts.black,
  },
  childBillBadge: {
    backgroundColor: '#ffedd5',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childBillBadgeText: {
    color: '#c2410c',
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  detailSplitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#dbeafe',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  detailSplitText: {
    color: '#2563eb',
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  modifierPillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginLeft: 8,
  },
  modifierPill: {
    backgroundColor: '#fafafa',
    borderColor: '#e4e4e7',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modifierPillText: {
    fontSize: 10,
    color: '#52525b',
    fontFamily: Fonts.semiBold,
  },
  mainFilterBar: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 8,
  },
  mainFilterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeMainFilterBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  mainFilterText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  activeMainFilterText: {
    color: '#fff',
    fontFamily: Fonts.black,
  },
});
