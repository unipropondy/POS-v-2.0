import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import KioskApp from "../src/Kiosk/app/index";
import { useGeneralSettingsStore } from "../stores/generalSettingsStore";

export default function KioskScreen() {
  const router = useRouter();
  const settings = useGeneralSettingsStore((s) => s.settings);
  const fetchSettings = useGeneralSettingsStore((s) => s.fetchSettings);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchSettings().finally(() => {
      if (mounted) setChecked(true);
    });
    return () => {
      mounted = false;
    };
  }, [fetchSettings]);

  const handleReturnToPOS = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/category" as any);
    }
  };

  if (!checked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  const isKioskEnabled = (settings as any)?.EnableKiosk === true || (settings as any)?.EnableKiosk === 1 || (settings as any)?.enableKiosk === true;
  if (!isKioskEnabled) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff7ed", padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 8 }}>
          Kiosk Mode Disabled
        </Text>
        <Text style={{ fontSize: 15, color: "#64748b", textAlign: "center", marginBottom: 24 }}>
          Kiosk access is currently disabled in system settings.
        </Text>
        <TouchableOpacity
          onPress={handleReturnToPOS}
          style={{ backgroundColor: "#ea580c", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Back to POS</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <StatusBar hidden={false} style="light" />
      <KioskApp onBackToPOS={handleReturnToPOS} />
    </>
  );
}

