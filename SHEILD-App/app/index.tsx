import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GuardianStateService } from "../services/GuardianStateService";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const checkLogin = async () => {
      const isLoggedIn = await AsyncStorage.getItem("isLoggedIn");

      if (isLoggedIn === "true") {
        await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
        router.replace("/dashboard");
      } else {
        router.replace("/phone");
      }
    };

    checkLogin();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#121212",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" color="#ec1313" />
    </View>
  );
}
