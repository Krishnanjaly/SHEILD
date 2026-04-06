import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BASE_URL from "../config/api";
import { EmergencyService } from "../services/EmergencyService";

type Coords = { latitude: number; longitude: number };
type FilterMode = "ALL" | "WITHIN_1KM" | "PRIORITY";

type TrustedContact = {
  trusted_id?: number | string;
  trusted_name?: string;
  trusted_no?: string;
  email?: string;
  relationship_type?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  last_active?: string | null;
  last_active_at?: string | null;
  updated_at?: string | null;
  priority?: string | number | boolean | null;
  is_priority?: string | number | boolean | null;
  favorite?: string | number | boolean | null;
};

type NearbyContact = TrustedContact & {
  id: string;
  name: string;
  phone: string;
  coords: Coords | null;
  distanceKm: number | null;
  bearing: number;
  online: boolean;
  priorityContact: boolean;
};

const CONTACT_POLL_MS = 30000;
const STATUS_REFRESH_MS = 15000;
const LOCATION_DISTANCE_INTERVAL_M = 25;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const MAX_RADAR_DISTANCE_KM = 5;

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

const calculateDistanceKm = (from: Coords, to: Coords) => {
  const earthRadiusKm = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calculateBearing = (from: Coords, to: Coords) => {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const formatDistance = (distanceKm: number | null) => {
  if (distanceKm === null) return "LOCATION UNKNOWN";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)}M AWAY`;
  return `${distanceKm.toFixed(1)}KM AWAY`;
};

const isTruthy = (value: unknown) =>
  value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";

const getLastActiveTime = (contact: TrustedContact) =>
  contact.last_active || contact.last_active_at || contact.updated_at || null;

const isOnline = (contact: TrustedContact, now: number) => {
  const lastActive = getLastActiveTime(contact);
  if (!lastActive) return Boolean(contact.latitude && contact.longitude);
  const timestamp = new Date(lastActive).getTime();
  return Number.isFinite(timestamp) && now - timestamp <= ONLINE_WINDOW_MS;
};

export default function SafeMap() {
  const router = useRouter();
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const distanceCacheRef = useRef<Record<string, number | null>>({});

  const [filter, setFilter] = useState<FilterMode>("ALL");
  const [userId, setUserId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTick, setStatusTick] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    sweepLoop.start();
    pulseLoop.start();
    return () => {
      sweepLoop.stop();
      pulseLoop.stop();
    };
  }, [pulse, sweep]);

  const fetchContacts = useCallback(async (targetUserId?: string | null) => {
    const activeUserId = targetUserId || userId || (await AsyncStorage.getItem("userId"));
    if (!activeUserId) {
      setError("User is not logged in.");
      setLoading(false);
      return;
    }

    try {
      setRefreshing(true);
      const response = await fetch(`${BASE_URL}/getTrustedContacts/${activeUserId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(data?.message || "Unable to load trusted contacts.");
      }
      setContacts(data);
      setError(null);
    } catch (fetchError) {
      console.error("Nearest contacts fetch error:", fetchError);
      setError("Unable to refresh trusted contacts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    let contactPoll: ReturnType<typeof setInterval> | null = null;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const start = async () => {
      const storedUserId = await AsyncStorage.getItem("userId");
      if (!mounted) return;
      setUserId(storedUserId);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied. Enable location to scan nearby contacts.");
        setLoading(false);
      } else {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted) {
          setUserLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }

        locationSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
            timeInterval: 10000,
          },
          (location) => {
            setUserLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
      }

      await fetchContacts(storedUserId);
      contactPoll = setInterval(() => fetchContacts(storedUserId), CONTACT_POLL_MS);
      statusTimer = setInterval(() => setStatusTick(Date.now()), STATUS_REFRESH_MS);
    };

    start().catch((startError) => {
      console.error("Nearest contacts startup error:", startError);
      setError("Unable to start nearest contact tracking.");
      setLoading(false);
    });

    return () => {
      mounted = false;
      locationSubRef.current?.remove();
      if (contactPoll) clearInterval(contactPoll);
      if (statusTimer) clearInterval(statusTimer);
    };
  }, [fetchContacts]);

  const nearbyContacts = useMemo(() => {
    const normalized = contacts.map((contact, index): NearbyContact => {
      const latitude = toNumber(contact.latitude);
      const longitude = toNumber(contact.longitude);
      const coords = latitude !== null && longitude !== null ? { latitude, longitude } : null;
      const id = String(contact.trusted_id || `${contact.trusted_no || "contact"}-${index}`);
      const cachedDistance = distanceCacheRef.current[id] ?? null;
      const distanceKm = userLocation && coords ? calculateDistanceKm(userLocation, coords) : cachedDistance;
      if (userLocation && coords) {
        distanceCacheRef.current[id] = distanceKm;
      }

      return {
        ...contact,
        id,
        name: contact.trusted_name || "TRUSTED CONTACT",
        phone: contact.trusted_no || "",
        coords,
        distanceKm,
        bearing: userLocation && coords ? calculateBearing(userLocation, coords) : index * 75,
        online: isOnline(contact, statusTick),
        priorityContact:
          isTruthy(contact.priority) ||
          isTruthy(contact.is_priority) ||
          isTruthy(contact.favorite) ||
          String(contact.relationship_type || "").toLowerCase().includes("emergency"),
      };
    });

    return normalized.sort((a, b) => {
      const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });
  }, [contacts, statusTick, userLocation]);

  const visibleContacts = useMemo(() => {
    if (filter === "WITHIN_1KM") {
      return nearbyContacts.filter((contact) => contact.distanceKm !== null && contact.distanceKm <= 1);
    }

    if (filter === "PRIORITY") {
      return [...nearbyContacts].sort((a, b) => {
        if (a.priorityContact !== b.priorityContact) return a.priorityContact ? -1 : 1;
        return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      });
    }

    return nearbyContacts;
  }, [filter, nearbyContacts]);

  const closestContactId = nearbyContacts.find((contact) => contact.distanceKm !== null)?.id;
  const locationUrl = userLocation
    ? `https://www.google.com/maps?q=${userLocation.latitude},${userLocation.longitude}`
    : "Location unavailable";

  const rotate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.13],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.35],
  });

  const callContact = async (contact: NearbyContact) => {
    if (!contact.phone) {
      Alert.alert("No phone number", "This trusted contact does not have a phone number.");
      return;
    }
    await Linking.openURL(`tel:${contact.phone}`);
  };

  const sendSosToContact = async (contact: NearbyContact) => {
    if (!userId) {
      Alert.alert("User missing", "Unable to send SOS because the user ID is missing.");
      return;
    }

    try {
      const smsContact = {
        trusted_id: contact.trusted_id,
        trusted_name: contact.trusted_name,
        trusted_no: contact.trusted_no,
        email: contact.email,
        user_id: userId,
        latitude: contact.latitude ?? undefined,
        longitude: contact.longitude ?? undefined,
      };

      await EmergencyService.sendTrustedContactAlerts({
        userId,
        locationUrl,
        keyword: "NEAREST CONTACT SOS",
        riskLevel: "HIGH",
        contacts: [smsContact],
      });
      Alert.alert("SOS sent", `Emergency SMS sent to ${contact.name}.`);
    } catch (sosError) {
      console.error("Nearest contact SOS error:", sosError);
      Alert.alert("SOS failed", "Unable to send SOS to this contact right now.");
    }
  };

  const openContactDetail = (contact: NearbyContact) => {
    Alert.alert(
      contact.name,
      [
        contact.phone ? `Phone: ${contact.phone}` : "Phone: unavailable",
        contact.email ? `Email: ${contact.email}` : null,
        `Distance: ${formatDistance(contact.distanceKm)}`,
        contact.coords ? `Location: ${contact.coords.latitude.toFixed(4)}, ${contact.coords.longitude.toFixed(4)}` : "Location: unavailable",
      ]
        .filter(Boolean)
        .join("\n"),
      [
        { text: "Close", style: "cancel" },
        { text: "Call", onPress: () => callContact(contact) },
        { text: "SOS", style: "destructive", onPress: () => sendSosToContact(contact) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.glowTopLeft} />
      <View style={styles.glowBottomRight} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFB4A9" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>NEAREST CONTACTS</Text>
        <TouchableOpacity style={styles.headerButton} onPress={() => fetchContacts()}>
          {refreshing ? (
            <ActivityIndicator color="#FFB4A9" size="small" />
          ) : (
            <MaterialIcons name="sensors" size={24} color="#FFB4A9" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Radar
          contacts={visibleContacts}
          closestContactId={closestContactId}
          pulseOpacity={pulseOpacity}
          pulseScale={pulseScale}
          rotate={rotate}
        />

        <View style={styles.tabs}>
          <FilterChip active={filter === "ALL"} label="ALL" onPress={() => setFilter("ALL")} />
          <FilterChip active={filter === "WITHIN_1KM"} label="WITHIN 1 KM" onPress={() => setFilter("WITHIN_1KM")} />
          <FilterChip active={filter === "PRIORITY"} label="EMERGENCY PRIORITY" onPress={() => setFilter("PRIORITY")} />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color="#EC1313" size="large" />
            <Text style={styles.emptyTitle}>Scanning trusted contacts...</Text>
          </View>
        ) : visibleContacts.length === 0 ? (
          <EmptyState onAdd={() => router.push("/trustedCircles")} />
        ) : (
          <View style={styles.contactList}>
            {visibleContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                closest={contact.id === closestContactId}
                onCall={() => callContact(contact)}
                onPress={() => openContactDetail(contact)}
                onSos={() => sendSosToContact(contact)}
                pulseOpacity={pulseOpacity}
                pulseScale={pulseScale}
              />
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.addContactButton} onPress={() => router.push("/trustedCircles")}>
          <MaterialIcons name="person-add" size={24} color="#AF8781" />
          <Text style={styles.addContactText}>ADD TRUSTED CONTACTS</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.navBar}>
        <NavItem icon="home" label="Home" onPress={() => router.replace("/dashboard")} />
        <NavItem icon="group" label="Contacts" onPress={() => router.push("/contacts")} />
        <NavItem icon="phone-in-talk" label="Fake Call" onPress={() => router.push("/fake-call")} />
        <NavItem icon="settings" label="Settings" onPress={() => router.push("/settings")} />
      </View>
    </SafeAreaView>
  );
}

const Radar = ({ contacts, closestContactId, pulseScale, pulseOpacity, rotate }: any) => (
  <View style={styles.radarWrap}>
    <View style={[styles.radarRing, styles.radarRing25]} />
    <View style={[styles.radarRing, styles.radarRing50]} />
    <View style={[styles.radarRing, styles.radarRing75]} />
    <View style={styles.radarRing} />
    <Animated.View style={[styles.radarSweep, { transform: [{ rotate }] }]} />
    <View style={styles.radarCenter} />
    {contacts.slice(0, 12).map((contact: NearbyContact, index: number) => {
      const distance = contact.distanceKm ?? MAX_RADAR_DISTANCE_KM;
      const radius = Math.max(22, Math.min(142, (distance / MAX_RADAR_DISTANCE_KM) * 142));
      const angle = toRad(contact.bearing || index * 60);
      const x = Math.sin(angle) * radius;
      const y = -Math.cos(angle) * radius;
      const isClosest = contact.id === closestContactId;
      return (
        <Animated.View
          key={contact.id}
          style={[
            styles.radarContactDot,
            isClosest ? styles.primaryDot : styles.secondaryRadarDot,
            {
              transform: [
                { translateX: x },
                { translateY: y },
                { scale: isClosest ? pulseScale : 1 },
              ],
              opacity: isClosest ? pulseOpacity : 0.68,
            },
          ]}
        />
      );
    })}
    <View style={styles.scanningBadge}>
      <View style={styles.scanningDot} />
      <Text style={styles.scanningText}>SCANNING LIVE DATA</Text>
    </View>
  </View>
);

const FilterChip = ({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const EmptyState = ({ onAdd }: { onAdd: () => void }) => (
  <View style={styles.emptyState}>
    <MaterialIcons name="group-off" size={52} color="#AF8781" />
    <Text style={styles.emptyTitle}>No nearby contacts found</Text>
    <Text style={styles.emptySub}>Add trusted contacts with locations to start scanning nearby help.</Text>
    <TouchableOpacity style={styles.emptyButton} onPress={onAdd}>
      <Text style={styles.emptyButtonText}>ADD TRUSTED CONTACTS</Text>
    </TouchableOpacity>
  </View>
);

const ContactCard = ({ contact, closest, onCall, onPress, onSos, pulseScale, pulseOpacity }: any) => {
  const CardView = closest ? Animated.View : View;
  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress}>
      <CardView
        style={[
          styles.contactCard,
          closest && styles.closestCard,
          closest ? { opacity: pulseOpacity, transform: [{ scale: pulseScale }] } : null,
        ]}
      >
        {closest ? (
          <View style={styles.closestBadge}>
            <Text style={styles.closestText}>CLOSEST</Text>
          </View>
        ) : null}

        <View style={styles.contactRow}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, !closest && styles.dimAvatar]}>
              <Text style={styles.avatarText}>{contact.name.slice(0, 1)}</Text>
            </View>
            <View style={[styles.statusDot, contact.online ? styles.onlineDot : styles.offlineDot]} />
          </View>

          <View style={styles.contactInfo}>
            <View style={styles.contactHeader}>
              <View style={styles.contactTextWrap}>
                <Text style={[styles.contactName, !closest && styles.dimContactName]}>{contact.name}</Text>
                <View style={styles.contactMetaRow}>
                  <Text style={[styles.distanceText, closest && styles.closestDistance]}>
                    {formatDistance(contact.distanceKm)}
                  </Text>
                  <View style={styles.metaSeparator} />
                  <Text style={[styles.statusText, contact.online ? styles.onlineText : styles.offlineText]}>
                    {contact.online ? "ONLINE" : "OFFLINE"}
                  </Text>
                </View>
              </View>
              {closest ? <MaterialIcons name="security" size={24} color="#EC1313" /> : null}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={onCall}>
                <MaterialIcons name="call" size={16} color="#FFB4A9" />
                <Text style={styles.actionText}>CALL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.sosActionButton]} onPress={onSos}>
                <MaterialIcons name="sos" size={16} color="#130000" />
                <Text style={styles.sosActionText}>SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </CardView>
    </TouchableOpacity>
  );
};

