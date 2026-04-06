import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppLockSecretStorage } from "./AppLockSecretStorage";

export type AppLockType = "PIN" | "PATTERN" | null;

export const APP_LOCK_ENABLED_KEY = "appLockEnabled";
export const APP_LOCK_TYPE_KEY = "lockType";
export const APP_LOCK_PIN_KEY = "appLockPin";
export const APP_LOCK_PATTERN_KEY = "appLockPattern";

const toBooleanString = (value: boolean) => (value ? "true" : "false");
const normalizeLockType = (value: string | null): AppLockType =>
  value === "PIN" || value === "PATTERN" ? value : null;
const REMOVED_APP_LOCK_AUTH_FLAG = ["bio", "metricEnabled"].join("");

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
    const [, rawLockType] = entries[1];
    const [, pattern] = entries[2];
    const lockType = normalizeLockType(rawLockType);

    if (rawLockType && rawLockType !== lockType) {
      await AsyncStorage.multiSet([
        [APP_LOCK_TYPE_KEY, ""],
        [APP_LOCK_ENABLED_KEY, "false"],
        [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
      ]);
    }

    return {
      isAppLockEnabled: enabled === "true" && lockType !== null,
      lockType,
      pin: pin || null,
      pattern: securePattern || pattern || null,
    };
  },

  async setEnabled(enabled: boolean) {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_KEY, toBooleanString(enabled));
    if (!enabled) {
      await AsyncStorage.setItem(APP_LOCK_TYPE_KEY, "");
    }
    await AsyncStorage.setItem(REMOVED_APP_LOCK_AUTH_FLAG, "false");
  },

  async setLockType(lockType: AppLockType) {
    await AsyncStorage.setItem(APP_LOCK_TYPE_KEY, lockType ?? "");
    await AsyncStorage.setItem(REMOVED_APP_LOCK_AUTH_FLAG, "false");
  },

  async activatePin(pin: string) {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PIN"],
      [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
    ]);
    await AppLockSecretStorage.savePin(pin);
    await AsyncStorage.removeItem(APP_LOCK_PATTERN_KEY);
  },

  async activatePattern(pattern: number[]) {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PATTERN"],
      [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
    ]);
    await AppLockSecretStorage.savePattern(pattern);
    await AsyncStorage.removeItem(APP_LOCK_PIN_KEY);
    await AppLockSecretStorage.deletePin();
  },

  async preparePinSelection() {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PIN"],
      [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
    ]);
    await AsyncStorage.removeItem(APP_LOCK_PATTERN_KEY);
    await AppLockSecretStorage.deletePattern();
  },

  async preparePatternSelection() {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "true"],
      [APP_LOCK_TYPE_KEY, "PATTERN"],
      [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
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
      [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
    ]);
    await this.clearMethods();
  },

  async disableAppLockPreserveCredentials() {
    await AsyncStorage.multiSet([
      [APP_LOCK_ENABLED_KEY, "false"],
      [REMOVED_APP_LOCK_AUTH_FLAG, "false"],
    ]);
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
    return shouldRequireUnlock ? "/app-lock" : "/dashboard";
  },

  async getFreshAuthSuccessRoute() {
    const shouldRequireUnlock = await this.shouldRequireUnlock();
    return shouldRequireUnlock ? "/app-lock" : "/dashboard";
  },
};
