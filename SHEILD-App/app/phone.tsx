import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { MaterialIcons, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BASE_URL from "../config/api";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";

WebBrowser.maybeCompleteAuthSession();

export default function PhoneScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Google Auth Setup (Production Ready)
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: "158206063504-4477q0hgvhf2krtp348stralccv2cmki.apps.googleusercontent.com",
    webClientId: "158206063504-05kjh8j70kg11es9rn4th0d3egcklh1l.apps.googleusercontent.com",
  });

  /* ================================
     ✅ Auto redirect if logged in
  ================================= */
  useEffect(() => {
    const checkLogin = async () => {
      const isLoggedIn = await AsyncStorage.getItem("isLoggedIn");
      if (isLoggedIn === "true") {
        router.replace("/dashboard");
      }
    };
    checkLogin();
  }, []);

  /* ================================
     ✅ Handle Google Response
  ================================= */
  useEffect(() => {
    if (response) {
      if (response.type === "success") {
        const { authentication } = response;
        fetchUserInfo(authentication?.accessToken);
      } else if (response.type === "error") {
        Alert.alert("Google Auth Error", response.error?.message || "Something went wrong. Check your Google Console IDs.");
        setLoading(false);
      } else if (response.type === "cancel") {
        setLoading(false);
      }
    }
  }, [response]);

  const fetchUserInfo = async (token: string | undefined) => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = await res.json();

      // Send to our backend
      await syncWithBackend(user);
    } catch (e) {
      Alert.alert("Error", "Failed to get Google user info");
      setLoading(false);
    }
  };

  const syncWithBackend = async (googleUser: any) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.name,
          profile_pic: googleUser.picture
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Store session
        await AsyncStorage.setItem("isLoggedIn", "true");
        await AsyncStorage.setItem("userId", data.user.id.toString());
        await AsyncStorage.setItem("userName", data.user.name || "");
        await AsyncStorage.setItem("userEmail", data.user.email);

        router.replace("/dashboard");
      } else {
        Alert.alert("Auth Failed", data.message || "Backend synchronization failed");
      }
    } catch (err) {
      Alert.alert("Server Error", "Backend is unreachable");
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

      {/* Fingerprint Circle */}
      <View style={styles.circle}>
        <MaterialIcons name="fingerprint" size={50} color="#ec1313" />
      </View>

      {/* Login Section */}
      <Text style={styles.loginTitle}>Identification Required</Text>
      <Text style={styles.loginSub}>
        Access your safety dashboard using your Google account.
      </Text>

      {/* Google Login Button */}
      <TouchableOpacity
        style={[styles.googleButton, (!request || loading) && { opacity: 0.6 }]}
        onPress={() => {
          setLoading(true);
          promptAsync();
        }}
        disabled={loading || !request}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <FontAwesome name="google" size={20} color="#fff" />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </>
        )}
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
          OAuth 2.0 Secure Session
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

  googleButton: {
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
});
