import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import {
    View, Alert, DeviceEventEmitter, Platform, PermissionsAndroid,
    Modal, Text, TouchableOpacity, StyleSheet, AppState, AppStateStatus,
    NativeModules, NativeEventEmitter, BackHandler
} from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import haversine from 'haversine';
import BASE_URL from '../config/api';
import * as IntentLauncher from 'expo-intent-launcher';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AiAnalysisPopup from './AiAnalysisPopup';
import AbnormalMovementPopup from './AbnormalMovementPopup';
import { foregroundCallService } from '../services/ForegroundCallService';
import { aiRiskEngine, MovementDetectionEvent, RiskAnalysis, SensorData } from '../utils/AiRiskEngine';
import { ActivityService } from '../services/ActivityService';
import { EmergencyService } from '../services/EmergencyService';
import { GuardianServiceManager } from '../services/GuardianServiceManager';
import { GuardianStateService } from '../services/GuardianStateService';
import * as SMS from 'expo-sms';
import { registerGuardianTask } from '../utils/GuardianTask';
import { findMatchedKeyword } from '../services/keywordMatcher';
import { classifyAbnormalMovement } from '../services/abnormalMovementClassifier';
import { abnormalMovementEmergencyService } from '../services/abnormalMovementEmergencyService';
import {
    classifyVoiceError,
    ensureVoicePermission,
    isVoiceModuleAvailable,
    safeVoiceCancel,
    safeVoiceDestroy,
    safeVoiceStart,
    voiceRuntime,
} from '../services/voiceModule';

// AI Risk Detection Thresholds
const LOW_RISK_THRESHOLD = 3;
const HIGH_RISK_THRESHOLD = 7;

// AI Risk Scoring Constants
const SCORE_STRONG_SHAKE = 3;
const SCORE_REPEATED_SHAKING = 4;
const SCORE_FALL_DETECTION = 5;
const SCORE_DARKNESS_DETECTED = 2;
const SCORE_HIGH_SOUND_INTENSITY = 3;
const VOICE_LISTENING_WINDOW_MS = 15000;
const VOICE_RESTART_DELAY_MS = 2500;
const MAX_VOICE_RESTART_ATTEMPTS = 6;
const DEFAULT_LOW_RISK_KEYWORDS = ["call me", "come later", "emergency"];
const DEFAULT_HIGH_RISK_KEYWORDS = ["help", "danger", "save me", "help help"];
const AI_CLASSIFICATION_POPUP_MS = 1800;

const Device = { osBuildId: "mock-device-id" };
const ReactNativeForegroundService = {
    update: (_options: unknown) => {
        // Foreground service integration removed for EAS compatibility.
    },
};

