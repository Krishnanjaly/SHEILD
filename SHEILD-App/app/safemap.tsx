import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef } from "react";
import * as Location from "expo-location";
import MapComponent, { Marker } from "../components/MapComponent";
import { Share } from "react-native";

export default function SafeMap() {
  const router = useRouter();
  const mapRef = useRef<any>(null);

  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      alert("Location permission denied");
      setLoading(false);
      return;
    }

    let currentLocation = await Location.getCurrentPositionAsync({});
    setLocation(currentLocation.coords);
    setLoading(false);

    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };
  const shareLocation = async () => {
    if (!location) {
      alert("Location not available yet");
      return;
    }

    const googleMapsLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

    try {
      await Share.share({
        message: `🚨 EMERGENCY ALERT 🚨\n\nI need help. My current location:\n${googleMapsLink}`,
      });
    } catch (error) {
      alert("Error sharing location");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back-ios" size={24} color="#EC1313" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Safe Map</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={getLocation}>
            <MaterialIcons name="my-location" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Map Section */}
        <View style={styles.mapContainer}>

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#EC1313" />
              <Text style={{ color: "#fff", marginTop: 10 }}>
                Fetching location...
              </Text>
            </View>
          ) : (
            location && (
              <MapComponent
                ref={mapRef}
                style={styles.map}
                showsUserLocation={true}
                initialRegion={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                  title="You are here"
                />
              </MapComponent>
            )
          )}

          {/* LIVE Badge */}
          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>

          {/* Safety Score */}
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue}>88</Text>
          </View>

          {/* AI Risk Card */}
          <View style={styles.riskCard}>
            <MaterialIcons name="gpp-maybe" size={20} color="#EC1313" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.riskTitle}>
                High Risk Area Detected
              </Text>
              <Text style={styles.riskSub}>
                Rerouting to safest path...
              </Text>
            </View>
            <TouchableOpacity style={styles.rerouteBtn}>
              <Text style={styles.rerouteText}>REROUTE</Text>
            </TouchableOpacity>
          </View>

          {/* Recenter Button */}
          <TouchableOpacity style={styles.recenterBtn} onPress={getLocation}>
            <MaterialIcons name="my-location" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Live Status Card */}
        <View style={styles.statusCard}>
          <View>
            <QuickButton icon="location-on" label="Share Now" onPress={shareLocation} />
            <Text style={styles.statusSub}>
              Sharing with emergency contacts
            </Text>
          </View>
          <View style={styles.statusIndicator} />
        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.navBar}>
        <NavItem icon="home" label="Home" onPress={() => router.replace("/dashboard")} />
        <NavItem icon="group" label="Contacts" onPress={() => router.push("/contacts")} />
        <NavItem icon="explore" label="SafeMap" active />
        <NavItem icon="settings" label="Settings" onPress={() => router.push("/settings")} />
      </View>
    </View>
  );
}

/* ---------- COMPONENTS ---------- */

const NavItem = ({ icon, label, active, onPress }: any) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress}>
    <MaterialIcons
      name={icon}
      size={24}
      color={active ? "#EC1313" : "#777"}
    />
    <Text
      style={[
        styles.navLabel,
        { color: active ? "#EC1313" : "#777" },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);
const QuickButton = ({ icon, label, onPress }: any) => (
  <TouchableOpacity
    style={styles.quickButton}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <MaterialIcons name={icon} size={26} color="#EC1313" />
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  locationBtn: {
    backgroundColor: "#2a1b1b",
    padding: 10,
    borderRadius: 20,
  },

  mapContainer: {
    height: 420,
    marginHorizontal: 20,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 25,
  },

  map: { flex: 1 },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },

  liveBadge: {
    position: "absolute",
    top: 15,
    left: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EC1313",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginRight: 6,
  },

  liveText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },

  scoreCircle: {
    position: "absolute",
    top: 15,
    right: 15,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  scoreLabel: {
    fontSize: 8,
    color: "#22c55e",
  },

  scoreValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },

  riskCard: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(42,27,27,0.9)",
    padding: 12,
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#EC1313",
  },

  riskTitle: {
    color: "#EC1313",
    fontWeight: "bold",
    fontSize: 12,
  },

  riskSub: {
    color: "#aaa",
    fontSize: 10,
  },

  rerouteBtn: {
    backgroundColor: "#EC1313",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },

  rerouteText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },

  recenterBtn: {
    position: "absolute",
    bottom: 90,
    right: 20,
    backgroundColor: "#2a1b1b",
    padding: 10,
    borderRadius: 12,
  },

  statusCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(236,19,19,0.1)",
    borderWidth: 1,
    borderColor: "rgba(236,19,19,0.3)",
    marginBottom: 25,
  },

  statusTitle: {
    color: "#fff",
    fontWeight: "bold",
  },

  statusSub: {
    color: "#aaa",
    fontSize: 12,
  },

  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    position: "absolute",
    top: 20,
    right: 20,
  },

  navBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 90,
    backgroundColor: "#121212",
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
    marginTop: 4,
  },
  quickButton: {
    backgroundColor: "#1f1f1f",
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    width: 105,

    // Glow border
    borderWidth: 1,
    borderColor: "rgba(236,19,19,0.3)",

    // Shadow (Android + iOS)
    elevation: 6,
    shadowColor: "#EC1313",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  quickLabel: {
    color: "#fff",
    fontSize: 12,
    marginTop: 8,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});