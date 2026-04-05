import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppLockSecretStorage } from "./AppLockSecretStorage";

export type AppLockType = "PIN" | "PATTERN" | null;

export const APP_LOCK_ENABLED_KEY = "appLockEnabled";
export const APP_LOCK_TYPE_KEY = "lockType";
export const APP_LOCK_PIN_KEY = "appLockPin";
export const APP_LOCK_PATTERN_KEY = "appLockPattern";

const toBooleanString = (value: boolean) => (value ? "true" : "false");

export const AppLockStorage = {
  async getState() {
    const [entries, pin, securePattern] = await Promise.all([
      AsyncStorage.multiGet([
        APP_LOCK_ENABLED_KEY,
        APP_LOCK_TYPE_KEY,
        APP_LOCK_PATTERN_KEY,
      ]),
      AppLockSecretStorage.getPin(),
      AppLockSecretStorage.getPattern(),
    ]);
    const [, enabled] = entries[0];
    const [, lockType] = entries[1];
    const [, pattern] = entries[2];

    return {
      isAppLockEnabled: enabled === "true",
      lockType: (lockType as AppLockType) || null,
      pin: pin || null,
      pattern: securePattern || pattern || null,
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
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PIN"],
    ]);
    await AppLockSecretStorage.savePin(pin);
    await AsyncStorage.removeItem(APP_LOCK_PATTERN_KEY);
  },

  async activatePattern(pattern: number[]) {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PATTERN"],
    ]);
    await AppLockSecretStorage.savePattern(pattern);
    await AsyncStorage.removeItem(APP_LOCK_PIN_KEY);
    await AppLockSecretStorage.deletePin();
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
        return Array.isArray(parsed) && parsed.length >= 4;
      } catch {
        return false;
      }
    }

    return false;
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
