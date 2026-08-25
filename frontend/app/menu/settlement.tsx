import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useGeneralSettingsStore } from "../../stores/generalSettingsStore";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";
import API from "../../api";
import * as Print from "expo-print";
import { useFocusEffect, useRouter } from "expo-router";
import { socket } from "../../constants/socket";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSingaporeTimeTodayRange, formatToSingaporeDateTime } from "../../utils/timezoneHelper";


interface CustomDatePickerProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  selectedEndDate: Date;
  isRangeMode: boolean;
  onApply: (startDate: Date, endDate: Date, isRange: boolean) => void;
  title: string;
}

function CustomDatePicker({ visible, onClose, selectedDate, selectedEndDate, isRangeMode, onApply, title }: CustomDatePickerProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 640;

  const [viewDate, setViewDate] = useState(() => new Date(selectedDate));
  const [rangeStart, setRangeStart] = useState(() => new Date(selectedDate));
  const [rangeEnd, setRangeEnd] = useState<Date | null>(() => isRangeMode ? new Date(selectedEndDate) : null);
  const [localIsRangeMode, setLocalIsRangeMode] = useState(isRangeMode);

  // Sync state when selectedDate changes or modal opens
  useEffect(() => {
    if (visible) {
      setViewDate(new Date(selectedDate));
      setRangeStart(new Date(selectedDate));
      setRangeEnd(isRangeMode ? new Date(selectedEndDate) : null);
      setLocalIsRangeMode(isRangeMode);
    }
  }, [visible, selectedDate, selectedEndDate, isRangeMode]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Navigation handlers
  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // Days list computation
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const arr = [];
    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      arr.push({
        day: prevMonthDays - i,
        month: month === 0 ? 11 : month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false,
      });
    }
    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      arr.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true,
      });
    }
    // Next month padding
    const totalCells = arr.length;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      arr.push({
        day: i,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false,
      });
    }
    return arr;
  }, [year, month]);

  const handleDaySelect = (dayObj: typeof days[0]) => {
    const clickedDate = new Date(dayObj.year, dayObj.month, dayObj.day);
    clickedDate.setHours(0, 0, 0, 0);

    if (!localIsRangeMode) {
      setRangeStart(clickedDate);
      setRangeEnd(null);
    } else {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(clickedDate);
        setRangeEnd(null);
      } else {
        if (clickedDate < rangeStart) {
          setRangeStart(clickedDate);
          setRangeEnd(null);
        } else {
          setRangeEnd(clickedDate);
        }
      }
    }
  };

  const handleApply = () => {
    const finalStart = new Date(rangeStart);
    finalStart.setHours(0, 0, 0, 0);
    const finalEnd = rangeEnd ? new Date(rangeEnd) : new Date(finalStart);
    finalEnd.setHours(0, 0, 0, 0);
    onApply(finalStart, finalEnd, localIsRangeMode);
    onClose();
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.modalContainer, { width: isTablet ? 360 : '90%', padding: 16 }]}>
          {/* Header */}
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>{title}</Text>
            <TouchableOpacity style={pickerStyles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color="#44403C" />
            </TouchableOpacity>
          </View>

          {/* Mode Selector */}
          <View style={{ flexDirection: 'row', backgroundColor: Theme.bgInput, borderRadius: 12, padding: 4, marginBottom: 16 }}>
            <TouchableOpacity 
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: !localIsRangeMode ? '#f97316' : 'transparent', borderRadius: 8 }}
              onPress={() => {
                setLocalIsRangeMode(false);
                setRangeEnd(null);
              }}
            >
              <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: !localIsRangeMode ? '#fff' : Theme.textSecondary }}>Single Date</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: localIsRangeMode ? '#f97316' : 'transparent', borderRadius: 8 }}
              onPress={() => {
                setLocalIsRangeMode(true);
              }}
            >
              <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: localIsRangeMode ? '#fff' : Theme.textSecondary }}>Date Range</Text>
            </TouchableOpacity>
          </View>

          {/* Calendar */}
          <View style={{ width: '100%' }}>
            {/* Calendar Navigator */}
            <View style={pickerStyles.calNavigator}>
              <TouchableOpacity onPress={prevMonth} style={pickerStyles.navBtn}>
                <Ionicons name="chevron-back" size={16} color="#44403C" />
              </TouchableOpacity>
              <Text style={pickerStyles.monthYearText}>{monthNames[month]} {year}</Text>
              <TouchableOpacity onPress={nextMonth} style={pickerStyles.navBtn}>
                <Ionicons name="chevron-forward" size={16} color="#44403C" />
              </TouchableOpacity>
            </View>

            {/* Weekdays Row */}
            <View style={pickerStyles.weekdaysRow}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((wd, i) => (
                <Text key={i} style={pickerStyles.weekdayText}>{wd}</Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={pickerStyles.daysGrid}>
              {days.map((dObj, idx) => {
                const currentDate = new Date(dObj.year, dObj.month, dObj.day);
                currentDate.setHours(0, 0, 0, 0);

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isFuture = currentDate > today;

                let isSelected = false;
                let isInRange = false;
                let isStart = false;
                let isEnd = false;

                if (!localIsRangeMode) {
                  isSelected = rangeStart && 
                    rangeStart.getDate() === dObj.day &&
                    rangeStart.getMonth() === dObj.month &&
                    rangeStart.getFullYear() === dObj.year;
                } else {
                  isStart = rangeStart && 
                    rangeStart.getDate() === dObj.day &&
                    rangeStart.getMonth() === dObj.month &&
                    rangeStart.getFullYear() === dObj.year;
                  
                  isEnd = !!(rangeEnd && 
                    rangeEnd.getDate() === dObj.day &&
                    rangeEnd.getMonth() === dObj.month &&
                    rangeEnd.getFullYear() === dObj.year);
                  
                  isSelected = isStart || isEnd;

                  if (rangeStart && rangeEnd) {
                    isInRange = currentDate > rangeStart && currentDate < rangeEnd;
                  }
                }

                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => !isFuture && handleDaySelect(dObj)}
                    disabled={isFuture}
                    style={[
                      pickerStyles.dayBtn,
                      isSelected && pickerStyles.dayBtnSelected,
                      isInRange && { backgroundColor: '#f9731620', borderRadius: 0 },
                      isFuture && { opacity: 0.3 }
                    ]}
                  >
                    <Text style={[
                      pickerStyles.dayText,
                      (!dObj.isCurrentMonth || isFuture) && pickerStyles.dayTextInactive,
                      isSelected && pickerStyles.dayTextSelected
                    ]}>
                      {dObj.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Footer Actions */}
          <View style={pickerStyles.footer}>
            <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose}>
              <Text style={pickerStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pickerStyles.applyBtn} onPress={handleApply}>
              <Text style={pickerStyles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalContainer: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    width: 620,
    maxWidth: '95%',
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      }
    }) as any,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayBtn: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 8,
  },
  dayBtnSelected: {
    backgroundColor: '#f97316', // Orange theme
  },
  dayText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  dayTextInactive: {
    color: '#D1D5DB',
  },
  dayTextSelected: {
    color: '#fff',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  timePanel: {
    width: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTimeTitle: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 16,
  },
  timePickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  timeBlock: {
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 2,
  },
  timeInputBox: {
    width: 50,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeValueText: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  timeSeparator: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginTop: -18,
  },
  ampmBtn: {
    width: 60,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22, // align with inputs vertically
  },
  ampmBtnActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  ampmBtnTextActive: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: '#f97316',
  },
  timeLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    marginTop: 4,
  },
  summaryCard: {
    width: '100%',
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#f97316',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F5F5F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#44403C',
  },
  applyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#fff',
  },
});

export default function SettlementScreen() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const enableCashDrawer = useGeneralSettingsStore(state => state.settings.enableCashDrawer);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<string>("");
  const [showLov, setShowLov] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const executeDayEnd = async () => {
    setLoading(true);
    try {
      const res = await API.post("/settlement/day-end", {
        username: user?.userName || "admin",
        businessDate: getLocalDateStr(selectedDate)
      });
      const data = res.data;
      if (data.success) {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        await AsyncStorage.removeItem("selected_business_date");
        fetchData();
        showToast({
          type: "success",
          message: "Day Ended Successfully",
          subtitle: "Report generated and business day closed."
        });
        router.replace("/(tabs)/category"); // Go back to Category
      } else {
        showToast({
          type: "error",
          message: "Day End Failed",
          subtitle: data.error || "Failed to complete Day End."
        });
      }
    } catch (err: any) {
      console.error("Day End Error:", err);
      showToast({
        type: "error",
        message: "Day End Failed",
        subtitle: err.response?.data?.error || err.message || "Failed to connect to the server."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDayEnd = () => {
    if (!dayLog || !dayLog.StartedAt) {
      showToast({
        type: "warning",
        message: "Day Not Started",
        subtitle: "Please press Day Start before performing Day End."
      });
      return;
    }
    if (dayLog.EndedAt) {
      showToast({
        type: "warning",
        message: "Day Already Ended",
        subtitle: "The business day for this date has already been ended."
      });
      return;
    }
    setShowConfirmModal(true);
  };

  const [totalSales, setTotalSales] = useState<any>({});
  const [payments, setPayments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  // Cash Out State
  const [cashOutEntries, setCashOutEntries] = useState<any[]>([]);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showCashBoxModal, setShowCashBoxModal] = useState(false);
  const [cashOutForm, setCashOutForm] = useState({
    CashOutId: '',
    Amount: '',
    Reason: '',
    Remarks: '',
    PaymentMode: 'Cash',
    ReferenceNo: '',
    AttachmentUrl: ''
  });

  const [uploading, setUploading] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [showAllMediaModal, setShowAllMediaModal] = useState(false);

  // Cash In State
  const [cashInEntries, setCashInEntries] = useState<any[]>([]);
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [cashInForm, setCashInForm] = useState({
    CashInId: '',
    Amount: '',
    Reason: '',
    Remarks: '',
    PaymentMode: 'Cash',
    ReferenceNo: '',
    AttachmentUrl: ''
  });

  // Cash Box State
  const [cashBoxEntries, setCashBoxEntries] = useState<any[]>([]);
  const [cashBoxForm, setCashBoxForm] = useState({
    ArtistName: '',
    Amount: '',
    CashBoxId: ''
  });
  
  // Generic Confirm State
  const [genericConfirm, setGenericConfirm] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Supervisor Password Verification State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordAction, setPasswordAction] = useState<{
    onSuccess: () => void;
    title: string;
    description: string;
    role: string;
  } | null>(null);

  const promptPassword = (title: string, description: string, role: string, onSuccess: () => void) => {
    setPasswordValue("");
    setPasswordAction({ onSuccess, title, description, role });
    setShowPasswordModal(true);
  };
  const [lovMode, setLovMode] = useState<"OPEN" | "CLOSE">("OPEN");

  const [openingCash, setOpeningCash] = useState<string>("0");

  const [dishList, setDishList] = useState<any[]>([]);
  const [showDishLov, setShowDishLov] = useState(false);
  const [artistSearch, setArtistSearch] = useState("");

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const { from } = getSingaporeTimeTodayRange();
    return from;
  });
  const [selectedEndDate, setSelectedEndDate] = useState<Date>(() => {
    const { from } = getSingaporeTimeTodayRange();
    return from;
  });
  const [isRangeMode, setIsRangeMode] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dayLog, setDayLog] = useState<{ StartedAt: string | null; StartedBy: string | null; EndedAt: string | null; EndedBy: string | null } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const userId = user?.userId || "0";

  // Hardcoded denominations
  const denominations = [100.00, 50.00, 20.00, 10.00, 5.00, 2.00, 1.00, 0.50, 0.20, 0.10, 0.05, 0.01];

  const initialCounts: Record<string, string> = {
    "100.00": "", "50.00": "", "20.00": "", "10.00": "", "5.00": "", "2.00": "",
    "1.00": "", "0.50": "", "0.20": "", "0.10": "", "0.05": "", "0.01": ""
  };

  const [openingCounts, setOpeningCounts] = useState<Record<string, string>>(initialCounts);
  const [closingCounts, setClosingCounts] = useState<Record<string, string>>(initialCounts);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const getLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const formatDateTime = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const h = hours.toString().padStart(2, '0');
    return `${d}-${m}-${y} ${h}:${minutes} ${ampm}`;
  };

  // Uses the app-wide Singapore-time helper so timestamps always reflect SGT (UTC+8)
  // regardless of the device's local timezone.
  const formatTimeOnly = (isoStr: string | null): string => {
    if (!isoStr) return "N/A";
    return formatToSingaporeDateTime(isoStr); // e.g. "22 Jul • 09:05 PM"
  };

  const handleCountChange = (denomStr: string, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    if (lovMode === "OPEN") {
      setOpeningCounts(prev => ({ ...prev, [denomStr]: cleaned }));
    } else {
      setClosingCounts(prev => ({ ...prev, [denomStr]: cleaned }));
    }
  };

  const computeTotal = (counts: Record<string, string>) => Object.entries(counts).reduce((sum, [denom, count]) => {
    const val = parseFloat(denom);
    const qty = parseInt(count, 10) || 0;
    return sum + val * qty;
  }, 0);

  const totalOpening = computeTotal(openingCounts);
  const totalClosing = computeTotal(closingCounts);

  useEffect(() => {
    const initScreen = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch active day
        let initialDate = new Date();
        try {
          const res = await API.get(`/settlement/active-day`);
          if (res.data?.success && res.data?.active && res.data?.startDate) {
            const parts = res.data.startDate.split("-");
            if (parts.length === 3) {
              initialDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            } else {
              initialDate = new Date(res.data.startDate);
            }
          } else {
            const { from } = getSingaporeTimeTodayRange();
            initialDate = from;
          }
        } catch (err) {
          console.error("Error fetching active day:", err);
          const { from } = getSingaporeTimeTodayRange();
          initialDate = from;
        }

        // 2. Fetch terminals
        let initialTerminal = "ALL";
        try {
          const res = await API.get(`/settlement/terminals`);
          const termData = res.data || [];
          setTerminals(termData);
          if (termData.length > 0) {
            initialTerminal = termData[0].TerminalCode;
          }
        } catch (err) {
          console.error("❌ TERMINAL LOAD ERROR", err);
        }

        // 3. Fetch dishes
        try {
          const res = await API.get(`/settlement/artist-list`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setDishList(res.data.data || []);
        } catch (err) {
          console.error("Error loading dishes:", err);
        }

        // 4. Fetch settings
        await useGeneralSettingsStore.getState().fetchSettings();

        // Set states back-to-back
        setSelectedDate(initialDate);
        setSelectedEndDate(initialDate);
        setSelectedTerminal(initialTerminal);

      } catch (err) {
        console.error("Init screen error:", err);
      } finally {
        setLoading(false);
      }
    };

    initScreen();
  }, []);

