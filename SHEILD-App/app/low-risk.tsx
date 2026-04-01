import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import BASE_URL from "../config/api";

type KeywordItem = {
    keyword_id: number;
    keyword_text: string;
};

export default function LowRiskKeywords() {
    const router = useRouter();
    const [input, setInput] = useState("");
    const [keywords, setKeywords] = useState<KeywordItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const loadKeywords = useCallback(async () => {
        try {
            const userId = await AsyncStorage.getItem("userId");

            if (!userId) {
                Alert.alert("Error", "User not logged in");
                return;
            }

            setLoading(true);
            const response = await fetch(`${BASE_URL}/get-keywords/${userId}/LOW`);
            const data = await response.json();
            setKeywords(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Load Keywords Error:", error);
            Alert.alert("Error", "Could not load low risk keywords");
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadKeywords();
        }, [loadKeywords])
    );

    const addKeyword = async () => {
        const trimmedKeyword = input.trim().toLowerCase();
        if (!trimmedKeyword) {
            return;
        }

        try {
            const userId = await AsyncStorage.getItem("userId");

            if (!userId) {
                Alert.alert("Error", "User not logged in");
                return;
            }

            setSubmitting(true);
            const response = await fetch(`${BASE_URL}/add-keyword`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    keyword_text: trimmedKeyword,
                    security_level: "LOW",
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to add keyword");
            }

            setInput("");
            await loadKeywords();
        } catch (error) {
            console.error("Add Keyword Error:", error);
            Alert.alert("Error", "Could not save keyword");
        } finally {
            setSubmitting(false);
        }
    };

    const deleteKeyword = async (id: number) => {
        try {
            const response = await fetch(`${BASE_URL}/delete-keyword/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to delete low risk keyword");
            }

            await loadKeywords();
        } catch (error) {
            console.error("Delete Error:", error);
            Alert.alert("Error", "Could not delete low risk keyword");
        }
    };

    const renderKeywordItem = ({ item }: { item: KeywordItem }) => (
        <View style={styles.keywordCard}>
            <View style={styles.keywordLeft}>
                <View style={styles.keywordPulse} />
                <Text style={styles.keywordText}>{item.keyword_text}</Text>
            </View>
            <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteKeyword(item.keyword_id)}
            >
                <MaterialIcons name="delete-outline" size={20} color="#ec1313" />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={["rgba(236,19,19,0.16)", "rgba(25,18,18,0.96)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.45 }}
                style={styles.topGlow}
            />

            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={22} color="#ec1313" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Low Risk Keywords</Text>
                </View>
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() =>
                        Alert.alert(
                            "Low Risk Keywords",
                            "These keywords silently notify your emergency contacts with your live location."
                        )
                    }
                >
                    <MaterialIcons name="info-outline" size={22} color="#ec1313" />
                </TouchableOpacity>
            </View>

            <FlatList
                data={keywords}
                keyExtractor={(item) => item.keyword_id.toString()}
                renderItem={renderKeywordItem}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                    <>
                        <View style={styles.heroSection}>
                            <View style={styles.heroHalo} />
                            <View style={styles.heroIconWrap}>
                                <MaterialIcons name="warning-amber" size={44} color="#ec1313" />
                            </View>
                            <Text style={styles.heroLabel}>Security Level: Minimum</Text>
                            <Text style={styles.heroTitle}>Silent Sentinel</Text>
                        </View>

                        <View style={styles.descriptionCard}>
                            <View style={styles.descriptionRail} />
                            <Text style={styles.descriptionText}>
                                Low risk keywords are used for early warning situations. When detected,
                                <Text style={styles.descriptionAccent}> SHEILD </Text>
                                sends silent alerts with your live location to trusted contacts without
                                drawing attention.
                            </Text>
                        </View>

                        <View style={styles.inputSection}>
                            <View style={styles.inputRow}>
                                <TextInput
                                    placeholder="Enter keyword..."
                                    placeholderTextColor="#6f5d5d"
                                    style={styles.input}
                                    value={input}
                                    onChangeText={setInput}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity
                                    style={styles.addButton}
                                    onPress={addKeyword}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <MaterialIcons name="add" size={24} color="#fff" />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Active Keywords</Text>
                            <View style={styles.liveBadge}>
                                <Text style={styles.liveBadgeText}>LIVE_TRACKING</Text>
                            </View>
                        </View>

                        {loading ? (
                            <View style={styles.loadingWrap}>
                                <ActivityIndicator size="large" color="#ec1313" />
                            </View>
                        ) : null}
                    </>
                }
                ListEmptyComponent={
                    loading ? null : (
                        <View style={styles.emptyState}>
                            <MaterialIcons name="history" size={56} color="#5e4a4a" />
                            <Text style={styles.emptyTitle}>No low risk keywords added yet</Text>
                            <Text style={styles.emptyText}>
                                Add a phrase that should quietly alert your emergency contacts.
                            </Text>
                        </View>
                    )
                }
                ListFooterComponent={
                    <View style={styles.footer}>
                        <View style={styles.footerLine} />
                        <Text style={styles.footerText}>End of transmission</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#191212",
    },
    topGlow: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 220,
    },
    header: {
        paddingTop: 58,
        paddingHorizontal: 20,
        paddingBottom: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "rgba(25,18,18,0.82)",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(236,19,19,0.08)",
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        flexShrink: 1,
    },
    iconButton: {
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(59,51,51,0.56)",
    },
    headerTitle: {
        color: "#ec1313",
        fontSize: 22,
        fontWeight: "800",
        letterSpacing: -0.5,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 34,
    },
    heroSection: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 22,
    },
    heroHalo: {
        position: "absolute",
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: "rgba(236,19,19,0.14)",
        opacity: 0.8,
    },
    heroIconWrap: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#251e1e",
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.16)",
        shadowColor: "#ec1313",
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
        elevation: 10,
    },
    heroLabel: {
        marginTop: 18,
        color: "rgba(233,188,182,0.56)",
        fontSize: 10,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 2.2,
    },
    heroTitle: {
        marginTop: 8,
        color: "#eedfde",
        fontSize: 31,
        fontWeight: "800",
        letterSpacing: -1,
    },
    descriptionCard: {
        backgroundColor: "rgba(42,27,27,0.66)",
        borderRadius: 20,
        paddingVertical: 20,
        paddingHorizontal: 20,
        marginTop: 10,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(94,63,58,0.18)",
    },
    descriptionRail: {
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: 4,
        backgroundColor: "rgba(236,19,19,0.42)",
    },
    descriptionText: {
        color: "#e9bcb6",
        fontSize: 14,
        lineHeight: 22,
    },
    descriptionAccent: {
        color: "#ec1313",
        fontWeight: "800",
    },
    inputSection: {
        marginTop: 24,
    },
    inputRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    input: {
        flex: 1,
        backgroundColor: "#130d0d",
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 16,
        color: "#eedfde",
        fontSize: 15,
        borderWidth: 1,
        borderColor: "rgba(94,63,58,0.22)",
    },
    addButton: {
        width: 58,
        height: 58,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ec1313",
        shadowColor: "#ec1313",
        shadowOpacity: 0.32,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    sectionHeader: {
        marginTop: 28,
        marginBottom: 14,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
    },
    sectionTitle: {
        color: "#bca6a3",
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 2.4,
    },
    liveBadge: {
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: "rgba(236,19,19,0.1)",
    },
    liveBadgeText: {
        color: "#ec1313",
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    loadingWrap: {
        paddingVertical: 28,
    },
    keywordCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: "#251e1e",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(94,63,58,0.12)",
        marginBottom: 12,
    },
    keywordLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flex: 1,
    },
    keywordPulse: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#ec1313",
    },
    keywordText: {
        color: "#eedfde",
        fontSize: 16,
        fontWeight: "600",
    },
    deleteButton: {
        marginLeft: 12,
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(236,19,19,0.08)",
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 56,
        paddingHorizontal: 16,
    },
    emptyTitle: {
        marginTop: 14,
        color: "#a89693",
        fontSize: 15,
        fontWeight: "700",
        textAlign: "center",
    },
    emptyText: {
        marginTop: 8,
        color: "#746463",
        fontSize: 13,
        lineHeight: 20,
        textAlign: "center",
    },
    footer: {
        alignItems: "center",
        paddingTop: 26,
    },
    footerLine: {
        width: 48,
        height: 1,
        backgroundColor: "rgba(233,188,182,0.28)",
        marginBottom: 10,
    },
    footerText: {
        color: "rgba(233,188,182,0.3)",
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.2,
        textTransform: "uppercase",
    },
});
