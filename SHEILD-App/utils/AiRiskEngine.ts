import { Accelerometer, Gyroscope, LightSensor } from 'expo-sensors';
import { Audio } from 'expo-av';
import { ActivityService } from '../services/ActivityService';
import BASE_URL from "../config/api";

const analyzeWithAI = async (text: string) => {
    try {
        const res = await fetch(`${BASE_URL}/ai/analyze`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ text }),
        });

        const data = await res.json();
        return data.risk;
    } catch (err) {
        console.log("AI error:", err);
        return "LOW";
    }
};

const LOW_RISK_THRESHOLD = 3;
const HIGH_RISK_THRESHOLD = 7;
const MOVEMENT_THRESHOLD = 2.5;
const MOVEMENT_DELTA_THRESHOLD = 1.15;
const ANALYSIS_INTERVAL_MS = 2000;

const SCORE_STRONG_SHAKE = 3;
const SCORE_REPEATED_SHAKING = 4;
const SCORE_FALL_DETECTION = 5;
const SCORE_DARKNESS_DETECTED = 2;
const SCORE_HIGH_SOUND_INTENSITY = 3;

export interface SensorData {
    accelerometer: { x: number; y: number; z: number } | null;
    gyroscope: { x: number; y: number; z: number } | null;
    light: number;
    microphoneLevel?: number;
    timestamp: number;
}

export interface RiskAnalysis {
    riskLevel: 'LOW' | 'HIGH' | 'NONE';
    confidence: number;
    triggers: string[];
    sensorData: SensorData;
}

class AiRiskEngine {
    private static instance: AiRiskEngine;
    private sensorHistory: SensorData[] = [];
    private accelerometerData: { x: number; y: number; z: number } | null = null;
    private gyroscopeData: { x: number; y: number; z: number } | null = null;
    private lightData: number = 100;
    private micLevelHistory: number[] = [];

    private recording: Audio.Recording | null = null;
    private isMonitoring = false;
    private isAnalysisRunning = false;

    private micLevelInterval: ReturnType<typeof setInterval> | null = null;
    private analysisInterval: ReturnType<typeof setInterval> | null = null;
    private subscribers: ((analysis: RiskAnalysis) => void)[] = [];

    private accelerometerSubscription: { remove: () => void } | null = null;
    private gyroscopeSubscription: { remove: () => void } | null = null;
    private lightSubscription: { remove: () => void } | null = null;

    private lastMovementMagnitude: number | null = null;
    private lastFullAnalysisStartedAt = 0;

    private constructor() {}

    public static getInstance(): AiRiskEngine {
        if (!AiRiskEngine.instance) {
            AiRiskEngine.instance = new AiRiskEngine();
        }
        return AiRiskEngine.instance;
    }

    public async startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;

        console.log('AiRiskEngine: Starting passive movement monitoring');