const fetchDayHistory = async () => {
  try {
    setLoadingHistory(true);
    const res = await API.get(`/settlement/day-history`);
    if (res.data?.success) {
      setHistoryLogs(res.data.data || []);
    } else {
      setHistoryLogs([]);
    }
  } catch (err) {
    console.error("Error fetching day history:", err);
    setHistoryLogs([]);
  } finally {
    setLoadingHistory(false);
  }
};

  useEffect(() => {
    if (selectedTerminal) fetchData();
  }, [selectedTerminal, selectedDate, selectedEndDate, isRangeMode]);

  // Re-fetch every time this screen comes into focus (fixes stale data on navigate)
  useFocusEffect(
    useCallback(() => {
      if (selectedTerminal) fetchData();
    }, [selectedTerminal, selectedDate, selectedEndDate, isRangeMode])
  );

  // Socket-based instant sync: re-fetch when a settlement action or sale completes
  useEffect(() => {
    const handleSettlementUpdate = () => {
      if (selectedTerminal) fetchData();
    };
    socket.on('settlement_updated', handleSettlementUpdate);
    socket.on('order_closed', handleSettlementUpdate);
    return () => {
      socket.off('settlement_updated', handleSettlementUpdate);
      socket.off('order_closed', handleSettlementUpdate);
    };
  }, [selectedTerminal, selectedDate, selectedEndDate, isRangeMode]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const dateStr = getLocalDateStr(selectedDate); // e.g. "2026-07-22"
      const endDateStr = isRangeMode ? getLocalDateStr(selectedEndDate) : dateStr;

      const totalRes = await API.get(`/settlement/total-sales/${selectedTerminal}?fromDate=${dateStr}&toDate=${endDateStr}`).catch(() => ({ data: {} }));
      const payRes = await API.get(`/settlement/payment/${selectedTerminal}/${userId}?fromDate=${dateStr}&toDate=${endDateStr}`).catch(() => ({ data: [] }));
      const transRes = await API.get(`/settlement/transactions/${selectedTerminal}/${userId}?fromDate=${dateStr}&toDate=${endDateStr}`).catch(() => ({ data: [] }));
      const salesRes = await API.get(`/settlement/sales-summary/${selectedTerminal}?fromDate=${dateStr}&toDate=${endDateStr}`).catch(() => ({ data: [] }));

      const outId = selectedTerminal === "ALL" ? 1 : selectedTerminal;
      const openRes = await API.get(`/settlement/opening-cash?outletId=${outId}&date=${dateStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const denomsRes = await API.get(`/settlement/denominations?type=OPEN&date=${dateStr}&screenType=CB`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const closeDenomsRes = await API.get(`/settlement/denominations?type=CLOSE&date=${dateStr}&screenType=CB`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const cashOutRes = await API.get(`/settlement/cash-out/${selectedTerminal}?fromDate=${dateStr}&toDate=${endDateStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const cashInRes = await API.get(`/settlement/cash-in/${selectedTerminal}?fromDate=${dateStr}&toDate=${endDateStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const cashBoxRes = await API.get(`/settlement/artist-cashbox?fromDate=${dateStr}&toDate=${endDateStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const dayLogRes = await API.get(`/settlement/day-log?date=${dateStr}`).catch(() => ({ data: null }));

      setTotalSales(totalRes.data || {});
      setPayments(payRes.data || []);
      setTransactions(transRes.data || []);
      setSales(salesRes.data || []);
      setCashOutEntries(cashOutRes.data?.data || []);
      setCashInEntries(cashInRes.data?.data || []);
      setCashBoxEntries(cashBoxRes.data?.data || []);
      setDayLog(dayLogRes.data?.data || null);

      if (openRes.data?.data?.total) {
        setOpeningCash(openRes.data.data.total.toString());
      } else if (openRes.data?.total) {
        setOpeningCash(openRes.data.total.toString());
      } else {
        setOpeningCash("0");
      }

      if (denomsRes.data?.success && Array.isArray(denomsRes.data.data)) {
        const newCounts: Record<string, string> = { ...initialCounts };
        denomsRes.data.data.forEach((d: any) => {
          const valStr = parseFloat(d.CurrencyValue).toFixed(2);
          if (newCounts[valStr] !== undefined) {
            newCounts[valStr] = d.NoteCount > 0 ? d.NoteCount.toString() : "";
          }
        });
        setOpeningCounts(newCounts);
      }

      if (closeDenomsRes.data?.success && Array.isArray(closeDenomsRes.data.data)) {
        const newCounts: Record<string, string> = { ...initialCounts };
        closeDenomsRes.data.data.forEach((d: any) => {
          const valStr = parseFloat(d.CurrencyValue).toFixed(2);
          if (newCounts[valStr] !== undefined) {
            newCounts[valStr] = d.NoteCount > 0 ? d.NoteCount.toString() : "";
          }
        });
        setClosingCounts(newCounts);
      }
    } catch (err) {
      console.error("❌ FETCH DATA ERROR", err);
      Alert.alert("Error", "Failed to load settlement data.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: any) => {
    const val = parseFloat(amount);
    if (isNaN(val)) return "0.00";
    return val.toFixed(2);
  };

  const netSales = parseFloat(totalSales.NetTotal) || 0;

  const salesTotal = sales.reduce((sum, s) => sum + (parseFloat(s.Amount) || 0), 0);
  const paymentsTotal = payments.reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);
  const displayOpeningAmount = totalOpening > 0 ? totalOpening : (parseFloat(openingCash) || 0);
  const totalCashOut = cashOutEntries.reduce((sum, entry) => sum + (parseFloat(entry.Amount) || 0), 0);
  const totalCashInEntries = cashInEntries.reduce((sum, entry) => sum + (parseFloat(entry.Amount) || 0), 0);
  const totalCashBoxEntries = cashBoxEntries.reduce((sum, entry) => sum + (parseFloat(entry.Amount) || 0), 0);
  const cashBoxTotal = payments
    .filter(p => p.PaymodeName?.toUpperCase().includes("CASH BOX") || p.PaymodeName?.toUpperCase().includes("CASHBOX"))
    .reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);

  const baseTransactionsTotal = transactions.reduce((sum, t) => {
    const amt = parseFloat(t.Amount) || 0;
    return sum + (t.TransactionType === "IN" ? amt : -amt);
  }, 0);

  const transactionsTotal = baseTransactionsTotal + displayOpeningAmount - totalCashOut + totalCashInEntries;

  const normalCashSales = payments
    .filter(p => {
      const name = p.PaymodeName?.toUpperCase();
      return name === 'CASH' || name === 'CASHBOX' || name === 'CASH BOX';
    })
    .reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);

  const cashBoxEntrySales = 0;

  const salesCash = normalCashSales;

  const dbHasCashSalesInCashIn = cashInEntries.some(entry => entry.Reason === 'Cash Sale');

  const cashInTransactionsSum = transactions.filter(t => t.TransactionType === "IN").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);
  const cashOutTransactionsSum = transactions.filter(t => t.TransactionType === "OUT").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);

  const displayManualCashIn = dbHasCashSalesInCashIn
    ? Math.max(0, totalCashInEntries - salesCash)
    : totalCashInEntries;

  const displayCashInCard = dbHasCashSalesInCashIn
    ? totalCashInEntries + cashInTransactionsSum
    : totalCashInEntries + salesCash + cashInTransactionsSum;

  const displayCashOutCard = totalCashOut + cashOutTransactionsSum;

  const totalCashIn = salesCash + displayOpeningAmount + displayManualCashIn + cashInTransactionsSum;

  const totalCashOutSum = totalCashOut + cashOutTransactionsSum;

  const nonCashTotal = payments
    .filter(p => {
      const name = p.PaymodeName?.toUpperCase() || "";
      return name !== 'CASH' && name !== 'CASHBOX' && name !== 'CASH BOX';
    })
    .reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);

  const sysCash = totalCashIn - totalCashOutSum;

  const handleFinalize = async () => {
    try {
      setLoading(true);
      const token = await useAuthStore.getState().token;
      if (!token) {
        Alert.alert("Error", "No authentication token found. Please login again.");
        return;
      }

      const sumByMode = (mode: string) => payments.filter(p => p.PaymodeName?.trim().toUpperCase() === mode).reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);

      const payload = {
        outletId: 1, // Fallback, backend handles this based on user
        settlementDate: getLocalDateStr(selectedDate),
        cashierName: user?.userName || "Admin",
        totalSales: totalSales.SubTotal || 0,
        totalDiscount: totalSales.DiscountAmount || 0,
        voidAmount: 0,
        netSales: netSales,
        cashReceived: totalClosing,
        expectedClosing: sysCash,
        variance: totalClosing - sysCash,
        varianceStatus: totalClosing === sysCash ? "BALANCED" : (totalClosing > sysCash ? "SURPLUS" : "SHORTAGE"),
        openingCash: displayOpeningAmount,
        cashAmount: totalClosing,
        cardAmount: sumByMode('CARD'),
        upiAmount: sumByMode('UPI'),
        paynowAmount: sumByMode('PAYNOW'),
        valueCardAmount: sumByMode('VALUE CARD'),
      };

      const res = await API.post(`/settlement/finalize`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        Alert.alert("Success", "Settlement finalized successfully!");
        router.back();
      } else {
        Alert.alert("Error", res.data.error || "Failed to finalize settlement");
      }
    } catch (err: any) {
      console.error("❌ FINALIZE ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to finalize settlement");
    } finally {
      setLoading(false);
    }
  };

  const handleClearDenominations = () => {
    if (lovMode === "OPEN") {
      setOpeningCounts(initialCounts);
    } else {
      setClosingCounts(initialCounts);
    }
  };

  const handleSaveDenominations = async () => {
    try {
      setLoading(true);
      const counts = lovMode === "OPEN" ? openingCounts : closingCounts;
      const denomsPayload = Object.entries(counts).map(([denom, count]) => ({
        value: parseFloat(denom),
        count: parseInt(count, 10) || 0
      }));

      const dateStr = getLocalDateStr(selectedDate);
      const outId = selectedTerminal === "ALL" ? 1 : selectedTerminal;

      const res = await API.post(`/settlement/save-denominations`, {
        denominations: denomsPayload,
        type: lovMode,
        date: dateStr,
        outletId: outId,
        screenType: 'CB'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        if (lovMode === "OPEN") {
          setOpeningCash(totalOpening.toString());
        }
        setShowLov(false);
        Alert.alert("Success", `${lovMode === "OPEN" ? "Opening" : "Closing"} cash denominations saved.`);
      } else {
        Alert.alert("Error", res.data.error || "Failed to save denominations");
      }
    } catch (err: any) {
      console.error("❌ SAVE DENOMINATIONS ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to save denominations");
    } finally {
      setLoading(false);
    }
  };

  const executeSaveCashOut = async () => {
    try {
      setLoading(true);
      const payload = {
        amount: parseFloat(cashOutForm.Amount),
        reason: cashOutForm.Reason,
        remarks: cashOutForm.Remarks,
        paymentMode: cashOutForm.PaymentMode,
        referenceNo: cashOutForm.ReferenceNo,
        terminalCode: selectedTerminal === "ALL" ? "" : selectedTerminal,
        date: getLocalDateStr(selectedDate),
        attachmentUrl: cashOutForm.AttachmentUrl || null
      };

      let res;
      if (cashOutForm.CashOutId) {
        res = await API.put(`/settlement/cash-out/${cashOutForm.CashOutId}`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      } else {
        res = await API.post(`/settlement/cash-out`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      }

      if (res.data.success) {
        setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '', AttachmentUrl: '' });
        setShowCashOutModal(false);
        fetchData();
        Alert.alert("Success", "Cash Out entry saved");
      }
    } catch (err: any) {
      console.error("❌ SAVE CASH OUT ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to save cash out entry");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCashOut = () => {
    if (!cashOutForm.Amount || parseFloat(cashOutForm.Amount) <= 0) {
      Alert.alert("Validation", "Please enter a valid amount");
      return;
    }
    if (cashOutForm.CashOutId) {
      promptPassword(
        "Edit Cash Out",
        "Enter Admin password to modify this Cash Out entry",
        "ADMIN",
        executeSaveCashOut
      );
    } else {
      executeSaveCashOut();
    }
  };

  const handleSelectImage = async (mode: 'camera' | 'library') => {
    try {
      let permissionResult;
      if (mode === 'camera') {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permissionResult.granted) {
        Alert.alert("Permission Denied", `We need access to your ${mode === 'camera' ? 'camera' : 'photo library'} to upload receipts.`);
        return;
      }

      const pickerResult = mode === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.3,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.3,
          });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const fileUri = pickerResult.assets[0].uri;
      await handleUploadImage(fileUri);
    } catch (err) {
      console.error("❌ SELECT IMAGE ERROR", err);
      Alert.alert("Error", "Failed to select image");
    }
  };

  const handleUploadImage = async (fileUri: string) => {
    try {
      setUploading(true);
      const formData = new FormData();

      if (Platform.OS === 'web') {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        formData.append('image', blob, 'receipt.png');
      } else {
        const filename = fileUri.split('/').pop() || 'receipt.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append('image', {
          uri: fileUri,
          name: filename,
          type,
        } as any);
      }

      const response = await API.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${useAuthStore.getState().token}`,
        },
      });

      if (response.data && response.data.success) {
        if (showCashInModal) {
          setCashInForm(prev => ({ ...prev, AttachmentUrl: response.data.imageUrl }));
        } else {
          setCashOutForm(prev => ({ ...prev, AttachmentUrl: response.data.imageUrl }));
        }
        Alert.alert("Success", "Receipt uploaded successfully!");
      } else {
        Alert.alert("Upload Failed", "Could not upload image to server.");
      }
    } catch (err: any) {
      console.error("❌ UPLOAD IMAGE ERROR", err);
      Alert.alert("Error", "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const executeSaveCashIn = async () => {
    try {
      setLoading(true);
      const payload = {
        amount: parseFloat(cashInForm.Amount),
        reason: cashInForm.Reason,
        remarks: cashInForm.Remarks,
        paymentMode: cashInForm.PaymentMode,
        referenceNo: cashInForm.ReferenceNo,
        terminalCode: selectedTerminal === "ALL" ? "" : selectedTerminal,
        date: getLocalDateStr(selectedDate),
        attachmentUrl: cashInForm.AttachmentUrl || null
      };

      let res;
      if (cashInForm.CashInId) {
        res = await API.put(`/settlement/cash-in/${cashInForm.CashInId}`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      } else {
        res = await API.post(`/settlement/cash-in`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      }

      if (res.data.success) {
        setCashInForm({ CashInId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '', AttachmentUrl: '' });
        setShowCashInModal(false);
        fetchData();
        Alert.alert("Success", "Cash In entry saved");
      }
    } catch (err: any) {
      console.error("❌ SAVE CASH IN ERROR", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to save cash in entry");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCashIn = () => {
    if (!cashInForm.Amount || parseFloat(cashInForm.Amount) <= 0) {
      Alert.alert("Validation", "Please enter a valid amount");
      return;
    }
    if (cashInForm.CashInId) {
      promptPassword(
        "Edit Cash In",
        "Enter Admin password to modify this Cash In entry",
        "ADMIN",
        executeSaveCashIn
      );
    } else {
      executeSaveCashIn();
    }
  };

  const executeSaveCashBox = async () => {
    try {
      setLoading(true);

      if (cashBoxForm.CashBoxId) {
        await API.delete(`/settlement/artist-cashbox/${cashBoxForm.CashBoxId}`, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      }

      await API.post(
        `/settlement/artist-cashbox`,
        {
          ArtistName: cashBoxForm.ArtistName,
          Amount: parseFloat(cashBoxForm.Amount)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      Alert.alert("Success", "Cash Box Saved");

      setCashBoxForm({
        ArtistName: "",
        Amount: "",
        CashBoxId: ""
      });

      setShowCashBoxModal(false);
      fetchData();

    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCashBox = () => {
    if (!cashBoxForm.ArtistName || !cashBoxForm.Amount || parseFloat(cashBoxForm.Amount) <= 0) {
      Alert.alert("Validation", "Artist name and valid amount are required");
      return;
    }
    if (cashBoxForm.CashBoxId) {
      promptPassword(
        "Edit Cash Box",
        "Enter Admin password to modify this Artist Cashbox entry",
        "ADMIN",
        executeSaveCashBox
      );
    } else {
      executeSaveCashBox();
    }
  };

  const executeDeleteCashBox = async (id: string) => {
    try {
      setLoading(true);
      const res = await API.delete(`/settlement/artist-cashbox/${id}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
      });
      if (res.data.success) {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to delete entry");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCashBox = (id: string) => {
    if (!id) return;
    setGenericConfirm({
      visible: true,
      title: "Delete Cash Box",
      message: "Are you sure you want to delete this artist cashbox entry?",
      onConfirm: () => {
        setGenericConfirm(prev => ({ ...prev, visible: false }));
        promptPassword(
          "Delete Cash Box",
          "Enter Admin/Void password to delete this Artist Cashbox entry",
          "Void,ADMIN",
          () => executeDeleteCashBox(id)
        );
      }
    });
  };

  const executeDeleteCashOut = async (id: string) => {
    try {
      setLoading(true);
      const res = await API.delete(`/settlement/cash-out/${id}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
      });
      if (res.data.success) {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to delete entry");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCashOut = (id: string) => {
    if (!id) return;
    setGenericConfirm({
      visible: true,
      title: "Delete Cash Out",
      message: "Are you sure you want to delete this cash out entry?",
      onConfirm: () => {
        setGenericConfirm(prev => ({ ...prev, visible: false }));
        promptPassword(
          "Delete Cash Out",
          "Enter Admin/Void password to delete this Cash Out entry",
          "Void,ADMIN",
          () => executeDeleteCashOut(id)
        );
      }
    });
  };

  const executeDeleteCashIn = async (id: string) => {
    try {
      setLoading(true);
      const res = await API.delete(`/settlement/cash-in/${id}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
      });
      if (res.data.success) {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to delete entry");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCashIn = (id: string) => {
    if (!id) return;
    setGenericConfirm({
      visible: true,
      title: "Delete Cash In",
      message: "Are you sure you want to delete this cash in entry?",
      onConfirm: () => {
        setGenericConfirm(prev => ({ ...prev, visible: false }));
        promptPassword(
          "Delete Cash In",
          "Enter Admin/Void password to delete this Cash In entry",
          "Void,ADMIN",
          () => executeDeleteCashIn(id)
        );
      }
    });
  };

   const handlePrintReport = async () => {
    try {
      // 1. Fetch Cashier Printer IP from settings
      let cashierIp = "";
      try {
        const response = await fetch(`${API_URL}/api/settings/kitchen-printers`);
        const printers = await response.json();
        if (Array.isArray(printers)) {
          const cashierPrinter = printers.find((p: any) => p.PrinterType === 1);
          cashierIp = cashierPrinter?.PrinterPath || "";
        }
      } catch (err) {
        console.warn("Failed to fetch printer IP from settings:", err);
      }

      // Helper function for robust reachability check
      const checkIpReachable = async (ip: string, port = 80, timeoutMs = 600): Promise<boolean> => {
        if (!ip || ip.trim() === "") return false;
        const cleanIp = ip.trim();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          await fetch(`http://${cleanIp}:${port}`, {
            method: "GET",
            signal: controller.signal,
            mode: "no-cors",
            headers: { "Cache-Control": "no-cache" }
          });
          clearTimeout(timer);
          return true;
        } catch (err: any) {
          clearTimeout(timer);
          if (err.name === "AbortError") {
            return false;
          }
          return true; // Connection refused/other error means host is online
        }
      };

      const businessDateStr = isRangeMode
        ? `${selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${selectedEndDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
        : selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const cashInTotalSum = totalCashInEntries + transactions.filter(t => t.TransactionType === "IN").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);

      const aggregatedPayments: { PaymodeName: string; Amount: number }[] = [];
      const tempAgg: Record<string, { PaymodeName: string; Amount: number }> = {};
      payments.forEach(p => {
        const rawName = p.PaymodeName || "Unknown";
        const name = rawName.trim();
        const key = name.toUpperCase();
        const amt = parseFloat(p.Amount) || 0;
        if (tempAgg[key]) {
          tempAgg[key].Amount += amt;
        } else {
          tempAgg[key] = { PaymodeName: name, Amount: amt };
        }
      });
      aggregatedPayments.push(...Object.values(tempAgg));

      // 2. Format HTML aligned to 80mm width with centered print-out look
      const html = `
        <html>
          <head>
            <style>
              @page { margin: 0; size: 80mm auto; }
              * { box-sizing: border-box; }
              body { 
                font-family: 'Courier New', Courier, monospace; 
                width: 100%; 
                margin: 0; 
                padding: 0; 
                color: #000; 
                background-color: #f3f4f6; 
                display: flex;
                justify-content: center;
                align-items: flex-start;
                -webkit-print-color-adjust: exact; print-color-adjust: exact;
              }
              .report-wrapper {
                width: 80mm;
                padding: 6mm;
                margin: 20px auto;
                background-color: #fff;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
                font-size: 13px;
                line-height: 1.3;
              }
              @media print {
                body {
                  background-color: #fff;
                }
                .report-wrapper {
                  margin: 0 auto;
                  box-shadow: none;
                  padding: 4mm;
                }
              }
              .title { text-align: center; font-size: 16px; font-weight: bold; margin: 5px 0; text-transform: uppercase; }
              .section-title { text-align: center; font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 5px 0; }
              .divider { text-align: center; font-weight: bold; margin: 2px 0; }
              .info-block { margin: 15px 0; font-size: 13px; }
              .info-row { margin-bottom: 2px; }
              table { width: 100%; border-collapse: collapse; margin: 10px 0; }
              td { padding: 3px 0; font-size: 13px; vertical-align: top; }
              .right { text-align: right; }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .line-divider { border-bottom: 1px dashed #000; margin: 5px 0; }
            </style>
          </head>
          <body>
            <div class="report-wrapper">
              <div class="divider">========================================</div>
              <div class="title">SETTLEMENT REPORT</div>
              <div class="divider">========================================</div>
              
              <div class="info-block">
                <div class="bold">Business Date:</div>
                <div class="info-row">${businessDateStr}</div>
                <br/>
                <div class="bold">Generated:</div>
                <div class="info-row">${formatDateTime(new Date())}</div>
              </div>

              <div class="divider">========================================</div>
              <div class="section-title">SALES SUMMARY</div>
              <div class="divider">========================================</div>
              <table>
                <tr>
                  <td>Gross Sales</td>
                  <td class="right">${formatCurrency(totalSales.SubTotal)}</td>
                </tr>
                <tr>
                  <td>Discount</td>
                  <td class="right">${formatCurrency(totalSales.DiscountAmount)}</td>
                </tr>
                <tr>
                  <td>Service Charge</td>
                  <td class="right">${formatCurrency(totalSales.ServiceCharge)}</td>
                </tr>
                <tr>
                  <td>GST Collected</td>
                  <td class="right">${formatCurrency(totalSales.TotalTax)}</td>
                </tr>

                <tr>
                  <td>Round Off</td>
                  <td class="right">${formatCurrency(totalSales.RoundedBy)}</td>
                </tr>
                <tr>
                  <td>Tips</td>
                  <td class="right">${formatCurrency(totalSales.Tips)}</td>
                </tr>
                <tr>
                  <td colspan="2"><div class="line-divider"></div></td>
                </tr>
                <tr class="bold">
                  <td>NET SALES</td>
                  <td class="right">${formatCurrency(netSales)}</td>
                </tr>
              </table>

              <div class="divider">========================================</div>
              <div class="section-title">PAYMENT COLLECTION</div>
              <div class="divider">========================================</div>
              <table>
                ${aggregatedPayments.map(p => `
                  <tr>
                    <td>${p.PaymodeName}</td>
                    <td class="right">${formatCurrency(p.Amount)}</td>
                  </tr>
                `).join('')}
                <tr>
                  <td colspan="2"><div class="line-divider"></div></td>
                </tr>
                <tr class="bold">
                  <td>TOTAL COLLECTION</td>
                  <td class="right">${formatCurrency(paymentsTotal)}</td>
                </tr>
              </table>

              <div class="divider">========================================</div>
              <div class="section-title">CASH DRAWER SUMMARY</div>
              <div class="divider">========================================</div>
              <table>
                <tr>
                  <td>Opening Float</td>
                  <td class="right">${formatCurrency(displayOpeningAmount)}</td>
                </tr>
                <tr>
                  <td>Cash Sales</td>
                  <td class="right">${formatCurrency(normalCashSales)}</td>
                </tr>

                <tr>
                  <td>Cash In</td>
                  <td class="right">${formatCurrency(cashInTotalSum)}</td>
                </tr>
                <tr>
                  <td>Cash Out</td>
                  <td class="right">${formatCurrency(totalCashOutSum)}</td>
                </tr>
                <tr>
                  <td colspan="2"><div class="line-divider"></div></td>
                </tr>
                <tr class="bold">
                  <td>EXPECTED CASH</td>
                  <td class="right">${formatCurrency(totalCashIn - totalCashOutSum)}</td>
                </tr>
                ${totalClosing > 0 ? `
                <tr>
                  <td colspan="2"><div class="line-divider"></div></td>
                </tr>
                <tr class="bold">
                  <td>CLOSING AMOUNT</td>
                  <td class="right">${formatCurrency(totalClosing)}</td>
                </tr>
                <tr>
                  <td>Variance</td>
                  <td class="right" style="color: ${totalClosing >= (totalCashIn - totalCashOutSum) ? '#2e7d32' : '#c62828'}">${totalClosing >= (totalCashIn - totalCashOutSum) ? '+' : ''}${formatCurrency(totalClosing - (totalCashIn - totalCashOutSum))}</td>
                </tr>` : ''}
              </table>

              <div class="divider">========================================</div>
              <div class="center bold" style="font-size: 11px; margin-top: 10px; text-transform: uppercase;">SMART-POS BY UNIPROSG</div>
              <div class="divider">========================================</div>
            </div>
          </body>
        </html>
      `;

      // 3. Attempt silent IP printing first if IP is reachable (or via Print Bridge on Web)
      let printedToHardware = false;
      const isIp = cashierIp && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cashierIp.trim());

      // Generate ESC/POS payload formatters
      const formatTwoCols48 = (left: string, right: string) => {
        const cleanLeft = left.replace(/<[^>]*>/g, "");
        const cleanRight = right.replace(/<[^>]*>/g, "");
        const spaceCount = 48 - cleanLeft.length - cleanRight.length;
        return spaceCount > 0 ? `${left}${" ".repeat(spaceCount)}${right}\n` : `${left}\n${right.padStart(48, " ")}\n`;
      };

      let text = "[C]========================================\n";
      text += "[C]<font size='big'><B>SETTLEMENT REPORT</B></font>\n";
      text += "[C]========================================\n\n";
      text += `[L]<B>Business Date:</B> ${businessDateStr}\n\n`;
      text += "[L]<B>Generated:</B>\n";
      text += `[L]${formatDateTime(new Date())}\n\n`;

      text += "[C]========================================\n";
      text += "[C]<B>SALES SUMMARY</B>\n";
      text += "[C]========================================\n";
      text += formatTwoCols48("Gross Sales:", formatCurrency(totalSales.SubTotal));
      text += formatTwoCols48("Discount:", formatCurrency(totalSales.DiscountAmount));
      text += formatTwoCols48("Service Charge:", formatCurrency(totalSales.ServiceCharge));
      text += formatTwoCols48("GST Collected:", formatCurrency(totalSales.TotalTax));

      text += formatTwoCols48("Round Off:", formatCurrency(totalSales.RoundedBy));
      text += formatTwoCols48("Tips:", formatCurrency(totalSales.Tips));
      text += "[L]----------------------------------------\n";
      text += formatTwoCols48("<B>NET SALES:</B>", "<B>" + formatCurrency(netSales) + "</B>\n");

      text += "[C]========================================\n";
      text += "[C]<B>PAYMENT COLLECTION</B>\n";
      text += "[C]========================================\n";
      aggregatedPayments.forEach(p => {
        text += formatTwoCols48(p.PaymodeName + ":", formatCurrency(p.Amount));
      });
      text += "[L]----------------------------------------\n";
      text += formatTwoCols48("<B>TOTAL COLLECTION:</B>", "<B>" + formatCurrency(paymentsTotal) + "</B>\n");

      text += "[C]========================================\n";
      text += "[C]<B>CASH DRAWER SUMMARY</B>\n";
      text += "[C]========================================\n";
      text += formatTwoCols48("Opening Float:", formatCurrency(displayOpeningAmount));
      text += formatTwoCols48("Cash Sales:", formatCurrency(normalCashSales));

      text += formatTwoCols48("Cash In:", formatCurrency(cashInTotalSum));
      text += formatTwoCols48("Cash Out:", formatCurrency(totalCashOutSum));
      text += "[L]----------------------------------------\n";
      text += formatTwoCols48("<font size='big'><B>EXPECTED CASH:</B></font>", "<font size='big'><B>" + formatCurrency(totalCashIn - totalCashOutSum) + "</B></font>\n");
      if (totalClosing > 0) {
        text += formatTwoCols48("<B>CLOSING AMOUNT:</B>", "<B>" + formatCurrency(totalClosing) + "</B>\n");
        const variance = totalClosing - (totalCashIn - totalCashOutSum);
        text += formatTwoCols48("Variance:", (variance >= 0 ? '+' : '') + formatCurrency(variance) + "\n");
      }
      text += "[C]========================================\n";
      text += "[C]SMART-POS BY UNIPROSG\n";
      text += "[C]========================================\n\n\n\n";

      if (Platform.OS === 'web') {
        try {
          console.log("📡 [Web Settlement] Sending print job to Print Bridge");
          const storeId = "STORE_001";
          const response = await fetch(`${API_URL}/api/print-jobs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer unipro-pos-bridge-token-2026",
              "x-store-id": storeId
            },
            body: JSON.stringify({
              printerType: 1, // Cashier Printer
              content: text
            })
          });
          const resData = await response.json();
          if (resData.success && resData.jobId) {
            console.log(`📡 [Web Settlement] print queued: ${resData.jobId}. Polling status...`);
            const jobId = resData.jobId;
            const start = Date.now();
            let isCompleted = false;
            while (Date.now() - start < 8000) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              try {
                const statusRes = await fetch(`${API_URL}/api/print-jobs/status/${jobId}`);
                const statusData = await statusRes.json();
                if (statusData.success && statusData.status === 'COMPLETED') {
                  isCompleted = true;
                  break;
                }
                if (statusData.success && statusData.status === 'FAILED') {
                  console.warn(`❌ [Web Settlement] Job failed on bridge side:`, statusData.error);
                  break;
                }
              } catch (err) {
                console.error("[Web Settlement] Status poll error:", err);
              }
            }
            if (isCompleted) {
              printedToHardware = true;
              console.log(`✅ [Web Settlement] Settlement report printed successfully via bridge`);
            } else {
              console.warn(`⚠️ [Web Settlement] Print job ${jobId} failed or timed out. Falling back to print preview.`);
            }
          }
        } catch (e) {
          console.error("❌ [Web Settlement] Bridge print failed:", e);
        }
      } else if (isIp) {
        try {
          // Check if IP reachable
          const ipReachable = await checkIpReachable(cashierIp.trim());

          if (ipReachable) {
            const ThermalPrinter = require("react-native-thermal-printer").default;
            await ThermalPrinter.printTcp({
              ip: cashierIp.trim(),
              port: 9100,
              payload: text,
              mmFeedPaper: 60,
            });
            printedToHardware = true;
          }
        } catch (printErr) {
          console.warn("Direct IP print failed, fallback to system printing:", printErr);
        }
      }

      // 4. Try Sunmi direct print if Sunmi is detected
      if (!printedToHardware && Platform.OS === 'android') {
        try {
          const SunmiPrinterService = require("../../components/SunmiPrinterService").default;
          const sunmiReady = await SunmiPrinterService.init();
          if (sunmiReady) {
            const SunmiModule = require("sunmi-printer-expo");
            await SunmiModule.initPrinter();
            await SunmiModule.lineWrap(1);
            await SunmiModule.printText("================================\n");
            
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(32);
            await SunmiModule.printText("     SETTLEMENT REPORT\n");
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(24);
            await SunmiModule.printText("================================\n\n");
            
            await SunmiModule.printText(`Business Date: ${businessDateStr}\n\n`);
            await SunmiModule.printText("Generated:\n");
            await SunmiModule.printText(`${formatDateTime(new Date())}\n\n`);

            const formatTwoCols32 = (left: string, right: string) => {
              const spaceCount = 32 - left.length - right.length;
              return spaceCount > 0 ? `${left}${" ".repeat(spaceCount)}${right}\n` : `${left}\n${right.padStart(32, " ")}\n`;
            };

            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("         SALES SUMMARY\n");
            await SunmiModule.printText("================================\n");
            await SunmiModule.printText(formatTwoCols32("Gross Sales:", formatCurrency(totalSales.SubTotal)));
            await SunmiModule.printText(formatTwoCols32("Discount:", formatCurrency(totalSales.DiscountAmount)));
            await SunmiModule.printText(formatTwoCols32("Service Charge:", formatCurrency(totalSales.ServiceCharge)));
            await SunmiModule.printText(formatTwoCols32("GST Collected:", formatCurrency(totalSales.TotalTax)));
            await SunmiModule.printText(formatTwoCols32("Round Off:", formatCurrency(totalSales.RoundedBy)));
            await SunmiModule.printText(formatTwoCols32("Tips:", formatCurrency(totalSales.Tips)));
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("NET SALES:", formatCurrency(netSales)));
            await SunmiModule.printText("\n");

            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("       PAYMENT COLLECTION\n");
            await SunmiModule.printText("================================\n");
            for (const p of aggregatedPayments) {
              await SunmiModule.printText(formatTwoCols32(p.PaymodeName + ":", formatCurrency(p.Amount)));
            }
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("TOTAL COLLECTION:", formatCurrency(paymentsTotal)));
            await SunmiModule.printText("\n");

            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("      CASH DRAWER SUMMARY\n");
            await SunmiModule.printText("================================\n");
            await SunmiModule.printText(formatTwoCols32("Opening Float:", formatCurrency(displayOpeningAmount)));
            await SunmiModule.printText(formatTwoCols32("Cash Sales:", formatCurrency(normalCashSales)));

            await SunmiModule.printText(formatTwoCols32("Cash In:", formatCurrency(cashInTotalSum)));
            await SunmiModule.printText(formatTwoCols32("Cash Out:", formatCurrency(totalCashOutSum)));
            await SunmiModule.printText("--------------------------------\n");
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(28);
            await SunmiModule.printText(formatTwoCols32("EXPECTED CASH:", formatCurrency(totalCashIn - totalCashOutSum)));
            if (SunmiModule.setFontSize) await SunmiModule.setFontSize(24);
            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("     SMART-POS BY UNIPROSG\n");
            await SunmiModule.printText("================================\n");
            await SunmiModule.lineWrap(3);
            await SunmiModule.cutPaper();
            printedToHardware = true;
          }
        } catch (sunmiErr) {
          console.warn("Sunmi direct print failed, fallback to system printing:", sunmiErr);
        }
      }

      // 5. Fallback/Standard option: Show PDF Preview or system print aligned to 80mm
      if (!printedToHardware) {
        if (Platform.OS === 'web') {
          const frame = document.createElement("iframe");
          frame.style.display = "none";
          document.body.appendChild(frame);
          frame.contentWindow?.document.open();
          frame.contentWindow?.document.write(html);
          frame.contentWindow?.document.close();
          setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            document.body.removeChild(frame);
          }, 500);
        } else {
          // mobile PDF fallback / system print with 80mm width config
          await Print.printAsync({
            html,
            width: 226, // 80mm approximate width in points
          });
        }
      }
    } catch (err) {
      console.error("Print Error", err);
      Alert.alert("Error", "Failed to print report");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={[styles.header, !isTablet && { flexDirection: 'column', alignItems: 'stretch', gap: 12, paddingVertical: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.replace("/(tabs)/category" as any)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={Theme.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Settlement</Text>

            {!isTablet && (
              <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                  onPress={handlePrintReport}
                >
                  <Ionicons name="print-outline" size={16} color="#fff" />
                  <Text style={[styles.confirmBtnText, { fontSize: 12 }]}>Print</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#ef4444",
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6
                  }}
                  onPress={handleDayEnd}
                >
                  <Ionicons name="moon-outline" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontFamily: Fonts.black, fontSize: 12 }}>Day End</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Single/Range Business Date Navigator */}
          <View style={
            isTablet 
              ? { marginLeft: 'auto', flexDirection: 'row', gap: 12, alignItems: 'center', marginRight: 20 }
              : { flexDirection: 'row', justifyContent: 'center', gap: 12, alignItems: 'center', marginVertical: 4 }
          }>
            {!isRangeMode && (
              <TouchableOpacity 
                onPress={() => {
                  const nextDate = new Date(selectedDate);
                  nextDate.setDate(nextDate.getDate() - 1);
                  setSelectedDate(nextDate);
                }} 
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: Theme.bgMuted,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="chevron-back" size={18} color={Theme.textPrimary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                backgroundColor: Theme.bgMuted, 
                borderWidth: 1.5, 
                borderColor: Theme.border, 
                borderRadius: 10, 
                paddingHorizontal: 12,
                height: 38,
                gap: 8,
                justifyContent: 'center',
                minWidth: 150,
                ...Platform.select({
                  web: {
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    cursor: 'pointer',
                  }
                }) as any
              }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary, fontSize: 13 }}>
                {isRangeMode 
                  ? `${selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${selectedEndDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                  : selectedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                }
              </Text>
              <Ionicons name="calendar-outline" size={15} color={Theme.primary} />
            </TouchableOpacity>

            {!isRangeMode && (
              <TouchableOpacity
                onPress={() => {
                  const nextDate = new Date(selectedDate);
                  nextDate.setDate(nextDate.getDate() + 1);
                  setSelectedDate(nextDate);
                }} 
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: Theme.bgMuted,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="chevron-forward" size={18} color={Theme.textPrimary} />
              </TouchableOpacity>
            )}

            <CustomDatePicker
              visible={showDatePicker}
              onClose={() => setShowDatePicker(false)}
              selectedDate={selectedDate}
              selectedEndDate={selectedEndDate}
              isRangeMode={isRangeMode}
              onApply={(start, end, isRange) => {
                setSelectedDate(start);
                setSelectedEndDate(end);
                setIsRangeMode(isRange);
              }}
              title="Select Business Date"
            />
          </View>

          {isTablet && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#3b82f6",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                  elevation: 2,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 1.41,
                }}
                onPress={() => {
                  setShowHistoryModal(true);
                  fetchDayHistory();
                }}
              >
                <Ionicons name="time-outline" size={18} color="#fff" />
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: "#fff" }}>History</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, { paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                onPress={handlePrintReport}
              >
                <Ionicons name="print-outline" size={18} color="#fff" />
                <Text style={styles.confirmBtnText}>Print Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: "#ef4444",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 10,
                  elevation: 2,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 1.41,
                }}
                onPress={handleDayEnd}
              >
                <Ionicons name="moon-outline" size={18} color="#fff" />
                <Text style={{ fontFamily: Fonts.bold, fontSize: 14, color: "#fff" }}>Day End</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Theme.primary} />
            <Text style={styles.loadingText}>Fetching Settlement...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Day Start & End Timestamps */}
            {dayLog && (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                backgroundColor: Theme.bgCard,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: Theme.border,
                marginBottom: 15,
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                ...Platform.select({
                  web: {
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }
                }) as any
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, color: '#f59e0b', fontFamily: Fonts.bold }}>☀️ Day Started:</Text>
                  <Text style={{ fontSize: 13, color: Theme.textPrimary, fontFamily: Fonts.medium }}>
                    {dayLog.StartedAt ? formatTimeOnly(dayLog.StartedAt) : 'Pending'}
                  </Text>
                  {dayLog.StartedBy && (
                    <Text style={{ fontSize: 11, color: Theme.textSecondary, fontFamily: Fonts.medium }}>
                      ({dayLog.StartedBy})
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, color: '#3b82f6', fontFamily: Fonts.bold }}>🌙 Day Ended:</Text>
                  <Text style={{ fontSize: 13, color: dayLog.EndedAt ? Theme.textPrimary : Theme.success, fontFamily: Fonts.medium }}>
                    {dayLog.EndedAt ? formatTimeOnly(dayLog.EndedAt) : '🟢 Active Now'}
                  </Text>
                  {dayLog.EndedBy && dayLog.EndedAt && (
                    <Text style={{ fontSize: 11, color: Theme.textSecondary, fontFamily: Fonts.medium }}>
                      ({dayLog.EndedBy})
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Top Overview Cards */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.bgInput, borderColor: Theme.borderStrong, borderWidth: 1 }]}
                onPress={() => {
                  setLovMode("OPEN");
                  setShowLov(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="wallet-outline" size={isTablet ? 16 : 14} color={Theme.textSecondary} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.textSecondary, fontSize: isTablet ? 12 : 11 }}>Opening Amount</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.textPrimary, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(displayOpeningAmount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.successBg, borderColor: Theme.successBorder, borderWidth: 1 }]}
                onPress={() => {
                  if (enableCashDrawer) {
                    Alert.alert("Locked", "Manual Cash In entry is disabled when Cash Drawer is ON.");
                    return;
                  }
                  setCashInForm({ CashInId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '', AttachmentUrl: '' });
                  setShowCashInModal(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="add-circle-outline" size={isTablet ? 16 : 14} color={Theme.success} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.success, fontSize: isTablet ? 12 : 11 }}>Cash In</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.success, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(displayCashInCard)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.dangerBg, borderColor: Theme.dangerBorder, borderWidth: 1 }]}
                onPress={() => {
                  if (enableCashDrawer) {
                    Alert.alert("Locked", "Manual Cash Out entry is disabled when Cash Drawer is ON.");
                    return;
                  }
                  setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '', AttachmentUrl: '' });
                  setShowCashOutModal(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="remove-circle-outline" size={isTablet ? 16 : 14} color={Theme.danger} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.danger, fontSize: isTablet ? 12 : 11 }}>Cash Out</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.danger, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(displayCashOutCard)}</Text>
              </TouchableOpacity>



              <View style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.successBg, borderColor: Theme.successBorder, borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="trending-up-outline" size={isTablet ? 16 : 14} color={Theme.success} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.success, fontSize: isTablet ? 12 : 11 }}>Net Sales</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.success, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(netSales)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.primaryLight, borderColor: Theme.primaryBorder, borderWidth: 1 }]}
                onPress={() => {
                  setLovMode("CLOSE");
                  setShowLov(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calculator-outline" size={isTablet ? 16 : 14} color={Theme.primary} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.primary, fontSize: isTablet ? 12 : 11 }}>Closing Amount</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.primaryDark, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalClosing)}</Text>
              </TouchableOpacity>
            </View>
            

            <View style={[styles.grid, isTablet && styles.gridTablet]}>
              {/* === SUMMARY === */}
              <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderTitle}>SUMMARY</Text>
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 1 }]}>Details</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Amount</Text>
                </View>
                <View style={[styles.cardBody, { flex: 1 }]}>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Sales Total</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.SubTotal)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Total Discount</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.DiscountAmount)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Service Charge</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.ServiceCharge)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>GST</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.TotalTax)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Round Off</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.RoundedBy)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Tips</Text>
                    <Text style={styles.rowValue}>{formatCurrency(totalSales.Tips)}</Text>
                  </View>

                  <View style={[styles.row, styles.highlightRow, { marginTop: 'auto' }]}>
                    <Text style={[styles.rowLabel, styles.highlightText]}>Net Sales</Text>
                    <Text style={[styles.rowValue, styles.highlightText]}>{formatCurrency(netSales)}</Text>
                  </View>
                </View>
              </View>

              {/* === SALES === */}
              <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={[styles.cardHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                  <Text style={styles.cardHeaderTitle}>SALES</Text>
                  {(cashOutEntries.some(co => co.AttachmentUrl) || cashInEntries.some(ci => ci.AttachmentUrl)) && (
                    <TouchableOpacity
                      onPress={() => setShowAllMediaModal(true)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: Theme.success + '20',
                        borderWidth: 1,
                        borderColor: Theme.success + '60',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Ionicons name="images" size={13} color={Theme.success} />
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 11, color: Theme.success }}>Receipts</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>Paymode</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Cash In</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Cash Out</Text>
                </View>
                <View style={styles.cardBodyScroll}>
                  {displayOpeningAmount > 0 && (
                    <View style={styles.tableRow}>
                      <Text style={[styles.tableCellText, { flex: 2 }]}>Opening Balance</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.success }]}>
                        +{formatCurrency(displayOpeningAmount)}
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                        0.00
                      </Text>
                    </View>
                  )}
                  {cashInEntries.filter(ci => ci.Reason !== 'Cash Sale').map((ci, i) => (
                    <TouchableOpacity
                      key={`ci-${i}`}
                      style={[styles.tableRow, { alignItems: 'center' }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (enableCashDrawer) {
                          Alert.alert("Locked", "Manual Cash In entry is disabled when Cash Drawer is ON.");
                          return;
                        }
                        setCashInForm({ ...ci, CashInId: ci.CashInId || ci.cashInId, Amount: ci.Amount?.toString() || '', AttachmentUrl: ci.AttachmentUrl || '' });
                        setShowCashInModal(true);
                      }}
                    >
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.tableCellText}>{ci.Reason || 'Cash In'}</Text>
                        <Ionicons name="create-outline" size={14} color={Theme.textPrimary} style={{ marginLeft: 6 }} />
                        {!!ci.AttachmentUrl && (
                          <TouchableOpacity 
                            onPress={(e) => {
                              e.stopPropagation();
                              setViewerImageUrl(ci.AttachmentUrl);
                            }}
                            style={{
                              marginLeft: 8,
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              borderWidth: 1.5,
                              borderColor: Theme.success,
                              backgroundColor: Theme.success + "15",
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                          >
                            <Ionicons name="image" size={12} color={Theme.success} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.success }]}>
                        +{formatCurrency(ci.Amount)}
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                        0.00
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {cashOutEntries.map((co, i) => (
                    <TouchableOpacity
                      key={`co-${i}`}
                      style={[styles.tableRow, { alignItems: 'center' }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (enableCashDrawer) {
                          Alert.alert("Locked", "Manual Cash Out entry is disabled when Cash Drawer is ON.");
                          return;
                        }
                        setCashOutForm({ ...co, CashOutId: co.CashOutId || co.cashOutId, Amount: co.Amount?.toString() || '', AttachmentUrl: co.AttachmentUrl || '' });
                        setShowCashOutModal(true);
                      }}
                    >
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.tableCellText}>{co.Reason || 'Cash Out'}</Text>
                        <Ionicons name="create-outline" size={14} color={Theme.textPrimary} style={{ marginLeft: 6 }} />
                        {!!co.AttachmentUrl && (
                          <TouchableOpacity 
                            onPress={(e) => {
                              e.stopPropagation();
                              setViewerImageUrl(co.AttachmentUrl);
                            }}
                            style={{
                              marginLeft: 8,
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              borderWidth: 1.5,
                              borderColor: Theme.success,
                              backgroundColor: Theme.success + "15",
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                          >
                            <Ionicons name="image" size={12} color={Theme.success} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                        0.00
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.danger }]}>
                        -{formatCurrency(co.Amount)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {transactions.map((t, i) => (
                    <View key={`trans-${i}`} style={styles.tableRow}>
                      <Text style={[styles.tableCellText, { flex: 2 }]}>{t.TransactionMode}</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: t.TransactionType === "IN" ? Theme.success : undefined }]}>
                        {t.TransactionType === "IN" ? `+${formatCurrency(t.Amount)}` : "0.00"}
                      </Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: t.TransactionType === "OUT" ? Theme.danger : undefined }]}>
                        {t.TransactionType === "OUT" ? `-${formatCurrency(t.Amount)}` : "0.00"}
                      </Text>
                    </View>
                  ))}
                  {(() => {
                    const aggregated: Record<string, { PaymodeName: string; Amount: number }> = {};
                    payments.forEach(p => {
                      const rawName = p.PaymodeName || "Unknown";
                      const name = rawName.trim();
                      const key = name.toUpperCase();
                      const amt = parseFloat(p.Amount) || 0;
                      if (aggregated[key]) {
                        aggregated[key].Amount += amt;
                      } else {
                        aggregated[key] = { PaymodeName: name, Amount: amt };
                      }
                    });
                    return Object.values(aggregated).map((p, i) => {
                      const modeUpper = p.PaymodeName.toUpperCase();
                      const isCash = modeUpper === "CASH" || modeUpper === "CASHBOX" || modeUpper === "CASH BOX";
                      return (
                        <View key={`pay-${i}`} style={styles.tableRow}>
                          <Text style={[styles.tableCellText, { flex: 2 }]}>{p.PaymodeName}</Text>
                          <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: isCash ? Theme.success : Theme.textPrimary }]}>
                            {`+${formatCurrency(p.Amount)}`}
                          </Text>
                          <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>0.00</Text>
                        </View>
                      );
                    });
                  })()}
                  {payments.length === 0 && displayOpeningAmount === 0 && transactions.length === 0 && cashOutEntries.length === 0 && cashInEntries.length === 0 && <Text style={styles.emptyText}>No sales</Text>}
                </View>
                {/* 1. Total Collection (All Modes) */}
                <View style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Theme.bgNav, borderTopWidth: 1, borderTopColor: Theme.border, alignItems: "center" }}>
                  <Text style={{ flex: 2, fontFamily: Fonts.bold, fontSize: 12, color: Theme.textSecondary }}>Total Collection (All Modes)</Text>
                  <Text style={{ flex: 1, textAlign: "right", fontFamily: Fonts.bold, fontSize: 13, color: Theme.success }}>
                    {`+${formatCurrency(totalCashIn + nonCashTotal - displayOpeningAmount)}`}
                  </Text>
                  <Text style={{ flex: 1, textAlign: "right", fontFamily: Fonts.bold, fontSize: 13, color: Theme.danger }}>
                    {`-${formatCurrency(totalCashOutSum)}`}
                  </Text>
                </View>

                {/* 2. Non-Cash Collection */}
                <View style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Theme.bgNav, alignItems: "center" }}>
                  <Text style={{ flex: 2, fontFamily: Fonts.bold, fontSize: 12, color: Theme.textSecondary }}>Non-Cash Collection</Text>
                  <Text style={{ flex: 2, textAlign: "right", fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary }}>
                    {formatCurrency(nonCashTotal)}
                  </Text>
                </View>

                {/* 3. Opening Float */}
                <View style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Theme.bgNav, alignItems: "center" }}>
                  <Text style={{ flex: 2, fontFamily: Fonts.bold, fontSize: 12, color: Theme.textSecondary }}>Opening Float</Text>
                  <Text style={{ flex: 2, textAlign: "right", fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary }}>
                    {formatCurrency(displayOpeningAmount)}
                  </Text>
                </View>

                {/* 4. Cash Out (All Modes) */}
                <View style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Theme.bgNav, alignItems: "center" }}>
                  <Text style={{ flex: 2, fontFamily: Fonts.bold, fontSize: 12, color: Theme.textSecondary }}>Total Cash Out</Text>
                  <Text style={{ flex: 2, textAlign: "right", fontFamily: Fonts.bold, fontSize: 13, color: Theme.danger }}>
                    {formatCurrency(totalCashOutSum)}
                  </Text>
                </View>

                {/* 5. Expected Drawer Cash */}
                <View style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#f9731615', borderTopWidth: 1, borderTopColor: '#f9731630', alignItems: "center" }}>
                  <Text style={{ flex: 2, fontFamily: Fonts.black, fontSize: 13, color: '#f97316' }}>EXPECTED DRAWER CASH</Text>
                  <Text style={{ flex: 2, textAlign: "right", fontFamily: Fonts.black, fontSize: 15, color: (totalCashIn - totalCashOutSum) >= 0 ? Theme.success : Theme.danger }}>
                    {formatCurrency(totalCashIn - totalCashOutSum)}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Cash Denominations Modal */}
      <Modal
        visible={showLov}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLov(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalDismiss}
            activeOpacity={1}
            onPress={() => setShowLov(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Denomination</Text>
              <TouchableOpacity onPress={() => setShowLov(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Currency Value</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>No.Of Currencies</Text>
            </View>

            <ScrollView style={styles.modalList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>
                  {lovMode === "OPEN" ? "Opening Cash Notes" : "Count All Cash Notes"}
                </Text>
              </View>
              {denominations.filter(d => d >= 1).map((denom, i) => {
                const denomStr = denom.toFixed(2);
                const val = lovMode === "OPEN" ? openingCounts[denomStr] : closingCounts[denomStr];
                return (
                  <View key={`note-${i}`} style={[styles.tableRow, { alignItems: "center" }]}>
                    <Text style={[styles.tableCellText, { flex: 1 }]}>{denomStr}</Text>
                    <TextInput
                      style={styles.currencyInput}
                      keyboardType="numeric"
                      value={val || ""}
                      onChangeText={(v) => handleCountChange(denomStr, v)}
                      placeholder="0"
                      placeholderTextColor={Theme.textMuted}
                    />
                  </View>
                );
              })}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>
                  {lovMode === "OPEN" ? "Opening Cash Coins" : "Count All Cash Coins"}
                </Text>
              </View>
              {denominations.filter(d => d < 1).map((denom, i) => {
                const denomStr = denom.toFixed(2);
                const val = lovMode === "OPEN" ? openingCounts[denomStr] : closingCounts[denomStr];
                return (
                  <View key={`coin-${i}`} style={[styles.tableRow, { alignItems: "center" }]}>
                    <Text style={[styles.tableCellText, { flex: 1 }]}>{denomStr}</Text>
                    <TextInput
                      style={styles.currencyInput}
                      keyboardType="numeric"
                      value={val || ""}
                      onChangeText={(v) => handleCountChange(denomStr, v)}
                      placeholder="0"
                      placeholderTextColor={Theme.textMuted}
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalDivider} />

            <View style={styles.modalFooter}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontFamily: Fonts.bold, color: Theme.textSecondary }}>Total Cash:</Text>
                <Text style={{ fontFamily: Fonts.black, fontSize: 18, color: Theme.primary }}>
                  {formatCurrency(lovMode === "OPEN" ? totalOpening : totalClosing)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                  onPress={handleClearDenominations}
                >
                  <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { flex: 1 }]}
                  onPress={handleSaveDenominations}
                >
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cash Out Modal */}
      <Modal
        visible={showCashOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashOutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCashOutModal(false)}
          />
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Cash Out</Text>
              <TouchableOpacity onPress={() => setShowCashOutModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingVertical: 5 }} showsVerticalScrollIndicator={false}>
              {/* List of Today's Cash Out */}
              <View style={{ marginBottom: 15 }}>
                {/* <Text style={{ fontFamily: Fonts.bold, marginBottom: 8, color: Theme.textPrimary }}>Today's Entries</Text> */}
                {cashOutEntries.length > 0 ? (
                  <View>
                    {cashOutEntries.map((co, idx) => (
                      <View key={idx} style={[styles.tableRow, { alignItems: 'center' }]}>
                        <Text style={[styles.tableCellText, { flex: 2 }]}>{co.Reason || 'Cash Out'}</Text>
                        <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right', paddingRight: 15 }]}>{formatCurrency(co.Amount)}</Text>
                        <View style={{ flexDirection: 'row', gap: 15, width: 90, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {!!co.AttachmentUrl && (
                            <TouchableOpacity onPress={() => setViewerImageUrl(co.AttachmentUrl)}>
                              <Ionicons name="eye-outline" size={18} color={Theme.success} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => setCashOutForm({ ...co, CashOutId: co.CashOutId || co.cashOutId, Amount: co.Amount?.toString() || '', AttachmentUrl: co.AttachmentUrl || '' })}>
                            <Ionicons name="create-outline" size={18} color={Theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCashOut(co.CashOutId || co.cashOutId)}>
                            <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 8, borderWidth: 1, borderColor: Theme.border }}>
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted }}>No cash out entries found for the selected time period.</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 15, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Amount *</Text>
                  <TextInput
                    style={[styles.premiumInput, { textAlign: 'left', fontSize: 18 }]}
                    keyboardType="numeric"
                    value={cashOutForm.Amount}
                    onChangeText={(v) => setCashOutForm({ ...cashOutForm, Amount: v })}
                    placeholder="0.00"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Payment Mode</Text>
                  <TextInput
                    style={[styles.premiumInput, { fontFamily: Fonts.medium }]}
                    value={cashOutForm.PaymentMode}
                    onChangeText={(v) => setCashOutForm({ ...cashOutForm, PaymentMode: v })}
                    placeholder="Cash"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Reason</Text>
                <TextInput
                  style={[styles.premiumInput, { fontFamily: Fonts.medium }]}
                  value={cashOutForm.Reason}
                  onChangeText={(v) => setCashOutForm({ ...cashOutForm, Reason: v })}
                  // placeholder="e.g. Supplier Payment"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>

              {/* <View style={{ marginBottom: 15 }}>
                <Text style={{ fontFamily: Fonts.medium, fontSize: 12, marginBottom: 4 }}>Remarks</Text>
                <TextInput
                  style={[styles.currencyInput, { height: 60, textAlignVertical: 'top', textAlign: 'left', fontFamily: Fonts.medium }]}
                  multiline
                  value={cashOutForm.Remarks}
                  onChangeText={(v) => setCashOutForm({ ...cashOutForm, Remarks: v })}
                  placeholder="Additional notes..."
                />
              </View> */}
              {/* Attachment Section */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 8, color: Theme.textSecondary }}>Receipt Attachment</Text>
                
                {uploading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                    <ActivityIndicator size="small" color={Theme.primary} />
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted }}>Uploading receipt...</Text>
                  </View>
                ) : cashOutForm.AttachmentUrl ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.bgMuted, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Theme.border }}>
                    <Ionicons name="document-attach-outline" size={24} color={Theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary }} numberOfLines={1}>
                        {cashOutForm.AttachmentUrl.split('/').pop()}
                      </Text>
                      <Text style={{ fontFamily: Fonts.medium, fontSize: 11, color: Theme.textMuted }}>Compressed receipt photo</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => setViewerImageUrl(cashOutForm.AttachmentUrl)} style={{ padding: 4 }}>
                        <Ionicons name="eye-outline" size={20} color={Theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setCashOutForm(prev => ({ ...prev, AttachmentUrl: '' }))} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={20} color={Theme.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity 
                      onPress={() => handleSelectImage('camera')}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: Theme.bgCard,
                        borderWidth: 1.5,
                        borderColor: Theme.primary + '30',
                        borderStyle: 'dashed',
                        paddingVertical: 12,
                        borderRadius: 8
                      }}
                    >
                      <Ionicons name="camera-outline" size={18} color={Theme.primary} />
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.primary }}>Take Photo</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => handleSelectImage('library')}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: Theme.bgCard,
                        borderWidth: 1.5,
                        borderColor: Theme.primary + '30',
                        borderStyle: 'dashed',
                        paddingVertical: 12,
                        borderRadius: 8
                      }}
                    >
                      <Ionicons name="image-outline" size={18} color={Theme.primary} />
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.primary }}>Upload Image</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '', AttachmentUrl: '' })}
              >
                <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Clear Form</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1 }]}
                onPress={handleSaveCashOut}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Image Viewer Modal */}
      <Modal visible={!!viewerImageUrl} transparent animationType="fade" onRequestClose={() => setViewerImageUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={() => setViewerImageUrl(null)} 
          />
          <View style={{ width: '90%', height: '80%', justifyContent: 'center', alignItems: 'center' }}>
            {!!viewerImageUrl && (
              <Image 
                source={{ uri: viewerImageUrl.startsWith('http') ? viewerImageUrl : `${API_URL}${viewerImageUrl}` }} 
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
              />
            )}
          </View>
          <TouchableOpacity 
            onPress={() => setViewerImageUrl(null)} 
            style={{ position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20 }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* All Cash Out Media Gallery Modal */}
      <Modal
        visible={showAllMediaModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAllMediaModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAllMediaModal(false)}
          />
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%', maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Receipts Gallery</Text>
              <TouchableOpacity onPress={() => setShowAllMediaModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
              {(() => {
                const outs = cashOutEntries.filter(co => co.AttachmentUrl).map(co => ({
                  ...co,
                  type: 'OUT',
                  date: co.CreatedOn || co.CreatedDate || new Date()
                }));
                const ins = cashInEntries.filter(ci => ci.AttachmentUrl).map(ci => ({
                  ...ci,
                  type: 'IN',
                  date: ci.CreatedOn || ci.CreatedDate || new Date()
                }));
                const combined = [...outs, ...ins].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (combined.length === 0) {
                  return (
                    <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                      <Text style={{ fontFamily: Fonts.medium, fontSize: 14, color: Theme.textMuted }}>No receipts found.</Text>
                    </View>
                  );
                }

                return combined.map((item, idx) => {
                  const isOut = item.type === 'OUT';
                  return (
                    <View key={idx} style={{ 
                      flexDirection: 'row', 
                      backgroundColor: Theme.bgMuted, 
                      borderRadius: 12, 
                      padding: 12, 
                      marginBottom: 12, 
                      borderWidth: 1, 
                      borderColor: Theme.border,
                      alignItems: 'center'
                    }}>
                      <TouchableOpacity onPress={() => {
                        setShowAllMediaModal(false);
                        setViewerImageUrl(item.AttachmentUrl);
                      }}>
                        <Image 
                          source={{ uri: item.AttachmentUrl.startsWith('http') ? item.AttachmentUrl : `${API_URL}${item.AttachmentUrl}` }} 
                          style={{ width: 60, height: 60, borderRadius: 8, marginRight: 12, resizeMode: 'cover' }} 
                        />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: Fonts.bold, fontSize: 14, color: Theme.textPrimary }}>
                          {item.Reason || (isOut ? 'Cash Out' : 'Cash In')}
                        </Text>
                        <Text style={{ fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary, marginTop: 2 }}>
                          Ref: {item.ReferenceNo || 'N/A'} ({isOut ? 'Withdrawal' : 'Deposit'})
                        </Text>
                        <Text style={{ fontFamily: Fonts.medium, fontSize: 11, color: Theme.textMuted, marginTop: 2 }}>
                          By: {item.CreatedBy || 'Admin'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontFamily: Fonts.black, fontSize: 15, color: isOut ? Theme.danger : Theme.success }}>
                          {isOut ? '-' : '+'}{formatCurrency(item.Amount)}
                        </Text>
                        <TouchableOpacity 
                          onPress={() => {
                            setShowAllMediaModal(false);
                            setViewerImageUrl(item.AttachmentUrl);
                          }}
                          style={{ 
                            marginTop: 8, 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            gap: 4, 
                            backgroundColor: Theme.primary + '20', 
                            paddingHorizontal: 8, 
                            paddingVertical: 4, 
                            borderRadius: 6 
                          }}
                        >
                          <Ionicons name="eye-outline" size={14} color={Theme.primary} />
                          <Text style={{ fontFamily: Fonts.bold, fontSize: 11, color: Theme.primary }}>View</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cash In Modal */}
      <Modal
        visible={showCashInModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashInModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCashInModal(false)}
          />
          <View style={[styles.modalContent, { maxWidth: 600, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Cash In</Text>
              <TouchableOpacity onPress={() => setShowCashInModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingVertical: 5 }} showsVerticalScrollIndicator={false}>
              {/* List of Today's Cash In */}
              <View style={{ marginBottom: 15 }}>
                {cashInEntries.length > 0 ? (
                  <View>
                    {cashInEntries.map((ci, idx) => (
                      <View key={idx} style={[styles.tableRow, { alignItems: 'center' }]}>
                        <Text style={[styles.tableCellText, { flex: 2 }]}>{ci.Reason || 'Cash In'}</Text>
                        <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right', paddingRight: 15 }]}>{formatCurrency(ci.Amount)}</Text>
                        <View style={{ flexDirection: 'row', gap: 15, width: 60, justifyContent: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setCashInForm({ ...ci, CashInId: ci.CashInId || ci.cashInId, Amount: ci.Amount?.toString() || '' })}>
                            <Ionicons name="create-outline" size={18} color={Theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCashIn(ci.CashInId || ci.cashInId)}>
                            <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 8, borderWidth: 1, borderColor: Theme.border }}>
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted }}>No cash in entries found for the selected time period.</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 15, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Amount *</Text>
                  <TextInput
                    style={[styles.premiumInput, { textAlign: 'left', fontSize: 18 }]}
                    keyboardType="numeric"
                    value={cashInForm.Amount}
                    onChangeText={(v) => setCashInForm({ ...cashInForm, Amount: v })}
                    placeholder="0.00"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Payment Mode</Text>
                  <TextInput
                    style={[styles.premiumInput, { fontFamily: Fonts.medium }]}
                    value={cashInForm.PaymentMode}
                    onChangeText={(v) => setCashInForm({ ...cashInForm, PaymentMode: v })}
                    placeholder="Cash"
                    placeholderTextColor={Theme.textMuted}
                  />
                </View>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Reason</Text>
                <TextInput
                  style={[styles.premiumInput, { fontFamily: Fonts.medium }]}
                  value={cashInForm.Reason}
                  onChangeText={(v) => setCashInForm({ ...cashInForm, Reason: v })}
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
              
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 8, color: Theme.textSecondary }}>Receipt Attachment</Text>
                
                {uploading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                    <ActivityIndicator size="small" color={Theme.primary} />
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted }}>Uploading receipt...</Text>
                  </View>
                ) : cashInForm.AttachmentUrl ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.bgMuted, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Theme.border }}>
                    <Ionicons name="document-attach-outline" size={24} color={Theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary }} numberOfLines={1}>
                        {cashInForm.AttachmentUrl.split('/').pop()}
                      </Text>
                      <Text style={{ fontFamily: Fonts.medium, fontSize: 11, color: Theme.textMuted }}>Compressed receipt photo</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => setViewerImageUrl(cashInForm.AttachmentUrl)} style={{ padding: 4 }}>
                        <Ionicons name="eye-outline" size={20} color={Theme.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setCashInForm(prev => ({ ...prev, AttachmentUrl: '' }))} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={20} color={Theme.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity 
                      onPress={() => handleSelectImage('camera')}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: Theme.bgCard,
                        borderWidth: 1.5,
                        borderColor: Theme.primary + '30',
                        borderStyle: 'dashed',
                        paddingVertical: 12,
                        borderRadius: 8
                      }}
                    >
                      <Ionicons name="camera-outline" size={18} color={Theme.primary} />
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.primary }}>Take Photo</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => handleSelectImage('library')}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: Theme.bgCard,
                        borderWidth: 1.5,
                        borderColor: Theme.primary + '30',
                        borderStyle: 'dashed',
                        paddingVertical: 12,
                        borderRadius: 8
                      }}
                    >
                      <Ionicons name="image-outline" size={18} color={Theme.primary} />
                      <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.primary }}>Upload Image</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setCashInForm({ CashInId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '', AttachmentUrl: '' })}
              >
                <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Clear Form</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1 }]}
                onPress={handleSaveCashIn}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      {/* Cash Box Modal */}
      <Modal
        visible={showCashBoxModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashBoxModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCashBoxModal(false)}
          />
          <View style={[styles.modalContent, { maxWidth: 500, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Artist Cash Box</Text>
              <TouchableOpacity onPress={() => setShowCashBoxModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingVertical: 5 }} showsVerticalScrollIndicator={false}>
              {/* List of Today's Artist Cash Box */}
              <View style={{ marginBottom: 15 }}>
                {cashBoxEntries.length > 0 ? (
                  <View>
                    {cashBoxEntries.map((co, idx) => (
                      <View key={idx} style={[styles.tableRow, { alignItems: 'center' }]}>
                        <Text style={[styles.tableCellText, { flex: 2, fontFamily: Fonts.bold }]}>{co.ArtistName || 'Artist'}</Text>
                        <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right', paddingRight: 15 }]}>{formatCurrency(co.Amount)}</Text>
                        <View style={{ flexDirection: 'row', gap: 15, width: 60, justifyContent: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setCashBoxForm({ ...co, CashBoxId: co.CashBoxId || co.cashBoxId, ArtistName: co.ArtistName, Amount: co.Amount?.toString() || '' })}>
                            <Ionicons name="create-outline" size={18} color={Theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCashBox(co.CashBoxId || co.cashBoxId)}>
                            <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: Theme.bgInput, borderRadius: 8, borderWidth: 1, borderColor: Theme.border }}>
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted }}>No cash box entries found for the selected time period.</Text>
                  </View>
                )}
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Artist Name *</Text>
                <TouchableOpacity
                  style={[styles.premiumInput, { justifyContent: 'center', height: 44 }]}
                  onPress={() => setShowDishLov(true)}
                >
                  <Text style={{ fontFamily: Fonts.medium, fontSize: 14, color: cashBoxForm.ArtistName ? Theme.textPrimary : Theme.textMuted }}>
                    {cashBoxForm.ArtistName || "Select Artist..."}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: Fonts.bold, fontSize: 13, marginBottom: 6, color: Theme.textSecondary }}>Amount *</Text>
                <TextInput
                  style={[styles.premiumInput, { textAlign: 'left', fontSize: 18, fontFamily: Fonts.medium }]}
                  keyboardType="number-pad"
                  value={cashBoxForm.Amount}
                  onChangeText={(v) => {
                    const cleaned = v.replace(/[^0-9]/g, "");
                    setCashBoxForm({ ...cashBoxForm, Amount: cleaned });
                  }}
                  placeholder="0"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setCashBoxForm({ ArtistName: '', Amount: '', CashBoxId: '' })}
              >
                <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Clear Form</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1 }]}
                onPress={handleSaveCashBox}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


<Modal
  visible={showDishLov}
  transparent
  animationType="fade"
  onRequestClose={() => {
    setShowDishLov(false);
    setArtistSearch("");
  }}
>
  <View style={styles.modalOverlay}>
    <TouchableOpacity
      style={StyleSheet.absoluteFill}
      activeOpacity={1}
      onPress={() => {
        setShowDishLov(false);
        setArtistSearch("");
      }}
    />
    <View style={[styles.modalContent, { maxWidth: 450, width: "90%", padding: 0, overflow: 'hidden' }]}>
      <View style={[styles.modalHeader, { padding: 16, backgroundColor: Theme.bgCard }]}>
        <Text style={styles.modalTitle}>Select Artist</Text>
        <TouchableOpacity
          onPress={() => {
            setShowDishLov(false);
            setArtistSearch("");
          }}
          style={styles.modalCloseBtn}
        >
          <Ionicons name="close" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>
      </View>
      
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Theme.bgCard, borderBottomWidth: 1, borderBottomColor: Theme.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.bgInput, borderRadius: 8, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Theme.border }}>
          <Ionicons name="search-outline" size={18} color={Theme.textMuted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontFamily: Fonts.medium, fontSize: 14, color: Theme.textPrimary, outlineStyle: 'none' } as any}
            placeholder="Search artist..."
            placeholderTextColor={Theme.textMuted}
            value={artistSearch}
            onChangeText={setArtistSearch}
          />
          {artistSearch.length > 0 && (
            <TouchableOpacity onPress={() => setArtistSearch("")}>
              <Ionicons name="close-circle" size={16} color={Theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={{ maxHeight: 350, backgroundColor: Theme.bgMain }}>
        {dishList.filter(item => item.Name.toLowerCase().includes(artistSearch.toLowerCase())).length > 0 ? (
          dishList.filter(item => item.Name.toLowerCase().includes(artistSearch.toLowerCase())).map((item, index) => {
            const isSelected = cashBoxForm.ArtistName === item.Name;
            return (
              <TouchableOpacity
                key={index}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                  backgroundColor: isSelected ? Theme.primaryLight : Theme.bgCard,
                  borderBottomWidth: 1,
                  borderBottomColor: Theme.border,
                }}
                onPress={() => {
                  setCashBoxForm({
                    ...cashBoxForm,
                    ArtistName: item.Name,
                  });
                  setShowDishLov(false);
                  setArtistSearch("");
                }}
              >
                <Text style={{ 
                  fontFamily: isSelected ? Fonts.bold : Fonts.medium,
                  fontSize: 14,
                  color: isSelected ? Theme.primary : Theme.textPrimary 
                }}>
                  {item.Name}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color={Theme.primary} />
                )}
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <Ionicons name="search-outline" size={32} color={Theme.border} style={{ marginBottom: 10 }} />
            <Text style={{ fontFamily: Fonts.medium, color: Theme.textMuted, fontSize: 14 }}>
              No artists found matching "{artistSearch}"
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  </View>
</Modal>

      {/* CUSTOM CONFIRM DAY END MODAL */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <TouchableOpacity 
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20
          }}
          activeOpacity={1}
          onPress={() => setShowConfirmModal(false)}
        >
          <TouchableWithoutFeedback>
            <View 
              style={{
                width: "100%",
                maxWidth: 420,
                backgroundColor: Theme.bgCard || "#ffffff",
                borderRadius: 24,
                padding: 24,
                alignItems: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 5
              }}
            >
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "#fee2e2",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 16
              }}>
                <Ionicons name="warning-outline" size={28} color="#ef4444" />
              </View>

              <Text style={{
                fontFamily: Fonts.black,
                fontSize: 20,
                color: Theme.textPrimary || "#1c2d42",
                marginBottom: 10,
                textAlign: "center"
              }}>
                Confirm Day End
              </Text>

              <Text style={{
                fontFamily: Fonts.medium,
                fontSize: 14,
                color: Theme.textSecondary || "#556e8a",
                textAlign: "center",
                lineHeight: 20,
                marginBottom: 24
              }}>
                Are you sure you want to close the day? This will finalize all transactions and prepare for the next business day.
              </Text>

              <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: Theme.bgMuted || "#f1f5f9",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 15, color: Theme.textPrimary || "#1c2d42" }}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: "#ef4444",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                  onPress={() => {
                    setShowConfirmModal(false);
                    executeDayEnd();
                  }}
                >
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 15, color: "#fff" }}>
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* GENERIC CONFIRM MODAL */}
      <Modal
        visible={genericConfirm.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setGenericConfirm(prev => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity 
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20
          }}
          activeOpacity={1}
          onPress={() => setGenericConfirm(prev => ({ ...prev, visible: false }))}
        >
          <TouchableWithoutFeedback>
            <View 
              style={{
                width: "100%",
                maxWidth: 400,
                backgroundColor: Theme.bgCard,
                borderRadius: 20,
                padding: 24,
                alignItems: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 5
              }}
            >
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 16
              }}>
                <Ionicons name="trash-outline" size={28} color="#ef4444" />
              </View>

              <Text style={{
                fontSize: 18,
                fontFamily: Fonts.bold,
                color: Theme.textPrimary,
                marginBottom: 8,
                textAlign: "center"
              }}>
                {genericConfirm.title}
              </Text>

              <Text style={{
                fontSize: 14,
                fontFamily: Fonts.medium,
                color: Theme.textSecondary,
                marginBottom: 24,
                textAlign: "center",
                lineHeight: 20
              }}>
                {genericConfirm.message}
              </Text>

              <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                <TouchableOpacity 
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: Theme.bgMuted || "#F3F4F6",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                  onPress={() => setGenericConfirm(prev => ({ ...prev, visible: false }))}
                >
                  <Text style={{
                    fontSize: 14,
                    fontFamily: Fonts.bold,
                    color: Theme.textPrimary
                  }}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: "#ef4444",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                  onPress={genericConfirm.onConfirm}
                >
                  <Text style={{
                    fontSize: 14,
                    fontFamily: Fonts.bold,
                    color: "#ffffff"
                  }}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* SUPERVISOR PASSWORD VERIFICATION MODAL */}
      <Modal
        visible={showPasswordModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{passwordAction?.title || "Verification Required"}</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalDivider} />
            <Text style={{ fontFamily: Fonts.medium, fontSize: 14, color: Theme.textSecondary, marginBottom: 16 }}>
              {passwordAction?.description || "Please enter the supervisor/admin password:"}
            </Text>
            <TextInput
              style={[styles.premiumInput, { width: '100%', marginBottom: 20, textAlign: 'left' }]}
              placeholder="Enter Password"
              placeholderTextColor={Theme.textMuted}
              secureTextEntry
              value={passwordValue}
              onChangeText={setPasswordValue}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setShowPasswordModal(false)}
              >
                <Text style={[styles.confirmBtnText, { color: Theme.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1 }]}
                onPress={async () => {
                  try {
                    const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ password: passwordValue, role: passwordAction?.role || "ADMIN" }),
                    });
                    const verifyData = await verifyRes.json();
                    if (!verifyData.success) {
                      Alert.alert("Incorrect Password", "The password you entered is incorrect.");
                      return;
                    }
                    setShowPasswordModal(false);
                    if (passwordAction?.onSuccess) {
                      passwordAction.onSuccess();
                    }
                  } catch (err) {
                    console.error("Password verification error:", err);
                    Alert.alert("Error", "Failed to verify password");
                  }
                }}
              >
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DAY HISTORY MODAL */}
      <Modal
        visible={showHistoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <TouchableOpacity 
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20
          }}
          activeOpacity={1}
          onPress={() => setShowHistoryModal(false)}
        >
          <TouchableWithoutFeedback>
            <View 
              style={{
                width: "100%",
                maxWidth: 560,
                backgroundColor: Theme.bgCard || "#ffffff",
                borderRadius: 24,
                padding: 24,
                maxHeight: "85%",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.25,
                shadowRadius: 20,
                elevation: 10
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Theme.border, paddingBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.infoBg, justifyContent: "center", alignItems: "center" }}>
                    <Ionicons name="time" size={20} color="#3b82f6" />
                  </View>
                  <View>
                    <Text style={{ fontFamily: Fonts.black, fontSize: 18, color: Theme.textPrimary }}>Day Start & End History</Text>
                    <Text style={{ fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary }}>
                      Recent Business Day Audit Logs
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={26} color={Theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {loadingHistory ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color={Theme.primary} />
                </View>
              ) : historyLogs.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <Ionicons name="document-text-outline" size={48} color={Theme.textMuted} />
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 15, color: Theme.textSecondary, marginTop: 12 }}>No audit history found</Text>
                  <Text style={{ fontFamily: Fonts.medium, fontSize: 12, color: Theme.textMuted, marginTop: 4 }}>No Day Start or Day End logs recorded in the system.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                  <View style={{ gap: 12 }}>
                    {historyLogs.map((log: any, idx: number) => {
                      const isStart = log.EventType === "DAY_START";
                      const logDateStr = log.BusinessDate 
                        ? new Date(log.BusinessDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : "—";

                      return (
                        <View 
                          key={log.AuditId || idx}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: isStart ? "rgba(245,158,11,0.12)" : "rgba(239, 68, 68, 0.12)",
                            borderLeftWidth: 4,
                            borderLeftColor: isStart ? "#f59e0b" : "#ef4444",
                            padding: 14,
                            borderRadius: 12,
                            justifyContent: "space-between"
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                            <Text style={{ fontSize: 22 }}>{isStart ? "☀️" : "🌙"}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: Fonts.bold, fontSize: 14, color: isStart ? "#f59e0b" : "#ef4444" }}>
                                {isStart ? "Day Started" : "Day Ended"}
                              </Text>
                              <Text style={{ fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary, marginTop: 4 }}>
                                Business Date: <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary }}>{logDateStr}</Text>
                              </Text>
                              <Text style={{ fontFamily: Fonts.medium, fontSize: 11, color: Theme.textMuted, marginTop: 2 }}>
                                Action by: <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary }}>{log.ActionBy || "admin"}</Text>
                              </Text>
                            </View>
                          </View>
                          <View style={{ alignItems: "flex-end", marginLeft: 10 }}>
                            <Text style={{ fontFamily: Fonts.bold, fontSize: 12, color: Theme.textPrimary, textAlign: "right" }}>
                              {formatToSingaporeDateTime(log.EventTime)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Theme.border, alignItems: "flex-end" }}>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: Theme.bgMuted,
                  }}
                  onPress={() => setShowHistoryModal(false)}
                >
                  <Text style={{ fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  verticalDivider: {
    width: 1,
    height: 20,
    backgroundColor: Theme.border,
  },
  filterWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterTitle: {
    fontSize: 11,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  filterScroll: {
    gap: 6,
    alignItems: "center",
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  filterBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  filterBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  filterBtnTextActive: {
    color: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  content: {
    padding: 12,
  },
  grid: {
    flexDirection: "column",
    gap: 12,
  },
  gridTablet: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    backgroundColor: Theme.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    width: "100%",
  },
  cardTablet: {
    flex: 1, // Distribute evenly in a single row
  },
  cardHeader: {
    backgroundColor: Theme.bgCard,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  cardBody: {
    padding: 12,
  },
  cardBodyScroll: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  rowLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  highlightRow: {
    backgroundColor: Theme.bgNav,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    borderBottomWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    marginBottom: -12,
  },
  highlightText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.bgMuted,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  tableHeaderText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  tableCellText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  currencyInput: {
    width: 120,
    height: 38,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: Theme.bgInput,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    textAlign: "left",
    fontSize: 14,
  },
  premiumInput: {
    height: 52,
    backgroundColor: Theme.bgInput,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 16,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 12,
  },
  modalList: {
    // no maxHeight - let modal content expand naturally
  },
  sectionHeader: {
    backgroundColor: Theme.bgMuted,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 4,
  },
  sectionHeaderText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  modalFooter: {
    marginTop: 8,
  },
  confirmBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  confirmBtnText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  clickableRow: {
    backgroundColor: Theme.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: Theme.primary,
    paddingHorizontal: 8,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 8,
    backgroundColor: Theme.bgNav,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  footerLabel: {
    backgroundColor: Theme.bgMuted,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.primaryDark,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  footerValue: {
    backgroundColor: Theme.bgCard,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primaryDark,
    borderWidth: 1,
    borderColor: Theme.border,
    borderLeftWidth: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    minWidth: 80,
    textAlign: "right",
  },
});
