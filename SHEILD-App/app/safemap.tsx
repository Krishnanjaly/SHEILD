import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import MapComponent, { Marker } from "../components/MapComponent";

export default function SafeMap() {
  const router = useRouter();
  const mapRef = useRef<any>(null);

  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const getLocation = useCallback(async () => {
    try {
      setRefreshing(true);
      setLocationError(null);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setLocation(null);
        setLocationError("Location permission denied. Enable it to share your live location.");
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation(currentLocation.coords);

      if (mapRef.current?.animateToRegion) {
        mapRef.current.animateToRegion({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    } catch (error) {
      console.log("SafeMap location error:", error);
      setLocation(null);
      setLocationError("Unable to fetch the current location right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    getLocation();
  }, [getLocation]);

  const googleMapsLink = location
    ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
    : null;

  const shareLocation = async () => {
    if (!googleMapsLink) {
      Alert.alert("Location unavailable", "Fetch your location before sharing it.");
      return;
    }

    try {
      await Share.share({
        message: `EMERGENCY ALERT\n\nI need help. My current location:\n${googleMapsLink}`,
      });
    } catch {
      Alert.alert("Share failed", "Unable to share the location right now.");
    }
  };

  const openInMaps = async () => {
    if (!googleMapsLink) {
      Alert.alert("Location unavailable", "Fetch your location before opening Maps.");
      return;
    }

    try {
      await Linking.openURL(googleMapsLink);
    } catch {
      Alert.alert("Open failed", "Unable to open the map application.");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back-ios" size={24} color="#EC1313" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Safe Map</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={getLocation}>
            {refreshing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="my-location" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.mapContainer}>
          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#EC1313" />
              <Text style={styles.loaderText}>Fetching location...</Text>
            </View>
          ) : locationError ? (
            <View style={styles.loader}>
              <MaterialIcons name="location-disabled" size={44} color="#EC1313" />
              <Text style={styles.errorTitle}>Location unavailable</Text>
              <Text style={styles.errorText}>{locationError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={getLocation}>
                <Text style={styles.retryText}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          ) : location ? (
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
          ) : (
            <View style={styles.loader}>
              <Text style={styles.errorText}>Waiting for a live GPS fix.</Text>
            </View>
          )}

          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>

          <View style={styles.scoreCircle}>
            <Text style={styles.scoreLabel}>GPS</Text>
            <Text style={styles.scoreValue}>{location ? "ON" : "OFF"}</Text>
          </View>

          <View style={styles.riskCard}>
            <MaterialIcons name="place" size={20} color="#EC1313" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.riskTitle}>
                {location ? "Live location ready" : "Waiting for location"}
              </Text>
              <Text style={styles.riskSub}>
                {location
                  ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                  : "Turn on location to share your position."}
              </Text>
            </View>
            <TouchableOpacity style={styles.rerouteBtn} onPress={openInMaps}>
              <Text style={styles.rerouteText}>OPEN</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.recenterBtn} onPress={getLocation}>
            <MaterialIcons name="my-location" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusActions}>
            <QuickButton icon="location-on" label="Share Now" onPress={shareLocation} />
            <QuickButton icon="map" label="Open Map" onPress={openInMaps} />
          </View>
          <View style={styles.statusMeta}>
            <Text style={styles.statusSub}>
              {googleMapsLink ? "Ready to share your live location" : "Waiting for a live GPS fix"}
            </Text>
            {location ? (
              <Text style={styles.coordsText}>
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </Text>
            ) : null}
          </View>
          <View style={styles.statusIndicator} />
        </View>
      </ScrollView>

      <View style={styles.navBar}>
        <NavItem icon="home" label="Home" onPress={() => router.replace("/dashboard")} />
        <NavItem icon="group" label="Contacts" onPress={() => router.push("/contacts")} />
        <NavItem icon="explore" label="SafeMap" active />
        <NavItem icon="settings" label="Settings" onPress={() => router.push("/settings")} />
      </View>
    </View>
  );
}

const NavItem = ({ icon, label, active, onPress }: any) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress}>
    <MaterialIcons name={icon} size={24} color={active ? "#EC1313" : "#777"} />
    <Text style={[styles.navLabel, { color: active ? "#EC1313" : "#777" }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const QuickButton = ({ icon, label, onPress }: any) => (
  <TouchableOpacity style={styles.quickButton} onPress={onPress} activeOpacity={0.7}>
    <MaterialIcons name={icon} size={26} color="#EC1313" />
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

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
    minWidth: 42,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
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
    padding: 20,
  },
  loaderText: {
    color: "#fff",
    marginTop: 10,
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
    fontSize: 16,
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
    marginTop: 2,
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
  statusActions: {
    flexDirection: "row",
    gap: 12,
  },
  statusMeta: {
    marginTop: 14,
  },
  statusSub: {
    color: "#aaa",
    fontSize: 12,
  },
  coordsText: {
    color: "#fff",
    fontSize: 12,
    marginTop: 6,
    fontWeight: "600",
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
    borderWidth: 1,
    borderColor: "rgba(236,19,19,0.3)",
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
  errorTitle: {
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#aaa",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  retryBtn: {
    marginTop: 18,
    backgroundColor: "#EC1313",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
});
