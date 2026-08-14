import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useGeneralSettingsStore } from "../../stores/generalSettingsStore";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { getSingaporeTimeTodayRange } from "../../utils/timezoneHelper";


interface CustomDateTimePickerProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onApply: (date: Date) => void;
  title: string;
}

function CustomDateTimePicker({ visible, onClose, selectedDate, onApply, title }: CustomDateTimePickerProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 640;

  const getSgtComponents = (d: Date) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const yearVal = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
    const monthVal = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
    const dayVal = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
    return { year: yearVal, month: monthVal, day: dayVal };
  };

  const [viewDate, setViewDate] = useState(() => {
    const { year, month, day } = getSgtComponents(selectedDate);
    return new Date(year, month, day);
  });
  const [selectedDay, setSelectedDay] = useState(() => {
    const { year, month, day } = getSgtComponents(selectedDate);
    return new Date(year, month, day);
  });
  
  // Time states
  const [hour, setHour] = useState(() => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      hour12: false
    }).formatToParts(selectedDate);
    let h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    h = h % 12;
    return h === 0 ? 12 : h;
  });
  const [minute, setMinute] = useState(() => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      minute: '2-digit'
    }).formatToParts(selectedDate);
    return parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  });
  const [amPm, setAmPm] = useState<"AM" | "PM">(() => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      hour12: false
    }).formatToParts(selectedDate);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    return h >= 12 ? "PM" : "AM";
  });

  // Sync state when selectedDate changes or modal opens
  useEffect(() => {
    if (visible) {
      const { year, month, day } = getSgtComponents(selectedDate);
      setViewDate(new Date(year, month, day));
      setSelectedDay(new Date(year, month, day));
      
      const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Singapore',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(selectedDate);
      let hSgt = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const minSgt = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      
      const ampm = hSgt >= 12 ? "PM" : "AM";
      hSgt = hSgt % 12;
      setHour(hSgt === 0 ? 12 : hSgt);
      setMinute(minSgt);
      setAmPm(ampm);
    }
  }, [visible, selectedDate]);

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
    setSelectedDay(new Date(dayObj.year, dayObj.month, dayObj.day));
  };

  // Time adjustment helpers
  const adjustHour = (amount: number) => {
    setHour(prev => {
      let next = prev + amount;
      if (next > 12) return 1;
      if (next < 1) return 12;
      return next;
    });
  };

  const adjustMinute = (amount: number) => {
    setMinute(prev => {
      let next = prev + amount;
      if (next > 59) return 0;
      if (next < 0) return 59;
      return next;
    });
  };

  const handleApply = () => {
    const y = selectedDay.getFullYear();
    const m = String(selectedDay.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDay.getDate()).padStart(2, '0');
    const isTo = title.toLowerCase().includes("to") || title.toLowerCase().includes("end");
    const timeSuffix = isTo ? "T23:59:59+08:00" : "T00:00:00+08:00";
    const finalDate = new Date(`${y}-${m}-${d}${timeSuffix}`);
    onApply(finalDate);
    onClose();
  };

  const formatSummaryStr = () => {
    const d = selectedDay.getDate().toString().padStart(2, '0');
    const m = (selectedDay.getMonth() + 1).toString().padStart(2, '0');
    const y = selectedDay.getFullYear();
    return `${d}-${m}-${y}`;
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.modalContainer, !isTablet && { width: '95%', padding: 16, maxHeight: '90%' }]}>
          {/* Header */}
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>{title}</Text>
            <TouchableOpacity style={pickerStyles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color="#44403C" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={{ flexShrink: 1 }} 
            contentContainerStyle={{ paddingBottom: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Columns Container */}
            <View style={{ flexDirection: 'column', gap: 20 }}>
              {/* Left Side: Calendar */}
              <View style={{ flex: 1 }}>
                {/* Calendar Navigator */}
                <View style={pickerStyles.calNavigator}>
                  <TouchableOpacity onPress={prevMonth} style={pickerStyles.navBtn}>
                    <Ionicons name="chevron-back" size={16} color="#44403C" />
                  </TouchableOpacity>
                  <Text style={pickerStyles.monthYearText}>{monthNames[month]} {year}</Text>
                  {(() => {
                    const todayVal = new Date();
                    const isCurrentMonthOrFuture = year > todayVal.getFullYear() || (year === todayVal.getFullYear() && month >= todayVal.getMonth());
                    return (
                      <TouchableOpacity 
                        onPress={nextMonth} 
                        disabled={isCurrentMonthOrFuture} 
                        style={[pickerStyles.navBtn, isCurrentMonthOrFuture && { opacity: 0.25 }]}
                      >
                        <Ionicons name="chevron-forward" size={16} color="#44403C" />
                      </TouchableOpacity>
                    );
                  })()}
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
                    const isSelected = selectedDay.getDate() === dObj.day &&
                      selectedDay.getMonth() === dObj.month &&
                      selectedDay.getFullYear() === dObj.year;

                    const today = new Date();
                    today.setHours(23, 59, 59, 999);
                    const cellDate = new Date(dObj.year, dObj.month, dObj.day);
                    const isFuture = cellDate > today;

                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleDaySelect(dObj)}
                        disabled={isFuture}
                        style={[
                          pickerStyles.dayBtn,
                          isSelected && pickerStyles.dayBtnSelected,
                          isFuture && { opacity: 0.25 }
                        ]}
                      >
                        <Text style={[
                          pickerStyles.dayText,
                          !dObj.isCurrentMonth && pickerStyles.dayTextInactive,
                          isSelected && pickerStyles.dayTextSelected,
                          isFuture && { color: '#D1D5DB' }
                        ]}>
                          {dObj.day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Summary Display */}
                <View style={[pickerStyles.summaryCard, { marginTop: 16 }]}>
                  <Text style={pickerStyles.summaryLabel}>Selected Date:</Text>
                  <Text style={pickerStyles.summaryValue}>{formatSummaryStr()}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

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
    backgroundColor: '#fff',
    borderRadius: 20,
    width: 380,
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
    color: '#9CA3AF',
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
    backgroundColor: '#F97316', // Orange theme
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
    color: '#F97316',
  },
  timeLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: '#9CA3AF',
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
    color: '#9CA3AF',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: '#F97316',
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
    backgroundColor: '#F97316',
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
      const res = await fetch(`${API_URL}/api/settlement/day-end`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          username: user?.userName || "admin"
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        await AsyncStorage.removeItem("selected_business_date");
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
    } catch (err) {
      console.error("Day End Error:", err);
      showToast({
        type: "error",
        message: "Network Error",
        subtitle: "Failed to connect to the server."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDayEnd = () => {
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
    ReferenceNo: ''
  });

  // Cash In State
  const [cashInEntries, setCashInEntries] = useState<any[]>([]);
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [cashInForm, setCashInForm] = useState({
    CashInId: '',
    Amount: '',
    Reason: '',
    Remarks: '',
    PaymentMode: 'Cash',
    ReferenceNo: ''
  });
const [cashBoxForm, setCashBoxForm] = useState({
  ArtistName: '',
  Amount: ''
});
  const [lovMode, setLovMode] = useState<"OPEN" | "CLOSE">("OPEN");

  const [openingCash, setOpeningCash] = useState<string>("0");

  const [dishList, setDishList] = useState<any[]>([]);
const [showDishLov, setShowDishLov] = useState(false);
const [artistSearch, setArtistSearch] = useState("");

  const [fromDate, setFromDate] = useState<Date>(() => {
    const { from } = getSingaporeTimeTodayRange();
    return from;
  });
  const [toDate, setToDate] = useState<Date>(() => {
    const { to } = getSingaporeTimeTodayRange();
    return to;
  });

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

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
  const formatLocal = (d: Date) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const h = parts.find(p => p.type === 'hour')?.value;
    const min = parts.find(p => p.type === 'minute')?.value;
    const s = parts.find(p => p.type === 'second')?.value;
    return `${y}-${m}-${day}T${h}:${min}:${s}`;
  };
  const getLocalDateStr = (d: Date) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${y}-${m}-${day}`;
  };

  const formatDateTime = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value || '00';
    const month = parts.find(p => p.type === 'month')?.value || '00';
    const year = parts.find(p => p.type === 'year')?.value || '0000';
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || 'AM').toUpperCase();
    return `${day}-${month}-${year} ${hour}:${minute} ${dayPeriod}`;
  };

  const formatDateOnly = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value || '00';
    const month = parts.find(p => p.type === 'month')?.value || '00';
    const year = parts.find(p => p.type === 'year')?.value || '0000';
    return `${day}-${month}-${year}`;
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
    const initDate = async () => {
      try {
        const savedBusinessDate = await require("@react-native-async-storage/async-storage").default.getItem("selected_business_date");
        let activeDateStr = savedBusinessDate;
        
        try {
          const res = await fetch(`${API_URL}/api/settlement/active-day`);
          const data = await res.json();
          if (data.success && data.active && data.startDate) {
            activeDateStr = data.startDate;
          }
        } catch (err) {
          console.warn("Failed to fetch active business day inside Settlement:", err);
        }

        if (activeDateStr) {
          const activeFrom = new Date(`${activeDateStr}T00:00:00+08:00`);
          const activeTo = new Date(`${activeDateStr}T23:59:59+08:00`);
          setFromDate(activeFrom);
          setToDate(activeTo);
        }
      } catch (e) {
        console.error("Failed to load business date:", e);
      }
    };
    initDate();
    loadTerminals();
    loadDishes();
    useGeneralSettingsStore.getState().fetchSettings();
  }, []);

  const loadTerminals = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/settlement/terminals`);
      const termData = res.data || [];
      setTerminals(termData);
      if (termData.length > 0) {
        setSelectedTerminal(termData[0].TerminalCode);
      } else {
        setSelectedTerminal("ALL");
      }
    } catch (err) {
      console.error("❌ TERMINAL LOAD ERROR", err);
      setSelectedTerminal("ALL");
    } finally {
      setLoading(false);
    }
  };

