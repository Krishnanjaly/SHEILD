import React, { useEffect } from "react";
import { LogBox } from "react-native";
import ReactNativeForegroundService from "@supersami/rn-foreground-service";

ReactNativeForegroundService.register({
  config: {
    alert: false,
    onServiceErrorCallBack: function () {
      console.warn("Foreground service error");
    },
  },
});

LogBox.ignoreLogs(["[expo-av]: Expo AV has been deprecated"]);

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("Expo AV has been deprecated")) {
    return;
  }
  originalWarn(...args);
};

import { Stack } from "expo-router";
import EmergencyMonitor from "../components/EmergencyMonitor";

export default function Layout() {
  useEffect(() => {
    try {
      ReactNativeForegroundService.start({
        id: 114,
        title: "SHIELD Guardian Active",
        message: "Listening for volume triggers and shakes.",
        icon: "ic_launcher",
        button: false,
        button2: false,
        setOnlyAlertOnce: "true",
        color: "#ec1313",
        ServiceType: "location|microphone|camera",
      } as any);
    } catch (e) {
      console.log("Foreground Service errored: ", e);
    }
  }, []);

  return (
    <>
      <EmergencyMonitor />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
