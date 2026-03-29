import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Linking,
    Platform,
    Alert,
    ActivityIndicator
} from "react-native";
import { useState, useEffect } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import haversine from "haversine";
import BASE_URL from "../config/api";

export default function TrustedCircles() {
    const router = useRouter();

    const [contacts, setContacts] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [relationship, setRelationship] = useState("");
    const [email, setEmail] = useState(""); // 📧 New email state
    const [address, setAddress] = useState(""); 
    const [userId, setUserId] = useState("U101");
    const [editingId, setEditingId] = useState<number | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    
    // 📍 Location State
    const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number; label?: string } | null>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    useEffect(() => {
        const initialize = async () => {
            try {
                const id = await AsyncStorage.getItem("userId");
                if (id) setUserId(id);
                
                // Get current user location for distance calculations
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === "granted") {
                    const location = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced
                    }).catch(() => null);
                    
                    if (location) {
                        setUserLocation({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude
                        });
                    }
                }
                await loadContacts(id || "U101");
            } catch (err) {
                console.error("Init Error:", err);
                await loadContacts("U101");
            } finally {
                setLoading(false);
            }
        };
        initialize();
    }, []);

    // 🔍 ANALYZE LOCATION (Geocoding)
    const analyzeAddress = async () => {
        if (!address.trim()) {
            Alert.alert("Input Required", "Please enter an address or place name to analyze.");
            return;
        }

        setAnalyzing(true);
        try {
            const geocoded = await Location.geocodeAsync(address);
            
            if (geocoded.length > 0) {
                const { latitude, longitude } = geocoded[0];
                
                // Get a nice label for the coordinates
                const reverse = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
                const label = reverse[0] ? `${reverse[0].street || ''} ${reverse[0].city || ''}, ${reverse[0].region || ''}`.trim() : address;

                setSelectedLocation({ latitude, longitude, label });
                Alert.alert("Location Analyzed", `Found coordinates for: ${label}\n\nLat: ${latitude.toFixed(4)}\nLng: ${longitude.toFixed(4)}`);
            } else {
                Alert.alert("Not Found", "We couldn't find coordinates for that address. Try adding more details (City, Country).");
            }
        } catch (error) {
            console.error("Geocode Error:", error);
            Alert.alert("Error", "Failed to analyze location. Please check your internet connection.");
        } finally {
            setAnalyzing(false);
        }
    };

    const addContact = async () => {
        if (!name || !phone || !relationship || !email) {
            Alert.alert("Required", "Please fill name, phone, email, and relationship");
            return;
        }

        if (!selectedLocation) {
            Alert.alert("Location Missing", "Please enter and 'ANALYZE' the contact's location first.");
            return;
        }

        try {
            const payload = {
                trusted_id: editingId,
                user_id: userId,
                trusted_name: name,
                trusted_no: phone,
                email: email,
                relationship_type: relationship,
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude
            };

            const endpoint = editingId ? "/updateTrustedContact" : "/addTrustedContact";
            
            const response = await fetch(`${BASE_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.success) {
                Alert.alert("Success", editingId ? "Contact Updated!" : "Contact Added to Circle");
                setName("");
                setPhone("");
                setEmail("");
                setRelationship("");
                setAddress("");
                setSelectedLocation(null);
                setEditingId(null);
                loadContacts();
            } else {
                Alert.alert("Database Error", data.message || "Failed to save contact");
            }
        } catch (error) {
            Alert.alert("Error", "Could not connect to server");
        }
    };

    const handleEdit = (contact: any) => {
        setEditingId(contact.trusted_id);
        setName(contact.trusted_name);
        setPhone(contact.trusted_no);
        setEmail(contact.email || "");
        setRelationship(contact.relationship_type || "");
        setAddress("");
        setSelectedLocation({
            latitude: parseFloat(contact.latitude),
            longitude: parseFloat(contact.longitude),
            label: "Saved Location"
        });
    };
    
    const cancelEdit = () => {
        setEditingId(null);
        setName("");
        setPhone("");
        setEmail("");
        setRelationship("");
        setAddress("");
        setSelectedLocation(null);
    };

    const loadContacts = async (id?: string) => {
        try {
            const uid = id || userId;
            const response = await fetch(`${BASE_URL}/getTrustedContacts/${uid}`);
            const data = await response.json();
            setContacts(Array.isArray(data) ? data : []);
        } catch (error) {
            setContacts([]);
        }
    };

    const calculateDistance = (targetLat: any, targetLng: any) => {
        if (!userLocation || !targetLat || !targetLng) return null;
        try {
            const dist = haversine(
                userLocation,
                { latitude: parseFloat(targetLat), longitude: parseFloat(targetLng) },
                { unit: 'meter' }
            );
            return dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`;
        } catch (e) {
            return null;
        }
    };

    if (loading && contacts.length === 0) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#ec5b13" />
                <Text style={{ color: '#fff', marginTop: 15 }}>Synchronizing...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={24} color="#ec5b13" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Trusted Circles</Text>
                    <MaterialIcons name="shield" size={24} color="#ec5b13" />
                </View>

                {/* Hero */}
                <View style={styles.hero}>
                    <MaterialIcons name="group" size={60} color="#ec5b13" />
                    <Text style={styles.heroTitle}>Trusted Circles</Text>
                    <Text style={styles.heroSubtitle}>Emergency Support Network</Text>
                </View>

                {/* Form */}
                <View style={styles.addSection}>
                    <TextInput
                        placeholder="Contact Name"
                        placeholderTextColor="#666"
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                    />
                    <TextInput
                        placeholder="Phone Number"
                        placeholderTextColor="#666"
                        style={styles.input}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                    />

                    <TextInput
                        placeholder="Email Address"
                        placeholderTextColor="#666"
                        style={styles.input}
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                    />

                    <TextInput
                        placeholder="Relationship (e.g. Sister, Friend)"
                        placeholderTextColor="#666"
                        style={styles.input}
                        value={relationship}
                        onChangeText={setRelationship}
                    />

                    {/* 📍 AI Location Analyzer */}
                    <View style={styles.locationContainer}>
                        <View style={styles.locationHeader}>
                            <MaterialIcons name="location-searching" size={18} color="#ec5b13" />
                            <Text style={styles.locationLabel}>Analyze Contact's Location</Text>
                        </View>
                        
                        <View style={styles.searchRow}>
                            <TextInput
                                placeholder="Enter address or landmark..."
                                placeholderTextColor="#555"
                                style={styles.searchInput}
                                value={address}
                                onChangeText={setAddress}
                            />
                            <TouchableOpacity 
                                style={[styles.analyzeButton, analyzing && { opacity: 0.6 }]} 
                                onPress={analyzeAddress}
                                disabled={analyzing}
                            >
                                {analyzing ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Text style={styles.analyzeButtonText}>ANALYZE</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        {selectedLocation && (
                            <View style={styles.resultBox}>
                                <MaterialIcons name="check-circle" size={16} color="#4caf50" />
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={styles.resultLabel}>Location Detected:</Text>
                                    <Text style={styles.resultText} numberOfLines={1}>{selectedLocation.label}</Text>
                                    <Text style={styles.coordsMini}>Coords: {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}</Text>
                                </View>
                            </View>
                        )}
                        
                        <Text style={styles.hintText}>
                            Enter where this contact lives. We'll use this to find the nearest person when you need help.
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity style={[styles.addButton, { flex: 1 }]} onPress={addContact}>
                            <MaterialIcons name={editingId ? "save" : "person-add"} size={20} color="white" />
                            <Text style={styles.addButtonText}>{editingId ? "UPDATE" : "ADD TO Circle"}</Text>
                        </TouchableOpacity>
                        
                        {editingId && (
                            <TouchableOpacity style={[styles.addButton, { flex: 1, backgroundColor: "#333" }]} onPress={cancelEdit}>
                                <MaterialIcons name="close" size={20} color="white" />
                                <Text style={styles.addButtonText}>CANCEL</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* List */}
                <View style={{ marginTop: 30 }}>
                    <Text style={styles.activityTitle}>YOUR CIRCLE MEMBERS</Text>
                    {contacts.length === 0 ? (
                        <Text style={styles.emptyText}>Start by adding your first contact above</Text>
                    ) : (
                        contacts.map((item, index) => (
                            <View key={item.trusted_id || index} style={styles.card}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Text style={styles.name}>{item.trusted_name}</Text>
                                        <View style={styles.tag}>
                                            <Text style={styles.tagText}>{(item.relationship_type || "Contact").toUpperCase()}</Text>
                                        </View>
                                    </View>
                                    
                                    <View style={styles.detailRow}>
                                        <MaterialIcons name="phone" size={12} color="#888" />
                                        <Text style={styles.detailText}>{item.trusted_no}</Text>
                                    </View>

                                    <View style={styles.detailRow}>
                                        <MaterialIcons name="email" size={12} color="#888" />
                                        <Text style={styles.detailText}>{item.email || "No email"}</Text>
                                    </View>

                                    {item.latitude && (
                                        <View style={styles.detailRow}>
                                            <MaterialIcons name="location-on" size={12} color="#888" />
                                            <Text style={[styles.detailText, { color: '#ec5b13' }]}>
                                                {parseFloat(item.latitude).toFixed(4)}, {parseFloat(item.longitude).toFixed(4)}
                                            </Text>
                                            <Text style={[styles.detailText, { marginLeft: 10, color: '#666' }]}>
                                                ({calculateDistance(item.latitude, item.longitude) || "???"} away)
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                
                                <TouchableOpacity 
                                    style={styles.callActionButton} 
                                    onPress={() => Linking.openURL(`tel:${item.trusted_no}`)}
                                >
                                    <MaterialIcons name="call" size={20} color="white" />
                                </TouchableOpacity>
                                
                                <TouchableOpacity 
                                    style={[styles.callActionButton, { backgroundColor: "rgba(255,255,255,0.1)", marginLeft: 5 }]} 
                                    onPress={() => handleEdit(item)}
                                >
                                    <MaterialIcons name="edit" size={18} color="white" />
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#181111", paddingHorizontal: 20 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 50, marginBottom: 20 },
    headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
    hero: { alignItems: "center", marginBottom: 25 },
    heroTitle: { color: "white", fontSize: 24, fontWeight: "bold" },
    heroSubtitle: { color: "#888", fontSize: 13 },
    addSection: { marginTop: 5 },
    input: { backgroundColor: "#221a1a", borderRadius: 12, padding: 14, marginBottom: 12, color: "white", borderWidth: 1, borderColor: "#332626" },
    
    // 📍 Search Styles
    locationContainer: { backgroundColor: "#221a1a", borderRadius: 16, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: "#332626" },
    locationHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    locationLabel: { color: "#bbb", fontSize: 12, marginLeft: 6, fontWeight: "600" },
    searchRow: { flexDirection: 'row', alignItems: 'center' },
    searchInput: { flex: 1, backgroundColor: '#1a1414', borderRadius: 10, padding: 10, color: 'white', fontSize: 13, borderWidth: 1, borderColor: '#332626' },
    analyzeButton: { backgroundColor: '#ec5b13', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
    analyzeButtonText: { color: 'white', fontWeight: 'bold', fontSize: 11 },
    
    resultBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(76, 175, 80, 0.05)', padding: 10, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.2)' },
    resultLabel: { color: '#888', fontSize: 10 },
    resultText: { color: 'white', fontSize: 12, fontWeight: '500' },
    coordsMini: { color: '#555', fontSize: 9, marginTop: 1 },
    
    addButton: { flexDirection: "row", backgroundColor: "#ec5b13", padding: 16, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    addButtonText: { color: "white", fontWeight: "bold", fontSize: 15, marginLeft: 8 },
    
    hintText: { color: '#555', fontSize: 10, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
    activityTitle: { color: "#ec5b13", fontSize: 11, fontWeight: "bold", letterSpacing: 2, marginBottom: 12 },
    emptyText: { textAlign: "center", color: "#444", marginTop: 10, fontSize: 13 },
    card: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(236,91,19,0.03)",
        borderWidth: 1,
        borderColor: "rgba(236,91,19,0.15)",
        padding: 16,
        borderRadius: 20,
        marginBottom: 15,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
    },
    name: {
        color: "white",
        fontWeight: "bold",
        fontSize: 18,
        letterSpacing: 0.5
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6
    },
    detailText: {
        color: "#aaa",
        fontSize: 13,
        marginLeft: 8
    },
    tag: {
        backgroundColor: 'rgba(236,91,19,0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(236,91,19,0.3)'
    },
    tagText: {
        color: "#ec5b13",
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1
    },
    callActionButton: {
        backgroundColor: "#ec5b13",
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
        marginLeft: 10,
        elevation: 4
    },
    footer: { textAlign: "center", marginTop: 40, color: "#444", fontSize: 10 }
});
