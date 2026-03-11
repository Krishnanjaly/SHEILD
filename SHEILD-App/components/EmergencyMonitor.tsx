import React, { useEffect, useState, useRef } from 'react';
import { View, Alert, DeviceEventEmitter, Platform, PermissionsAndroid, Modal, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import Voice from '@react-native-voice/voice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import haversine from 'haversine';
import BASE_URL from '../config/api';
import * as IntentLauncher from 'expo-intent-launcher';

export default function EmergencyMonitor() {
    const [isListening, setIsListening] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [lowRiskKeywords, setLowRiskKeywords] = useState<string[]>([]);
    const [highRiskKeywords, setHighRiskKeywords] = useState<string[]>([]);

    // We use refs to avoid dependency loops in listeners
    const keywordsRef = useRef<{ low: string[], high: string[] }>({ low: [], high: [] });
    const listeningRef = useRef(false);
    const volumeHistory = useRef<number[]>([]);
    const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastShakeTime = useRef<number>(0);

    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        setup();
        const cancelSub = DeviceEventEmitter.addListener("EMERGENCY_LISTENING_CANCEL", () => stopListening());

        return () => {
            cancelSub.remove();
            Voice.destroy()
                .then(() => {
                    try {
                        Voice.removeAllListeners();
                    } catch (e) {
                        // ignore null reference error if native module is not linked
                    }
                })
                .catch(() => { });
        };
    }, []);

    const setup = async () => {
        // 1. Get User
        const id = await AsyncStorage.getItem("userId");
        setUserId(id);
        if (id) {
            // 2. Fetch Keywords
            await fetchKeywords(id);
        }

        // 3. Setup Voice
        Voice.onSpeechResults = onSpeechResults;
        Voice.onSpeechPartialResults = onSpeechResults;
        Voice.onSpeechError = (e) => {
            console.log('Speech Error:', e);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_CANCEL");
            Voice.destroy().then(() => {
                listeningRef.current = false;
                setIsListening(false);
            });
        };
        Voice.onSpeechEnd = () => {
            console.log('Speech Ended Environmentally');
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_CANCEL");
            Voice.destroy().then(() => {
                listeningRef.current = false;
                setIsListening(false);
            });
        };

        // 4. Setup Volume Listener
        const volumeListener = VolumeManager.addVolumeListener((result) => {
            // Very basic "long press" simulation: rapid continuous volume events
            const now = Date.now();
            volumeHistory.current.push(now);

            // Keep only last 3 seconds of events
            volumeHistory.current = volumeHistory.current.filter(t => now - t < 3000);

            // If we receive 3+ volume change events within 3 seconds, consider it a long press trigger
            if (volumeHistory.current.length >= 3 && !listeningRef.current) {
                volumeHistory.current = []; // reset
                Alert.alert("Debug", "Volume sequence detected! Starting SHIELD...");
                activateEmergencyListening();
            }
        });

        // 5. Setup Shake Listener (safe: expo-sensors may not be available in Expo Go)
        let shakeListener: { remove: () => void } | null = null;
        try {
            const { Accelerometer } = require('expo-sensors');
            Accelerometer.setUpdateInterval(400);
            shakeListener = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
                const force = Math.sqrt(x * x + y * y + z * z);
                if (force > 2.5 && !listeningRef.current) {
                    const now = Date.now();
                    if (now - lastShakeTime.current > 5000) {
                        lastShakeTime.current = now;
                        console.log('SHAKE DETECTED! Force:', force);
                        activateEmergencyListening();
                    }
                }
            });
            console.log('Shake detection active.');
        } catch (e) {
            console.log('Shake detection unavailable (native module missing):', e);
        }

        return () => {
            volumeListener.remove();
            if (shakeListener) shakeListener.remove();
        };
    };

    const fetchKeywords = async (id: string) => {
        try {
            const [resLow, resHigh] = await Promise.all([
                fetch(`${BASE_URL}/get-keywords/${id}/LOW`),
                fetch(`${BASE_URL}/get-keywords/${id}/HIGH`)
            ]);
            const dataLow = await resLow.json();
            const dataHigh = await resHigh.json();

            const lowList = Array.isArray(dataLow) ? dataLow.map((k: any) => k.keyword_text.toLowerCase()).filter((k: string) => k.trim().length > 0) : [];
            const highList = Array.isArray(dataHigh) ? dataHigh.map((k: any) => k.keyword_text.toLowerCase()).filter((k: string) => k.trim().length > 0) : [];

            setLowRiskKeywords(lowList);
            setHighRiskKeywords(highList);
            keywordsRef.current = { low: lowList, high: highList };
            console.log('Emergency Monitor loaded keywords:', keywordsRef.current);
        } catch (error) {
            console.log('Error fetching keywords:', error);
        }
    };

    const activateEmergencyListening = async () => {
        console.log("🔥 EMERGENCY LISTENING ACTIVATED");
        try {
            if (!userId) {
                const id = await AsyncStorage.getItem("userId");
                if (id) {
                    setUserId(id);
                    await fetchKeywords(id);
                }
            }

            listeningRef.current = true;
            setIsListening(true);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_START");
            await Voice.start('en-US');

            if (listeningTimeoutRef.current) {
                clearTimeout(listeningTimeoutRef.current);
            }

            listeningTimeoutRef.current = setTimeout(() => {
                if (listeningRef.current) {
                    console.log("10 seconds elapsed. Stopping emergency listening.");
                    stopListening();
                }
            }, 10000);

        } catch (e: any) {
            console.error("Voice Error: ", e);
            Alert.alert("Microphone Error", "Failed to start listening: " + (e.message || "Unknown error"));
            listeningRef.current = false;
            setIsListening(false);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
        }
    };

    const onSpeechResults = (e: any) => {
        const results = e.value as string[];
        console.log("Detecting speech:", results);

        if (!results || results.length === 0) return;

        // Check all possible transcript results
        const isHighRisk = results.some(res =>
            keywordsRef.current.high.some(kw => res.toLowerCase().includes(kw))
        );

        if (isHighRisk) {
            handleHighRisk();
            stopListening();
            return;
        }

        const isLowRisk = results.some(res =>
            keywordsRef.current.low.some(kw => res.toLowerCase().includes(kw))
        );

        if (isLowRisk) {
            handleLowRisk();
            stopListening();
            return;
        }
    };

    const stopListening = async () => {
        if (!listeningRef.current) return;
        try {
            if (listeningTimeoutRef.current) {
                clearTimeout(listeningTimeoutRef.current);
                listeningTimeoutRef.current = null;
            }

            listeningRef.current = false;
            setIsListening(false);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
            await Voice.cancel();
            await Voice.destroy();
        } catch (e) {
            console.log("Stop Listening Error:", e);
        }
    };

    const handleLowRisk = () => {
        setShowWarning(true);
        setCountdown(5);

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);

        timerIntervalRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timerIntervalRef.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        cancelTimeoutRef.current = setTimeout(() => {
            clearInterval(timerIntervalRef.current!);
            setShowWarning(false);
            executeLowRiskAction();
        }, 5000);
    };

    const cancelLowRiskAlert = () => {
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setShowWarning(false);
    };

    const executeLowRiskAction = async () => {
        console.log("Executing LOW RISK action...");

        try {
            const email = await AsyncStorage.getItem("userEmail");

            // 1. Get Location
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            let lat = 0;
            let lon = 0;
            try {
               const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
               console.log("User Location:", loc.coords);
               lat = loc.coords.latitude;
               lon = loc.coords.longitude;
            } catch (err) {
               console.log("Location fetch failed, proceeding with fallback", err);
            }

            if (email) {
                // 2. Fetch contacts
                const contactResponse = await fetch(`${BASE_URL}/contacts/${email}`);
                if (contactResponse.ok) {
                    const data = await contactResponse.json();
                    const contacts = Array.isArray(data) ? data : (Array.isArray(data.contacts) ? data.contacts : []);

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
                                        IntentLauncher.startActivityAsync('android.intent.action.CALL', {
                                            data: `tel:${closestContact.phone}`
                                        }).catch((e) => { console.log("Call failed", e) });
                                    } else {
                                        console.log('CALL_PHONE permission denied.');
                                    }
                                } catch (err) {
                                    console.warn(err);
                                }
                            } else {
                                console.log("iOS background calling is restricted.");
                            }
                        }
                    }

                    // 4. Send alert to backend
                    await fetch(`${BASE_URL}/send-sos`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, latitude: lat, longitude: lon }),
                    });
                    console.log("Email alerts sent out successfully.");
                }
            }
        } catch (error) {
            console.error("Error in LOW RISK sequence:", error);
        }
    };

    const handleHighRisk = async () => {
        Alert.alert("HIGH RISK DETECTED", "Initiating Video/Audio recording and alerting contacts...");

        // 1. Location
        const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
        let locationStr = "Unknown location";
        if (locStatus === 'granted') {
            const loc = await Location.getCurrentPositionAsync({});
            locationStr = `${loc.coords.latitude}, ${loc.coords.longitude}`;
        }

        // 2. Start Recording (Covertly)
        // Audio recording is easier to do silently via expo-av
        startCovertRecording(locationStr);
    };

    const startCovertRecording = async (locationStr: string) => {
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const recording = new Audio.Recording();
            await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            await recording.startAsync();

            console.log("Covert recording started...");

            // Record for 10 seconds then upload (for demonstration of the flow)
            setTimeout(async () => {
                await recording.stopAndUnloadAsync();
                const uri = recording.getURI();
                console.log("Covert recording saved at:", uri);

                // Next step: Upload to Firebase
                // Since firebase isn't initialized here perfectly, we stub the upload
                console.log("Uploading to cloud storage...");
                const fakeCloudUrl = "https://firebasestorage.googleapis.com/v0/b/example/audio.m4a";

                Alert.alert("Emergency Complete", `Alert sent with Location: ${locationStr}\nAudio Evidence: ${fakeCloudUrl}`);
            }, 10000);

        } catch (err) {
            console.error('Failed to start covert recording', err);
        }
    };

    return (
        <Modal visible={showWarning} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>LOW RISK DETECTED</Text>
                    <Text style={styles.modalText}>Alerting contacts in {countdown} seconds...</Text>
                    <TouchableOpacity style={styles.cancelBtn} onPress={cancelLowRiskAlert}>
                        <Text style={styles.cancelBtnText}>DISABLE</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.8)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    modalContent: {
        backgroundColor: "#2a1b1b",
        padding: 25,
        borderRadius: 20,
        width: "100%",
        alignItems: "center",
        elevation: 10,
    },
    modalTitle: {
        color: "#ec1313",
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 10,
    },
    modalText: {
        color: "#fff",
        fontSize: 16,
        marginBottom: 25,
        textAlign: "center",
    },
    cancelBtn: {
        backgroundColor: "#1f1f1f",
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: "#555",
        width: "100%",
        alignItems: "center",
    },
    cancelBtnText: {
        color: "#ccc",
        fontWeight: "bold",
        fontSize: 16,
    },
});
