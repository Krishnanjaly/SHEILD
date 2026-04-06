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
import { fetchKeywords } from "../services/keywordService";
import { DeviceEventEmitter } from "react-native";
import * as IntentLauncher from 'expo-intent-launcher';
import { Audio } from 'expo-av';
import { aiRiskEngine, RiskAnalysis } from "../utils/AiRiskEngine";
import { ActivityService, Activity } from "../services/ActivityService";
import { EmergencyService } from "../services/EmergencyService";
import { GuardianServiceManager } from "../services/GuardianServiceManager";
import { GuardianStateService } from "../services/GuardianStateService";
import { AppLockStorage } from "../services/AppLockStorage";
import {
  ensureVoicePermission,
  isVoiceModuleAvailable,
} from "../services/voiceModule";
import { startVoiceListening, stopVoiceListening } from "../services/voiceDetection";

export default function Dashboard() {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [lowKeywords, setLowKeywords] = useState<string[]>([]);
  const [highKeywords, setHighKeywords] = useState<string[]>([]);
  const [micStatus, setMicStatus] = useState("Inactive");
  const [locationStatus, setLocationStatus] = useState("Off");
  const [sensorStatus, setSensorStatus] = useState("Locked");
  const [airisk, setAiRisk] = useState<RiskAnalysis | null>(null);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [isGuardianEnabled, setIsGuardianEnabled] = useState(false);
  const [guardianStatus, setGuardianStatus] = useState<'PASSIVE' | 'ACTIVE' | 'EMERGENCY'>('PASSIVE');

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

    const loadActivities = async () => {
      const data = await ActivityService.getActivities();
      setRecentActivities(data.slice(0, 3)); // Only show top 3 on dashboard
    };

    loadActivities();

    const sub3 = DeviceEventEmitter.addListener("AI_RISK_DETECTED", (analysis: RiskAnalysis) => {
      setAiRisk(analysis);
      loadActivities(); // Refresh list when new event happens
      setTimeout(() => setAiRisk(prev => prev?.sensorData.timestamp === analysis.sensorData.timestamp ? null : prev), 10000);
    });

    const sub4 = DeviceEventEmitter.addListener("ACTIVITY_UPDATED", loadActivities);

    const checkGuardian = async () => {
      const enabled = await AsyncStorage.getItem('GUARDIAN_ENABLED');
      setIsGuardianEnabled(enabled === 'true');
    };
    checkGuardian();

    const sub5 = DeviceEventEmitter.addListener("AI_RISK_DETECTED", (analysis) => {
        if (analysis.riskLevel === 'HIGH') setGuardianStatus('ACTIVE');
        else setGuardianStatus('PASSIVE');
    });

    return () => {
      sub3.remove();
      sub4.remove();
      sub5.remove();
    };

  }, []);

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

  // 📡 SYSTEM STATUS LOGIC
  const [micEnabled, setMicEnabled] = useState(true);
  const [locEnabled, setLocEnabled] = useState(true);
  const [snsEnabled, setSnsEnabled] = useState(true);

  useEffect(() => {
    const loadToggles = async () => {
      const m = await AsyncStorage.getItem("MIC_ENABLED");
      const l = await AsyncStorage.getItem("LOCATION_ENABLED");
      const s = await AsyncStorage.getItem("SENSORS_ENABLED");
      if (m !== null) setMicEnabled(m === "true");
      if (l !== null) setLocEnabled(l === "true");
      if (s !== null) setSnsEnabled(s === "true");
    };
    loadToggles();
  }, []);

  const toggleMic = async () => {
    const newVal = !micEnabled;

    if (newVal) {
      const hasPermission = await ensureVoicePermission();
      if (!hasPermission) {
        setMicEnabled(true);
        await AsyncStorage.setItem("MIC_ENABLED", "true");
        setMicStatus("Needs Permission");
        Alert.alert(
          "Microphone permission required",
          "Allow microphone access to enable emergency keyword detection."
        );
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
        return;
      }
    }

    setMicEnabled(newVal);
    await AsyncStorage.setItem("MIC_ENABLED", newVal.toString());

    if (newVal) {
      if (aiRiskEngine.isMonitoringActive()) {
        startVoiceListening().catch(console.error);
      }
    } else {
      stopVoiceListening().catch(console.error);
      aiRiskEngine.stopFullAnalysis().catch(console.error); 
    }
    DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
  };

  const toggleGuardian = async () => {
    const newState = !isGuardianEnabled;
    setIsGuardianEnabled(newState);
    
    if (newState) {
      console.log('🛡️ Starting AI Guardian Service...');
      await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
      
      // Request battery optimization ignore
      if (Platform.OS === 'android') {
        const packageName = 'com.shield.safetyapp';
        IntentLauncher.startActivityAsync(
          'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
          { data: `package:${packageName}` }
        );
      }
    } else {
      console.log('🛑 Stopping AI Guardian Service...');
      await GuardianStateService.disableGuardianState();
    }
    
    DeviceEventEmitter.emit('STATUS_TOGGLE_CHANGED');
  };

  const toggleLocation = async () => {
    const newVal = !locEnabled;
    setLocEnabled(newVal);
    await AsyncStorage.setItem("LOCATION_ENABLED", newVal.toString());
    DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
  };

  const toggleSensors = async () => {
    const newVal = !snsEnabled;
    setSnsEnabled(newVal);
    await AsyncStorage.setItem("SENSORS_ENABLED", newVal.toString());
    if (newVal) {
      aiRiskEngine.startMonitoring();
    } else {
      aiRiskEngine.stopMonitoring();
    }
    DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
  };

  useEffect(() => {
    const updateStatuses = async () => {
      // 1. Microphone Status
      if (!micEnabled) {
        setMicStatus("Off");
      } else {
        try {
          if (!isVoiceModuleAvailable()) {
            setMicStatus("Unavailable");
          } else {
            const { status: audioPerm } = await Audio.getPermissionsAsync();
            if (audioPerm !== "granted") {
              setMicStatus("Needs Permission");
            } else {
              const isEngineAnalyzing = aiRiskEngine.isAnalysisActive();
              if (isEngineAnalyzing) {
                setMicStatus("Listening");
              } else {
                setMicStatus("Active");
              }
            }
          }
        } catch (e) {
          setMicStatus("Disabled");
        }
      }

      // 2. Location Status
      if (!locEnabled) {
        setLocationStatus("Off");
      } else {
        try {
          const { status: locPerm } = await Location.getForegroundPermissionsAsync();
          if (locPerm === "granted") {
            if (aiRiskEngine.isMonitoringActive()) {
              setLocationStatus("Shared");
            } else {
              setLocationStatus("Ready");
            }
          } else {
            setLocationStatus("Off");
          }
        } catch (e) {
          setLocationStatus("Off");
        }
      }

      // 3. Sensor Status
      if (!snsEnabled) {
        setSensorStatus("Off");
      } else {
        if (aiRiskEngine.isAnalysisActive()) {
          setSensorStatus("Analyzing");
        } else if (aiRiskEngine.isMonitoringActive()) {
          setSensorStatus("Monitoring");
        } else {
          setSensorStatus("Locked");
        }
      }
    };

    updateStatuses();
    const interval = setInterval(updateStatuses, 3000);

    return () => clearInterval(interval);
  }, [micEnabled, locEnabled, snsEnabled]);

  const handleSOS = async () => {
    try {
      ActivityService.logActivity('Manual SOS Triggered via Long Press');

      // 1️⃣ Get location permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Permission Required", "Location permission is required for SOS.");
        return;
      }

      // 2️⃣ Get current location
      let lat = 0;
      let lon = 0;
      let mapLink = "";

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = location.coords.latitude;
        lon = location.coords.longitude;
        mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
      } catch (locErr) {
        console.log("Location request failed, proceeding without location:", locErr);
      }

      // 3️⃣ Fetch trusted contacts from backend (Trusted Circles)
      const userId = await AsyncStorage.getItem("userId") || "U101";
      const contactResponse = await fetch(`${BASE_URL}/getTrustedContacts/${userId}`);

      if (!contactResponse.ok) {
        throw new Error(`Failed to fetch contacts: HTTP ${contactResponse.status}`);
      }

      const contacts = await contactResponse.json();

      // (NEW) 3B -> Find closest contact based on latitude and longitude
      if (contacts.length > 0) {
        let closestContact = contacts[0];
        let minDistance = Infinity;

        contacts.forEach((c: any) => {
          if (c.latitude && c.longitude) {
            const distance = haversine(
              { latitude: lat, longitude: lon },
              { latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) },
              { unit: 'mile' }
            );

            if (distance < minDistance) {
              minDistance = distance;
              closestContact = c;
            }
          }
        });

        if (closestContact?.trusted_no) {
          console.log("Calling closest contact: ", closestContact.trusted_no);

          if (Platform.OS === 'android') {
            try {
              const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CALL_PHONE
              );

              if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                console.log('CALL_PHONE permission granted. Dialing directly...');
                IntentLauncher.startActivityAsync('android.intent.action.CALL', {
                  data: `tel:${closestContact.trusted_no}`
                }).catch((e) => { console.log("Call failed", e) });
              }
            } catch (err) {
              console.warn(err);
            }
          }
        }
      }

      // 4️⃣ Send SMS alert to trusted contacts
      // and start emergency record in database
      const startRes = await EmergencyService.startEmergency(userId, "MANUAL SOS", mapLink);
      if (startRes.success) {
          await EmergencyService.logAlert(startRes.emergency_id, 'sms');
          await ActivityService.logActivity("SOS_TRIGGERED_MANUAL", startRes.emergency_id);
          await EmergencyService.sendTrustedContactAlerts({
            userId,
            locationUrl: mapLink || "Location unavailable",
            keyword: "MANUAL SOS",
            riskLevel: "HIGH",
            emergencyId: startRes.emergency_id,
            contacts,
          });
      } else {
          await EmergencyService.sendTrustedContactAlerts({
            userId,
            locationUrl: mapLink || "Location unavailable",
            keyword: "MANUAL SOS",
            riskLevel: "HIGH",
            contacts,
          });
      }

      console.log("Emergency alert sent successfully.");

    } catch (error) {
      console.log("Failed to trigger SOS.", error);
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

  const handleLogoutPreservingAppLock = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          onPress: async () => {
            await AppLockStorage.disableAppLockPreserveCredentials();
            await AsyncStorage.multiRemove([
              "isLoggedIn",
              "userId",
              "userName",
              "userEmail",
            ]);

            Alert.alert("Success", "Logged out successfully!");
            router.replace("/phone");
          },
        },
      ]
    );
  };

  const openSettings = async () => {
    router.push("/settings");
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
                handleLogoutPreservingAppLock();
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
          <StatusCard icon="mic" label="Mic" value={micStatus} onPress={toggleMic} />
          <StatusCard icon="location-on" label="Location" value={locationStatus} onPress={toggleLocation} />
          <StatusCard icon="sensors" label="Sensors" value={sensorStatus} onPress={toggleSensors} />
          <StatusCard 
            icon="verified-user" 
            label="Guardian" 
            value={isGuardianEnabled ? "Active" : "Offline"} 
            onPress={toggleGuardian} 
            color={isGuardianEnabled ? "#34d399" : "#666"}
          />
        </View>

        {/* AI Banner */}
        <View style={[
          styles.aiBanner,
          airisk?.riskLevel === 'HIGH' ? { backgroundColor: 'rgba(236,19,19,0.2)', borderColor: '#ec1313' } :
            airisk?.riskLevel === 'LOW' ? { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: '#eab308' } : {}
        ]}>
          <View style={[
            styles.aiIcon,
            airisk?.riskLevel === 'HIGH' ? { backgroundColor: 'rgba(236,19,19,0.3)' } :
              airisk?.riskLevel === 'LOW' ? { backgroundColor: 'rgba(234,179,8,0.2)' } : {}
          ]}>
            <MaterialIcons
              name={airisk?.riskLevel === 'HIGH' ? "warning" : airisk?.riskLevel === 'LOW' ? "error-outline" : "smart-toy"}
              size={22}
              color={airisk?.riskLevel === 'HIGH' ? "#ec1313" : airisk?.riskLevel === 'LOW' ? "#eab308" : "#ec1313"}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiTitle}>
              {airisk?.riskLevel === 'HIGH' ? "HIGH RISK DETECTED" :
                airisk?.riskLevel === 'LOW' ? "POSSIBLE THREAT DETECTED" :
                  !snsEnabled ? "AI Guardian is Offline" :
                    "AI Guardian is Monitoring"}
            </Text>
            <Text style={styles.aiSub} numberOfLines={1} adjustsFontSizeToFit>
              {airisk?.triggers.length ? airisk.triggers.join(", ") :
                !snsEnabled ? "Sensors are manually disabled." :
                  "Silent mode enabled. No threats detected."}
            </Text>
          </View>
        </View>

        <View style={styles.activitySection}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={styles.activityTitle}>RECENT ACTIVITY</Text>
            <TouchableOpacity onPress={() => router.push("/log")}>
              <Text style={{ color: "#ec1313", fontSize: 10 }}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>

          {recentActivities.length > 0 ? (
            recentActivities.map(act => (
              <ActivityItem
                key={act.id}
                icon={act.activity_type.includes('AI') ? "smart-toy" : act.activity_type.includes('KEYWORD') ? "mic" : "warning"}
                text={act.activity_type}
                time={new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              />
            ))
          ) : (
            <Text style={{ color: "#666", fontSize: 12, textAlign: "center", fontStyle: "italic", marginVertical: 10 }}>
              No recent security logs.
            </Text>
          )}
        </View>

        <View style={styles.featureGrid}>

          <FeatureButton icon="group" label="Emergency Contacts" route="/contacts" />
          <FeatureButton icon="location-on" label="Share Location" route="/safemap" />
          <FeatureButton icon="phone-in-talk" label="Fake Call" route="/fake-call" />
          <FeatureButton icon="call" label="Helpline Numbers" route="/helpline" />
          <FeatureButton icon="storage" label="Cloud Storage" route="/cloud-storage" />
          <FeatureButton icon="qr-code" label="QR Emergency" route="/qr" />
          <FeatureButton icon="verified-user" label="Trusted Circles" route="/trustedCircles" />
          <FeatureButton icon="smart-toy" label="AI Guardian" route="/guardian" />
          <FeatureButton icon="history" label="Recent Activity" route="/log" />
          <FeatureButton icon="report" label="About" route="/report" />

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
          onPress={() => {
            openSettings().catch(console.error);
          }}
        />
      </View>

    </View>
  );
}

/* ---------------- COMPONENTS ---------------- */

const StatusCard = ({ icon, label, value, onPress }: any) => {
  const getStatusColor = (val: string) => {
    switch (val) {
      case "Active":
      case "Shared":
      case "Monitoring":
      case "Listening":
      case "Analyzing":
        return "#22c55e"; // Green
      case "Locked":
      case "Ready":
        return "#eab308"; // Yellow
      case "Disabled":
      case "Off":
        return "#ec1313"; // Red
      default:
        return "#aaa";
    }
  };

  const statusColor = getStatusColor(value);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialIcons name={icon} size={22} color={statusColor} />
      <Text style={styles.cardLabel}>{label}</Text>
      <Text
        style={[styles.cardValue, { color: statusColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </TouchableOpacity>
  );
};

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
    fontSize: 12,
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
