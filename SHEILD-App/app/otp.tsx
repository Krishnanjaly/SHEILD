import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BASE_URL from "../config/api";
import { GuardianStateService } from "../services/GuardianStateService";
import { AppLockStorage } from "../services/AppLockStorage";


export default function OtpScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const handleVerify = async () => {
    if (!email) {
      Alert.alert("Error", "Email missing.");
      return;
    }

    if (!otp || otp.length !== 6) {
      Alert.alert("Invalid OTP", "Enter a valid 6-digit OTP");
      return;
    }

    try {
      setLoading(true);

      const emailString =
        Array.isArray(email) ? email[0] : email;

      const response = await fetch(
        `${BASE_URL}/verify-email-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailString,
            otp,
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {

        const emailString =
          Array.isArray(email) ? email[0] : email;

        // Save login status
        await AsyncStorage.setItem("isLoggedIn", "true");
        await AsyncStorage.setItem("userEmail", emailString);

        // 🔥 Always fetch user from backend
        const userResponse = await fetch(`${BASE_URL}/user/${emailString}`);
        const userData = await userResponse.json();

        if (userResponse.ok && userData.id) {
          await AsyncStorage.setItem(
            "userId",
            userData.id.toString()
          );
          console.log("Stored userId:", userData.id);
          await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
        } else {
          console.log("User not found after OTP");
        }

        if (data.existingUser) {
          const nextRoute = await AppLockStorage.getFreshAuthSuccessRoute();
          router.replace(nextRoute);
        } else {
          router.replace("/profile-setup");
        }
      }

    } catch (error) {
      console.log("OTP Verify Error:", error);
      Alert.alert("Server Error", "Unable to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OTP Verification</Text>
      <Text style={styles.subtitle}>
        Enter the 6-digit code sent to {email}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Enter OTP"
        placeholderTextColor="#888"
        keyboardType="number-pad"
        maxLength={6}
        value={otp}
        onChangeText={setOtp}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    color: "#aaa",
    textAlign: "center",
    marginBottom: 30,
  },
  input: {
    backgroundColor: "#1c1c1c",
    color: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 8,
  },
  button: {
    backgroundColor: "#ec1313",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
