import React, { useEffect, useState, useRef } from 'react';
import {
    View, Alert, DeviceEventEmitter, Platform, PermissionsAndroid,
    Modal, Text, TouchableOpacity, StyleSheet, AppState, AppStateStatus
} from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import Voice from '@react-native-voice/voice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
// Firebase Storage removed — using Cloudinary via backend /upload-recording
import haversine from 'haversine';
import BASE_URL from '../config/api';
import * as IntentLauncher from 'expo-intent-launcher';
import { MaterialIcons } from '@expo/vector-icons';
const Device = { osBuildId: "mock-device-id" }; // Mock because native module is missing
// import * as Device from 'expo-device'; 
import { LinearGradient } from 'expo-linear-gradient';


export default function EmergencyMonitor() {
    const [isListening, setIsListening] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [lowRiskKeywords, setLowRiskKeywords] = useState<string[]>([]);
    const [highRiskKeywords, setHighRiskKeywords] = useState<string[]>([]);

    // Refs to avoid dependency loops
    const keywordsRef = useRef<{ low: string[], high: string[] }>({ low: [], high: [] });
    const listeningRef = useRef(false);
    const volumeHistory = useRef<number[]>([]);
    const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastShakeTime = useRef<number>(0);

    // LOW RISK modal state
    const [showLowWarning, setShowLowWarning] = useState(false);
    const [lowCountdown, setLowCountdown] = useState(5);

    // HIGH RISK modal + recording state
    const [showHighWarning, setShowHighWarning] = useState(false);
    const [highCountdown, setHighCountdown] = useState(10);
    const highCancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCancelledRef = useRef(false);



    // Camera recording
    const [showCamera, setShowCamera] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const cameraRef = useRef<CameraView | null>(null);
    const videoRecordingRef = useRef<boolean>(false);
    const audioRecordingRef = useRef<Audio.Recording | null>(null);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const luxRef = useRef<number>(100); // Default bright
    const blankScreenCounterRef = useRef<number>(0);
    const triggeredKeywordRef = useRef<string>('');


    useEffect(() => {
        setup();
        const cancelSub = DeviceEventEmitter.addListener("EMERGENCY_LISTENING_CANCEL", () => stopListening());

        return () => {
            cancelSub.remove();
            Voice.destroy()
                .then(() => {
                    try { Voice.removeAllListeners(); } catch (e) { }
                })
                .catch(() => { });
        };
    }, []);

    const setup = async () => {
        const id = await AsyncStorage.getItem("userId");
        setUserId(id);
        if (id) await fetchKeywords(id);

        // Voice listeners
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
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_CANCEL");
            Voice.destroy().then(() => {
                listeningRef.current = false;
                setIsListening(false);
            });
        };

        // Volume button trigger
        const volumeListener = VolumeManager.addVolumeListener(() => {
            const now = Date.now();
            volumeHistory.current.push(now);
            volumeHistory.current = volumeHistory.current.filter(t => now - t < 3000);
            if (volumeHistory.current.length >= 3 && !listeningRef.current) {
                volumeHistory.current = [];
                activateEmergencyListening();
            }
        });

        // Shake detection (safe — fails silently in Expo Go)
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
        } catch (e) {
            console.log('Shake detection unavailable:', e);
        }

        // Blank screen detection via LightSensor (simulated)
        let lightListener: { remove: () => void } | null = null;
        try {
            const { LightSensor } = require('expo-sensors');
            lightListener = LightSensor.addListener((data: { illuminance: number }) => {
                luxRef.current = data.illuminance;
            });
        } catch (e) {
            console.log('Light sensor unavailable:', e);
        }

        return () => {
            volumeListener.remove();
            if (shakeListener) shakeListener.remove();
            if (lightListener) lightListener.remove();
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

            const lowList = Array.isArray(dataLow)
                ? dataLow.map((k: any) => k.keyword_text.toLowerCase()).filter((k: string) => k.trim().length > 0)
                : [];
            const highList = Array.isArray(dataHigh)
                ? dataHigh.map((k: any) => k.keyword_text.toLowerCase()).filter((k: string) => k.trim().length > 0)
                : [];

            setLowRiskKeywords(lowList);
            setHighRiskKeywords(highList);
            keywordsRef.current = { low: lowList, high: highList };
            console.log('Keywords loaded:', keywordsRef.current);
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

            if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
            listeningTimeoutRef.current = setTimeout(() => {
                if (listeningRef.current) stopListening();
            }, 30000);

        } catch (e: any) {
            console.error("Voice Error: ", e);
            listeningRef.current = false;
            setIsListening(false);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
        }
    };

    const onSpeechResults = (e: any) => {
        const results = e.value as string[];
        if (!results || results.length === 0) return;
        console.log("Detecting speech:", results);

        const highMatch = results.find(res =>
            keywordsRef.current.high.some(kw => {
                const found = res.toLowerCase().includes(kw);
                if (found) triggeredKeywordRef.current = kw; // Store the actual keyword matched
                return found;
            })
        );

        if (highMatch) {
            handleHighRisk();
            stopListening();
            return;
        }

        const lowMatch = results.find(res =>
            keywordsRef.current.low.some(kw => {
                const found = res.toLowerCase().includes(kw);
                if (found) triggeredKeywordRef.current = kw;
                return found;
            })
        );

        if (lowMatch) {
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

    // ─────────────────────────── LOW RISK ───────────────────────────

    const handleLowRisk = () => {
        setShowLowWarning(true);
        setLowCountdown(5);

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);

        timerIntervalRef.current = setInterval(() => {
            setLowCountdown(prev => {
                if (prev <= 1) { clearInterval(timerIntervalRef.current!); return 0; }
                return prev - 1;
            });
        }, 1000);

        cancelTimeoutRef.current = setTimeout(() => {
            clearInterval(timerIntervalRef.current!);
            setShowLowWarning(false);
            executeLowRiskAction();
        }, 5000);
    };

    const cancelLowRiskAlert = () => {
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setShowLowWarning(false);
    };

    const executeLowRiskAction = async () => {
        console.log("Executing LOW RISK action...");
        try {
            const email = await AsyncStorage.getItem("userEmail");
            const locStr = await getLocationString();
            
            let lat = null, lon = null;
            if (locStr.includes('?q=')) {
                const coords = locStr.split('?q=')[1].split(',');
                lat = coords[0];
                lon = coords[1];
            }

            if (email) {
                const sosRes = await fetch(`${BASE_URL}/send-sos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        email, 
                        latitude: lat, 
                        longitude: lon,
                        keyword: triggeredKeywordRef.current,
                        risk_level: 'LOW' 
                    }),
                });
                const sosData = await sosRes.json();
                console.log("✅ LOW RISK SOS response:", sosData.message);
            }
        } catch (error) {
            console.error("Error in LOW RISK sequence:", error);
        }
    };

    // ─────────────────────────── HIGH RISK ───────────────────────────

    const handleHighRisk = () => {
        console.log("🔴 HIGH RISK KEYWORD DETECTED");
        isCancelledRef.current = false;
        setShowHighWarning(true);
        setHighCountdown(10);

        if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
        if (highCancelTimeoutRef.current) clearTimeout(highCancelTimeoutRef.current);

        // 10s countdown UI
        highTimerIntervalRef.current = setInterval(() => {
            setHighCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(highTimerIntervalRef.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // After 10 seconds, if NOT cancelled → start recording (which will also trigger calls)
        highCancelTimeoutRef.current = setTimeout(() => {
            clearInterval(highTimerIntervalRef.current!);
            setShowHighWarning(false);

            if (isCancelledRef.current) {
                console.log("High risk protocol cancelled within 10s window.");
                return;
            }

            console.log("High risk protocol confirmed after 10s. Starting recording.");
            startHighRiskRecording();
        }, 10000);
    };



    const executeHighRiskAlertsAndCalls = async () => {
        try {
            const email = await AsyncStorage.getItem("userEmail");
            const userId = (await AsyncStorage.getItem("userId")) || "U101";
            const locStr = await getLocationString();
            
            let lat = null, lon = null;
            if (locStr.includes('?q=')) {
                const coords = locStr.split('?q=')[1].split(',');
                lat = coords[0];
                lon = coords[1];
            }

            // 1. Send High-Risk Email immediately (during recording)
            if (email) {
                await fetch(`${BASE_URL}/send-sos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, latitude: lat, longitude: lon, keyword: triggeredKeywordRef.current, risk_level: 'HIGH' }),
                });
            }

            // 2. Automated calling one by one
            const contactResponse = await fetch(`${BASE_URL}/getTrustedContacts/${userId}`);
            const contacts = await contactResponse.json();

            if (Array.isArray(contacts) && contacts.length > 0) {
                let callIndex = 0;
                // Each contact gets ~15 seconds before moving to the next.
                while (!isCancelledRef.current) {
                    const contact = contacts[callIndex % contacts.length];
                    if (contact?.trusted_no) {
                        const callSeconds = 15;
                        console.log(`📞 Auto-calling ${contact.trusted_name} (${contact.trusted_no}) for ~${callSeconds}s (until user marks SAFE).`);
                        await triggerCall(contact.trusted_no);
                        // We cannot programmatically hang up the call from Expo;
                        // this delay simply controls how long we wait before trying the next contact.
                        const waitMs = callSeconds * 1000;
                        const start = Date.now();
                        while (!isCancelledRef.current && Date.now() - start < waitMs) {
                            await new Promise(res => setTimeout(res, 500));
                        }
                    }

                    if (isCancelledRef.current) break;
                    callIndex += 1;
                }
            }
        } catch (err) {
            console.error("High risk alerts/calls error:", err);
        }
    };

    const triggerCall = async (phone: string) => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
                if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                    await IntentLauncher.startActivityAsync('android.intent.action.CALL', {
                        data: `tel:${phone}`
                    });
                }
            } catch (e) {
                console.log("Call failed:", e);
            }
        }
    };

    const cancelHighRiskAlert = () => {
        isCancelledRef.current = true;
        if (highCancelTimeoutRef.current) clearTimeout(highCancelTimeoutRef.current);
        if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
        setShowHighWarning(false);
        stopVideoRecording();
        stopAudioRecording();
        setIsRecording(false);
        console.log("⛔ High risk protocol cancelled by user.");
    };



    const startHighRiskRecording = async () => {
        console.log("📹 Starting high risk video + audio recording...");

        // Request all permissions
        if (!cameraPermission?.granted) {
            const result = await requestCameraPermission();
            if (!result.granted) {
                console.log("Camera permission denied.");
                // Fall back to audio-only
                startAudioOnlyRecording();
                return;
            }
        }

        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({ 
            allowsRecordingIOS: true, 
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            playThroughEarpieceAndroid: false
        });

        // Start Separate Audio Recording for redundancy/evidence
        startAudioOnlyRecording();

        // Show hidden camera view for recording
        setCameraFacing('back');
        setShowCamera(true);
        setIsRecording(true);
        setUploadStatus('Recording...');

        // Once recording is started, begin emergency calls in parallel
        executeHighRiskAlertsAndCalls();
    };

    // Called from CameraView once it's mounted and ready
    const startVideoCapture = async () => {
        if (!cameraRef.current || videoRecordingRef.current) return;
        videoRecordingRef.current = true;

        try {
            console.log("▶️ Video recording started");

            // Record until stopVideoRecording() is called
            const videoPromise = cameraRef.current.recordAsync();

            // Periodic check for TRUE blank screen (not just low light)
            const checkBlankInterval = setInterval(async () => {
                if (!videoRecordingRef.current) {
                    clearInterval(checkBlankInterval);
                    return;
                }

                // Treat near-zero illuminance as "screen completely covered"
                if (luxRef.current <= 0.5) {
                    blankScreenCounterRef.current += 1;
                } else {
                    blankScreenCounterRef.current = 0;
                }

                // Require a few consecutive checks before switching
                if (blankScreenCounterRef.current >= 2) { // ~4 seconds of true blank
                    console.log("🌑 True blank screen detected. Switching camera.");
                    blankScreenCounterRef.current = 0;
                    setCameraFacing(prev => prev === 'back' ? 'front' : 'back');
                }
            }, 2000); // Check every 2 seconds

            const videoResult = await videoPromise;

            if (videoResult && videoResult.uri && !isCancelledRef.current) {
                console.log("✅ Video saved at:", videoResult.uri);
                setUploadStatus('Uploading to Cloudinary...');
                await uploadToCloudinary(videoResult.uri, 'video');
            } else {
                console.log("Recording discarded (cancelled or empty)");
            }

        } catch (err) {
            console.error("Video recording error:", err);
            // Fall back to audio only
            startAudioOnlyRecording();
        } finally {
            videoRecordingRef.current = false;
            setIsRecording(false);
            setShowCamera(false);
        }
    };

    const stopVideoRecording = () => {
        if (cameraRef.current && videoRecordingRef.current) {
            cameraRef.current.stopRecording();
            videoRecordingRef.current = false;
        }
    };

    const stopAudioRecording = async () => {
        if (audioRecordingRef.current) {
            try {
                await audioRecordingRef.current.stopAndUnloadAsync();
                const uri = audioRecordingRef.current.getURI();
                if (uri && !isCancelledRef.current) {
                    setUploadStatus('Uploading audio to Cloudinary...');
                    await uploadToCloudinary(uri, 'audio');
                }
            } catch (e) {
                console.log("Stop audio error:", e);
            } finally {
                audioRecordingRef.current = null;
                setIsRecording(false);
            }
        }
    };


    const startAudioOnlyRecording = async () => {
        console.log("🎙️ Starting audio-only recording as fallback...");
        try {
            // audio mode is already set in startHighRiskRecording or setup
            const recording = new Audio.Recording();
            audioRecordingRef.current = recording;
            await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            await recording.startAsync();

            // Recording will continue until stopAudioRecording() is called
            // No more 30s timeout
        } catch (err) {
            console.error("Audio recording error:", err);
            setIsRecording(false);
        }
    };


    /**
     * uploadToCloudinary
     * Sends the recorded file to the backend /upload-recording endpoint as
     * multipart/form-data. The backend uploads to Cloudinary, saves the
     * secure_url to MySQL (emergency_recordings table), and emails all trusted
     * contacts with the recording link — all in one atomic request.
     */
    /**
     * uploadToCloudinary
     * USES DIRECT SIGNED UPLOAD for security and efficiency.
     */
    const uploadToCloudinary = async (localUri: string, type: 'video' | 'audio') => {
        try {
            const email = await AsyncStorage.getItem("userEmail");
            const userId = (await AsyncStorage.getItem("userId")) || "U101";
            if (!email) return;

            // 1. Get signature from backend
            const sigRes = await fetch(`${BASE_URL}/generate-signature`);
            const { signature, timestamp, cloud_name, api_key } = await sigRes.json();

            // 2. Prepare Direct Upload FormData
            const extension = localUri.split('.').pop() || (type === 'video' ? 'mp4' : 'm4a');
            const mimeType = type === 'video' ? `video/${extension}` : `audio/${extension === 'm4a' ? 'm4a' : 'mpeg'}`;
            const fileName = `emergency_${type}_${Date.now()}.${extension}`;

            const formData = new FormData();
            formData.append('file', {
                uri: localUri,
                name: fileName,
                type: mimeType,
            } as any);
            formData.append('api_key', api_key);
            formData.append('timestamp', timestamp.toString());
            formData.append('signature', signature);
            formData.append('folder', 'shield_emergency_records');

            // 3. Upload TO CLOUDINARY Directly
            // Use 'video' resource type for both video and audio in Cloudinary
            console.log(`☁️ Direct Cloudinary Upload (${type})...`);
            const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`, {
                method: 'POST',
                body: formData,
            });

            const cloudData = await cloudRes.json();

            if (cloudRes.ok) {
                console.log("✅ Direct Upload Succeeded:", cloudData.secure_url);
                setUploadStatus('✅ Upload complete!');

                // 4. Trigger Twilio Protocol + DB Log
                const locationStr = await getLocationString();
                const contactResponse = await fetch(`${BASE_URL}/getTrustedContacts/${userId}`);
                const contacts = await contactResponse.json();

                let deviceId = "Unknown";
                try {
                    deviceId = Device.osBuildId || "Unknown";
                } catch (e) {
                    console.log("Device module failed:", e);
                }

                await fetch(`${BASE_URL}/trigger-emergency-protocol`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        keyword: triggeredKeywordRef.current || "HIGH-RISK DETECTED",
                        location_link: locationStr,
                        recording_url: cloudData.secure_url,
                        cloudinary_public_id: cloudData.public_id,
                        contacts: contacts,
                        device_id: deviceId,
                    }),
                });

            } else {
                console.error("❌ Cloudinary error:", cloudData);
                setUploadStatus('Cloudinary Error');
            }

        } catch (err) {
            console.error("uploadToCloudinary error:", err);
            setUploadStatus('Upload failed');
        }
    };


    const getLocationString = async (): Promise<string> => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                return `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`;
            }
        } catch (_) { }
        return 'Location unavailable';
    };

    // ─────────────────────────── RENDER ───────────────────────────

    return (
        <>
            {/* ───── LOW RISK WARNING MODAL ───── */}
            <Modal visible={showLowWarning} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.warningIconWrap}>
                            <MaterialIcons name="warning" size={36} color="#f59e0b" />
                        </View>
                        <Text style={styles.modalTitle}>LOW RISK DETECTED</Text>
                        <Text style={styles.modalText}>
                            Alerting your trusted contacts in{'\n'}
                            <Text style={styles.countdown}>{lowCountdown}s</Text>
                        </Text>
                        <TouchableOpacity style={styles.cancelBtn} onPress={cancelLowRiskAlert}>
                            <MaterialIcons name="block" size={18} color="#ccc" />
                            <Text style={styles.cancelBtnText}>DISABLE</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ───── HIGH RISK WARNING MODAL ───── */}
            <Modal visible={showHighWarning} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <LinearGradient
                        colors={['#2a0f0f', '#1a0505']}
                        style={[styles.modalContent, styles.highRiskContent]}
                    >
                        <View style={styles.highRiskIconWrap}>
                            <MaterialIcons name="videocam" size={42} color="#ec1313" />
                        </View>
                        <Text style={[styles.modalTitle, { color: '#ec1313', fontSize: 24 }]}>🚨 HIGH-RISK DETECTED</Text>
                        <Text style={styles.modalText}>
                            Emergency recording and alerts are active.{'\n'}
                            Sending SOS in <Text style={[styles.countdown, { color: '#ec1313' }]}>{highCountdown}s</Text>
                        </Text>
                        <Text style={styles.subText}>Cloud storage enabled for evidence collection</Text>
                        <TouchableOpacity style={[styles.cancelBtn, styles.highCancelBtn]} onPress={cancelHighRiskAlert}>
                            <MaterialIcons name="security" size={20} color="#fff" />
                            <Text style={[styles.cancelBtnText, { color: '#fff' }]}>DISABLE EMERGENCY</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </Modal>


            {/* ───── HIDDEN CAMERA VIEW (recording in background) ───── */}
            {showCamera && (
                <Modal visible={showCamera} transparent animationType="none">
                    <View style={styles.cameraOverlay}>
                        <CameraView
                            ref={cameraRef}
                            style={styles.hiddenCamera}
                            facing={cameraFacing}
                            mode="video"
                            onCameraReady={startVideoCapture}
                        />
                        <View style={styles.recordingBadge}>
                            <View style={styles.recordingDot} />
                            <Text style={styles.recordingText}>REC • {uploadStatus}</Text>
                        </View>
                        <TouchableOpacity 
                            style={styles.stopBtn} 
                            onPress={() => {
                                isCancelledRef.current = true;
                                stopVideoRecording();
                                stopAudioRecording();
                                setShowCamera(false);
                                setIsRecording(false);
                            }}
                        >
                            <MaterialIcons name="security" size={32} color="#fff" />
                            <Text style={styles.stopBtnText}>I AM SAFE (Stop & Send)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.flipBtn}
                            onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}
                        >
                            <MaterialIcons name="flip-camera-android" size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </Modal>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.85)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    modalContent: {
        backgroundColor: "#1e1414",
        padding: 28,
        borderRadius: 24,
        width: "100%",
        alignItems: "center",
        elevation: 10,
        borderWidth: 1,
        borderColor: "rgba(245,158,11,0.3)",
    },
    highRiskContent: {
        borderColor: "rgba(236,19,19,0.4)",
        backgroundColor: "#1a0f0f",
    },
    warningIconWrap: {
        backgroundColor: "rgba(245,158,11,0.15)",
        padding: 16,
        borderRadius: 50,
        marginBottom: 14,
    },
    highRiskIconWrap: {
        backgroundColor: "rgba(236,19,19,0.15)",
        padding: 16,
        borderRadius: 50,
        marginBottom: 14,
    },
    modalTitle: {
        color: "#f59e0b",
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
        letterSpacing: 1,
    },
    modalText: {
        color: "#fff",
        fontSize: 15,
        marginBottom: 10,
        textAlign: "center",
        lineHeight: 24,
    },
    countdown: {
        fontSize: 36,
        fontWeight: "bold",
        color: "#f59e0b",
    },
    subText: {
        color: "#888",
        fontSize: 12,
        marginBottom: 22,
        textAlign: "center",
    },
    cancelBtn: {
        backgroundColor: "#2a2a2a",
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#555",
        width: "100%",
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        marginTop: 10,
    },
    highCancelBtn: {
        borderColor: "#ec1313",
        backgroundColor: "rgba(236,19,19,0.1)",
    },
    cancelBtnText: {
        color: "#ccc",
        fontWeight: "bold",
        fontSize: 14,
        letterSpacing: 0.5,
    },
    // Camera overlay styles
    cameraOverlay: {
        flex: 1,
        backgroundColor: "#000",
    },
    hiddenCamera: {
        flex: 1,
    },
    recordingBadge: {
        position: "absolute",
        top: 50,
        left: 20,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 8,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#ec1313",
    },
    recordingText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "bold",
    },
    stopBtn: {
        position: "absolute",
        bottom: 60,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(236,19,19,0.85)",
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 50,
        gap: 8,
    },
    stopBtnText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 15,
    },
    flipBtn: {
        position: "absolute",
        top: 50,
        right: 20,
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: 10,
        borderRadius: 30,
    },
});
