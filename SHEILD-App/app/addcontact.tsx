import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import BASE_URL from "../config/api";

export default function AddContact() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const { contact } = useLocalSearchParams();
  const [contactEmail, setContactEmail] = useState("");

  const [contactId, setContactId] = useState<number | null>(null);

  useEffect(() => {
    if (!contact) return;

    try {
      const parsed =
        typeof contact === "string"
          ? JSON.parse(contact)
          : contact;

      setContactId(parsed?.id ?? null);
      setName(parsed?.name ?? "");
      setRelation(parsed?.relation ?? "");
      setPhone(parsed?.phone ?? "");
      setLocation(parsed?.location ?? "");
      setNotes(parsed?.notes ?? "");
      setGender(parsed?.gender ?? null);
      setContactEmail(parsed?.contact_email ?? "");
    } catch (error) {
      console.log("Contact parse error:", error);
    }
  }, [contact]);

  const handleSave = async () => {
    try {
      if (!name.trim() || !phone.trim() || !gender) {
        alert("Name, Phone and Gender are required");
        return;
      }

      const email = await AsyncStorage.getItem("userEmail");

      let url = `${BASE_URL}/add-contact`;
      let method = "POST";

      if (contactId !== null) {
        // UPDATE
        url = `${BASE_URL}/update-contact/${contactId}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          relation,
          phone,
          contact_email: contactEmail,
          location,
          notes,
          gender,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Operation failed");
        return;
      }

      alert(contactId ? "Contact Updated" : "Contact Added");
      router.back();

    } catch (error) {
      console.log(error);
      alert("Server error");
    }
  };



  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <View style={styles.backBtn}>
              <MaterialIcons
                name="chevron-left"
                size={24}
                color="#EC5B13"
              />
            </View>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            {contactId ? "EDIT CONTACT" : "ADD CONTACT"}
          </Text>

          <View style={{ width: 40 }} />
        </View>

        {/* AVATAR */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <MaterialIcons
              name={
                gender === "male"
                  ? "man"
                  : gender === "female"
                    ? "woman"
                    : "person"
              }
              size={60}
              color="#EC5B13"
            />
          </View>

          <Text style={styles.identityTitle}>PROFILE IDENTITY</Text>
          <Text style={styles.identitySub}>
            EMERGENCY CONTACT SETUP
          </Text>
        </View>

        {/* GENDER TOGGLE */}
        <View style={styles.genderRow}>
          <TouchableOpacity
            style={[
              styles.genderBtn,
              gender === "male" && styles.genderActive,
            ]}
            onPress={() => setGender("male")}
          >
            <Text
              style={[
                styles.genderText,
                gender === "male" && styles.genderTextActive,
              ]}
            >
              MALE
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.genderBtn,
              gender === "female" && styles.genderActive,
            ]}
            onPress={() => setGender("female")}
          >
            <Text
              style={[
                styles.genderText,
                gender === "female" && styles.genderTextActive,
              ]}
            >
              FEMALE
            </Text>
          </TouchableOpacity>
        </View>

        {/* FORM CARD */}
        <View style={styles.card}>

          <InputField label="FULL NAME" value={name} onChange={setName} />
          <InputField label="RELATION" value={relation} onChange={setRelation} />
          <InputField
            label="PHONE NUMBER"
            value={phone}
            onChange={setPhone}
            keyboardType="phone-pad"
          />
          <InputField
            label="EMAIL ID"
            value={contactEmail}
            onChange={setContactEmail}
            keyboardType="email-address"
          />
          <InputField label="LOCATION" value={location} onChange={setLocation} />

          <View style={{ marginBottom: 15 }}>
            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Medical info or special instructions..."
              placeholderTextColor="#777"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>
        </View>

        {/* SAVE BUTTON */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <MaterialIcons
            name="shield"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.saveText}>
            {contactId ? "UPDATE CONTACT" : "SAVE CONTACT"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          This contact will receive encrypted emergency alerts.
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* INPUT COMPONENT */
const InputField = ({ label, value, onChange, keyboardType }: any) => (
  <View style={{ marginBottom: 15 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      placeholder="Enter here..."
      placeholderTextColor="#777"
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType}
    />
  </View>
);

/* STYLES */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    paddingHorizontal: 20,
    paddingTop: 40,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  backBtn: {
    backgroundColor: "#2A1B1B",
    padding: 10,
    borderRadius: 50,
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },

  avatarSection: {
    alignItems: "center",
    marginVertical: 30,
  },

  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#2A1B1B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(236,91,19,0.3)",
  },

  identityTitle: {
    marginTop: 15,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  identitySub: {
    color: "#EC5B13",
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 4,
  },

  genderRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 25,
  },

  genderBtn: {
    flex: 1,
    backgroundColor: "#2A1B1B",
    paddingVertical: 12,
    borderRadius: 15,
    alignItems: "center",
  },

  genderActive: {
    backgroundColor: "#EC5B13",
  },

  genderText: {
    color: "#aaa",
    fontWeight: "bold",
  },

  genderTextActive: {
    color: "#fff",
  },

  card: {
    backgroundColor: "#2A1B1B",
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
  },

  label: {
    color: "#777",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 5,
    letterSpacing: 1,
  },

  input: {
    height: 55,
    backgroundColor: "#1f1f1f",
    borderRadius: 15,
    paddingHorizontal: 15,
    color: "#fff",
  },

  textArea: {
    backgroundColor: "#1f1f1f",
    borderRadius: 15,
    padding: 15,
    color: "#fff",
    height: 90,
    textAlignVertical: "top",
  },

  saveBtn: {
    backgroundColor: "#EC5B13",
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#EC5B13",
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
  },

  saveText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  footerNote: {
    marginTop: 15,
    textAlign: "center",
    fontSize: 9,
    color: "#555",
    letterSpacing: 1,
  },
});
