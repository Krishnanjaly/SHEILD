import React, { useEffect } from "react";
import { BackHandler, LogBox } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import EmergencyMonitor from "../components/EmergencyMonitor";
import { GuardianStateService } from "../services/GuardianStateService";

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs(["[expo-av]: Expo AV has been deprecated"]);

const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("Expo AV has been deprecated")
  ) {
    return;
  }
  originalWarn(...args);
};

export default function Layout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    GuardianStateService.ensureBackgroundGuardianForLoggedInUser().catch((e) => {
      console.log("Guardian auto-start error:", e);
    });

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => false
    );

    return () => {
      backHandler.remove();
    };
  }, []);

  return (
    <>
      <EmergencyMonitor />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
