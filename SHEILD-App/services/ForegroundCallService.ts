import { Platform, PermissionsAndroid } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import haversine from 'haversine';
import BASE_URL from '../config/api';

interface EmergencyContact {
    trusted_id: string;
    trusted_name: string;
    trusted_no: string;
    trusted_email?: string;
    latitude?: number;
    longitude?: number;
}

interface LocationCoords {
    latitude: number;
    longitude: number;
}

class ForegroundCallService {
    private isCallActive: boolean = false;
    private currentCallIndex: number = 0;
    private callTimeoutRef: NodeJS.Timeout | null = null;
    private userLocation: LocationCoords | null = null;

    constructor() {
        this.setupLocationTracking();
    }

    private async setupLocationTracking(): Promise<void> {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({ 
                    accuracy: Location.Accuracy.High 
                });
                this.userLocation = {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude
                };
            }
        } catch (error) {
            console.error('Location setup error:', error);
        }
    }

    private calculateDistance(contact: EmergencyContact): number {
        // If contact has no GPS coordinates, return a default distance (will be sorted last)
        if (!this.userLocation || !contact.latitude || !contact.longitude) {
            console.log(`⚠️ No GPS data for ${contact.trusted_name}, using default distance`);
            return 9999; // Large distance so contacts with GPS are prioritized
        }

        const contactLocation: LocationCoords = {
            latitude: contact.latitude,
            longitude: contact.longitude
        };

        const distance = haversine(this.userLocation, contactLocation, { unit: 'mile' });
        console.log(`📍 Distance to ${contact.trusted_name}: ${distance.toFixed(2)} miles`);
        return distance;
    }

    private sortContactsByDistance(contacts: EmergencyContact[]): EmergencyContact[] {
        console.log('🔄 Sorting contacts by distance...');
        
        // First filter out contacts without phone numbers
        const validContacts = contacts.filter(contact => {
            const hasPhone = contact.trusted_no && contact.trusted_no.trim().length > 0;
            if (!hasPhone) {
                console.log(`⚠️ Skipping ${contact.trusted_name} - no phone number`);
            }
            return hasPhone;
        });
        
        console.log(`📞 Valid contacts with phone numbers: ${validContacts.length}`);
        
        // Sort by distance (contacts without GPS will get large distance and be sorted last)
        const sorted = validContacts.sort((a, b) => this.calculateDistance(a) - this.calculateDistance(b));
        
        console.log('📋 Sorted contacts:', sorted.map(c => ({
            name: c.trusted_name, 
            phone: c.trusted_no, 
            distance: this.calculateDistance(c)
        })));
        
        return sorted;
    }

    private async triggerCall(phoneNumber: string): Promise<void> {
        console.log(`📞 Attempting to call ${phoneNumber} from within app...`);
        
        if (Platform.OS === 'android') {
            try {
                console.log('📱 Requesting CALL_PHONE permission for in-app calling...');
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CALL_PHONE
                );
                
                if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                    console.log('✅ Permission granted, initiating in-app call...');
                    
                    // Use CALL_ACTION instead of CALL to open phone dialer with call initiated
                    await IntentLauncher.startActivityAsync(
                        'android.intent.action.CALL',
                        {
                            data: `tel:${phoneNumber}`
                        }
                    );
                    
                    console.log(`📞 In-app call initiated to ${phoneNumber}`);
                    console.log('📱 Note: Call opens in phone app but appears integrated');
                    
                    // Auto-hang up after 15 seconds (this will be handled by the countdown)
                    return new Promise<void>((resolve) => {
                        // The countdown will handle the timing
                        setTimeout(() => {
                            console.log(`⏰ 15 seconds elapsed, should move to next contact`);
                            resolve();
                        }, 15000);
                    });
                } else {
                    console.log('❌ Call permission denied:', granted);
                    return Promise.resolve();
                }
            } catch (error) {
                console.error('❌ In-app call failed:', error);
                return Promise.resolve();
            }
        } else {
            console.log('⚠️ In-app calling not supported on this platform:', Platform.OS);
            return Promise.resolve();
        }
    }

    public async startEmergencyCallRotation(
        contacts: EmergencyContact[],
        onCallUpdate?: (contactName: string, timeRemaining: number) => void,
        onCallAnswered?: () => void,
        onAllContactsCalled?: () => void
    ): Promise<void> {
        console.log('🚀 Starting emergency call rotation...');
        
        if (this.isCallActive) {
            console.log('⚠️ Call rotation already active');
            return;
        }
        
        if (contacts.length === 0) {
            console.log('⚠️ No contacts provided');
            return;
        }

        this.isCallActive = true;
        this.currentCallIndex = 0;

        // Sort contacts by GPS distance
        const sortedContacts = this.sortContactsByDistance(contacts);
        console.log('📍 Contacts sorted by distance:', sortedContacts.map(c => `${c.trusted_name} (${c.trusted_no})`));

        const callNextContact = async () => {
            // Check if call rotation was stopped
            if (!this.isCallActive) {
                console.log('📞 Call rotation stopped before next contact');
                onAllContactsCalled?.();
                return;
            }
            
            if (this.currentCallIndex >= sortedContacts.length) {
                this.isCallActive = false;
                onAllContactsCalled?.();
                return;
            }

            const contact = sortedContacts[this.currentCallIndex];
            console.log(`📞 Preparing to call ${contact.trusted_name} (${contact.trusted_no}) - Distance: ${this.calculateDistance(contact).toFixed(2)} miles`);
            
            if (!contact.trusted_no) {
                console.log('⚠️ Contact has no phone number, skipping...');
                this.currentCallIndex++;
                setTimeout(() => callNextContact(), 1000);
                return;
            }

            // Start the call and provide countdown updates
            console.log(`📞 Calling ${contact.trusted_name} now...`);
            
            // Start 15-second countdown with callback
            let timeRemaining = 15;
            if (onCallUpdate) {
                onCallUpdate(contact.trusted_name, timeRemaining);
            }
            
            const countdownInterval = setInterval(() => {
                // Check if call rotation was stopped
                if (!this.isCallActive) {
                    clearInterval(countdownInterval);
                    console.log('📞 Call rotation stopped during countdown');
                    return;
                }
                
                timeRemaining--;
                if (onCallUpdate) {
                    onCallUpdate(contact.trusted_name, timeRemaining);
                }
                
                if (timeRemaining <= 0) {
                    clearInterval(countdownInterval);
                }
            }, 1000);
            
            // Start the actual call (runs in parallel with countdown)
            await this.triggerCall(contact.trusted_no);
            
            // Clear any remaining countdown
            clearInterval(countdownInterval);
            
            // Check if call rotation was stopped before moving to next contact
            if (!this.isCallActive) {
                console.log('📞 Call rotation stopped after call completed');
                return;
            }
            
            // Move to next contact after call completes
            this.currentCallIndex++;
            setTimeout(() => callNextContact(), 1000); // 1-second delay between calls
        };

        // Start calling the first (nearest) contact
        await callNextContact();
    }

    public stopCallRotation(): void {
        console.log('📞 Emergency call rotation stopped by user');
        this.isCallActive = false;
        
        if (this.callTimeoutRef) {
            clearInterval(this.callTimeoutRef);
            this.callTimeoutRef = null;
        }

        console.log('📞 All call processes terminated');
    }

    public async updateContactsWithLocation(
        userId: string,
        contacts: EmergencyContact[]
    ): Promise<EmergencyContact[]> {
        try {
            // Update user location first
            await this.setupLocationTracking();

            // For contacts without location, we could implement geocoding
            // For now, return contacts with current user location
            return contacts.map(contact => ({
                ...contact,
                // You could add geocoding here to get contact locations
            }));
        } catch (error) {
            console.error('Error updating contact locations:', error);
            return contacts;
        }
    }

    public isCallInProgress(): boolean {
        return this.isCallActive;
    }

    public getCurrentCallInfo(): { contactName: string; index: number } | null {
        if (!this.isCallActive) {
            return null;
        }

        return {
            contactName: `Contact ${this.currentCallIndex + 1}`,
            index: this.currentCallIndex
        };
    }
}

// Export singleton instance
export const foregroundCallService = new ForegroundCallService();

// Export types
export type { EmergencyContact, LocationCoords };
