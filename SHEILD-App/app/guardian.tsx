import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    DeviceEventEmitter,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { aiRiskEngine, RiskAnalysis, SensorData } from "../utils/AiRiskEngine";
import { ActivityService } from "../services/ActivityService";
import {
    GuardianAnalysisUiState,
    GuardianMonitoringStatus,
    GuardianSnapshot,
    GuardianStateService,
} from "../services/GuardianStateService";
import {
    GuardianLogEntry,
    GuardianLogService,
} from "../services/GuardianLogService";


export default function Guardian() {
    const router = useRouter();
    const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [isFullAnalysis, setIsFullAnalysis] = useState(false);
    const [monitoringStatus, setMonitoringStatus] = useState<GuardianMonitoringStatus>("OFF");
    const [guardianLogs, setGuardianLogs] = useState<GuardianLogEntry[]>([]);
    const [analysisUi, setAnalysisUi] = useState<GuardianAnalysisUiState>({
        isAnalyzing: false,
        detectedMovement: null,
        progress: 0,
        statusText: "Idle",
        riskLevel: null,
    });

    useEffect(() => {
        const loadSnapshot = async () => {
            const [snapshot, logs] = await Promise.all([
                GuardianStateService.getSnapshot(),
                GuardianLogService.getLogs(),
            ]);
            setAnalysis(snapshot.analysis);
            setMonitoringStatus(snapshot.monitoringStatus);
            setAnalysisUi(snapshot.analysisUi);
            setGuardianLogs(logs);
            setIsMonitoring(snapshot.monitoringStatus !== "OFF");
            setIsFullAnalysis(
                snapshot.monitoringStatus === "ACTIVE" || snapshot.monitoringStatus === "EMERGENCY"
            );
        };
        loadSnapshot();

        const unsubscribe = aiRiskEngine.subscribe(async (nextAnalysis) => {
            setAnalysis(nextAnalysis);
            const snapshot = await GuardianStateService.getSnapshot();
            setMonitoringStatus(snapshot.monitoringStatus);
            setAnalysisUi(snapshot.analysisUi);
            setIsMonitoring(snapshot.monitoringStatus !== "OFF");
            setIsFullAnalysis(
                snapshot.monitoringStatus === "ACTIVE" || snapshot.monitoringStatus === "EMERGENCY"
            );
        });

        // Event listener for real-time detections
        const sub = DeviceEventEmitter.addListener("AI_RISK_DETECTED", (data: RiskAnalysis) => {
            setAnalysis(data);
        });
        const snapshotSub = DeviceEventEmitter.addListener(
            "GUARDIAN_SNAPSHOT_UPDATED",
            (snapshot: GuardianSnapshot) => {
                setAnalysis(snapshot.analysis);
                setMonitoringStatus(snapshot.monitoringStatus);
                setAnalysisUi(snapshot.analysisUi);
                setIsMonitoring(snapshot.monitoringStatus !== "OFF");
                setIsFullAnalysis(
                    snapshot.monitoringStatus === "ACTIVE" || snapshot.monitoringStatus === "EMERGENCY"
                );
            }
        );
        const logsSub = DeviceEventEmitter.addListener(
            "GUARDIAN_LOGS_UPDATED",
            (logs: GuardianLogEntry[]) => {
                setGuardianLogs(Array.isArray(logs) ? logs : []);
            }
        );

        // Check monitoring state periodically
        const interval = setInterval(() => {
            setIsMonitoring(aiRiskEngine.isMonitoringActive());
            setIsFullAnalysis(aiRiskEngine.isAnalysisActive());
        }, 1000);

        return () => {
            sub.remove();
            snapshotSub.remove();
            logsSub.remove();
            unsubscribe?.();
            clearInterval(interval);
        };
    }, []);

    const riskLevel = analysis?.riskLevel || 'NONE';
    const confidence = analysis ? Math.round(analysis.confidence * 100) : 0;
    const livePercent = analysisUi.isAnalyzing ? analysisUi.progress : confidence;
    const triggers = analysis?.triggers || [];
    const monitorTitle =
        monitoringStatus === "EMERGENCY"
            ? "Emergency Risk Detected"
            : monitoringStatus === "ACTIVE"
              ? "Enhanced Analysis Active"
              : monitoringStatus === "PASSIVE"
                ? "Passive Guard Active"
                : "AI Monitoring Paused";
    const monitorSubtitle =
        monitoringStatus === "EMERGENCY"
            ? "Guardian detected a live threat and escalated monitoring"
            : monitoringStatus === "ACTIVE"
              ? analysisUi.isAnalyzing
                ? analysisUi.statusText
                : "Analyzing sensors and microphone in real time"
              : monitoringStatus === "PASSIVE"
                ? "Background guardian is running for this logged-in account"
                : "Sign in and keep sensors enabled to monitor in background";

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <MaterialIcons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>AI Guardian</Text>

                    <View style={styles.robotIcon}>
                        <MaterialIcons 
                            name="security" 
                            size={20} 
                            color={isMonitoring ? "#22c55e" : "#EC1313"} 
                        />
                    </View>
                </View>

                {/* Hero Section */}
                <View style={styles.hero}>
                    <View style={[styles.orbGlow, { backgroundColor: riskLevel === 'HIGH' ? 'rgba(236,19,19,0.3)' : 'rgba(34,197,94,0.1)' }]} />
                    <View style={[styles.orbOuter, { borderColor: riskLevel === 'HIGH' ? 'rgba(236,19,19,0.4)' : 'rgba(34,197,94,0.2)' }]}>
                        <View style={styles.orbInner}>
                            <LinearGradient
                                colors={riskLevel === 'HIGH' ? ["#EC1313", "#ff6a00"] : ["#22c55e", "#10b981"]}
                                style={styles.orbCore}
                            />
                            <MaterialCommunityIcons
                                name={riskLevel === 'HIGH' ? "shield-alert" : "shield-check"}
                                size={40}
                                color="#fff"
                                style={{ position: "absolute" }}
                            />
                        </View>
                    </View>

                    <Text style={styles.monitorTitle}>
                        {analysisUi.isAnalyzing && analysisUi.detectedMovement
                            ? `Analyzing: ${analysisUi.detectedMovement}`
                            : monitorTitle}
                    </Text>
                    <Text style={styles.monitorSubtitle}>
                        {monitorSubtitle}
                    </Text>
                </View>

                {/* Indicators */}
                <View style={styles.card}>
                    <Indicator label="Microphone" status={isFullAnalysis ? "Active" : isMonitoring ? "Armed" : "Off"} active={isMonitoring} />
                    <Indicator label="Live Location" status={isMonitoring ? "Ready" : "Off"} active={isMonitoring} />
                    <Indicator label="Motion Sensors" status={isMonitoring ? "Streaming" : "Standby"} active={isMonitoring} />
                    <Indicator label="Pattern Recognition" status={analysisUi.isAnalyzing ? "Evaluating" : monitoringStatus === "EMERGENCY" ? "Escalated" : isMonitoring ? "Learning" : "Paused"} active={isMonitoring} />
                </View>

                {/* Threat Section */}
                <View style={styles.threatCard}>
                    <Text style={styles.threatTitle}>
                        Real-time Threat Assessment
                    </Text>

                    <View style={styles.threatRow}>
                        <Text style={styles.threatPercent}>{livePercent}%</Text>
                        <Text style={[
                            styles.riskLabel, 
                            { color: riskLevel === 'HIGH' ? "#EC1313" : riskLevel === 'LOW' ? "#eab308" : "#22c55e" }
                        ]}>
                            {riskLevel === 'HIGH' ? "High Risk" : riskLevel === 'LOW' ? "Low Risk" : "Stable"}
                        </Text>
                    </View>

                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${Math.max(5, livePercent)}%`, backgroundColor: analysisUi.isAnalyzing ? "#EC1313" : riskLevel === 'HIGH' ? "#EC1313" : "#22c55e" }]} />
                    </View>
                    {analysisUi.isAnalyzing && (
                        <View style={styles.analysisLiveCard}>
                            <View style={styles.analysisPulse} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.analysisMovementText}>
                                    {analysisUi.detectedMovement || "Movement detected"}
                                </Text>
                                <Text style={styles.analysisStatusText}>
                                    {analysisUi.statusText} {analysisUi.progress}%
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Observations */}
                <View style={{ marginTop: 20 }}>
                    <Text style={styles.sectionLabel}>
                        Live Surveillance Feed
                    </Text>

                    {triggers.length > 0 ? (
                        triggers.map((t, i) => (
                            <Observation
                                key={i}
                                text={t}
                                time="JUST NOW"
                                type="alert"
                            />
                        ))
                    ) : (
                        <>
                            <Observation
                                text="Environment stability verified. No motion anomalies."
                                time="SMART SCAN ACTIVE"
                            />
                            <Observation
                                text="Background audio levels within safety parameters."
                                time="SECURE"
                            />
                        </>
                    )}
                </View>

                <View style={{ marginTop: 24 }}>
                    <Text style={styles.sectionLabel}>
                        Guardian Event Log
                    </Text>

                    {guardianLogs.length > 0 ? (
                        guardianLogs.map((entry) => (
                            <Observation
                                key={entry.id}
                                text={`${entry.eventType} • ${entry.explanation}`}
                                time={`${new Date(entry.timestamp).toLocaleDateString()} • ${new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${entry.riskLevel}`}
                                type="alert"
                            />
                        ))
                    ) : (
                        <Observation
                            text="No AI guardian events logged yet."
                            time="AWAITING DETECTION"
                        />
                    )}
                </View>

                {/* Emergency Button */}
                <TouchableOpacity 
                    style={[styles.emergencyButton, { opacity: isMonitoring ? 1 : 0.5 }]}
                    onPress={() => {
                        if (isMonitoring) {
                            DeviceEventEmitter.emit("FORCE_AI_EMERGENCY");
                        }
                    }}
                >
                    <MaterialIcons name="warning" size={22} color="#fff" />
                    <Text style={styles.emergencyText}>
                        Force AI Emergency Protocol
                    </Text>
                </TouchableOpacity>

                {/* Manual Reactivation Button */}
                {!isFullAnalysis && isMonitoring && (
                    <TouchableOpacity 
                        style={styles.reactivateButton}
                        onPress={async () => {
                            console.log('🤖 Manual Full Analysis Activation');
                            await aiRiskEngine.startFullAnalysis();
                            await GuardianStateService.saveMonitoringStatus("ACTIVE");
                            setIsFullAnalysis(true);
                            
                             ActivityService.logActivity('Manual Enhanced Monitoring: User explicitly started Full AI analysis mode');
                        }}
                    >
                        <MaterialIcons name="radar" size={22} color="#ec1313" />
                        <Text style={styles.reactivateText}>
                            Engage Enhanced Monitoring
                        </Text>
                    </TouchableOpacity>
                )}

                {isFullAnalysis && (
                    <View style={styles.enhancedStatus}>
                        <MaterialIcons name="graphic-eq" size={24} color="#22c55e" />
                        <Text style={styles.enhancedStatusText}>
                            Live Sensor Analysis Active
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

/* ---------------- COMPONENTS ---------------- */

function Indicator({ label, status, active, danger }: any) {
    return (
        <View style={styles.indicatorRow}>
            <Text style={styles.indicatorLabel}>{label}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.indicatorStatus}>{status}</Text>
                <View
                    style={[
                        styles.dot,
                        { backgroundColor: active ? (danger ? "#EC1313" : "#22c55e") : "#555" },
                    ]}
                />
            </View>
        </View>
    );
}

function Observation({ text, time, type }: any) {
    return (
        <View style={[styles.observationCard, type === 'alert' && { borderColor: 'rgba(236,19,19,0.3)', borderWidth: 1 }]}>
            <MaterialIcons 
                name={type === 'alert' ? "error-outline" : "check-circle"} 
                size={20} 
                color={type === 'alert' ? "#EC1313" : "#22c55e"} 
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.observationText}>{text}</Text>
                <Text style={styles.observationTime}>{time}</Text>
            </View>
        </View>
    );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
        paddingHorizontal: 20,
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 20,
    },

    headerTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },

    robotIcon: {
        backgroundColor: "rgba(236,19,19,0.2)",
        padding: 8,
        borderRadius: 20,
    },

    hero: {
        alignItems: "center",
        marginTop: 10,
    },

    orbGlow: {
        position: "absolute",
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: "rgba(236,19,19,0.2)",
    },

    orbOuter: {
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 2,
        borderColor: "rgba(236,19,19,0.4)",
        justifyContent: "center",
        alignItems: "center",
    },

    orbInner: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: "center",
        alignItems: "center",
    },

    orbCore: {
        width: 90,
        height: 90,
        borderRadius: 45,
        opacity: 0.8,
    },

    monitorTitle: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
        marginTop: 15,
    },

    monitorSubtitle: {
        color: "#aaa",
        fontSize: 12,
        marginTop: 5,
    },

    card: {
        backgroundColor: "#2a1b1b",
        borderRadius: 16,
        padding: 15,
        marginTop: 25,
    },

    indicatorRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 10,
    },

    indicatorLabel: {
        color: "#ddd",
        fontSize: 14,
    },

    indicatorStatus: {
        color: "#888",
        fontSize: 12,
        marginRight: 8,
    },

    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },

    threatCard: {
        backgroundColor: "#2a1b1b",
        borderRadius: 16,
        padding: 15,
        marginTop: 25,
    },

    threatTitle: {
        color: "#fff",
        fontWeight: "bold",
        marginBottom: 10,
    },

    threatRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
    },

    threatPercent: {
        color: "#fff",
        fontSize: 28,
        fontWeight: "bold",
    },

    riskLabel: {
        fontWeight: "bold",
        fontSize: 14,
    },

    progressBar: {
        height: 8,
        backgroundColor: "#333",
        borderRadius: 10,
        marginTop: 10,
        overflow: "hidden",
    },

    progressFill: {
        width: "12%",
        height: "100%",
        backgroundColor: "#EC1313",
    },

    sectionLabel: {
        color: "#888",
        fontSize: 12,
        fontWeight: "bold",
        marginBottom: 10,
    },

    observationCard: {
        flexDirection: "row",
        backgroundColor: "#222",
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
    },

    observationText: {
        color: "#ddd",
        fontSize: 13,
    },
    backButton: {
        padding: 8,
        borderRadius: 20,
    },

    observationTime: {
        color: "#666",
        fontSize: 10,
        marginTop: 4,
    },

    emergencyButton: {
        backgroundColor: "#EC1313",
        paddingVertical: 18,
        borderRadius: 20,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 30,
    },

    emergencyText: {
        color: "#fff",
        fontWeight: "bold",
        marginLeft: 10,
    },
    reactivateButton: {
        backgroundColor: "rgba(236,19,19,0.1)",
        paddingVertical: 18,
        borderRadius: 20,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 15,
        borderWidth: 1,
        borderColor: "#EC1313",
        borderStyle: 'dashed'
    },
    reactivateText: {
        color: "#EC1313",
        fontWeight: "bold",
        marginLeft: 10,
    },
    enhancedStatus: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 20,
        backgroundColor: "rgba(34,197,94,0.1)",
        padding: 10,
        borderRadius: 12,
        gap: 8,
        marginBottom: 20
    },
    enhancedStatusText: {
        color: "#22c55e",
        fontWeight: '600',
        fontSize: 14
    },
    analysisLiveCard: {
        marginTop: 14,
        borderRadius: 14,
        backgroundColor: "#120c0c",
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.32)",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    analysisPulse: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: "#ec1313",
    },
    analysisMovementText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    analysisStatusText: {
        color: "#bca6a6",
        marginTop: 4,
        fontSize: 12,
    }
});
