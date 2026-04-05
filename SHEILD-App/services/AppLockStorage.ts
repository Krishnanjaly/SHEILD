import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppLockSecretStorage } from "./AppLockSecretStorage";

export type AppLockType = "PIN" | "PATTERN" | "FINGERPRINT" | null;

export const APP_LOCK_ENABLED_KEY = "appLockEnabled";
export const APP_LOCK_TYPE_KEY = "lockType";
export const APP_LOCK_PIN_KEY = "appLockPin";
export const APP_LOCK_PATTERN_KEY = "appLockPattern";
export const APP_LOCK_BIOMETRIC_ENABLED_KEY = "biometricEnabled";

const toBooleanString = (value: boolean) => (value ? "true" : "false");

export const AppLockStorage = {
  async getState() {
    const [entries, pin, securePattern] = await Promise.all([
      AsyncStorage.multiGet([
        APP_LOCK_ENABLED_KEY,
        APP_LOCK_TYPE_KEY,
        APP_LOCK_PATTERN_KEY,
        APP_LOCK_BIOMETRIC_ENABLED_KEY,
      ]),
      AppLockSecretStorage.getPin(),
      AppLockSecretStorage.getPattern(),
    ]);
    const [, enabled] = entries[0];
    const [, lockType] = entries[1];
    const [, pattern] = entries[2];
    const [, biometricEnabled] = entries[3];

    return {
      isAppLockEnabled: enabled === "true",
      lockType: (lockType as AppLockType) || null,
      pin: pin || null,
      pattern: securePattern || pattern || null,
      biometricEnabled: biometricEnabled === "true",
    };
  },

  async setEnabled(enabled: boolean) {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_KEY, toBooleanString(enabled));
    if (!enabled) {
      await AsyncStorage.setItem(APP_LOCK_TYPE_KEY, "");
    }
  },

  async setLockType(lockType: AppLockType) {
    await AsyncStorage.setItem(APP_LOCK_TYPE_KEY, lockType ?? "");
  },

  async activatePin(pin: string) {
    const biometricEnabled = await AsyncStorage.getItem(APP_LOCK_BIOMETRIC_ENABLED_KEY);
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PIN"],
      [APP_LOCK_BIOMETRIC_ENABLED_KEY, biometricEnabled === "true" ? "true" : "false"],
    ]);
    await AppLockSecretStorage.savePin(pin);
    await AsyncStorage.removeItem(APP_LOCK_PATTERN_KEY);
  },

  async activatePattern(pattern: number[]) {
    const biometricEnabled = await AsyncStorage.getItem(APP_LOCK_BIOMETRIC_ENABLED_KEY);
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PATTERN"],
      [APP_LOCK_BIOMETRIC_ENABLED_KEY, biometricEnabled === "true" ? "true" : "false"],
    ]);
    await AppLockSecretStorage.savePattern(pattern);
    await AsyncStorage.removeItem(APP_LOCK_PIN_KEY);
    await AppLockSecretStorage.deletePin();
  },

  async activateFingerprint() {
    const state = await this.getState();
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, state.lockType ?? "FINGERPRINT"],
      [APP_LOCK_BIOMETRIC_ENABLED_KEY, "true"],
    ]);
  },

  async preparePinSelection() {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PIN"],
    ]);
    await AsyncStorage.removeItem(APP_LOCK_PATTERN_KEY);
    await AppLockSecretStorage.deletePattern();
  },

  async preparePatternSelection() {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PATTERN"],
    ]);
    await AsyncStorage.removeItem(APP_LOCK_PIN_KEY);
    await AppLockSecretStorage.deletePin();
  },

  async clearMethods() {
    await AsyncStorage.multiRemove([APP_LOCK_PIN_KEY, APP_LOCK_PATTERN_KEY]);
    await AppLockSecretStorage.deletePin();
    await AppLockSecretStorage.deletePattern();
  },

  async resetAppLock() {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "false"],
      [APP_LOCK_TYPE_KEY, ""],
      [APP_LOCK_BIOMETRIC_ENABLED_KEY, "false"],
    ]);
    await this.clearMethods();
  },

  async disableAppLockPreserveCredentials() {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_KEY, "false");
  },

  async shouldRequireUnlock() {
    const state = await this.getState();

    if (!state.isAppLockEnabled || !state.lockType) {
      return false;
    }

    if (state.lockType === "PIN") {
      return Boolean(state.pin && state.pin.length >= 4);
    }

    if (state.lockType === "PATTERN") {
      try {
        const parsed = state.pattern ? JSON.parse(state.pattern) : null;
        if (Array.isArray(parsed) && parsed.length >= 4) {
          return true;
        }
      } catch {
        return state.biometricEnabled;
      }
    }

    if (state.lockType === "FINGERPRINT") {
      return state.biometricEnabled;
    }

    return state.biometricEnabled;
  },

  async getAuthSuccessRoute() {
    const shouldRequireUnlock = await this.shouldRequireUnlock();
    return shouldRequireUnlock ? "/app-lock" : "/settings";
  },

  async getFreshAuthSuccessRoute() {
    const shouldRequireUnlock = await this.shouldRequireUnlock();

    if (shouldRequireUnlock) {
      await this.disableAppLockPreserveCredentials();
      return "/phone";
    }

    return "/settings";
  },
};
