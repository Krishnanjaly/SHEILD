import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiRiskEngine, RiskAnalysis } from '../utils/AiRiskEngine';
import { GuardianStateService } from './GuardianStateService';

/**
 * Headless Task for background monitoring.
 * This function runs in a separate JS context even if the app is killed.
 */
export const backgroundMonitoringTask = async (data: any) => {
    const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
    const userId = await AsyncStorage.getItem('userId');
    if (isLoggedIn !== 'true' || !userId) {
        return;
    }

    // Start the engine if not already started
    // We check a private flag via a public method if available, 
    // or just rely on the engine's internal guard.
    await aiRiskEngine.startMonitoring();

    try {
        const analysis = await aiRiskEngine.performRiskAnalysis();
        await GuardianStateService.saveAnalysis(
            analysis,
            analysis.riskLevel === 'NONE' ? 'PASSIVE' : undefined
        );
        
        if (analysis.riskLevel !== 'NONE') {
            console.log(`🛡️ SHIELD Background: ${analysis.riskLevel} risk detected!`);
            
            if (analysis.riskLevel === 'HIGH') {
                // Store pending emergency for the UI to pick up
                await AsyncStorage.setItem('pendingEmergency', JSON.stringify(analysis));
                
                // Emit event (only works if UI thread is alive)
                DeviceEventEmitter.emit('AI_RISK_DETECTED', analysis);
            }
        }
    } catch (error) {
        console.error('Error in background analysis task:', error);
    }
};