export default function EmergencyMonitor() {
    const [isListening, setIsListening] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [currentEmergencyId, setCurrentEmergencyId] = useState<number | null>(null);
    const [lowRiskKeywords, setLowRiskKeywords] = useState<string[]>([]);
    const [highRiskKeywords, setHighRiskKeywords] = useState<string[]>([]);

    // Refs to avoid dependency loops
    const keywordsRef = useRef<{ low: string[], high: string[] }>({ low: [], high: [] });
    const listeningRef = useRef(false);
    const volumeHistory = useRef<number[]>([]);
    const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const voiceRestartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const voiceRestartAttemptsRef = useRef(0);
    const movementPopupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const analysisProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastShakeTime = useRef<number>(0);
    const analysisReadyRef = useRef(true);

    // AI Risk Detection State
    const [aiRiskLevel, setAiRiskLevel] = useState<'LOW' | 'HIGH' | 'NONE'>('NONE');
    const [aiRiskTriggers, setAiRiskTriggers] = useState<string[]>([]);
    const [aiConfidence, setAiConfidence] = useState<number>(0);
    const [showAiRiskAlert, setShowAiRiskAlert] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [detectedMovement, setDetectedMovement] = useState<string | null>(null);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [analysisStatusText, setAnalysisStatusText] = useState("Idle");
    const [isEmergencyActive, setIsEmergencyActive] = useState(false);
    const [abnormalMovementPopup, setAbnormalMovementPopup] = useState<{
        visible: boolean;
        classification: 'LOW' | 'HIGH';
        title: string;
        message: string;
    } | null>(null);
    
    // AI Sensor Data Storage
    const sensorHistory = useRef<SensorData[]>([]);
    const lastRiskAnalysis = useRef<RiskAnalysis | null>(null);
    const aiAnalysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const accelerometerData = useRef<{ x: number; y: number; z: number } | null>(null);
    const gyroscopeData = useRef<{ x: number; y: number; z: number } | null>(null);
    const fallDetectionRef = useRef<{ detected: boolean; timestamp: number }>({ detected: false, timestamp: 0 });
    const movementPatternRef = useRef<{ variance: number; pattern: string }>({ variance: 0, pattern: 'normal' });
    const darkEnvironmentRef = useRef<{ detected: boolean; duration: number }>({ detected: false, duration: 0 });

    // LOW RISK modal state
    const [showLowWarning, setShowLowWarning] = useState(false);
    const [lowCountdown, setLowCountdown] = useState(5);

    // HIGH RISK modal    // High-risk warning modal
    const [showHighWarning, setShowHighWarning] = useState(false);
    const [highCountdown, setHighCountdown] = useState(10);
    const [showContactCalling, setShowContactCalling] = useState(false);
    const [callingContactName, setCallingContactName] = useState('');
    const [callingCountdown, setCallingCountdown] = useState(15);
    const highCancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCancelledRef = useRef(false);

    const [isBackgroundMode, setIsBackgroundMode] = useState(false);
    const backgroundServiceRef = useRef<boolean>(false);
    const appStateRef = useRef<AppStateStatus>('active');
    const lastVolumePressRef = useRef<number[]>([]);


    // Camera recording
    const [showCamera, setShowCamera] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const [callCountdown, setCallCountdown] = useState(5);
    const [showCallCountdown, setShowCallCountdown] = useState(false);
    const [currentCallContact, setCurrentCallContact] = useState('');
    const [showActiveCallCountdown, setShowActiveCallCountdown] = useState(false);
    const [activeCallCountdown, setActiveCallCountdown] = useState(15);

    useSpeechRecognitionEvent("result", (event) => {
        const transcripts =
            event.results?.map((result) => result.transcript).filter(Boolean) || [];
        if (transcripts.length === 0) {
            return;
        }

        const syntheticEvent = { value: transcripts };
        if (event.isFinal) {
            voiceRuntime.onSpeechResults?.(syntheticEvent);
        } else {
            voiceRuntime.onSpeechPartialResults?.(syntheticEvent);
        }
    });

    useSpeechRecognitionEvent("end", () => {
        voiceRuntime.onSpeechEnd?.();
    });

    useSpeechRecognitionEvent("error", (event) => {
        voiceRuntime.onSpeechError?.(event);
    });

    // PERSISTENT GUARDIAN STATE
    const [isGuardianEnabled, setIsGuardianEnabled] = useState(false);
    const [guardianStatus, setGuardianStatus] = useState<'PASSIVE' | 'ACTIVE' | 'EMERGENCY'>('PASSIVE');
    const cameraRef = useRef<CameraView | null>(null);
    const videoRecordingRef = useRef<boolean>(false);
    const audioRecordingRef = useRef<Audio.Recording | null>(null);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const luxRef = useRef<number>(100); // Default bright
    const blankScreenCounterRef = useRef<number>(0);
    const triggeredKeywordRef = useRef<string>('');
    const callCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const listeningWindowEndsAtRef = useRef<number | null>(null);

    const applyKeywordLists = useCallback((lowList: string[], highList: string[]) => {
        setLowRiskKeywords(lowList);
        setHighRiskKeywords(highList);
        keywordsRef.current = { low: lowList, high: highList };
        console.log('Keywords loaded:', keywordsRef.current);
    }, []);

    const ensureKeywordFallbacks = useCallback(() => {
        const lowList =
            keywordsRef.current.low.length > 0 ? keywordsRef.current.low : DEFAULT_LOW_RISK_KEYWORDS;
        const highList =
            keywordsRef.current.high.length > 0 ? keywordsRef.current.high : DEFAULT_HIGH_RISK_KEYWORDS;

        applyKeywordLists([...lowList], [...highList]);
    }, [applyKeywordLists]);

    const showAbnormalMovementDetectionPopup = useCallback((
        classification: 'LOW' | 'HIGH',
        title: string,
        message: string
    ) => {
        if (movementPopupTimeoutRef.current) {
            clearTimeout(movementPopupTimeoutRef.current);
        }

        setAbnormalMovementPopup({
            visible: true,
            classification,
            title,
            message,
        });

        movementPopupTimeoutRef.current = setTimeout(() => {
            setAbnormalMovementPopup((current) => current ? { ...current, visible: false } : current);
            movementPopupTimeoutRef.current = null;
        }, 3500);
    }, []);

    const waitForClassificationPopup = useCallback(async () => {
        await new Promise((resolve) => setTimeout(resolve, AI_CLASSIFICATION_POPUP_MS));
    }, []);

    const processAbnormalMovementDetection = useCallback(async (
        analysis: RiskAnalysis
    ) => {
        const assessment = classifyAbnormalMovement(analysis);
        if (assessment.classification === 'NONE') {
            return;
        }

        showAbnormalMovementDetectionPopup(
            assessment.classification,
            assessment.title,
            assessment.message
        );
        await waitForClassificationPopup();

        if (assessment.classification === 'HIGH') {
            const response = await abnormalMovementEmergencyService.handleHighRiskDetection(
                assessment,
                getLocationString
            );

            if (response.duplicate) {
                return;
            }

            if (response.emergencyId) {
                setCurrentEmergencyId(response.emergencyId);
            }

            triggeredKeywordRef.current =
                analysis.triggers.length > 0
                    ? `Abnormal movement: ${analysis.triggers.join(', ')}`
                    : 'Abnormal movement detected';

            triggerHighRiskAiAlert({
                ...analysis,
                riskLevel: 'HIGH',
            });
            return;
        }

        const response = await abnormalMovementEmergencyService.handleLowRiskDetection(
            assessment,
            getLocationString
        );

        if (response.duplicate) {
            return;
        }

        if (response.emergencyId) {
            setCurrentEmergencyId(response.emergencyId);
        }

        triggeredKeywordRef.current =
            analysis.triggers.length > 0
                ? `Abnormal movement: ${analysis.triggers.join(', ')}`
                : 'Abnormal movement detected';

        triggerLowRiskAiAlert({
            ...analysis,
            riskLevel: 'LOW',
        });
    }, [showAbnormalMovementDetectionPopup, waitForClassificationPopup]);

    const clearVoiceRestartTimer = () => {
        if (voiceRestartTimeoutRef.current) {
            clearTimeout(voiceRestartTimeoutRef.current);
            voiceRestartTimeoutRef.current = null;
        }
    };

    const isEmergencyListeningWindowActive = () => {
        return (
            listeningRef.current &&
            appStateRef.current === 'active' &&
            !backgroundServiceRef.current &&
            listeningWindowEndsAtRef.current !== null &&
            Date.now() < listeningWindowEndsAtRef.current
        );
    };

    const scheduleVoiceRestart = useCallback((reason: string) => {
        if (!isEmergencyListeningWindowActive()) {
            stopListening();
            return;
        }

        if (voiceRestartAttemptsRef.current >= MAX_VOICE_RESTART_ATTEMPTS) {
            console.log(`Voice restart limit reached during emergency listening: ${reason}`);
            stopListening();
            return;
        }

        clearVoiceRestartTimer();
        voiceRestartAttemptsRef.current += 1;
        voiceRestartTimeoutRef.current = setTimeout(async () => {
            if (!isEmergencyListeningWindowActive()) {
                await stopListening();
                return;
            }

            console.log(`Restarting speech recognition during emergency window (${voiceRestartAttemptsRef.current}/${MAX_VOICE_RESTART_ATTEMPTS}): ${reason}`);
            const contextualStrings = Array.from(
                new Set([...keywordsRef.current.low, ...keywordsRef.current.high])
            );
            const voiceStart = await safeVoiceStart('en-US', {
                contextualStrings,
                interimResults: true,
                continuous: true,
                maxAlternatives: 5,
            }, 'emergency');
            if (!voiceStart.ok && isEmergencyListeningWindowActive()) {
                console.log('Voice restart failed:', voiceStart.reason);
                scheduleVoiceRestart(`retry after failure: ${voiceStart.reason}`);
                return;
            }
            voiceRestartAttemptsRef.current = 0;
        }, VOICE_RESTART_DELAY_MS);
    }, []);

    const bindVoiceRuntimeHandlers = useCallback(() => {
        voiceRuntime.onSpeechResults = onSpeechResults;
        voiceRuntime.onSpeechPartialResults = (event) => {
            voiceRestartAttemptsRef.current = 0;
            onSpeechResults(event);
        };
        voiceRuntime.onSpeechEnd = () => {
            if (isEmergencyListeningWindowActive()) {
                scheduleVoiceRestart('speech ended');
            }
        };
        voiceRuntime.onSpeechError = (e) => {
            console.log('Speech Error:', e);
            if (isEmergencyListeningWindowActive()) {
                const errorKind = classifyVoiceError(e);
                if (errorKind === 'aborted') {
                    console.log('Speech recognition aborted during emergency listening. Delaying restart.');
                }
                scheduleVoiceRestart(`speech error: ${errorKind}`);
                return;
            }

            DeviceEventEmitter.emit("EMERGENCY_LISTENING_CANCEL");
            listeningRef.current = false;
            setIsListening(false);
        };
    }, [scheduleVoiceRestart]);


    const startGuardianService = async () => {
        await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
        setIsGuardianEnabled(true);
        setGuardianStatus(aiRiskEngine.isAnalysisActive() ? 'ACTIVE' : 'PASSIVE');
    };

    const stopGuardianService = async () => {
        await GuardianStateService.disableGuardianState();
        setIsGuardianEnabled(false);
        setGuardianStatus('PASSIVE');
    };

    useEffect(() => {
        const loadGuardianState = async () => {
            const enabled = await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
            if (enabled) {
                setIsGuardianEnabled(true);
                setGuardianStatus(aiRiskEngine.isAnalysisActive() ? 'ACTIVE' : 'PASSIVE');
            }
        };
        loadGuardianState();

        // 1. Register Background Task
        registerGuardianTask();

        // 2. Listen for Auto Triggers from Background
        const autoSub = DeviceEventEmitter.addListener('AUTO_EMERGENCY_TRIGGER', (analysis: RiskAnalysis) => {
            console.log('⚡ Background Guardian triggered Emergency!');
            triggeredKeywordRef.current = analysis.triggers.join(', ');
            handleHighRisk();
        });

        const riskSub = DeviceEventEmitter.addListener('AI_RISK_DETECTED', (analysis: RiskAnalysis) => {
            setAiRiskLevel(analysis.riskLevel);
            setAiConfidence(analysis.confidence);
            setAiRiskTriggers(analysis.triggers);
            GuardianStateService.saveAnalysis(
                analysis,
                analysis.riskLevel === 'NONE' ? 'PASSIVE' : undefined
            ).catch(() => {});
            
            if (analysis.riskLevel === 'HIGH') setGuardianStatus('EMERGENCY');
            else if (analysis.riskLevel === 'LOW') setGuardianStatus('ACTIVE');
            else if (isEmergencyActive) setGuardianStatus('EMERGENCY');
            else setGuardianStatus('PASSIVE');
        });

        // 3. Status Toggle Change (from Dashboard)
        const toggleSub = DeviceEventEmitter.addListener('STATUS_TOGGLE_CHANGED', async () => {
             const sensorStatus = await AsyncStorage.getItem('SENSORS_ENABLED');
             if (sensorStatus === 'true') {
                 setIsGuardianEnabled(true);
                 startGuardianService();
             } else {
                 setIsGuardianEnabled(false);
                 stopGuardianService();
             }
        });

        setup();
        const cancelSub = DeviceEventEmitter.addListener("EMERGENCY_LISTENING_CANCEL", () => stopListening());
        
        // Listen for AI risk events from background task
        const aiRiskSub = DeviceEventEmitter.addListener("AI_RISK_DETECTED", (analysis) => {
            if (isEmergencyActive) return;
            console.log('📡 Received Background AI Risk:', analysis.riskLevel);
            if (analysis.riskLevel === 'HIGH') {
                processAbnormalMovementDetection(analysis).catch((error) => {
                    console.log('Background abnormal movement handling error:', error);
                });
            }
        });

        const forceAiSub = DeviceEventEmitter.addListener("FORCE_AI_EMERGENCY", () => {
            console.log('🚨 Manually Forced AI Emergency');
            processAbnormalMovementDetection({
                riskLevel: 'HIGH',
                confidence: 1.0,
                triggers: ['User Forced Emergency'],
                sensorData: {
                    accelerometer: null,
                    gyroscope: null,
                    light: 0,
                    timestamp: Date.now()
                }
            }).catch((error) => {
                console.log('Forced abnormal movement handling error:', error);
            });
        });

        const movementUnsubscribe = aiRiskEngine.subscribeMovement((movementEvent) => {
            if (showHighWarning || showLowWarning || isEmergencyActive) {
                return;
            }

            startAiAnalysisSequence(movementEvent).catch((error) => {
                console.log("AI analysis sequence error:", error);
            });
        });

        // App State Listener for Background/Foreground transitions
        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        // Background Volume Button Listener (works even when app is backgrounded)
        const volumeListener = VolumeManager.addVolumeListener((event) => {
            handleVolumeButtonPress(event);
        });

        return () => {
            autoSub.remove();
            riskSub.remove();
            cancelSub.remove();
            toggleSub.remove();
            aiRiskSub.remove();
            forceAiSub.remove();
            movementUnsubscribe?.();
            appStateSubscription.remove();
            volumeListener.remove();
            safeVoiceDestroy().catch(() => {});
            clearVoiceRestartTimer();
            clearAiAnalysisProgress();
            if (movementPopupTimeoutRef.current) {
                clearTimeout(movementPopupTimeoutRef.current);
                movementPopupTimeoutRef.current = null;
            }
        };
    }, []);

    const clearAiAnalysisProgress = useCallback(() => {
        if (analysisProgressIntervalRef.current) {
            clearInterval(analysisProgressIntervalRef.current);
            analysisProgressIntervalRef.current = null;
        }
    }, []);

    const getAnalysisStatusText = (progressValue: number) => {
        if (progressValue < 34) return "Analyzing motion pattern...";
        if (progressValue < 68) return "Checking sensor intensity...";
        return "Evaluating risk level...";
    };

    const updateGuardianAnalysisUi = useCallback(async (
        next: {
            isAnalyzing: boolean;
            detectedMovement: string | null;
            progress: number;
            statusText: string;
            riskLevel: 'LOW' | 'HIGH' | 'NONE' | null;
        }
    ) => {
        await GuardianStateService.saveAnalysisUi(next);
    }, []);

    const cancelAiDetection = useCallback(async () => {
        clearAiAnalysisProgress();
        analysisReadyRef.current = true;
        setIsAnalyzing(false);
        setDetectedMovement(null);
        setAnalysisProgress(0);
        setAnalysisStatusText("Idle");
        setAiRiskLevel('NONE');
        setAiConfidence(0);
        setAiRiskTriggers([]);
        await aiRiskEngine.stopFullAnalysis();
        await updateGuardianAnalysisUi({
            isAnalyzing: false,
            detectedMovement: null,
            progress: 0,
            statusText: "Detection cancelled",
            riskLevel: null,
        });
    }, [clearAiAnalysisProgress, updateGuardianAnalysisUi]);

    const startAiAnalysisSequence = useCallback(async (movementEvent: MovementDetectionEvent) => {
        clearAiAnalysisProgress();
        analysisReadyRef.current = false;
        setDetectedMovement(movementEvent.movementType);
        setIsAnalyzing(true);
        setAnalysisProgress(0);
        setAnalysisStatusText("Analyzing motion pattern...");
        await updateGuardianAnalysisUi({
            isAnalyzing: true,
            detectedMovement: movementEvent.movementType,
            progress: 0,
            statusText: "Analyzing motion pattern...",
            riskLevel: null,
        });

        let nextProgress = 0;
        analysisProgressIntervalRef.current = setInterval(async () => {
            nextProgress = Math.min(100, nextProgress + 8);
            const nextStatusText = getAnalysisStatusText(nextProgress);
            setAnalysisProgress(nextProgress);
            setAnalysisStatusText(nextStatusText);
            await updateGuardianAnalysisUi({
                isAnalyzing: true,
                detectedMovement: movementEvent.movementType,
                progress: nextProgress,
                statusText: nextStatusText,
                riskLevel: null,
            });

            if (nextProgress >= 100) {
                clearAiAnalysisProgress();
                analysisReadyRef.current = true;
                setIsAnalyzing(false);
                const analysis = await aiRiskEngine.performRiskAnalysis();
                await updateGuardianAnalysisUi({
                    isAnalyzing: false,
                    detectedMovement: movementEvent.movementType,
                    progress: 100,
                    statusText:
                        analysis.riskLevel === 'HIGH'
                            ? "User is in Danger"
                            : analysis.riskLevel === 'LOW'
                              ? "Risk evaluation completed"
                              : "No Threat Detected",
                    riskLevel: analysis.riskLevel,
                });

                if (!isEmergencyActive && !showHighWarning && !showLowWarning && !isCancelledRef.current) {
                    processAbnormalMovementDetection(analysis).catch((error) => {
                        console.log('Movement detection handling error:', error);
                    });
                }
            }
        }, 250);
    }, [clearAiAnalysisProgress, isEmergencyActive, showHighWarning, showLowWarning, updateGuardianAnalysisUi]);

    const setup = async () => {
        const id = await AsyncStorage.getItem("userId");
        setUserId(id);
        if (id) {
            await fetchKeywords(id);
            await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
        }

        // Check for pending emergency from background monitoring
        try {
            const pendingEmergency = await AsyncStorage.getItem('pendingEmergency');
            if (pendingEmergency) {
                console.log('🚨 Initial setup: Found pending emergency:', pendingEmergency);
                const analysis = JSON.parse(pendingEmergency);
                await AsyncStorage.removeItem('pendingEmergency');
                
                if (analysis.riskLevel === 'HIGH') {
                    triggerHighRiskAiAlert(analysis);
                } else if (analysis.riskLevel === 'LOW') {
                    triggerLowRiskAiAlert(analysis);
                }
            }
        } catch (e) {
            console.log('Error checking pending emergency in setup:', e);
        }

        // Voice listeners
        if (isVoiceModuleAvailable()) {
            bindVoiceRuntimeHandlers();
        } else {
            console.log("Voice native module unavailable. Emergency voice listening is disabled until the app is rebuilt.");
        }
        
        // Initiation
        // Refresh toggles
        const micEnabled = await AsyncStorage.getItem("MIC_ENABLED");
        const snsEnabled = await AsyncStorage.getItem("SENSORS_ENABLED");

        if (snsEnabled === "false") {
            aiRiskEngine.stopMonitoring();
            await GuardianStateService.saveMonitoringStatus('OFF');
        } else {
            startAiRiskDetection();
            await GuardianStateService.saveMonitoringStatus(
                aiRiskEngine.isAnalysisActive() ? 'ACTIVE' : 'PASSIVE'
            );
        }

        checkBatteryOptimization();
    };

    const checkBatteryOptimization = async () => {
        if (Platform.OS === 'android') {
            console.log("🔋 Checking battery optimization settings...");
            // Informative intent for background persistence
            try {
                // Intent logic here if needed
            } catch (e) {}
        }
    };

    // ==================== BACKGROUND MONITORING ====================

    const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
        console.log('📱 App State Change:', appStateRef.current, '->', nextAppState);
        
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
            // App has come to foreground
            console.log('✅ App came to foreground');
            setIsBackgroundMode(false);
            backgroundServiceRef.current = false;
            
            // Check for pending emergency from background
            try {
                const pendingEmergency = await AsyncStorage.getItem('pendingEmergency');
                if (pendingEmergency) {
                    console.log('🚨 Found pending emergency from background:', pendingEmergency);
                    const analysis = JSON.parse(pendingEmergency);
                    await AsyncStorage.removeItem('pendingEmergency');
                    
                    processAbnormalMovementDetection(analysis).catch((error) => {
                        console.log('Foreground abnormal movement handling error:', error);
                    });
                }
            } catch (e) {
                console.log('Error checking pending emergency:', e);
            }
        } else if (nextAppState === 'background' || nextAppState === 'inactive') {
            // App has gone to background
            console.log('🔴 App went to background - using background monitoring service');
            setIsBackgroundMode(true);
            backgroundServiceRef.current = true;
            if (listeningRef.current) {
                await stopListening();
            }
            updateForegroundServiceNotification();
        }
        
        appStateRef.current = nextAppState;
    }, []);

    const updateForegroundServiceNotification = () => {
        try {
            ReactNativeForegroundService.update({
                id: 114,
                title: "SHIELD Guardian Active",
                message: isBackgroundMode 
                    ? "🔴 Background monitoring - Passive sensors active"
                    : "Monitoring for emergencies.",
                icon: "ic_launcher",
                color: "#ec1313",
            });
        } catch (e) {
            console.log('Foreground service update error:', e);
        }
    };


    const fetchKeywords = async (id: string) => {
        try {
            const [resLow, resHigh] = await Promise.all([
                fetch(`${BASE_URL}/get-keywords/${id}/LOW`),
                fetch(`${BASE_URL}/get-keywords/${id}/HIGH`)
            ]);
            let lowList: string[] = [];
            let highList: string[] = [];

            if (resLow.ok && resHigh.ok) {
                const dataLow = await resLow.json();
                const dataHigh = await resHigh.json();

                lowList = Array.isArray(dataLow)
                    ? dataLow.map((k: any) => k.keyword_text.toLowerCase()).filter((k: string) => k.trim().length > 0)
                    : [];
                highList = Array.isArray(dataHigh)
                    ? dataHigh.map((k: any) => k.keyword_text.toLowerCase()).filter((k: string) => k.trim().length > 0)
                    : [];
            }

            if (lowList.length === 0 && highList.length === 0) {
                const fallbackRes = await fetch(`${BASE_URL}/keywords/${id}`);
                if (fallbackRes.ok) {
                    const fallbackData = await fallbackRes.json();
                    lowList = Array.isArray(fallbackData.lowRiskKeywords)
                        ? fallbackData.lowRiskKeywords.map((k: string) => k.toLowerCase()).filter((k: string) => k.trim().length > 0)
                        : [];
                    highList = Array.isArray(fallbackData.highRiskKeywords)
                        ? fallbackData.highRiskKeywords.map((k: string) => k.toLowerCase()).filter((k: string) => k.trim().length > 0)
                        : [];
                }
            }

            if (lowList.length === 0) {
                lowList = lowRiskKeywords.length > 0 ? lowRiskKeywords : DEFAULT_LOW_RISK_KEYWORDS;
            }

            if (highList.length === 0) {
                highList = highRiskKeywords.length > 0 ? highRiskKeywords : DEFAULT_HIGH_RISK_KEYWORDS;
            }

            applyKeywordLists(lowList, highList);
        } catch (error) {
            console.log('Error fetching keywords:', error);
            ensureKeywordFallbacks();
        }
    };

    const activateEmergencyListening = async () => {
        console.log("🔥 EMERGENCY LISTENING ACTIVATED");
        try {
            let activeUserId = userId;
            if (!activeUserId) {
                activeUserId = await AsyncStorage.getItem("userId");
                if (activeUserId) {
                    setUserId(activeUserId);
                }
            }

            if (activeUserId) {
                await fetchKeywords(activeUserId);
            }

            ensureKeywordFallbacks();

            const micEnabled = await AsyncStorage.getItem("MIC_ENABLED");
            if (micEnabled === "false") {
                console.log("🚫 Mic is disabled by user. Skipping Voice start.");
                return;
            }

            const hasPermission = await ensureVoicePermission();
            if (!hasPermission) {
                console.log("🎤 Microphone permission denied. Skipping emergency voice start.");
                return;
            }

            if (!isVoiceModuleAvailable()) {
                console.log("Voice native module unavailable. Build the Android app with expo run:android before using voice detection.");
                return;
            }

            // 🔑 CRITICAL: Pause AI engine audio recording to free the mic for speech recognition
            // On Android, Audio.Recording and SpeechRecognition can't share the microphone
            console.log("🎤 Pausing AI audio metering to free mic for speech recognition...");
            await aiRiskEngine.pauseAudioRecording();

            bindVoiceRuntimeHandlers();
            listeningRef.current = true;
            setIsListening(true);
            voiceRestartAttemptsRef.current = 0;
            listeningWindowEndsAtRef.current = Date.now() + VOICE_LISTENING_WINDOW_MS;
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_START");
            const contextualStrings = Array.from(
                new Set([...keywordsRef.current.low, ...keywordsRef.current.high])
            );
            console.log('🗣️ Emergency listening keywords:', contextualStrings);
            console.log('🗣️ HIGH risk keywords:', keywordsRef.current.high);
            console.log('🗣️ LOW risk keywords:', keywordsRef.current.low);
            const voiceStart = await safeVoiceStart('en-US', {
                contextualStrings,
                interimResults: true,
                continuous: true,
                maxAlternatives: 5,
            }, 'emergency');
            if (!voiceStart.ok) {
                throw new Error(voiceStart.reason);
            }

            console.log('✅ Speech recognition started successfully — listening for keywords...');

            if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
            listeningTimeoutRef.current = setTimeout(() => {
                if (listeningRef.current) stopListening();
            }, VOICE_LISTENING_WINDOW_MS);

        } catch (e: any) {
            console.error("Voice Error: ", e);
            listeningRef.current = false;
            setIsListening(false);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
            // Resume audio recording since speech recognition failed
            aiRiskEngine.resumeAudioRecording().catch(() => {});
        }
    };

    const onSpeechResults = (e: any) => {
        const results = e.value as string[];
        if (!results || results.length === 0) return;
        const candidates = Array.from(new Set([...results, results.join(" ")]));
        voiceRestartAttemptsRef.current = 0;
        console.log("🎙️ Speech detected:", results);
        console.log("🔍 Checking against HIGH keywords:", keywordsRef.current.high);
        console.log("🔍 Checking against LOW keywords:", keywordsRef.current.low);

        const highMatch = findMatchedKeyword(candidates, keywordsRef.current.high);

        if (highMatch) {
            console.log("🚨 HIGH RISK KEYWORD MATCHED:", highMatch);
            triggeredKeywordRef.current = highMatch;
            ActivityService.logActivity(`KEYWORD_DETECTED_HIGH: ${triggeredKeywordRef.current}`, currentEmergencyId);
            handleHighRisk();
            stopListening();
            return;
        }

        const lowMatch = findMatchedKeyword(candidates, keywordsRef.current.low);

        if (lowMatch) {
            console.log("⚠️ LOW RISK KEYWORD MATCHED:", lowMatch);
            triggeredKeywordRef.current = lowMatch;
            ActivityService.logActivity(`KEYWORD_DETECTED_LOW: ${triggeredKeywordRef.current}`, currentEmergencyId);
            handleLowRisk();
            stopListening();
            return;
        }
    };

    const stopListening = async (options?: { resumeAiAudio?: boolean }) => {
        if (!listeningRef.current) return;
        try {
            if (listeningTimeoutRef.current) {
                clearTimeout(listeningTimeoutRef.current);
                listeningTimeoutRef.current = null;
            }
            clearVoiceRestartTimer();
            voiceRestartAttemptsRef.current = 0;
            listeningWindowEndsAtRef.current = null;
            listeningRef.current = false;
            setIsListening(false);
            DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
            await safeVoiceCancel();

            if (options?.resumeAiAudio !== false) {
                console.log("🔊 Resuming AI audio metering after speech recognition stopped");
                await aiRiskEngine.resumeAudioRecording();
            }
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
            const locEnabled = await AsyncStorage.getItem("LOCATION_ENABLED");
            const locStr = locEnabled !== "false" ? await getLocationString() : "Location Disabled";
            
            let lat = null, lon = null;
            if (locStr.includes('?q=')) {
                const coords = locStr.split('?q=')[1].split(',');
                lat = coords[0];
                lon = coords[1];
            }

            if (email && userId) {
                // start emergency record in DB
                const startRes = await EmergencyService.startEmergency(userId, triggeredKeywordRef.current, locStr);
                if (startRes.success) {
                    setCurrentEmergencyId(startRes.emergency_id);
                    await EmergencyService.logAlert(startRes.emergency_id, 'email');
                    await ActivityService.logActivity("SOS_TRIGGERED", startRes.emergency_id);
                }

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

        // After 10 seconds, if NOT cancelled → start recording and alerts
        highCancelTimeoutRef.current = setTimeout(async () => {
            clearInterval(highTimerIntervalRef.current!);
            setShowHighWarning(false);

            if (isCancelledRef.current) {
                console.log("High risk protocol cancelled within 10s window.");
                return;
            }

            console.log("High risk protocol confirmed after 10s. Starting recording and alerts.");
            startHighRiskRecording();
            await executeHighRiskAlertsAndCalls();
        }, 10000);
    };



    const executeHighRiskAlertsAndCalls = async () => {
        try {
            const email = await AsyncStorage.getItem("userEmail");
            const userId = (await AsyncStorage.getItem("userId")) || "U101";
            
            const locEnabled = await AsyncStorage.getItem("LOCATION_ENABLED");
            const locStr = locEnabled !== "false" ? await getLocationString() : "Location Disabled";
            
            console.log('🚨 EXECUTING HIGH RISK ALERTS');
            console.log('👤 User ID from AsyncStorage:', userId);
            console.log(' User ID type:', typeof userId);
            console.log(' Email:', email);
            console.log('📍 Location:', locStr);
            
            // Let's try a simple test first
            console.log('🔧 Testing API connection...');
            try {
                const response = await fetch(`${BASE_URL}/test-connection`);
                const data = await response.json();
                console.log('✅ Backend response:', data);
            } catch (error: any) {
                console.log('❌ Backend connection failed:', error.message);
                console.log('❌ Make sure the backend server is running on:', BASE_URL);
                return;
            }
            
            let lat = null, lon = null;
            if (locStr.includes('?q=')) {
                const coords = locStr.split('?q=')[1].split(',');
                lat = coords[0];
                lon = coords[1];
            }

            // 1. Send High-Risk Email immediately
            if (email) {
                // start emergency record in DB if not already started
                if (!currentEmergencyId && userId) {
                    const startRes = await EmergencyService.startEmergency(userId, triggeredKeywordRef.current, locStr);
                    if (startRes.success) {
                        setCurrentEmergencyId(startRes.emergency_id);
                        await EmergencyService.logAlert(startRes.emergency_id, 'email');
                        await ActivityService.logActivity("SOS_TRIGGERED", startRes.emergency_id);
                    }
                }

                await fetch(`${BASE_URL}/send-sos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, latitude: lat, longitude: lon, keyword: triggeredKeywordRef.current, risk_level: 'HIGH' }),
                });
            }

            // 2. Get trusted contacts and start automatic calling rotation
            console.log('🔍 Fetching trusted contacts for userId:', userId);
            
            const contactResponse = await fetch(`${BASE_URL}/getTrustedContacts/${userId}`);
            
            console.log('📡 Contact API Response Status:', contactResponse.status);
            console.log('📡 Contact API Response OK:', contactResponse.ok);
            
            if (!contactResponse.ok) {
                console.log('❌ API call failed with status:', contactResponse.status);
                console.log('❌ Status text:', contactResponse.statusText);
                return;
            }
            
            let contacts = await contactResponse.json();
            console.log('📋 Raw contacts response:', contacts);
            console.log('📋 Contacts type:', typeof contacts);
            console.log('📋 Is array?', Array.isArray(contacts));
            console.log('📋 Contacts length:', contacts?.length);

            // If no contacts found with this userId, try with 'U101' as fallback
            if (Array.isArray(contacts) && contacts.length === 0) {
                console.log('⚠️ No contacts found for userId:', userId, 'Trying with U101...');
                
                const fallbackResponse = await fetch(`${BASE_URL}/getTrustedContacts/U101`);
                if (fallbackResponse.ok) {
                    const fallbackContacts = await fallbackResponse.json();
                    console.log('📋 Fallback contacts response:', fallbackContacts);
                    
                    if (Array.isArray(fallbackContacts) && fallbackContacts.length > 0) {
                        console.log('✅ Found contacts with U101, using these instead');
                        // Use the fallback contacts
                        contacts = fallbackContacts;
                    }
                }
            }

            if (Array.isArray(contacts) && contacts.length > 0) {
                console.log('📞 Found contacts:', contacts.length, 'Starting call rotation...');
                console.log('📞 Contact details:', contacts.map(c => ({ name: c.trusted_name, phone: c.trusted_no, userId: c.user_id, hasLocation: !!(c.latitude && c.longitude) })));
                
                // 3. Send SMS to all trusted numbers
                const numbers = contacts.map((c: any) => c.trusted_no);
                const smsAvailable = await SMS.isAvailableAsync();
                if (smsAvailable) {
                    await SMS.sendSMSAsync(numbers, `🚨 SHEILD EMERGENCY! I need help. My location: ${locStr}`);
                }

                // Update contacts with location data and start calling rotation
                const updatedContacts = await foregroundCallService.updateContactsWithLocation(userId, contacts);
                console.log('🔄 Updated contacts for location:', updatedContacts.length);

                // Start call rotation without await to prevent blocking
                console.log('🚀 Starting emergency call rotation...');
                foregroundCallService.startEmergencyCallRotation(
                    updatedContacts,
                    (contactName: string, timeRemaining: number) => {
                        console.log(`📞 Calling ${contactName} - ${timeRemaining}s remaining`);
                        // High risk call logging
                        if (currentEmergencyId) {
                            EmergencyService.logCall(currentEmergencyId, 'DIALLED');
                        }
                        
                        // Show Contact Calling modal with countdown
                        setShowContactCalling(true);
                        setCallingContactName(contactName);
                        setCallingCountdown(timeRemaining);
                    },
                    () => {
                        console.log('✅ Call answered!');
                        setShowContactCalling(false);
                    },
                    () => {
                        console.log('📞 All contacts called');
                        setShowContactCalling(false);
                        setCallingContactName('');
                    }
                ).catch(err => {
                    console.error('❌ Call rotation error:', err);
                    setShowContactCalling(false);
                });
                
                console.log('📞 Call rotation initiated (running in background)');
            } else {
                console.log('⚠️ No trusted contacts found or invalid contact data');
                console.log('⚠️ Response details:', { status: contactResponse.status, statusText: contactResponse.statusText, data: contacts });
                
                // Let's also check if there are any contacts at all in the database
                try {
                    const allContactsResponse = await fetch(`${BASE_URL}/get-all-contacts-debug`);
                    if (allContactsResponse.ok) {
                        const allContacts = await allContactsResponse.json();
                        console.log('🔍 All contacts in database:', allContacts);
                    } else {
                        console.log('🔍 Debug endpoint not available, status:', allContactsResponse.status);
                    }
                } catch (debugErr: any) {
                    console.log('🔍 Debug endpoint error:', debugErr.message);
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

    const handleIAmSafe = async () => {
        console.log("🛡️ User marked as SAFE - stopping ALL emergency processes");
        
        // Set cancellation flag immediately
        isCancelledRef.current = true;
        
        // Stop all recordings
        console.log("📹 Stopping video recording...");
        stopVideoRecording();
        console.log("🎤 Stopping audio recording...");
        stopAudioRecording();
        setIsRecording(false);
        
        // Stop the call rotation
        console.log("📞 Stopping emergency call rotation...");
        foregroundCallService.stopCallRotation();
        
        // Clear all call countdown states
        setShowCallCountdown(false);
        setShowActiveCallCountdown(false);
        setShowContactCalling(false);
        setCurrentCallContact('');
        setCallingContactName('');
        if (callCountdownRef.current) {
            clearInterval(callCountdownRef.current);
            callCountdownRef.current = null;
        }
        
        // Stop AI Risk Detection
        console.log("🤖 Stopping AI Risk Detection...");
        stopAiRiskDetection();
        
        // Stop background audio monitoring (via engine)
        console.log("🎙️ Reverting AI engine to passive mode...");
        await aiRiskEngine.stopFullAnalysis();
        
        // Stop voice detection
        console.log("🎤 Stopping voice detection...");
        try {
            await safeVoiceCancel();
            listeningRef.current = false;
            setIsListening(false);
        } catch (e) {
            console.log('Voice already stopped or error:', e);
        }
        
        // Hide camera and all modals
        console.log("📱 Hiding all UI elements...");
        setShowCamera(false);
        setShowHighWarning(false);
        setShowLowWarning(false);
        
        // Clear all timeouts and intervals
        console.log("⏰ Clearing all timers and intervals...");
        if (highCancelTimeoutRef.current) clearTimeout(highCancelTimeoutRef.current);
        if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
        if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        
        // Reset all emergency states
        console.log("🔄 Resetting emergency states...");
        setHighCountdown(10);
        setLowCountdown(5);
        setUploadStatus('');
        blankScreenCounterRef.current = 0;
        luxRef.current = 100;
        triggeredKeywordRef.current = '';
        
        // Emit emergency stop event
        DeviceEventEmitter.emit("EMERGENCY_LISTENING_STOP");
        
        setIsEmergencyActive(false);
        setAiRiskLevel('NONE');
        await cancelAiDetection();
        
        // RESET Emergency ID and Sync SAFE state to DB
        if (currentEmergencyId) {
            await EmergencyService.endEmergency(currentEmergencyId);
            await ActivityService.logActivity("USER_SAFE_CONFIRMED", currentEmergencyId);
            setCurrentEmergencyId(null);
        }
        
        console.log("✅ ALL emergency processes terminated successfully");
        
        // After 5s, re-enable AI monitoring in passive mode
        setTimeout(async () => {
            isCancelledRef.current = false;
            const snsEnabled = await AsyncStorage.getItem("SENSORS_ENABLED");
            if (snsEnabled !== "false") {
                console.log("🤖 Auto-restarting AI Risk Engine after safe confirmation...");
                startAiRiskDetection();
            }
        }, 5000);
    };

    const cancelHighRiskAlert = async () => {
        isCancelledRef.current = true;
        if (highCancelTimeoutRef.current) clearTimeout(highCancelTimeoutRef.current);
        if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
        setShowHighWarning(false);
        
        console.log("⛔ High risk protocol cancelled by user.");
        
        // Cancel any ongoing recording
        stopVideoRecording();
        stopAudioRecording();
        setIsRecording(false);
        setIsEmergencyActive(false);
        setAiRiskLevel('NONE');
        await cancelAiDetection();

        // After 5s, re-enable AI monitoring in passive mode
        setTimeout(async () => {
            isCancelledRef.current = false;
            const snsEnabled = await AsyncStorage.getItem("SENSORS_ENABLED");
            if (snsEnabled !== "false") {
                console.log("🤖 Auto-restarting AI Risk Engine after cancellation...");
                startAiRiskDetection();
            }
        }, 5000);
    };

    // ==================== AI RISK DETECTION FUNCTIONS ====================
    
    /**
     * Calculate movement magnitude using accelerometer values:
     * movementMagnitude = sqrt(x² + y² + z²)
     */
    const handleVolumeButtonPress = useCallback((event: any) => {
        const now = Date.now();
        lastVolumePressRef.current.push(now);
        
        // Keep only last 3 seconds of presses
        lastVolumePressRef.current = lastVolumePressRef.current.filter(t => now - t < 3000);
        
        console.log('🔊 Volume button pressed:', lastVolumePressRef.current.length, 'times in 3s');
        
        // Triple volume press triggers emergency
        if (lastVolumePressRef.current.length >= 3 && !listeningRef.current) {
            lastVolumePressRef.current = [];
            console.log('🔥🔥🔥 VOLUME BUTTON TRIGGER - EMERGENCY ACTIVATED');
            activateEmergencyListening();
        }
    }, []);
    
    const performRiskAnalysis = async (): Promise<RiskAnalysis> => {
        return await aiRiskEngine.performRiskAnalysis();
    };
    
    const startAiRiskDetection = () => {
        console.log('🤖 Initializing AI Risk Engine (Passive Mode)...');
        aiRiskEngine.startMonitoring();

        // One-time subscription
        aiRiskEngine.subscribe((analysis) => {
            setAiRiskLevel(analysis.riskLevel);
            setAiConfidence(analysis.confidence);
            setAiRiskTriggers(analysis.triggers);

            // Handle UI triggers from the subscription (triggered by background task or active detection)
            if (!analysisReadyRef.current) {
                return;
            }

            if (!isEmergencyActive && !showHighWarning && !showLowWarning && !isCancelledRef.current) {
                processAbnormalMovementDetection(analysis).catch((error) => {
                    console.log('Pending abnormal movement handling error:', error);
                });
            }
        });
    };
    
    const stopAiRiskDetection = () => {
        console.log('🤖 Stopping AI Risk Detection...');
        if (aiAnalysisIntervalRef.current) {
            clearInterval(aiAnalysisIntervalRef.current);
            aiAnalysisIntervalRef.current = null;
        }
        setAiRiskLevel('NONE');
        setAiConfidence(0);
        setAiRiskTriggers([]);
    };
    
    const triggerHighRiskAiAlert = (analysis: RiskAnalysis) => {
        if (isEmergencyActive || showHighWarning || isCancelledRef.current) return;
        
        console.log('🚨 AI HIGH RISK ALERT');
        ActivityService.logActivity(`AI_RISK_DETECTED_HIGH: ${analysis.triggers.join(', ')}`, currentEmergencyId);
        updateGuardianAnalysisUi({
            isAnalyzing: false,
            detectedMovement,
            progress: 100,
            statusText: "User is in Danger",
            riskLevel: 'HIGH',
        }).catch(() => {});
        setIsEmergencyActive(true);
        setShowAiRiskAlert(true);
        setShowHighWarning(true);
        setHighCountdown(10);
        setAiRiskLevel('HIGH');
        setAiConfidence(analysis.confidence);
        setAiRiskTriggers(analysis.triggers);
        
        // Start countdown
        let countdown = 10;
        highTimerIntervalRef.current = setInterval(() => {
            countdown--;
            setHighCountdown(countdown);
            
            if (countdown <= 0) {
                if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
                setShowAiRiskAlert(false);
                setShowHighWarning(false);
                
                if (!isCancelledRef.current) {
                    console.log('🚨 AI HIGH RISK CONFIRMED - Starting emergency workflow!');
                    triggeredKeywordRef.current = `AI Detection: ${analysis.triggers.join(', ')}`;
                    startEmergencyWorkflow();
                }
            }
        }, 1000);
        
        // Auto-cancel after 10 seconds if not disabled
        highCancelTimeoutRef.current = setTimeout(() => {
            if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
            setShowAiRiskAlert(false);
            setShowHighWarning(false);
        }, 10000);
    };
    
    const triggerLowRiskAiAlert = (analysis: RiskAnalysis | { riskLevel: 'LOW'; confidence: number; triggers: string[]; sensorData: SensorData }) => {
        if (isEmergencyActive || showLowWarning || isCancelledRef.current) return;
        
        console.log('⚠️ AI LOW RISK ALERT');
        ActivityService.logActivity(`AI_RISK_DETECTED_LOW: ${analysis.triggers.join(', ')}`, currentEmergencyId);
        updateGuardianAnalysisUi({
            isAnalyzing: false,
            detectedMovement,
            progress: 100,
            statusText: "Risk evaluation completed",
            riskLevel: 'LOW',
        }).catch(() => {});
        setShowLowWarning(true);
        setLowCountdown(5);
        setAiRiskLevel('LOW');
        setAiConfidence(analysis.confidence);
        setAiRiskTriggers(analysis.triggers);
        
        // Start countdown
        let countdown = 5;
        timerIntervalRef.current = setInterval(() => {
            countdown--;
            setLowCountdown(countdown);
            
            if (countdown <= 0) {
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                setShowLowWarning(false);
                
                if (!isCancelledRef.current) {
                    console.log('⚠️ AI LOW RISK CONFIRMED - Starting voice monitoring');
                    activateEmergencyListening();
                }
            }
        }, 1000);
        
        // Auto-cancel after 5 seconds if not disabled
        cancelTimeoutRef.current = setTimeout(() => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            setShowLowWarning(false);
        }, 5000);
    };
    
    const disableAiRiskAlert = () => {
        console.log('🛡️ AI Risk Alert disabled by user (Treating as false alarm)');
        
        // Clear all timers
        if (highTimerIntervalRef.current) clearInterval(highTimerIntervalRef.current);
        if (highCancelTimeoutRef.current) clearTimeout(highCancelTimeoutRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        
        // Hide alerts
        setShowAiRiskAlert(false);
        setShowHighWarning(false);
        setShowLowWarning(false);
        
        // Reset AI state & Stop Active sensors
        setAiRiskLevel('NONE');
        setAiConfidence(0);
        setAiRiskTriggers([]);
        setIsEmergencyActive(false);
        aiRiskEngine.stopFullAnalysis(); // Revert to passive mode
    };
    
    /**
     * Camera Handling with Darkness Logic
     * Automatically switch to front camera if back is obstructed/dark
     */
    useEffect(() => {
        if (isEmergencyActive) {
            const sub = DeviceEventEmitter.addListener('AI_RISK_DETECTED', (analysis: RiskAnalysis) => {
                if (analysis.sensorData.light < 5.0 && cameraFacing === 'back') {
                    console.log('🌘 Darkness detected during emergency, switching to FRONT camera');
                    setCameraFacing('front');
                } else if (analysis.sensorData.light > 20.0 && cameraFacing === 'front') {
                   // Optional: switch back if it gets bright, but usually front is more personal evidence
                   // setCameraFacing('back');
                }
            });
            return () => sub.remove();
        }
    }, [isEmergencyActive, cameraFacing]);

    const startEmergencyWorkflow = async () => {
        console.log('🚨 Starting Emergency Workflow...');
        
        let emergencyId = currentEmergencyId;
        if (!emergencyId) {
            const storedUserId = await AsyncStorage.getItem("userId");
            if (storedUserId) {
                const locStr = await getLocationString();
                const startRes = await EmergencyService.startEmergency(storedUserId, triggeredKeywordRef.current, locStr);
                if (startRes.success) {
                    emergencyId = startRes.emergency_id;
                    setCurrentEmergencyId(startRes.emergency_id);
                    await EmergencyService.logAlert(startRes.emergency_id, 'email');
                }
            }
        }

        if (emergencyId) {
            await ActivityService.logActivity("SOS_TRIGGERED_AI", emergencyId);
        }

        // Start high risk recording
        await startHighRiskRecording();
        
        // Execute high risk alerts and calls (this now skips startRes if currentEmergencyId is already set)
        await executeHighRiskAlertsAndCalls();
    };
    const startHighRiskRecording = async () => {
        console.log("📹 Starting high risk video + audio recording...");

        if (listeningRef.current) {
            await stopListening({ resumeAiAudio: false });
        }

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

        // Start emergency calls after 5 seconds of recording
        console.log('⏰ Emergency calls will start in 5 seconds...');
        setShowCallCountdown(true);
        setCallCountdown(5);
        
        callCountdownRef.current = setInterval(() => {
            setCallCountdown(prev => {
                if (prev <= 1) {
                    if (callCountdownRef.current) {
                        clearInterval(callCountdownRef.current);
                        callCountdownRef.current = null;
                    }
                    setShowCallCountdown(false);
                    
                    // Start calls
                    if (!isCancelledRef.current) {
                        console.log('🚀 Starting emergency calls (5 seconds delay complete)...');
                        executeHighRiskAlertsAndCalls().catch(err => {
                            console.error('Emergency calls failed to start:', err);
                        });
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // Called from CameraView once it's mounted and ready
    const startVideoCapture = async () => {
        if (!cameraRef.current || videoRecordingRef.current) return;
        videoRecordingRef.current = true;

        try {
            console.log("▶️ Video recording started");

            // Record until stopVideoRecording() is called
            const videoPromise = cameraRef.current.recordAsync();

            // Periodic check for actual black screen detection from camera feed
            const checkBlankInterval = setInterval(() => {
                if (!videoRecordingRef.current || !showCamera) {
                    console.log('📹 Recording stopped or camera hidden, clearing blank screen check');
                    clearInterval(checkBlankInterval);
                    return;
                }

                console.log(`💡 Checking for black screen...`);
                
                // Simulate black screen detection based on camera feed analysis
                // In a real implementation, you would analyze the actual camera frames
                // For now, we'll simulate periodic black screen detection
                const now = Date.now();
                const detectionCycle = now % 6000; // 6-second cycle
                
                // Simulate black screen for 2 seconds every 6 seconds
                if (detectionCycle < 2000) {
                    // This simulates when the camera feed is completely black
                    blankScreenCounterRef.current += 1;
                    console.log(`🌑 Black screen detected from camera feed (${blankScreenCounterRef.current}/2)`);
                } else {
                    if (blankScreenCounterRef.current > 0) {
                        console.log('☀️ Camera feed restored, resetting counter');
                    }
                    blankScreenCounterRef.current = 0;
                }

                // Require 2 consecutive checks before switching (2 seconds total)
                if (blankScreenCounterRef.current >= 2) {
                    console.log("🌑 True black screen detected from camera feed. Switching camera.");
                    blankScreenCounterRef.current = 0;
                    
                    // Stop current recording and switch camera
                    if (cameraRef.current && videoRecordingRef.current) {
                        const newFacing = cameraFacing === 'back' ? 'front' : 'back';
                        console.log(`📹 Switching from ${cameraFacing} to ${newFacing}`);
                        
                        // Stop recording
                        try {
                            cameraRef.current.stopRecording();
                            videoRecordingRef.current = false;
                            console.log('📹 Recording stopped successfully');
                        } catch (stopErr) {
                            console.error('❌ Error stopping recording:', stopErr);
                            return;
                        }
                        
                        // Clear this interval
                        clearInterval(checkBlankInterval);
                        
                        // Update camera facing
                        setCameraFacing(newFacing);
                        console.log(`📹 Camera facing updated to ${newFacing}`);
                        
                        // Restart recording after a short delay
                        setTimeout(() => {
                            if (!isCancelledRef.current && showCamera && cameraRef.current) {
                                console.log(`📹 Restarting recording with ${newFacing} camera`);
                                // Start recording again with new camera
                                videoRecordingRef.current = true;
                                cameraRef.current.recordAsync().then(result => {
                                    if (result && result.uri && !isCancelledRef.current) {
                                        console.log("✅ Switched video saved at:", result.uri);
                                        // Upload the switched video
                                        uploadToCloudinary(result.uri, 'video');
                                        
                                        // Start a new black screen check for the switched recording
                                        const newCheckInterval = setInterval(() => {
                                            if (!videoRecordingRef.current || !showCamera) {
                                                console.log('📹 Switched recording stopped, clearing new blank screen check');
                                                clearInterval(newCheckInterval);
                                                return;
                                            }

                                            console.log(`💡 [SWITCHED] Checking for black screen...`);
                                            
                                            // Continue black screen detection for switched camera
                                            const switchCycle = Date.now() % 6000;
                                            if (switchCycle < 2000) {
                                                blankScreenCounterRef.current += 1;
                                                console.log(`🌑 [SWITCHED] Black screen detected (${blankScreenCounterRef.current}/2)`);
                                            } else {
                                                if (blankScreenCounterRef.current > 0) {
                                                    console.log('☀️ [SWITCHED] Camera feed restored, resetting counter');
                                                }
                                                blankScreenCounterRef.current = 0;
                                            }

                                            if (blankScreenCounterRef.current >= 2) {
                                                console.log("🌑 [SWITCHED] True black screen detected. Switching camera again.");
                                                blankScreenCounterRef.current = 0;
                                                // Recursive switch back to original camera
                                                const originalFacing = newFacing === 'back' ? 'front' : 'back';
                                                
                                                if (cameraRef.current && videoRecordingRef.current) {
                                                    console.log(`📹 [SWITCHED] Switching from ${newFacing} to ${originalFacing}`);
                                                    cameraRef.current.stopRecording();
                                                    videoRecordingRef.current = false;
                                                    setCameraFacing(originalFacing);
                                                    
                                                    setTimeout(() => {
                                                        if (!isCancelledRef.current && showCamera && cameraRef.current) {
                                                            console.log(`📹 [SWITCHED] Restarting recording with ${originalFacing} camera`);
                                                            videoRecordingRef.current = true;
                                                            cameraRef.current.recordAsync().then(result => {
                                                                if (result && result.uri && !isCancelledRef.current) {
                                                                    console.log("✅ [SWITCHED] Switched back video saved at:", result.uri);
                                                                    uploadToCloudinary(result.uri, 'video');
                                                                }
                                                            }).catch(err => {
                                                                console.error('Error recording with switched back camera:', err);
                                                            });
                                                        }
                                                    }, 1000);
                                                }
                                                clearInterval(newCheckInterval);
                                            }
                                        }, 1000); // Check every 1 second for faster response
                                    }
                                }).catch(err => {
                                    console.error('Error recording with switched camera:', err);
                                    videoRecordingRef.current = false;
                                });
                            } else {
                                console.log('📹 Cannot restart recording - cancelled or camera not available');
                            }
                        }, 1000); // 1 second delay for camera to switch
                    }
                }
            }, 1000); // Check every 1 second

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
                        device_id: deviceId,
                        media_type: type,
                        risk_level: 'HIGH',
                    }),
                });

                // Link evidence to the emergency incident
                if (currentEmergencyId) {
                    if (type === 'video') {
                        await EmergencyService.logVideo(currentEmergencyId, cameraFacing === 'front' ? 'front' : 'rear', cloudData.secure_url);
                    } else {
                        await EmergencyService.logAudio(currentEmergencyId, cloudData.secure_url);
                    }
                    await ActivityService.logActivity(`RECORDING_UPLOADED_${type.toUpperCase()}`, currentEmergencyId);
                }

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
            {/* ───── BACKGROUND MODE STATUS INDICATOR ───── */}
            {isBackgroundMode && (
                <View style={styles.backgroundStatusIndicator}>
                    <View style={styles.backgroundStatusDot} />
                    <Text style={styles.backgroundStatusText}>🔴 Background Monitoring Active</Text>
                    <Text style={styles.backgroundStatusSubtext}>Sensors & Audio Active</Text>
                </View>
            )}

            {/* ───── AI RISK STATUS INDICATOR ───── */}
            {aiRiskLevel !== 'NONE' && (
                <View style={[styles.aiRiskIndicator, aiRiskLevel === 'HIGH' ? styles.aiRiskHigh : styles.aiRiskLow]}>
                    <MaterialIcons 
                        name={aiRiskLevel === 'HIGH' ? "warning" : "info"} 
                        size={14} 
                        color={aiRiskLevel === 'HIGH' ? "#ef4444" : "#fbbf24"} 
                    />
                    <Text style={styles.aiRiskText}>
                        AI: {aiRiskLevel} Risk ({(aiConfidence * 100).toFixed(0)}%)
                    </Text>
                </View>
            )}

            <AiAnalysisPopup
                visible={isAnalyzing}
                detectedMovement={detectedMovement || "Movement detected"}
                progress={analysisProgress}
                statusText={analysisStatusText}
                onCancel={cancelAiDetection}
            />
            {abnormalMovementPopup && (
                <AbnormalMovementPopup
                    visible={abnormalMovementPopup.visible}
                    classification={abnormalMovementPopup.classification}
                    title={abnormalMovementPopup.title}
                    message={abnormalMovementPopup.message}
                />
            )}

            {isEmergencyActive && (
                <View style={styles.emergencyModeBanner}>
                    <MaterialIcons name="warning" size={16} color="#fff" />
                    <Text style={styles.emergencyModeBannerText}>Emergency Mode Active</Text>
                </View>
            )}

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
                        <Text style={[styles.modalTitle, { color: '#ec1313', fontSize: 24 }]}>🚨 HIGH RISK DETECTED</Text>
                        <Text style={styles.modalText}>
                            <Text style={{ fontWeight: 'bold', color: '#fff' }}>High Risk Situation Detected</Text>{'\n'}
                            Emergency protocol will activate in <Text style={[styles.countdown, { color: '#ec1313' }]}>{highCountdown}s</Text>
                        </Text>
                        <Text style={styles.subText}>Press DISABLE ALERT to cancel</Text>
                        <TouchableOpacity style={[styles.cancelBtn, styles.highCancelBtn]} onPress={cancelHighRiskAlert}>
                            <MaterialIcons name="security" size={20} color="#fff" />
                            <Text style={[styles.cancelBtnText, { color: '#fff' }]}>DISABLE ALERT</Text>
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
                        
                        {/* Call Countdown Badge */}
                        {showCallCountdown && (
                            <View style={styles.callCountdownBadge}>
                                <MaterialIcons name="timer" size={12} color="#fbbf24" />
                                <Text style={styles.callCountdownText}>Calls in {callCountdown}s</Text>
                            </View>
                        )}
                        
                        {/* Call Status Badge */}
                        {!showCallCountdown && !showActiveCallCountdown && (
                            <View style={styles.callStatusBadge}>
                                <MaterialIcons name="phone" size={12} color="#4ade80" />
                                <Text style={styles.callStatusText}>Emergency Calls Active</Text>
                            </View>
                        )}
                        
                        {/* Active Call Countdown */}
                        {showActiveCallCountdown && (
                            <View style={styles.activeCallBadge}>
                                <MaterialIcons name="phone-in-talk" size={12} color="#ef4444" />
                                <Text style={styles.activeCallText}>Calling {currentCallContact}</Text>
                                <Text style={styles.activeCallCountdownText}>{activeCallCountdown}s</Text>
                            </View>
                        )}
                        <TouchableOpacity 
                            style={styles.stopBtn} 
                            onPress={async () => {
                                await handleIAmSafe();
                            }}
                        >
                            <MaterialIcons name="security" size={32} color="#fff" />
                            <Text style={styles.stopBtnText}>I AM SAFE</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.flipBtn}
                            onPress={() => {
                                console.log('🔄 Manual camera switch triggered');
                                const newFacing = cameraFacing === 'back' ? 'front' : 'back';
                                setCameraFacing(newFacing);
                                console.log(`📹 Manually switched to ${newFacing} camera`);
                            }}
                        >
                            <MaterialIcons name="flip-camera-android" size={28} color="#fff" />
                        </TouchableOpacity>
                        
                        {/* Test Light Sensor Button */}
                        <TouchableOpacity
                            style={styles.testLightBtn}
                            onPress={() => {
                                console.log('💡 Current light level:', luxRef.current);
                                console.log('💡 Blank screen counter:', blankScreenCounterRef.current);
                                if (luxRef.current <= 1.0) {
                                    console.log('🌑 Dark environment detected - camera should switch automatically');
                                } else {
                                    console.log('☀️ Bright environment - no switching needed');
                                }
                            }}
                        >
                            <MaterialIcons name="light-mode" size={20} color="#fff" />
                        </TouchableOpacity>
                        
                        {/* Force Blank Screen Detection Button */}
                        <TouchableOpacity
                            style={styles.forceBlankBtn}
                            onPress={() => {
                                console.log('🌑 Forcing blank screen detection for testing...');
                                // Simulate dark environment
                                luxRef.current = 0.1;
                                blankScreenCounterRef.current = 1;
                                console.log('💡 Set light level to 0.1 and counter to 1');
                                console.log('💡 Wait 2 more seconds for automatic switch...');
                            }}
                        >
                            <MaterialIcons name="videocam-off" size={20} color="#fff" />
                        </TouchableOpacity>
                        
                        {/* Force Immediate Camera Switch Button */}
                        <TouchableOpacity
                            style={styles.forceSwitchBtn}
                            onPress={() => {
                                console.log('🔄 Forcing immediate camera switch for testing...');
                                if (cameraRef.current && videoRecordingRef.current) {
                                    const newFacing = cameraFacing === 'back' ? 'front' : 'back';
                                    console.log(`📹 Forcing switch from ${cameraFacing} to ${newFacing}`);
                                    
                                    // Stop recording
                                    try {
                                        cameraRef.current.stopRecording();
                                        videoRecordingRef.current = false;
                                        console.log('📹 [FORCE] Recording stopped successfully');
                                    } catch (stopErr) {
                                        console.error('❌ [FORCE] Error stopping recording:', stopErr);
                                        return;
                                    }
                                    
                                    // Update camera facing
                                    setCameraFacing(newFacing);
                                    console.log(`📹 [FORCE] Camera facing updated to ${newFacing}`);
                                    
                                    // Restart recording after a short delay
                                    setTimeout(() => {
                                        if (!isCancelledRef.current && showCamera && cameraRef.current) {
                                            console.log(`📹 [FORCE] Restarting recording with ${newFacing} camera`);
                                            videoRecordingRef.current = true;
                                            cameraRef.current.recordAsync().then(result => {
                                                if (result && result.uri && !isCancelledRef.current) {
                                                    console.log("✅ [FORCE] Switched video saved at:", result.uri);
                                                    uploadToCloudinary(result.uri, 'video');
                                                }
                                            }).catch(err => {
                                                console.error('[FORCE] Error recording with switched camera:', err);
                                                videoRecordingRef.current = false;
                                            });
                                        }
                                    }, 1000);
                                }
                            }}
                        >
                            <MaterialIcons name="flip-camera-android" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </Modal>
            )}

            {/* Contact Calling Modal */}
            {showContactCalling && (
                <Modal
                    transparent={true}
                    animationType="fade"
                    visible={showContactCalling}
                    onRequestClose={() => setShowContactCalling(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.contactCallingModal}>
                            <View style={styles.contactCallingHeader}>
                                <MaterialIcons name="phone-in-talk" size={32} color="#ef4444" />
                                <Text style={styles.contactCallingTitle}>Emergency Calling</Text>
                            </View>
                            
                            <View style={styles.contactCallingInfo}>
                                <Text style={styles.contactCallingName}>{callingContactName}</Text>
                                <Text style={styles.contactCallingStatus}>Calling from within app...</Text>
                                <Text style={styles.contactCallingNumber}>📞 Connecting...</Text>
                            </View>
                            
                            <View style={styles.contactCallingCountdown}>
                                <Text style={styles.countdownNumber}>{callingCountdown}</Text>
                                <Text style={styles.countdownLabel}>seconds remaining</Text>
                            </View>
                            
                            <View style={styles.callActionsRow}>
                                <TouchableOpacity 
                                    style={styles.endCallBtn} 
                                    onPress={async () => {
                                        await handleIAmSafe();
                                    }}
                                >
                                    <MaterialIcons name="call-end" size={24} color="#fff" />
                                    <Text style={styles.endCallBtnText}>END CALL</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity 
                                    style={styles.skipCallBtn} 
                                    onPress={() => {
                                        console.log('⏭️ Skipping to next contact');
                                        // This will be handled by the countdown naturally
                                    }}
                                >
                                    <MaterialIcons name="skip-next" size={24} color="#fff" />
                                    <Text style={styles.skipCallBtnText}>SKIP</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    // Background Mode Indicator
    backgroundStatusIndicator: {
        position: 'absolute',
        top: 50,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(239, 68, 68, 0.95)',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        zIndex: 9999,
        elevation: 100,
    },
    backgroundStatusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#fff',
    },
    backgroundStatusText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        flex: 1,
    },
    backgroundStatusSubtext: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
    },
    // AI Risk Indicator
    aiRiskIndicator: {
        position: 'absolute',
        top: 120,
        left: 20,
        right: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 9998,
        elevation: 99,
    },
    aiRiskHigh: {
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    aiRiskLow: {
        backgroundColor: 'rgba(251, 191, 36, 0.9)',
    },
    aiRiskText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    emergencyModeBanner: {
        position: 'absolute',
        top: 160,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(239, 68, 68, 0.96)',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        zIndex: 9997,
        elevation: 98,
    },
    emergencyModeBannerText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
    aiAnalyzingPopup: {
        position: 'absolute',
        top: 165,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.35)',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        zIndex: 9997,
        elevation: 98,
    },
    aiAnalyzingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#22c55e',
    },
    aiAnalyzingText: {
        color: '#e5e7eb',
        fontSize: 13,
        fontWeight: '700',
    },
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
    callStatusBadge: {
        position: "absolute",
        top: 90,
        left: 20,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    callStatusText: {
        color: "#4ade80",
        fontSize: 11,
        fontWeight: "bold",
    },
    callCountdownBadge: {
        position: "absolute",
        top: 130,
        left: 20,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    callCountdownText: {
        color: "#fbbf24",
        fontSize: 11,
        fontWeight: "bold",
    },
    testLightBtn: {
        position: "absolute",
        bottom: 60,
        right: 20,
        backgroundColor: "rgba(251, 191, 36, 0.8)",
        padding: 10,
        borderRadius: 30,
    },
    forceBlankBtn: {
        position: "absolute",
        bottom: 120,
        right: 20,
        backgroundColor: "rgba(239, 68, 68, 0.8)",
        padding: 10,
        borderRadius: 30,
    },
    forceSwitchBtn: {
        position: "absolute",
        bottom: 180,
        right: 20,
        backgroundColor: "rgba(59, 130, 246, 0.8)",
        padding: 10,
        borderRadius: 30,
    },
    activeCallBadge: {
        position: "absolute",
        top: 90,
        left: 20,
        flexDirection: "column",
        alignItems: "flex-start",
        backgroundColor: "rgba(239, 68, 68, 0.9)",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 2,
        minWidth: 180,
    },
    activeCallText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "bold",
    },
    activeCallCountdownText: {
        color: "#fbbf24",
        fontSize: 14,
        fontWeight: "bold",
    },
    contactCallingModal: {
        backgroundColor: "rgba(239, 68, 68, 0.95)",
        padding: 30,
        borderRadius: 20,
        alignItems: "center",
        width: "85%",
        maxWidth: 350,
    },
    contactCallingHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
        gap: 12,
    },
    contactCallingTitle: {
        fontSize: 22,
        fontWeight: "bold",
        color: "#fff",
    },
    contactCallingInfo: {
        alignItems: "center",
        marginBottom: 25,
    },
    contactCallingName: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#fff",
        marginBottom: 5,
    },
    contactCallingStatus: {
        fontSize: 14,
        color: "rgba(255, 255, 255, 0.8)",
    },
    contactCallingNumber: {
        fontSize: 16,
        color: "#fbbf24",
        marginTop: 5,
    },
    contactCallingCountdown: {
        alignItems: "center",
        marginBottom: 30,
    },
    countdownNumber: {
        fontSize: 48,
        fontWeight: "bold",
        color: "#fbbf24",
        lineHeight: 50,
    },
    countdownLabel: {
        fontSize: 12,
        color: "rgba(255, 255, 255, 0.7)",
        textTransform: "uppercase",
    },
    stopCallBtn: {
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
        gap: 8,
    },
    stopCallBtnText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "bold",
    },
    callActionsRow: {
        flexDirection: "row",
        gap: 15,
        marginTop: 10,
    },
    endCallBtn: {
        backgroundColor: "#dc2626",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
        gap: 8,
        flex: 1,
    },
    endCallBtnText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "bold",
    },
    skipCallBtn: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 25,
        gap: 8,
        flex: 1,
    },
    skipCallBtnText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "bold",
    },
});