        Accelerometer.setUpdateInterval(200);
        this.accelerometerSubscription = Accelerometer.addListener(data => {
            this.accelerometerData = data;

            const magnitude = this.calculateMovementMagnitude(data);
            const movementDelta =
                this.lastMovementMagnitude === null
                    ? 0
                    : Math.abs(magnitude - this.lastMovementMagnitude);
            this.lastMovementMagnitude = magnitude;

            if (!this.isAnalysisRunning) {
                const cooldownElapsed =
                    Date.now() - this.lastFullAnalysisStartedAt > 5000;
                const suspiciousMovementDetected =
                    magnitude > MOVEMENT_THRESHOLD ||
                    movementDelta > MOVEMENT_DELTA_THRESHOLD;

                if (suspiciousMovementDetected && cooldownElapsed) {
                    console.log(
                        `AiRiskEngine: Suspicious movement detected (magnitude=${magnitude.toFixed(2)}, delta=${movementDelta.toFixed(2)}). Starting full analysis.`
                    );

                    ActivityService.logActivity(
                        `AI RISK: Suspicious movement detected (Magnitude ${magnitude.toFixed(2)}, Delta ${movementDelta.toFixed(2)})`
                    );

                    this.lastFullAnalysisStartedAt = Date.now();
                    this.startFullAnalysis().catch(error => {
                        console.error('Error auto-starting full analysis:', error);
                    });
                }
            }
        });
    }

    public async stopMonitoring() {
        this.isMonitoring = false;
        await this.stopFullAnalysis();

        if (this.accelerometerSubscription) {
            this.accelerometerSubscription.remove();
            this.accelerometerSubscription = null;
        }

        this.lastMovementMagnitude = null;
        console.log('AiRiskEngine: Completely stopped');
    }

    public async startFullAnalysis() {
        if (this.isAnalysisRunning) return;
        this.isAnalysisRunning = true;
        this.lastFullAnalysisStartedAt = Date.now();

        try {
            Gyroscope.setUpdateInterval(100);
            this.gyroscopeSubscription = Gyroscope.addListener(data => {
                this.gyroscopeData = data;
            });

            this.lightSubscription = LightSensor.addListener(data => {
                this.lightData = data.illuminance;
            });

            await this.startAudioMonitoring();

            if (this.analysisInterval) {
                clearInterval(this.analysisInterval);
            }

            this.analysisInterval = setInterval(() => {
                if (!this.isAnalysisRunning) {
                    return;
                }

                this.performRiskAnalysis().catch(error => {
                    console.error('Error during scheduled AI risk analysis:', error);
                });
            }, ANALYSIS_INTERVAL_MS);

            console.log('AiRiskEngine: Full analysis mode ACTIVE');
        } catch (error) {
            console.error('Error starting full analysis:', error);
            this.isAnalysisRunning = false;
        }
    }

    public async stopFullAnalysis() {
        this.isAnalysisRunning = false;

        if (this.gyroscopeSubscription) {
            this.gyroscopeSubscription.remove();
            this.gyroscopeSubscription = null;
        }
        if (this.lightSubscription) {
            this.lightSubscription.remove();
            this.lightSubscription = null;
        }

        if (this.micLevelInterval) {
            clearInterval(this.micLevelInterval);
            this.micLevelInterval = null;
        }

        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }

        if (this.recording) {
            try {
                const status = await this.recording.getStatusAsync();
                if (status.canRecord || status.isRecording) {
                    await this.recording.stopAndUnloadAsync();
                }
            } catch (e) {
                console.log('Error stopping recording object:', e);
            } finally {
                this.recording = null;
            }
        }

        console.log('AiRiskEngine: Reverted to passive mode');
    }

    private async startAudioMonitoring() {
        try {
            if (this.recording) {
                try {
                    await this.recording.stopAndUnloadAsync();
                } catch {}
                this.recording = null;
            }

            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') return;

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                playThroughEarpieceAndroid: false,
            });

            const recording = new Audio.Recording();
            await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            await recording.startAsync();
            this.recording = recording;

            this.micLevelInterval = setInterval(async () => {
                if (this.recording && this.isAnalysisRunning) {
                    try {
                        const status = await this.recording.getStatusAsync();
                        if (status.isRecording && status.metering !== undefined) {
                            const dbLevel = status.metering;
                            const normalizedLevel = Math.max(0, Math.min(100, (dbLevel + 60) * 1.67));
                            this.micLevelHistory.push(normalizedLevel);
                            if (this.micLevelHistory.length > 20) {
                                this.micLevelHistory = this.micLevelHistory.slice(-20);
                            }
                        }
                    } catch {}
                }
            }, 500);
        } catch (error) {
            console.log('Audio monitoring initialization error:', error);
            this.recording = null;
        }
    }

    private calculateMovementMagnitude(data: { x: number; y: number; z: number } | null): number {
        if (!data) return 0;
        return Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
    }

    public async performRiskAnalysis(): Promise<RiskAnalysis> {
        const currentMicLevel = this.micLevelHistory.length > 0
            ? this.micLevelHistory[this.micLevelHistory.length - 1]
            : 0;

        const currentSensorData: SensorData = {
            accelerometer: this.accelerometerData,
            gyroscope: this.gyroscopeData,
            light: this.lightData,
            microphoneLevel: currentMicLevel,
            timestamp: Date.now()
        };

        this.sensorHistory.push(currentSensorData);
        if (this.sensorHistory.length > 50) {
            this.sensorHistory = this.sensorHistory.slice(-50);
        }

        if (!this.isAnalysisRunning) {
            return {
                riskLevel: 'NONE',
                confidence: 0,
                triggers: [],
                sensorData: currentSensorData
            };
        }

        const triggers: string[] = [];
        let totalRiskScore = 0;

        const fallScore = this.analyzeFallDetection();
        if (fallScore > 0) {
            totalRiskScore += fallScore;
            triggers.push('Sudden fall detected');
        }

        const shake = this.analyzeShakingPatterns();
        if (shake.score > 0) {
            totalRiskScore += shake.score;
            triggers.push(...shake.triggers);
        }

        const lightScore = this.analyzeDarkEnvironment();
        if (lightScore > 0) {
            totalRiskScore += lightScore;
            triggers.push('Sudden darkness detected');
        }

        const soundScore = this.analyzeSoundIntensity();
        if (soundScore > 0) {
            totalRiskScore += soundScore;
            triggers.push('High sound intensity (shouting)');
        }

        let riskLevel: 'LOW' | 'HIGH' | 'NONE' = 'NONE';
        if (totalRiskScore >= HIGH_RISK_THRESHOLD) {
            riskLevel = 'HIGH';
        } else if (totalRiskScore >= LOW_RISK_THRESHOLD) {
            riskLevel = 'LOW';
        }

        const confidence = Math.min(totalRiskScore / 10, 1.0);
        const analysis: RiskAnalysis = {
            riskLevel,
            confidence,
            triggers,
            sensorData: currentSensorData
        };

        if (riskLevel !== 'NONE') {
            const contextText = `Emergency signals: ${triggers.join(", ")}. Sound level: ${currentMicLevel}`;
            console.log("Sending to AI:", contextText);

            const aiRisk = await analyzeWithAI(contextText);

            if (aiRisk === "HIGH") {
                const finalAnalysis: RiskAnalysis = {
                    ...analysis,
                    riskLevel: "HIGH"
                };

                this.notifySubscribers(finalAnalysis);
                return finalAnalysis;
            }

            const safeAnalysis: RiskAnalysis = {
                ...analysis,
                riskLevel: "NONE",
                confidence: 0
            };

            this.notifySubscribers(safeAnalysis);
            return safeAnalysis;
        }

        this.notifySubscribers(analysis);
        return analysis;
    }

    private analyzeFallDetection(): number {
        if (this.sensorHistory.length < 10) return 0;
        const recent = this.sensorHistory.slice(-10);
        let freeFallDetected = 0;
        let impactDetected = false;

        recent.forEach(data => {
            if (data.accelerometer) {
                const magnitude = this.calculateMovementMagnitude(data.accelerometer);
                if (magnitude < 0.5) freeFallDetected++;
                if (magnitude > 3.0) impactDetected = true;
            }
        });

        return (freeFallDetected >= 3 && impactDetected) ? SCORE_FALL_DETECTION : 0;
    }

    private analyzeShakingPatterns(): { score: number; triggers: string[] } {
        if (this.sensorHistory.length < 15) return { score: 0, triggers: [] };
        const recent = this.sensorHistory.slice(-15);
        let highIntensityCount = 0;
        const triggers: string[] = [];

        recent.forEach(data => {
            if (data.accelerometer) {
                const magnitude = this.calculateMovementMagnitude(data.accelerometer);
                if (magnitude > 2.5) highIntensityCount++;
            }
            if (data.gyroscope) {
                const rotationMagnitude = this.calculateMovementMagnitude(data.gyroscope);
                if (rotationMagnitude > 3.5) highIntensityCount++;
            }
        });

        if (highIntensityCount >= 8) return { score: SCORE_REPEATED_SHAKING, triggers: ['Repeated strong shaking'] };
        if (highIntensityCount >= 3) return { score: SCORE_STRONG_SHAKE, triggers: ['Strong shake detected'] };
        return { score: 0, triggers };
    }

    private analyzeDarkEnvironment(): number {
        if (this.sensorHistory.length < 5) return 0;
        const recent = this.sensorHistory.slice(-5);
        let darkReadings = 0;
        recent.forEach(data => {
            if (data.light < 5.0) darkReadings++;
        });
        return darkReadings >= 3 ? SCORE_DARKNESS_DETECTED : 0;
    }

    private analyzeSoundIntensity(): number {
        if (this.micLevelHistory.length < 5) return 0;
        const avgLevel = this.micLevelHistory.reduce((a, b) => a + b, 0) / this.micLevelHistory.length;
        const peakLevel = Math.max(...this.micLevelHistory);
        return (avgLevel > 65 || peakLevel > 85) ? SCORE_HIGH_SOUND_INTENSITY : 0;
    }

    public subscribe(callback: (analysis: RiskAnalysis) => void) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    private notifySubscribers(analysis: RiskAnalysis) {
        this.subscribers.forEach(cb => cb(analysis));
    }

    public isAnalysisActive(): boolean {
        return this.isAnalysisRunning;
    }

    public isMonitoringActive(): boolean {
        return this.isMonitoring;
    }
}

export const aiRiskEngine = AiRiskEngine.getInstance();
