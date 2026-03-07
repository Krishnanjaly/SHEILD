import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Linking
} from "react-native";
import { useState, useEffect } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import BASE_URL from "../config/api";


export default function TrustedCircles() {

    const router = useRouter();

    const [contacts, setContacts] = useState<any[]>([]);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [relationship, setRelationship] = useState("");

    useEffect(() => {
        loadContacts();
    }, []);

    const addContact = async () => {

        if (!name || !phone || !relationship) {
            alert("Please fill all fields");
            return;
        }

        try {

            // 📍 Ask location permission
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") {
                alert("Location permission required");
                return;
            }

            // 📍 Get current location
            const location = await Location.getCurrentPositionAsync({});

            const latitude = location.coords.latitude;
            const longitude = location.coords.longitude;

            // 🔗 Send to backend
            const response = await fetch(`${BASE_URL}/addTrustedContact`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    user_id: "U101",
                    trusted_name: name,
                    trusted_no: phone,
                    relationship_type: relationship,
                    latitude: latitude,
                    longitude: longitude
                })
            });

            const data = await response.json();

            if (data.success) {

                alert("Contact Added Successfully");

                setName("");
                setPhone("");
                setRelationship("");

                loadContacts();

            } else {
                alert("Failed to add contact");
            }

        } catch (error) {

            console.log(error);
            alert("Error adding contact");

        }

    };

    const loadContacts = async () => {

        const response = await fetch(
            `${BASE_URL}/getTrustedContacts/U101`
        );

        const data = await response.json();

        setContacts(data);
    };
    const callContact = (phone: string) => {
        Linking.openURL(`tel:${phone}`);
    };

    return (
        <View style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>

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
                    <Text style={styles.heroSubtitle}>
                        Your emergency support network
                    </Text>
                </View>

                {/* Add Contact Section */}
                <View style={styles.addSection}>

                    <TextInput
                        placeholder="Enter Name"
                        placeholderTextColor="#888"
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                    />

                    <TextInput
                        placeholder="Enter Phone Number"
                        placeholderTextColor="#888"
                        style={styles.input}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                    />

                    <TextInput
                        placeholder="Relationship (Mother, Friend)"
                        placeholderTextColor="#888"
                        style={styles.input}
                        value={relationship}
                        onChangeText={setRelationship}
                    />

                    <TouchableOpacity style={styles.addButton} onPress={addContact}>
                        <MaterialIcons name="person-add" size={20} color="white" />
                        <Text style={styles.addButtonText}>ADD CONTACT</Text>
                    </TouchableOpacity>

                </View>

                {/* Contact List */}
                {contacts.length === 0 ? (
                    <Text style={styles.emptyText}>
                        No trusted contacts added yet
                    </Text>
                ) : (
                    contacts.map((item) => (
                        <View key={item.trusted_id} style={styles.card}>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.name}>{item.trusted_name}</Text>
                                <Text style={styles.phone}>{item.trusted_no}</Text>
                                <Text style={{ color: "#ec5b13", fontSize: 10 }}>
                                    {item.relationship_type}
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={styles.callBtn}
                                onPress={() => callContact(item.trusted_no)}
                            >
                                <MaterialIcons name="call" size={18} color="#ec5b13" />
                                <Text style={styles.callText}>CALL</Text>
                            </TouchableOpacity>

                        </View>
                    ))
                )}

                <Text style={styles.footer}>
                    Protected by SHIELD Safety Network
                </Text>

            </ScrollView>
        </View>
    );
}
const styles = StyleSheet.create({

    container: {
        flex: 1,
        backgroundColor: "#181111",
        paddingHorizontal: 16
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 50
    },

    headerTitle: {
        color: "white",
        fontSize: 18,
        fontWeight: "bold"
    },

    hero: {
        alignItems: "center",
        marginTop: 30
    },

    heroTitle: {
        color: "white",
        fontSize: 22,
        fontWeight: "bold"
    },

    heroSubtitle: {
        color: "#aaa",
        fontSize: 13
    },

    addSection: {
        marginTop: 30
    },

    input: {
        backgroundColor: "#222",
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        color: "white"
    },

    addButton: {
        flexDirection: "row",
        backgroundColor: "#ec5b13",
        padding: 15,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center"
    },

    addButtonText: {
        color: "white",
        fontWeight: "bold",
        marginLeft: 8
    },

    emptyText: {
        textAlign: "center",
        color: "#777",
        marginTop: 30
    },

    card: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(236,91,19,0.05)",
        borderWidth: 1,
        borderColor: "rgba(236,91,19,0.2)",
        padding: 15,
        borderRadius: 12,
        marginTop: 15
    },

    name: {
        color: "white",
        fontWeight: "bold"
    },

    phone: {
        color: "#aaa",
        fontSize: 12
    },

    callBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(236,91,19,0.2)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8
    },

    callText: {
        color: "#ec5b13",
        marginLeft: 5,
        fontWeight: "bold"
    },

    footer: {
        textAlign: "center",
        marginTop: 40,
        color: "#666",
        fontSize: 10
    }
});