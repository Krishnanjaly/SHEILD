import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import BASE_URL from "../config/api";
import * as Location from "expo-location";
import { Linking, Platform, PermissionsAndroid } from "react-native";
import haversine from 'haversine';
import { addVolumeListener } from "react-native-volume-manager";
import call from 'react-native-phone-call';
import { fetchKeywords } from "../services/keywordService";
import { DeviceEventEmitter } from "react-native";
import EmergencyOverlay from "../components/EmergencyOverlay";

export default function Dashboard() {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [lowKeywords, setLowKeywords] = useState([]);
  const [highKeywords, setHighKeywords] = useState([]);
  const [overlayVisible, setOverlayVisible] = useState(false);

  useEffect(() => {

    const loadKeywords = async () => {
      const userId = await AsyncStorage.getItem("userId");
      if (userId) {
        const data = await fetchKeywords(userId);

        setLowKeywords(data.lowKeywords);
        setHighKeywords(data.highKeywords);
      }
    };

    loadKeywords();

  }, []);

  useEffect(() => {

    const sub1 = DeviceEventEmitter.addListener("EMERGENCY_LISTENING_START", () => {
      setOverlayVisible(true);
    });

    const sub2 = DeviceEventEmitter.addListener("EMERGENCY_LISTENING_STOP", () => {
      setOverlayVisible(false);
    });

    return () => {
      sub1.remove();
      sub2.remove();
    };

  }, []);

  const handleCancelListening = () => {
    setOverlayVisible(false); // Instantly hide the overlay
    DeviceEventEmitter.emit("EMERGENCY_LISTENING_CANCEL"); // Tell EmergencyMonitor to unlock mic
  };

  const startListeningMode = () => {
    console.log("Emergency listening started");
  };

  // 🔐 Protect Dashboard (redirect if not logged in)
  useEffect(() => {
    const checkLogin = async () => {
      const isLoggedIn = await AsyncStorage.getItem("isLoggedIn");
      if (isLoggedIn !== "true") {
        router.replace("/phone");
      }
    };

    checkLogin();
  }, []);

  const handleSOS = async () => {
    try {
      const email = await AsyncStorage.getItem("userEmail");

      // 1️⃣ Get location permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Permission Required", "Location permission is required for SOS.");
        return;
      }

      // 2️⃣ Get current location
      const location = await Location.getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lon = location.coords.longitude;

      const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;

      // 3️⃣ Fetch trusted contacts from backend
      const contactResponse = await fetch(`${BASE_URL}/contacts/${email}`);

      if (!contactResponse.ok) {
        throw new Error(`Failed to fetch contacts: HTTP ${contactResponse.status}`);
      }

      const data = await contactResponse.json();
      const contacts = Array.isArray(data) ? data : (Array.isArray(data.contacts) ? data.contacts : []);

      // (NEW) 3B -> Find closest contact based on latitude and longitude
      if (contacts.length > 0) {
        let closestContact = contacts[0];
        let minDistance = Infinity;

        contacts.forEach((c: any) => {
          if (c.latitude && c.longitude) {
            const distance = haversine(
              { latitude: lat, longitude: lon },
              { latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) }
            );

            if (distance < minDistance) {
              minDistance = distance;
              closestContact = c;
            }
          }
        });

        if (closestContact?.phone) {
          console.log("Calling closest contact: ", closestContact.phone);

          if (Platform.OS === 'android') {
            try {
              const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CALL_PHONE,
                {
                  title: 'Emergency Call Permission',
                  message: 'SHIELD needs access to make automatic emergency calls.',
                  buttonNeutral: 'Ask Me Later',
                  buttonNegative: 'Cancel',
                  buttonPositive: 'OK',
                }
              );

              if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                console.log('CALL_PHONE permission granted. Dialing bypassing overlay...');
                const args = {
                  number: closestContact.phone,
                  prompt: false, // Bypass the prompt to dial directly
                };
                call(args).catch(() => { Linking.openURL(`tel:${closestContact.phone}`); });
              } else {
                console.log('CALL_PHONE permission denied. Falling back to dialer.');
                Linking.openURL(`tel:${closestContact.phone}`);
              }
            } catch (err) {
              console.warn(err);
              Linking.openURL(`tel:${closestContact.phone}`);
            }
          } else {
            // For iOS or other platforms, we might fallback to prompt dialer, or handle appropriately
            const args = {
              number: closestContact.phone,
              prompt: false, // react-native-phone-call has custom iOS implementation, but usually iOS forces a prompt
            };
            call(args).catch(() => { Linking.openURL(`tel:${closestContact.phone}`); });
          }
        }
      }

      // 4️⃣ Send alert to backend (automatic email notification to trusted contacts)
      await fetch(`${BASE_URL}/send-sos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          latitude: lat,
          longitude: lon,
        }),
      });

      Alert.alert("SOS Activated", "Emergency alert sent successfully.");

    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to trigger SOS.");
    }
  };


  // 🚪 Logout with confirmation
  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          onPress: async () => {
            await AsyncStorage.clear(); // 🔥 clear everything

            Alert.alert("Success", "Logged out successfully!");

            router.replace("/phone"); // 🔥 go directly to login
          },
        },
      ]
    );
  };



  return (
    <View style={styles.container}>

      {/* 🔥 HEADER OUTSIDE SCROLLVIEW */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 15,
          backgroundColor: "#181111",
        }}
      >
        <MaterialIcons name="favorite" size={28} color="#ec1313" />

        <Text
          style={{
            color: "#fff",
            fontSize: 20,
            fontWeight: "bold",
          }}
        >
          SHEILD
        </Text>

        <View style={{ position: "relative" }}>
          <TouchableOpacity
            onPress={() => setMenuVisible(!menuVisible)}
            style={{
              padding: 10,
              borderRadius: 50,
              backgroundColor: "#2a1b1b",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="more-vert" size={26} color="#ec1313" />
          </TouchableOpacity>
        </View>

        {menuVisible && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setMenuVisible(false);
                router.push("/profile");
              }}
            >
              <MaterialIcons name="person" size={18} color="#fff" />
              <Text style={styles.dropdownText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setMenuVisible(false);
                handleLogout();
              }}
            >
              <MaterialIcons name="logout" size={18} color="#ff4444" />
              <Text style={[styles.dropdownText, { color: "#ff4444" }]}>
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 🔥 SCROLLABLE CONTENT */}
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Status Header */}
        <View style={styles.statusSection}>
          <Text style={styles.statusTitle}>Safety Service Active</Text>
          <View style={styles.statusRow}>
            <View style={styles.greenDot} />
            <Text style={styles.statusSub}>
              System monitoring for your safety
            </Text>
          </View>
        </View>

        {/* SOS Button Section */}
        <View style={styles.sosContainer}>
          <View style={styles.sosOuter} />
          <View style={styles.sosMiddle} />

          <TouchableOpacity
            style={styles.sosButton}
            onLongPress={handleSOS}
            delayLongPress={1000} // 1 second hold
          >
            <MaterialIcons name="back-hand" size={40} color="#fff" />
            <Text style={styles.sosText}>HOLD TO TRIGGER</Text>
            <Text style={styles.sosSub}>EMERGENCY SOS</Text>
          </TouchableOpacity>
        </View>

        {/* Status Cards */}
        <View style={styles.cardRow}>
          <StatusCard icon="mic" label="Mic" value="Active" />
          <StatusCard icon="location-on" label="Location" value="Shared" />
          <StatusCard icon="sensors" label="Sensors" value="Locked" />
        </View>

        {/* AI Banner */}
        <View style={styles.aiBanner}>
          <View style={styles.aiIcon}>
            <MaterialIcons name="smart-toy" size={22} color="#ec1313" />
          </View>
          <View>
            <Text style={styles.aiTitle}>AI Guardian is analyzing</Text>
            <Text style={styles.aiSub}>
              Silent mode enabled. No threats detected.
            </Text>
          </View>
        </View>

        <View style={styles.featureGrid}>

          <FeatureButton icon="group" label="Emergency Contacts" route="/contacts" />
          <FeatureButton icon="timer" label="Safety Timer" route="/safetimer" />
          <FeatureButton icon="location-on" label="Share Location" route="/safemap" />
          <FeatureButton icon="phone-in-talk" label="Fake Call" route="/fake-call" />
          <FeatureButton icon="call" label="Helpline Numbers" route="/helpline" />
          <FeatureButton icon="storage" label="Cloud Storage" route="/cloud-storage" />
          <FeatureButton icon="verified-user" label="Trusted Circles" route="/trustedCircles" />
          <FeatureButton icon="report" label="About" route="/report" />
          <FeatureButton icon="smart-toy" label="AI Guardian" route="/guardian" />

        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.navBar}>
        <NavItem
          icon="home"
          label="Home"
          active
          onPress={() => router.replace("/dashboard")}
        />
        <NavItem
          icon="group"
          label="Contacts"
          onPress={() => router.push("/contacts")}
        />
        <NavItem
          icon="map"
          label="SafeMap"
          onPress={() => router.push("/safemap")}
        />
        <NavItem
          icon="settings"
          label="Settings"
          onPress={() => router.push("/settings")}
        />
      </View>

      <EmergencyOverlay
        visible={overlayVisible}
        onCancel={handleCancelListening}
      />

    </View>
  );
}

/* ---------------- COMPONENTS ---------------- */

const StatusCard = ({ icon, label, value }: any) => (
  <View style={styles.card}>
    <MaterialIcons name={icon} size={22} color="#ec1313" />
    <Text style={styles.cardLabel}>{label}</Text>
    <Text style={styles.cardValue}>{value}</Text>
  </View>
);

const ActivityItem = ({ icon, text, time }: any) => (
  <View style={styles.activityItem}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <MaterialIcons name={icon} size={16} color="#aaa" />
      <Text style={styles.activityText}>{text}</Text>
    </View>
    <Text style={styles.activityTime}>{time}</Text>
  </View>
);

const NavItem = ({ icon, label, active, onPress }: any) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress}>
    <MaterialIcons
      name={icon}
      size={24}
      color={active ? "#ec1313" : "#777"}
    />
    <Text
      style={[
        styles.navLabel,
        { color: active ? "#ec1313" : "#777" },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);
const FeatureButton = ({ icon, label, route }: any) => {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.featureCard}
      activeOpacity={0.8}
      onPress={() => router.push(route)}
    >
      <MaterialIcons name={icon} size={28} color="#ec1313" />
      <Text style={styles.featureLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#181111",
    paddingTop: 30,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10,
    backgroundColor: "#181111",
    zIndex: 10,   // important
  },


  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },


  profileButton: {
    backgroundColor: "#2a1b1b",
    padding: 8,
    borderRadius: 20,
  },

  statusSection: {
    alignItems: "center",
    marginTop: 10,
  },

  statusTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  greenDot: {
    width: 8,
    height: 8,
    backgroundColor: "green",
    borderRadius: 4,
    marginRight: 6,
  },

  statusSub: {
    color: "#aaa",
    fontSize: 12,
  },

  sosContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 40,
  },

  sosOuter: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(236,19,19,0.1)",
  },

  sosMiddle: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(236,19,19,0.2)",
  },

  sosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#ec1313",
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
  },

  sosText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 6,
  },

  sosSub: {
    color: "#fff",
    fontSize: 9,
    marginTop: 2,
  },

  cardRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 15,
  },

  card: {
    backgroundColor: "#2a1b1b",
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
    width: 100,
  },

  cardLabel: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 5,
  },

  cardValue: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },

  aiBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(236,19,19,0.1)",
    borderColor: "rgba(236,19,19,0.2)",
    borderWidth: 1,
    margin: 20,
    padding: 15,
    borderRadius: 15,
  },

  aiIcon: {
    backgroundColor: "rgba(236,19,19,0.2)",
    padding: 8,
    borderRadius: 10,
    marginRight: 10,
  },

  aiTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },

  aiSub: {
    color: "#aaa",
    fontSize: 11,
  },

  activitySection: {
    paddingHorizontal: 20,
    marginTop: 10,
  },

  activityTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 10,
  },

  activityItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#2a1b1b",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },

  activityText: {
    color: "#ccc",
    fontSize: 12,
  },

  activityTime: {
    color: "#777",
    fontSize: 10,
  },

  navBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 80,
    backgroundColor: "#181111",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },

  navItem: {
    alignItems: "center",
  },

  navLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 10,
  },

  featureCard: {
    width: "47%",
    backgroundColor: "#2a1b1b",
    paddingVertical: 25,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    elevation: 5,
  },

  featureLabel: {
    marginTop: 8,
    fontSize: 12,
    color: "#ddd",
    textAlign: "center",
  },
  dropdownMenu: {
    position: "absolute",
    top: 50,
    right: 0,
    backgroundColor: "#2a1b1b",
    borderRadius: 12,
    paddingVertical: 10,
    width: 160,
    elevation: 10,
    zIndex: 100,
  },

  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },

  dropdownText: {
    color: "#fff",
    fontSize: 14,
  },
});
