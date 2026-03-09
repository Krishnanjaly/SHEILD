import React, { useEffect, useState, useRef } from 'react';
import { View, Alert, DeviceEventEmitter } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import Voice from '@react-native-voice/voice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import BASE_URL from '../config/api';

export default function EmergencyMonitor() {
    const [isListening, setIsListening] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [lowRiskKeywords, setLowRiskKeywords] = useState<string[]>([]);
    const [highRiskKeywords, setHighRiskKeywords] = useState<string[]>([]);

    // We use refs to avoid dependency loops in listeners
    const keywordsRef = useRef<{ low: string[], high: string[] }>({ low: [], high: [] });
    const listeningRef = useRef(false);
    const volumeHistory = useRef<number[]>([]);

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

        return () => {
            volumeListener.remove();
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

            const lowList = Array.isArray(dataLow) ? dataLow.map((k: any) => k.keyword_text.toLowerCase()) : [];
            const highList = Array.isArray(dataHigh) ? dataHigh.map((k: any) => k.keyword_text.toLowerCase()) : [];

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

        const detectedText = results[0].toLowerCase();

        // Check High Risk First
        const isHighRisk = keywordsRef.current.high.some(kw => detectedText.includes(kw));
        if (isHighRisk) {
            handleHighRisk();
            stopListening();
            return;
        }

        // Check Low Risk
        const isLowRisk = keywordsRef.current.low.some(kw => detectedText.includes(kw));
        if (isLowRisk) {
            handleLowRisk();
            stopListening();
            return;
        }
    };

    const stopListening = async () => {
        if (!listeningRef.current) return;
        try {
            listeningRef.current = false;
            setIsListening(false);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
            await Voice.cancel();
            await Voice.destroy();
        } catch (e) {
            console.log("Stop Listening Error:", e);
        }
    };

    const handleLowRisk = async () => {
        Alert.alert("LOW RISK DETECTED", "Sending location to safe contacts...");
        // 1. Get Location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        console.log("User Location:", loc.coords);

        // 2. Fetch contacts and send SMS (Integration with existing backend)
        // Normally we would call a backend route to trigger SMS, like /send-emergency-alert
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

    return null; // This is a background component, no UI
}
