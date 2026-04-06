import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BASE_URL from "../config/api";
import { GuardianStateService } from "../services/GuardianStateService";
import { AppLockStorage } from "../services/AppLockStorage";

export default function PhoneScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /* ================================
     ✅ Auto redirect if logged in
  ================================= */
  useEffect(() => {
    const checkLogin = async () => {
      const isLoggedIn = await AsyncStorage.getItem("isLoggedIn");
      if (isLoggedIn === "true") {
        const shouldRequireUnlock = await AppLockStorage.shouldRequireUnlock();
        router.replace(shouldRequireUnlock ? "/app-lock" : "/dashboard");
      }
    };
    checkLogin();
  }, [router]);

  /* ================================
     ✅ Login Handler
  ================================= */
  const handleLogin = async () => {
    const trimmedIdentifier = identifier.trim();
    const trimmedPassword = password.trim();

    // Input validation
    if (!trimmedIdentifier || !trimmedPassword) {
      Alert.alert("Missing Fields", "Please fill all fields");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: trimmedIdentifier,
          password: trimmedPassword,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Store user session
        await AsyncStorage.setItem("isLoggedIn", "true");
        await AsyncStorage.setItem("userId", data.user.id.toString());
        await AsyncStorage.setItem("userName", data.user.name || "");
        await AsyncStorage.setItem("userEmail", data.user.email || "");
        await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();

        const nextRoute = await AppLockStorage.getFreshAuthSuccessRoute();
        router.replace(nextRoute);
      } else {
        Alert.alert(
          "Login Failed",
          data.message || "Invalid credentials. Please try again."
        );
      }
    } catch (err: any) {
      Alert.alert(
        "Network Error",
        `Unable to reach the server.\n\nDetails: ${err.message}\nURL: ${BASE_URL}/auth/login`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialIcons name="shield" size={32} color="#ec1313" />
        <MaterialIcons name="help-outline" size={24} color="#777" />
      </View>

      {/* Branding */}
      <Text style={styles.logo}>SHIELD</Text>
      <Text style={styles.tagline}>
        Silent Protection. Smart Response.
      </Text>

      {/* Security Badge */}
      <View style={styles.circle}>
        <MaterialIcons name="lock" size={50} color="#ec1313" />
      </View>

      {/* Login Section */}
      <Text style={styles.loginTitle}>Identification Required</Text>
      <Text style={styles.loginSub}>
        Enter your username or email to access your safety dashboard.
      </Text>

      {/* Username / Email Input */}
      <TextInput
        style={styles.input}
        placeholder="Username or Email"
        placeholderTextColor="#666"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!loading}
      />

      {/* Password Input */}
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true}
        autoCapitalize="none"
        editable={!loading}
      />

      {/* Login Button */}
      <TouchableOpacity
        style={[styles.loginButton, loading && { opacity: 0.6 }]}
        onPress={handleLogin}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="login" size={20} color="#fff" />
            <Text style={styles.buttonText}>Login</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Signup Link */}
      <TouchableOpacity
        onPress={() => router.push("/signup")}
        style={styles.signupContainer}
        disabled={loading}
      >
        <Text style={styles.signupText}>
          New user? <Text style={styles.signupLink}>Create an account</Text>
        </Text>
      </TouchableOpacity>

      {/* Footer */}
      <Text style={styles.footerText}>
        By signing in, you agree to our{" "}
        <Text style={styles.link}>Terms</Text> and{" "}
        <Text style={styles.link}>Privacy Policy</Text>.
      </Text>

      <View style={styles.secureRow}>
        <MaterialIcons name="lock" size={14} color="#666" />
        <Text style={styles.secureText}>
          Encrypted Secure Session
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },

  logo: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginTop: 20,
  },

  tagline: {
    color: "#888",
    textAlign: "center",
    marginBottom: 30,
  },

  circle: {
    alignSelf: "center",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(236,19,19,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },

  loginTitle: {
    fontSize: 22,
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 5,
  },

  loginSub: {
    color: "#888",
    marginBottom: 20,
  },

  input: {
    backgroundColor: "#1e1e1e",
    color: "#fff",
    padding: 16,
    borderRadius: 15,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },

  loginButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ec1313",
    padding: 16,
    borderRadius: 15,
    marginTop: 10,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  footerText: {
    color: "#666",
    textAlign: "center",
    fontSize: 12,
    marginTop: 30,
  },

  link: {
    color: "#ec1313",
  },

  secureRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 5,
  },

  secureText: {
    color: "#666",
    fontSize: 11,
  },
  signupContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  signupText: {
    color: "#888",
    fontSize: 14,
  },
  signupLink: {
    color: "#ec1313",
    fontWeight: "bold",
  },
});
