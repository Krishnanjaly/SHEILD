import { LogBox } from "react-native";

LogBox.ignoreLogs(["[expo-av]: Expo AV has been deprecated"]);

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("Expo AV has been deprecated")) {
    return;
  }
  originalWarn(...args);
};

import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
