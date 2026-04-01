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

export default function HighRiskKeywords() {
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
            const response = await fetch(`${BASE_URL}/get-keywords/${userId}/HIGH`);
            const data = await response.json();
            setKeywords(Array.isArray(data) ? data : []);
        } catch (error) {
            console.log("Load High Keywords Error:", error);
            Alert.alert("Error", "Could not load high risk keywords");
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
                    security_level: "HIGH",
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.message || "Failed to add high risk keyword");
            }

            setInput("");
            await loadKeywords();
        } catch (error) {
            console.log("Add High Keyword Error:", error);
            Alert.alert("Error", "Could not save high risk keyword");
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
                throw new Error("Failed to delete high risk keyword");
            }

            await loadKeywords();
        } catch (error) {
            console.log("Delete High Keyword Error:", error);
            Alert.alert("Error", "Could not delete high risk keyword");
        }
    };

    const renderKeywordItem = ({ item }: { item: KeywordItem }) => (
        <View style={styles.keywordChip}>
            <Text style={styles.keywordChipText}>{item.keyword_text.toUpperCase()}</Text>
            <TouchableOpacity
                style={styles.keywordChipDelete}
                onPress={() => deleteKeyword(item.keyword_id)}
            >
                <MaterialIcons name="close" size={18} color="#af8781" />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={["rgba(236,19,19,0.2)", "rgba(25,18,18,0.98)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.42 }}
                style={styles.topGlow}
            />

            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={22} color="#ec1313" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>High Risk Keywords</Text>
                </View>
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() =>
                        Alert.alert(
                            "High Risk Keywords",
                            "These keywords trigger immediate emergency actions using the same existing backend logic."
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
                numColumns={2}
                columnWrapperStyle={keywords.length > 1 ? styles.keywordRow : undefined}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                    <>
                        <View style={styles.heroSection}>
                            <View style={styles.heroIconWrap}>
                                <MaterialIcons name="priority-high" size={54} color="#ec1313" />
                            </View>
                            <Text style={styles.heroLabel}>Security Level: Maximum</Text>
                            <Text style={styles.heroTitle}>Immediate Action</Text>
                        </View>

                        <View style={styles.descriptionCard}>
                            <MaterialIcons name="security" size={20} color="#ec1313" />
                            <Text style={styles.descriptionText}>
                                High risk keywords indicate danger. When detected,
                                <Text style={styles.descriptionAccent}> SHEILD </Text>
                                immediately calls emergency contacts, sends alerts, and records
                                video/audio for safety evidence.
                            </Text>
                        </View>

                        <View style={styles.inputSection}>
                            <Text style={styles.inputLabel}>Add New Trigger Keyword</Text>
                            <View style={styles.inputRow}>
                                <View style={styles.inputWrap}>
                                    <TextInput
                                        placeholder="e.g. Help, Emergency, Stop"
                                        placeholderTextColor="#7d6663"
                                        style={styles.input}
                                        value={input}
                                        onChangeText={setInput}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>
                                <TouchableOpacity
                                    style={styles.addButton}
                                    onPress={addKeyword}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.addButtonText}>ADD</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.sectionTitle}>Active Triggers</Text>

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
                            <MaterialIcons name="warning-amber" size={54} color="#6b4a49" />
                            <Text style={styles.emptyTitle}>No high risk keywords added yet</Text>
                            <Text style={styles.emptyText}>
                                Add urgent words that should trigger immediate emergency action.
                            </Text>
                        </View>
                    )
                }
                ListFooterComponent={
                    <View style={styles.warningFooter}>
                        <MaterialIcons name="warning-amber" size={18} color="#ec1313" />
                        <Text style={styles.warningFooterText}>
                            Use only for serious emergency triggers
                        </Text>
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
        height: 230,
    },
    header: {
        paddingTop: 58,
        paddingHorizontal: 20,
        paddingBottom: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "rgba(25,18,18,0.82)",
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
        backgroundColor: "rgba(42,27,27,0.58)",
    },
    headerTitle: {
        color: "#ec1313",
        fontSize: 21,
        fontWeight: "800",
        letterSpacing: -0.4,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 34,
    },
    heroSection: {
        alignItems: "center",
        paddingTop: 14,
        paddingBottom: 22,
    },
    heroIconWrap: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(236,19,19,0.12)",
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.22)",
        shadowColor: "#ec1313",
        shadowOpacity: 0.38,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
        elevation: 10,
    },
    heroLabel: {
        marginTop: 18,
        color: "#ffb4a9",
        fontSize: 10,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 2.8,
    },
    heroTitle: {
        marginTop: 8,
        color: "#eedfde",
        fontSize: 31,
        fontWeight: "900",
        textTransform: "uppercase",
        letterSpacing: -1,
    },
    descriptionCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
        backgroundColor: "rgba(42,27,27,0.64)",
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(94,63,58,0.18)",
        marginBottom: 26,
    },
    descriptionText: {
        flex: 1,
        color: "#e9bcb6",
        fontSize: 14,
        lineHeight: 21,
    },
    descriptionAccent: {
        color: "#eedfde",
        fontWeight: "800",
    },
    inputSection: {
        marginBottom: 26,
    },
    inputLabel: {
        color: "#af8781",
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 1.8,
        marginBottom: 10,
    },
    inputRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    inputWrap: {
        flex: 1,
        backgroundColor: "rgba(42,27,27,0.64)",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: "rgba(94,63,58,0.16)",
    },
    input: {
        color: "#eedfde",
        fontSize: 14,
        paddingVertical: 14,
    },
    addButton: {
        minWidth: 86,
        height: 54,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ec1313",
        paddingHorizontal: 18,
        shadowColor: "#ec1313",
        shadowOpacity: 0.3,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    addButtonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    sectionTitle: {
        color: "#af8781",
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 1.8,
        marginBottom: 16,
    },
    loadingWrap: {
        paddingVertical: 28,
    },
    keywordRow: {
        gap: 12,
        marginBottom: 12,
    },
    keywordChip: {
        flex: 1,
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 16,
        paddingRight: 8,
        paddingVertical: 10,
        backgroundColor: "rgba(42,27,27,0.64)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.22)",
        marginBottom: 12,
    },
    keywordChipText: {
        color: "#eedfde",
        fontSize: 14,
        fontWeight: "700",
        flexShrink: 1,
    },
    keywordChipDelete: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 56,
        paddingHorizontal: 16,
    },
    emptyTitle: {
        marginTop: 14,
        color: "#b59d9a",
        fontSize: 15,
        fontWeight: "700",
        textAlign: "center",
    },
    emptyText: {
        marginTop: 8,
        color: "#776462",
        fontSize: 13,
        lineHeight: 20,
        textAlign: "center",
    },
    warningFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingTop: 22,
        opacity: 0.75,
    },
    warningFooterText: {
        color: "#e9bcb6",
        fontSize: 10,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 1.4,
    },
});