const loadDishes = async () => {
  try {
    const res = await axios.get(
      `${API_URL}/api/settlement/artist-list`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("ARTIST DATA =", res.data);

    setDishList(res.data.data || []);
  } catch (err) {
    console.log(err);
  }
};

  useEffect(() => {
    if (selectedTerminal) fetchData();
  }, [selectedTerminal, fromDate, toDate]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const fromStr = formatLocal(fromDate);
      const toStr = formatLocal(toDate);

      const totalRes = await axios.get(`${API_URL}/api/settlement/total-sales/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: {} }));
      const payRes = await axios.get(`${API_URL}/api/settlement/payment/${selectedTerminal}/${userId}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: [] }));
      const transRes = await axios.get(`${API_URL}/api/settlement/transactions/${selectedTerminal}/${userId}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: [] }));
      const salesRes = await axios.get(`${API_URL}/api/settlement/sales-summary/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`).catch(() => ({ data: [] }));

      const outId = selectedTerminal === "ALL" ? 1 : selectedTerminal;
      const dateStr = getLocalDateStr(fromDate); // Fetch opening cash for the fromDate
      const openRes = await axios.get(`${API_URL}/api/settlement/opening-cash?outletId=${outId}&date=${dateStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const denomsRes = await axios.get(`${API_URL}/api/settlement/denominations?type=OPEN&date=${dateStr}&screenType=CB`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const closeDenomsRes = await axios.get(`${API_URL}/api/settlement/denominations?type=CLOSE&date=${dateStr}&screenType=CB`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const cashOutRes = await axios.get(`${API_URL}/api/settlement/cash-out/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));
      const cashInRes = await axios.get(`${API_URL}/api/settlement/cash-in/${selectedTerminal}?fromDate=${fromStr}&toDate=${toStr}`, { headers: { Authorization: `Bearer ${useAuthStore.getState().token}` } }).catch(() => ({ data: null }));

      setTotalSales(totalRes.data || {});
      setPayments(payRes.data || []);
      setTransactions(transRes.data || []);
      setSales(salesRes.data || []);
      setCashOutEntries(cashOutRes.data?.data || []);
      setCashInEntries(cashInRes.data?.data || []);

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
  const cashBoxTotal = payments
    .filter(p => p.PaymodeName?.toUpperCase().includes("CASH BOX") || p.PaymodeName?.toUpperCase().includes("CASHBOX"))
    .reduce((sum, p) => sum + (parseFloat(p.Amount) || 0), 0);

  const baseTransactionsTotal = transactions.reduce((sum, t) => {
    const amt = parseFloat(t.Amount) || 0;
    return sum + (t.TransactionType === "IN" ? amt : -amt);
  }, 0);

  const transactionsTotal = baseTransactionsTotal + displayOpeningAmount - totalCashOut + totalCashInEntries;
  const salesCash = parseFloat(payments.find(p => p.PaymodeName?.toUpperCase() === 'CASH')?.Amount) || 0;

  const sysCash = salesCash + transactionsTotal;

  const totalCashIn = salesCash + displayOpeningAmount + totalCashInEntries + transactions.filter(t => t.TransactionType === "IN").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);
  const uiTotalIn = paymentsTotal + displayOpeningAmount + totalCashInEntries + transactions.filter(t => t.TransactionType === "IN").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);
  const totalCashOutSum = totalCashOut + transactions.filter(t => t.TransactionType === "OUT").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);

  const handleFinalize = async () => {
    try {
      setLoading(true);

      const payload = {
        outletId: 1, // Fallback, backend handles this based on user
        settlementDate: getLocalDateStr(fromDate),
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
        cardAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'CARD')?.Amount || 0,
        upiAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'UPI')?.Amount || 0,
        paynowAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'PAYNOW')?.Amount || 0,
        valueCardAmount: payments.find(p => p.PaymodeName?.toUpperCase() === 'VALUE CARD')?.Amount || 0,
      };

      const res = await axios.post(`${API_URL}/api/settlement/finalize`, payload, {
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

      const dateStr = getLocalDateStr(fromDate);
      const outId = selectedTerminal === "ALL" ? 1 : selectedTerminal;

      const res = await axios.post(`${API_URL}/api/settlement/save-denominations`, {
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

  const handleSaveCashOut = async () => {
    if (!cashOutForm.Amount || parseFloat(cashOutForm.Amount) <= 0) {
      Alert.alert("Validation", "Please enter a valid amount");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        amount: parseFloat(cashOutForm.Amount),
        reason: cashOutForm.Reason,
        remarks: cashOutForm.Remarks,
        paymentMode: cashOutForm.PaymentMode,
        referenceNo: cashOutForm.ReferenceNo,
        terminalCode: selectedTerminal === "ALL" ? "" : selectedTerminal,
        date: getLocalDateStr(fromDate)
      };

      let res;
      if (cashOutForm.CashOutId) {
        res = await axios.put(`${API_URL}/api/settlement/cash-out/${cashOutForm.CashOutId}`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      } else {
        res = await axios.post(`${API_URL}/api/settlement/cash-out`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      }

      if (res.data.success) {
        setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '' });
        setShowCashOutModal(false);
        setToDate(new Date()); // Auto-update the "To" date so the new record falls within the filter range
        // Since setToDate triggers a re-fetch via useEffect, we don't strictly need fetchData() here,
        // but we'll leave it to guarantee a refresh.
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

  const handleSaveCashIn = async () => {
    if (!cashInForm.Amount || parseFloat(cashInForm.Amount) <= 0) {
      Alert.alert("Validation", "Please enter a valid amount");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        amount: parseFloat(cashInForm.Amount),
        reason: cashInForm.Reason,
        remarks: cashInForm.Remarks,
        paymentMode: cashInForm.PaymentMode,
        referenceNo: cashInForm.ReferenceNo,
        terminalCode: selectedTerminal === "ALL" ? "" : selectedTerminal,
        date: getLocalDateStr(fromDate)
      };

      let res;
      if (cashInForm.CashInId) {
        res = await axios.put(`${API_URL}/api/settlement/cash-in/${cashInForm.CashInId}`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      } else {
        res = await axios.post(`${API_URL}/api/settlement/cash-in`, payload, {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        });
      }

      if (res.data.success) {
        setCashInForm({ CashInId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '' });
        setShowCashInModal(false);
        setToDate(new Date());
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

  const handleSaveCashBox = async () => {
  try {

    await axios.post(
      `${API_URL}/api/settlement/artist-cashbox`,
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
    });

    setShowCashBoxModal(false);

  } catch (err) {
    console.log(err);
    Alert.alert("Error", "Failed to save");
  }
};

  const executeDeleteCashOut = async (id: string) => {
    try {
      setLoading(true);
      const res = await axios.delete(`${API_URL}/api/settlement/cash-out/${id}`, {
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

  const handleDeleteCashOut = async (id: string) => {
    if (!id) {
      Alert.alert("Error", "Invalid entry ID");
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm("Are you sure you want to delete this cash out entry?")) {
        executeDeleteCashOut(id);
      }
    } else {
      Alert.alert("Confirm", "Are you sure you want to delete this cash out entry?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => executeDeleteCashOut(id) }
      ]);
    }
  };

  const executeDeleteCashIn = async (id: string) => {
    try {
      setLoading(true);
      const res = await axios.delete(`${API_URL}/api/settlement/cash-in/${id}`, {
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

  const handleDeleteCashIn = async (id: string) => {
    if (!id) {
      Alert.alert("Error", "Invalid entry ID");
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm("Are you sure you want to delete this cash in entry?")) {
        executeDeleteCashIn(id);
      }
    } else {
      Alert.alert("Confirm", "Are you sure you want to delete this cash in entry?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => executeDeleteCashIn(id) }
      ]);
    }
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

      const fromDateStr = formatDateOnly(fromDate);
      const toDateStr = formatDateOnly(toDate);
      const cashInTotalSum = totalCashInEntries + transactions.filter(t => t.TransactionType === "IN").reduce((sum, t) => sum + (parseFloat(t.Amount) || 0), 0);

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
                <div class="bold">Period:</div>
                <div class="info-row">${fromDateStr}</div>
                <div class="info-row">to</div>
                <div class="info-row">${toDateStr}</div>
                <br/>
                <div class="bold">Generated:</div>
                <div class="info-row">${formatDateOnly(new Date())}</div>
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
                ${payments.map(p => `
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
                  <td class="right">${formatCurrency(salesCash)}</td>
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
              </table>

              <div class="divider">========================================</div>
              <div class="center bold" style="font-size: 11px; margin-top: 10px; text-transform: uppercase;">SMART-POS BY UNIPROSG</div>
              <div class="divider">========================================</div>
            </div>
          </body>
        </html>
      `;

      // 3. Attempt silent IP printing first if IP is reachable
      let printedToHardware = false;
      const isIp = cashierIp && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cashierIp.trim());
      if (isIp && Platform.OS !== 'web') {
        try {
          // Check if IP reachable
          const ipReachable = await checkIpReachable(cashierIp.trim());

          if (ipReachable) {
            // Generate ESC/POS payload
            const formatTwoCols48 = (left: string, right: string) => {
              const cleanLeft = left.replace(/<[^>]*>/g, "");
              const cleanRight = right.replace(/<[^>]*>/g, "");
              const spaceCount = 48 - cleanLeft.length - cleanRight.length;
              return spaceCount > 0 ? `${left}${" ".repeat(spaceCount)}${right}\n` : `${left}\n${right.padStart(48, " ")}\n`;
            };

            let text = "[C]========================================\n";
            text += "[C]<font size='big'><B>SETTLEMENT REPORT</B></font>\n";
            text += "[C]========================================\n\n";
            text += "[L]<B>Period:</B>\n";
            text += `[L]${fromDateStr}\n`;
            text += "[L]to\n";
            text += `[L]${toDateStr}\n\n`;
            text += "[L]<B>Generated:</B>\n";
            text += `[L]${formatDateOnly(new Date())}\n\n`;

            text += "[C]========================================\n";
            text += "[C]<B>SALES SUMMARY</B>\n";
            text += "[C]========================================\n";
            text += formatTwoCols48("Gross Sales:", formatCurrency(totalSales.SubTotal));
            text += formatTwoCols48("Discount:", formatCurrency(totalSales.DiscountAmount));
            text += formatTwoCols48("Service Charge:", formatCurrency(totalSales.ServiceCharge));
            text += formatTwoCols48("GST Collected:", formatCurrency(totalSales.TotalTax));
            text += formatTwoCols48("Tips:", formatCurrency(totalSales.Tips));
            text += "[L]----------------------------------------\n";
            text += formatTwoCols48("<B>NET SALES:</B>", "<B>" + formatCurrency(netSales) + "</B>\n");

            text += "[C]========================================\n";
            text += "[C]<B>PAYMENT COLLECTION</B>\n";
            text += "[C]========================================\n";
            payments.forEach(p => {
              text += formatTwoCols48(p.PaymodeName + ":", formatCurrency(p.Amount));
            });
            text += "[L]----------------------------------------\n";
            text += formatTwoCols48("<B>TOTAL COLLECTION:</B>", "<B>" + formatCurrency(paymentsTotal) + "</B>\n");

            text += "[C]========================================\n";
            text += "[C]<B>CASH DRAWER SUMMARY</B>\n";
            text += "[C]========================================\n";
            text += formatTwoCols48("Opening Float:", formatCurrency(displayOpeningAmount));
            text += formatTwoCols48("Cash Sales:", formatCurrency(salesCash));
            text += formatTwoCols48("Cash In:", formatCurrency(cashInTotalSum));
            text += formatTwoCols48("Cash Out:", formatCurrency(totalCashOutSum));
            text += "[L]----------------------------------------\n";
            text += formatTwoCols48("<font size='big'><B>EXPECTED CASH:</B></font>", "<font size='big'><B>" + formatCurrency(totalCashIn - totalCashOutSum) + "</B></font>\n");
            text += "[C]========================================\n";
            text += "[C]SMART-POS BY UNIPROSG\n";
            text += "[C]========================================\n\n\n\n";

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
            
            await SunmiModule.printText("Period:\n");
            await SunmiModule.printText(`${fromDateStr}\n`);
            await SunmiModule.printText("to\n");
            await SunmiModule.printText(`${toDateStr}\n\n`);
            await SunmiModule.printText("Generated:\n");
            await SunmiModule.printText(`${formatDateOnly(new Date())}\n\n`);

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
            await SunmiModule.printText(formatTwoCols32("Tips:", formatCurrency(totalSales.Tips)));
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("NET SALES:", formatCurrency(netSales)));
            await SunmiModule.printText("\n");

            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("       PAYMENT COLLECTION\n");
            await SunmiModule.printText("================================\n");
            for (const p of payments) {
              await SunmiModule.printText(formatTwoCols32(p.PaymodeName + ":", formatCurrency(p.Amount)));
            }
            await SunmiModule.printText("--------------------------------\n");
            await SunmiModule.printText(formatTwoCols32("TOTAL COLLECTION:", formatCurrency(paymentsTotal)));
            await SunmiModule.printText("\n");

            await SunmiModule.printText("================================\n");
            await SunmiModule.printText("      CASH DRAWER SUMMARY\n");
            await SunmiModule.printText("================================\n");
            await SunmiModule.printText(formatTwoCols32("Opening Float:", formatCurrency(displayOpeningAmount)));
            await SunmiModule.printText(formatTwoCols32("Cash Sales:", formatCurrency(salesCash)));
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

          {/* Date Pickers */}
          <View style={
            isTablet 
              ? { marginLeft: 'auto', flexDirection: 'row', gap: 20, alignItems: 'center', marginRight: 20 }
              : { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }
          }>
            <View style={{ flex: !isTablet ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: Theme.textSecondary, fontFamily: Fonts.medium }}>From:</Text>
              <TouchableOpacity
                style={{ 
                  flex: !isTablet ? 1 : undefined,
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  backgroundColor: '#fff', 
                  borderWidth: 1.5, 
                  borderColor: Theme.border, 
                  borderRadius: 10, 
                  paddingHorizontal: 8,
                  height: 38,
                  gap: 6,
                  justifyContent: 'space-between',
                  ...Platform.select({
                    web: {
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }
                  }) as any
                }}
                onPress={() => setShowFromPicker(true)}
              >
                <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
                  {formatDateOnly(fromDate)}
                </Text>
                <Ionicons name="calendar-outline" size={13} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: !isTablet ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: Theme.textSecondary, fontFamily: Fonts.medium }}>To:</Text>
              <TouchableOpacity
                style={{ 
                  flex: !isTablet ? 1 : undefined,
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  backgroundColor: '#fff', 
                  borderWidth: 1.5, 
                  borderColor: Theme.border, 
                  borderRadius: 10, 
                  paddingHorizontal: 8,
                  height: 38,
                  gap: 6,
                  justifyContent: 'space-between',
                  ...Platform.select({
                    web: {
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }
                  }) as any
                }}
                onPress={() => setShowToPicker(true)}
              >
                <Text style={{ fontFamily: Fonts.bold, color: Theme.textPrimary, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
                  {formatDateOnly(toDate)}
                </Text>
                <Ionicons name="calendar-outline" size={13} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <CustomDateTimePicker
              visible={showFromPicker}
              onClose={() => setShowFromPicker(false)}
              selectedDate={fromDate}
              onApply={(date) => setFromDate(date)}
              title="Select Start Date"
            />
            <CustomDateTimePicker
              visible={showToPicker}
              onClose={() => setShowToPicker(false)}
              selectedDate={toDate}
              onApply={(date) => setToDate(date)}
              title="Select End Date"
            />
          </View>

          {isTablet && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
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
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 3,
                  elevation: 2,
                  height: 38
                }}
                onPress={handleDayEnd}
              >
                <Ionicons name="moon-outline" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 13, fontFamily: Fonts.black }}>Day End</Text>
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
          <ScrollView contentContainerStyle={styles.content}>
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
                  setShowCashInModal(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="add-circle-outline" size={isTablet ? 16 : 14} color={Theme.success} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.success, fontSize: isTablet ? 12 : 11 }}>Cash In</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.success, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalCashInEntries)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { flex: isTablet ? 1 : undefined, minWidth: isTablet ? 0 : '48%', flexGrow: 1, padding: isTablet ? 15 : 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.dangerBg, borderColor: Theme.dangerBorder, borderWidth: 1 }]}
                onPress={() => {
                  if (enableCashDrawer) {
                    Alert.alert("Locked", "Manual Cash Out entry is disabled when Cash Drawer is ON.");
                    return;
                  }
                  setShowCashOutModal(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="remove-circle-outline" size={isTablet ? 16 : 14} color={Theme.danger} />
                  <Text style={{ fontFamily: Fonts.bold, color: Theme.danger, fontSize: isTablet ? 12 : 11 }}>Cash Out</Text>
                </View>
                <Text style={{ fontFamily: Fonts.black, fontSize: isTablet ? 22 : 16, color: Theme.danger, marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalCashOut)}</Text>
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

              {/* === SALES SUMMARY === */}
              {/* <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderTitle}>SALES SUMMARY</Text>
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>Paymode</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Sys Amount</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Manual Amount</Text>
                </View>
                <ScrollView style={styles.cardBodyScroll} nestedScrollEnabled> */}
              {/* Opening Cash Row */}
              {/* <TouchableOpacity
                    style={[styles.tableRow, styles.clickableRow, { alignItems: "center" }]}
                    onPress={() => {
                      setLovMode("OPEN");
                      setShowLov(true);
                    }}
                  >
                    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.tableCellText, { fontFamily: Fonts.bold, color: Theme.textSecondary }]}>OPENING AMOUNT</Text>
                      <Ionicons name="create-outline" size={14} color={Theme.textSecondary} style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}></Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", fontFamily: Fonts.bold, color: Theme.textSecondary }]}>
                      {formatCurrency(displayOpeningAmount)}
                    </Text>
                  </TouchableOpacity> */}

              {/* Hardcoded CASH Row */}
              {/* <TouchableOpacity
                    style={[styles.tableRow, styles.clickableRow, { alignItems: "center" }]}
                    onPress={() => {
                      setLovMode("CLOSE");
                      setShowLov(true);
                    }}
                  >
                    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.tableCellText, { fontFamily: Fonts.bold, color: Theme.primary }]}>CASH</Text>
                      <Ionicons name="create-outline" size={14} color={Theme.primary} style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}>
                      {formatCurrency(sysCash)}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", fontFamily: Fonts.bold }]}>
                      {formatCurrency(totalClosing)}
                    </Text>
                  </TouchableOpacity> */}

              {/* Cash Out Row */}
              {/* <TouchableOpacity
                    style={[styles.tableRow, styles.clickableRow, { alignItems: "center" }]}
                    onPress={() => setShowCashOutModal(true)}
                  >
                    <View style={{ flex: 2, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.tableCellText, { fontFamily: Fonts.bold, color: Theme.danger }]}>CASH OUT</Text>
                      <Ionicons name="create-outline" size={14} color={Theme.danger} style={{ marginLeft: 6 }} />
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}></Text>
                    <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", fontFamily: Fonts.bold, color: Theme.danger }]}>
                      {formatCurrency(totalCashOut)}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
                <View style={styles.cardFooter}>
                  <Text style={styles.footerLabel}>Total</Text>
                  <Text style={styles.footerValue}>{formatCurrency(totalClosing)}</Text>
                </View>
                </View>
              </View> */}

              {/* === SALES === */}
              <View style={[styles.card, isTablet && styles.cardTablet]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderTitle}>SALES</Text>
                </View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { flex: 2 }]}>Paymode</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Cash In</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Cash Out</Text>
                </View>
                <ScrollView style={styles.cardBodyScroll} nestedScrollEnabled>
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
                  {cashInEntries.map((ci, i) => (
                    <TouchableOpacity
                      key={`ci-${i}`}
                      style={[styles.tableRow, { alignItems: 'center' }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (enableCashDrawer) {
                          Alert.alert("Locked", "Manual Cash In entry is disabled when Cash Drawer is ON.");
                          return;
                        }
                        setCashInForm({ ...ci, CashInId: ci.CashInId || ci.cashInId, Amount: ci.Amount?.toString() || '' });
                        setShowCashInModal(true);
                      }}
                    >
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.tableCellText}>{ci.Reason || 'Cash In'}</Text>
                        <Ionicons name="create-outline" size={14} color={Theme.textPrimary} style={{ marginLeft: 6 }} />
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
                        setCashOutForm({ ...co, CashOutId: co.CashOutId || co.cashOutId, Amount: co.Amount?.toString() || '' });
                        setShowCashOutModal(true);
                      }}
                    >
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.tableCellText}>{co.Reason || 'Cash Out'}</Text>
                        <Ionicons name="create-outline" size={14} color={Theme.textPrimary} style={{ marginLeft: 6 }} />
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
                  {payments.map((p, i) => (
                    <View key={`pay-${i}`} style={styles.tableRow}>
                      <Text style={[styles.tableCellText, { flex: 2 }]}>{p.PaymodeName}</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right", color: Theme.success }]}>+{formatCurrency(p.Amount)}</Text>
                      <Text style={[styles.tableCellText, { flex: 1, textAlign: "right" }]}></Text>
                    </View>
                  ))}
                  {payments.length === 0 && displayOpeningAmount === 0 && transactions.length === 0 && cashOutEntries.length === 0 && cashInEntries.length === 0 && <Text style={styles.emptyText}>No sales</Text>}
                </ScrollView>
                <View style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 12, backgroundColor: "#FAFAFA", borderTopWidth: 1, borderTopColor: Theme.border, alignItems: "center" }}>
                  <View style={{ flex: 2, alignItems: 'flex-end', paddingRight: 15 }}>
                    <Text style={{ fontFamily: Fonts.black, fontSize: 14, color: Theme.primaryDark }}>TOTAL</Text>
                  </View>
                  <Text style={{ flex: 1, textAlign: "right", fontFamily: Fonts.black, fontSize: 14, color: Theme.success }}>
                    {formatCurrency(uiTotalIn)}
                  </Text>
                  <Text style={{ flex: 1, textAlign: "right", fontFamily: Fonts.black, fontSize: 14, color: Theme.danger }}>
                    {formatCurrency(totalCashOutSum)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F9FAFB", borderTopWidth: 1, borderTopColor: "#E5E7EB", alignItems: "center" }}>
                  <View style={{ flex: 2, alignItems: 'flex-end', paddingRight: 15 }}>
                    <Text style={{ fontFamily: Fonts.black, fontSize: 13, color: Theme.textSecondary }}>NET AMOUNT</Text>
                  </View>
                  <Text style={{ flex: 2, textAlign: "right", fontFamily: Fonts.black, fontSize: 14, color: (uiTotalIn - totalCashOutSum) >= 0 ? Theme.success : Theme.danger }}>
                    {formatCurrency(uiTotalIn - totalCashOutSum)}
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

            <ScrollView style={styles.modalList} nestedScrollEnabled>
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
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {cashOutEntries.map((co, idx) => (
                      <View key={idx} style={[styles.tableRow, { alignItems: 'center' }]}>
                        <Text style={[styles.tableCellText, { flex: 2 }]}>{co.Reason || 'Cash Out'}</Text>
                        <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right', paddingRight: 15 }]}>{formatCurrency(co.Amount)}</Text>
                        <View style={{ flexDirection: 'row', gap: 15, width: 60, justifyContent: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setCashOutForm({ ...co, CashOutId: co.CashOutId || co.cashOutId, Amount: co.Amount?.toString() || '' })}>
                            <Ionicons name="create-outline" size={18} color={Theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCashOut(co.CashOutId || co.cashOutId)}>
                            <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
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
                    style={[styles.premiumInput, { textAlign: 'right', fontSize: 18 }]}
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
            </ScrollView>

            <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setCashOutForm({ CashOutId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '' })}
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
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
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
                  </ScrollView>
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
                    style={[styles.premiumInput, { textAlign: 'right', fontSize: 18 }]}
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
            </ScrollView>

            <View style={[styles.modalFooter, { flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.confirmBtn, { flex: 1, backgroundColor: Theme.bgMuted }]}
                onPress={() => setCashInForm({ CashInId: '', Amount: '', Reason: '', Remarks: '', PaymentMode: 'Cash', ReferenceNo: '' })}
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
    height: 280,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
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
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    borderBottomWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    marginBottom: -12,
  },
  highlightText: {
    color: Theme.primaryDark,
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: '#F8FAFC', // Very subtle cool gray
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
    borderBottomColor: "#F0F0F0",
  },
  tableCellText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  currencyInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: Theme.bgInput,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    textAlign: "right",
  },
  premiumInput: {
    height: 52,
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: 'transparent',
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
    maxHeight: 300,
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
    backgroundColor: "#FAFAFA",
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
