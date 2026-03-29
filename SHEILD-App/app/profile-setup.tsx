import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ImageBackground,
  Switch,
  Alert,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BASE_URL from "../config/api";
import { GuardianStateService } from "../services/GuardianStateService";

export default function ProfileSetup() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }

    if (!password || password.length < 4) {
      Alert.alert("Error", "Password must be at least 4 characters");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    try {
      setLoading(true);

      const email = await AsyncStorage.getItem("userEmail");

      if (!email) {
        Alert.alert("Error", "Email missing. Please login again.");
        return;
      }

      const response = await fetch(
        `${BASE_URL}/register-user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            age: age ? Number(age) : null,
            bloodGroup,
            notes,
            password,
            aiEnabled: aiEnabled ? 1 : 0,
            email,
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        await AsyncStorage.setItem("isLoggedIn", "true");
        await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
        Alert.alert("Success", "Account created successfully!");
        router.replace("/dashboard");
      } else {
        Alert.alert("Error", data.message || "Registration failed");
      }
    } catch (error) {
      console.log("Profile Save Error:", error);
      Alert.alert("Server Error", "Unable to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#181111" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back-ios" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Profile Setup</Text>
          <View style={{ width: 22 }} />
        </View>

        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1200",
          }}
          style={styles.hero}
          imageStyle={{ borderRadius: 16 }}
        >
          <View style={styles.heroOverlay} />
          <View style={styles.profileCircle}>
            <MaterialIcons name="add-a-photo" size={30} color="#777" />
          </View>
        </ImageBackground>

        <View style={{ marginTop: 20 }}>
          <Text style={styles.sectionTitle}>Your Profile</Text>
          <Text style={styles.sectionSub}>
            Information helps SHIELD AI responders during emergencies.
          </Text>
        </View>

        <InputField
          label="Full Name"
          icon="person"
          value={name}
          onChangeText={setName}
          placeholder="Jane Doe"
        />

        <View style={styles.row}>
          <InputField
            label="Age"
            icon="calendar-today"
            value={age}
            onChangeText={setAge}
            placeholder="24"
            keyboardType="number-pad"
            style={{ flex: 1 }}
          />

          <InputField
            label="Blood Group"
            icon="bloodtype"
            value={bloodGroup}
            onChangeText={setBloodGroup}
            placeholder="A+"
            style={{ flex: 1 }}
          />
        </View>

        <InputField
          label="Create Password"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          secure
        />

        <InputField
          label="Confirm Password"
          icon="lock"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          secure
        />

        <View style={styles.inputBlock}>
          <Text style={styles.label}>Emergency Medical Notes</Text>
          <TextInput
            style={[styles.input, { height: 100 }]}
            placeholder="Allergies, chronic conditions..."
            placeholderTextColor="#666"
            multiline
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        <View style={styles.aiBox}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <MaterialIcons name="psychology" size={22} color="#ec1313" />
            <View>
              <Text style={styles.aiTitle}>Enhanced AI Detection</Text>
              <Text style={styles.aiSub}>
                Share profile with responders automatically
              </Text>
            </View>
          </View>

          <Switch
            value={aiEnabled}
            onValueChange={setAiEnabled}
            trackColor={{ false: "#444", true: "#ec1313" }}
            thumbColor="#fff"
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveText}>
            {loading ? "Saving..." : "Save Profile"}
          </Text>
          <MaterialIcons name="verified-user" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- Properly Typed InputField ---------- */

type InputFieldProps = {
  label: string;
  icon: any;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps["keyboardType"];
  secure?: boolean;
  style?: ViewStyle;
};

const InputField = ({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secure,
  style,
}: InputFieldProps) => (
  <View style={[styles.inputBlock, style]}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#666"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        secureTextEntry={secure}
      />
      <MaterialIcons name={icon} size={20} color="#777" />
    </View>
  </View>
);

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  hero: {
    height: 160,
    marginTop: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
  },
  profileCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  sectionSub: {
    color: "#aaa",
    marginTop: 5,
  },
  inputBlock: {
    marginTop: 20,
  },
  label: {
    color: "#aaa",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: "#fff",
    paddingVertical: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  aiBox: {
    marginTop: 30,
    padding: 15,
    backgroundColor: "#1c1c1c",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiTitle: {
    color: "#fff",
    fontWeight: "bold",
  },
  aiSub: {
    color: "#888",
    fontSize: 12,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#181111",
  },
  saveButton: {
    backgroundColor: "#ec1313",
    padding: 15,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  saveText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
