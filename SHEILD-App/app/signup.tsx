import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import BASE_URL from "../config/api";

export default function SignupScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /* ================================
     ✅ Signup Handler
  ================================= */
  const handleSignup = async () => {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    // Input validation
    if (!trimmedUsername || !trimmedEmail || !trimmedPassword) {
      Alert.alert("Missing Fields", "Please fill all fields");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return;
    }

    // Password strength check
    if (trimmedPassword.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters long");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          password: trimmedPassword,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        Alert.alert(
          "Success",
          "Account created successfully! Please login to continue.",
          [{ text: "OK", onPress: () => router.replace("/phone") }]
        );
      } else {
        Alert.alert(
          "Signup Failed",
          data.message || "Registration failed. Please try again."
        );
      }
    } catch (err) {
      Alert.alert(
        "Network Error",
        "Unable to reach the server. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <MaterialIcons name="shield" size={32} color="#ec1313" />
          <View style={{ width: 24 }} />
        </View>

        {/* Branding */}
        <Text style={styles.logo}>SHIELD</Text>
        <Text style={styles.tagline}>
          Create your account for silent protection.
        </Text>

        {/* Signup Section */}
        <Text style={styles.loginTitle}>Registration</Text>
        <Text style={styles.loginSub}>
          Join the network of protected citizens.
        </Text>

        {/* Username Input */}
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#666"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        {/* Email Input */}
        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
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

        {/* Signup Button */}
        <TouchableOpacity
          style={[styles.loginButton, loading && { opacity: 0.6 }]}
          onPress={handleSignup}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="person-add" size={20} color="#fff" />
              <Text style={styles.buttonText}>Create Account</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Login Link */}
        <TouchableOpacity
          onPress={() => router.replace("/phone")}
          style={styles.signupContainer}
          disabled={loading}
        >
          <Text style={styles.signupText}>
            Already have an account? <Text style={styles.signupLink}>Login</Text>
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footerText}>
          By signing up, you agree to our{" "}
          <Text style={styles.link}>Terms</Text> and{" "}
          <Text style={styles.link}>Privacy Policy</Text>.
        </Text>

        <View style={styles.secureRow}>
          <MaterialIcons name="lock" size={14} color="#666" />
          <Text style={styles.secureText}>
            Encrypted Secure Registration
          </Text>
        </View>
      </ScrollView>
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
    alignItems: "center",
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
    marginBottom: 20,
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