const NavItem = ({ icon, label, active, onPress }: any) => (
  <TouchableOpacity style={styles.navItem} onPress={onPress}>
    <MaterialIcons name={icon} size={24} color={active ? "#ec1313" : "#777"} />
    <Text style={[styles.navLabel, { color: active ? "#ec1313" : "#777" }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#191212" },
  glowTopLeft: {
    position: "absolute",
    top: -80,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(236,19,19,0.08)",
  },
  glowBottomRight: {
    position: "absolute",
    right: -120,
    bottom: 40,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(236,19,19,0.08)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: "rgba(25,18,18,0.88)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(236,19,19,0.12)",
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,51,51,0.55)",
  },
  headerTitle: {
    color: "#FFB4A9",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 132,
  },
  radarWrap: {
    width: 340,
    height: 340,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 22,
  },
  radarRing: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 180,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.35)",
  },
  radarRing25: { transform: [{ scale: 0.25 }] },
  radarRing50: { transform: [{ scale: 0.5 }] },
  radarRing75: { transform: [{ scale: 0.75 }] },
  radarSweep: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 180,
    borderTopWidth: 170,
    borderRightWidth: 170,
    borderBottomWidth: 170,
    borderLeftWidth: 170,
    borderTopColor: "rgba(236,19,19,0.22)",
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  },
  radarCenter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EC1313",
    borderWidth: 5,
    borderColor: "rgba(236,19,19,0.2)",
    zIndex: 5,
  },
  radarContactDot: {
    position: "absolute",
    left: 163,
    top: 163,
  },
  primaryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#EC1313",
    shadowColor: "#EC1313",
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 8,
  },
  secondaryRadarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(233,188,182,0.42)",
  },
  scanningBadge: {
    position: "absolute",
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(59,51,51,0.82)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.22)",
  },
  scanningDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#EC1313" },
  scanningText: { color: "#FFB4A9", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  tabs: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 24,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(42,27,27,0.72)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.28)",
  },
  filterChipActive: { borderColor: "rgba(236,19,19,0.5)" },
  filterChipText: {
    color: "rgba(233,188,182,0.62)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  filterChipTextActive: { color: "#FFB4A9" },
  errorText: {
    color: "#FFB4A9",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  contactList: { gap: 16 },
  contactCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "rgba(42,27,27,0.72)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.24)",
  },
  closestCard: {
    borderColor: "rgba(236,19,19,0.48)",
    shadowColor: "#EC1313",
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 10,
  },
  closestBadge: {
    position: "absolute",
    top: -12,
    left: 24,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "#EC1313",
    zIndex: 5,
  },
  closestText: { color: "#130000", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  contactRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#3B3333",
    alignItems: "center",
    justifyContent: "center",
  },
  dimAvatar: { opacity: 0.68 },
  avatarText: { color: "#FFB4A9", fontSize: 22, fontWeight: "900" },
  statusDot: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#191212",
  },
  onlineDot: { backgroundColor: "#22c55e" },
  offlineDot: { backgroundColor: "rgba(233,188,182,0.22)" },
  contactInfo: { flex: 1 },
  contactHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  contactTextWrap: { flex: 1, paddingRight: 10 },
  contactName: {
    color: "#EEDFDE",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  dimContactName: { color: "rgba(238,223,222,0.78)" },
  contactMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 9 },
  distanceText: {
    color: "rgba(233,188,182,0.62)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  closestDistance: { color: "#FFB4A9" },
  metaSeparator: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(233,188,182,0.28)",
  },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  onlineText: { color: "#4ade80" },
  offlineText: { color: "rgba(233,188,182,0.42)" },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(59,51,51,0.8)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.3)",
  },
  sosActionButton: {
    backgroundColor: "#EC1313",
    borderColor: "#EC1313",
  },
  actionText: { color: "#FFB4A9", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sosActionText: { color: "#130000", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  emptyState: {
    alignItems: "center",
    padding: 28,
    borderRadius: 24,
    backgroundColor: "rgba(42,27,27,0.72)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.24)",
  },
  emptyTitle: { color: "#EEDFDE", fontSize: 16, fontWeight: "900", marginTop: 12 },
  emptySub: {
    color: "rgba(233,188,182,0.62)",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#EC1313",
  },
  emptyButtonText: { color: "#130000", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  addContactButton: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(94,63,58,0.34)",
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  addContactText: {
    color: "rgba(233,188,182,0.62)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  navBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 90,
    backgroundColor: "#221010",
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
});
