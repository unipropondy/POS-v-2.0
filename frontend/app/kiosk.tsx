import React from "react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import KioskApp from "../src/Kiosk/app/index";

export default function KioskScreen() {
  const router = useRouter();

  const handleReturnToPOS = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/category" as any);
    }
  };

  return (
    <>
      <StatusBar hidden={false} style="light" />
      <KioskApp onBackToPOS={handleReturnToPOS} />
    </>
  );
}

