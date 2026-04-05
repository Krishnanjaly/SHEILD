import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_PIN_KEY = "appPin";
const APP_PATTERN_KEY = "appPattern";

type SecureStoreModule = {
  setItemAsync: (key: string, value: string) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const getSecureStore = (): SecureStoreModule | null => {
  try {
    const dynamicRequire = Function("return require")();
    return dynamicRequire("expo-secure-store") as SecureStoreModule;
  } catch {
    return null;
  }
};

export const AppLockSecretStorage = {
  async savePin(pin: string) {
    const secureStore = getSecureStore();
    if (secureStore) {
      await secureStore.setItemAsync(APP_PIN_KEY, pin);
      return;
    }

    await AsyncStorage.setItem(APP_PIN_KEY, pin);
  },

  async deletePin() {
    const secureStore = getSecureStore();
    if (secureStore) {
      await secureStore.deleteItemAsync(APP_PIN_KEY);
      return;
    }

    await AsyncStorage.removeItem(APP_PIN_KEY);
  },

  async getPin() {
    const secureStore = getSecureStore();
    if (secureStore) {
      return secureStore.getItemAsync(APP_PIN_KEY);
    }

    return AsyncStorage.getItem(APP_PIN_KEY);
  },

  async savePattern(pattern: number[]) {
    const serialized = JSON.stringify(pattern);
    const secureStore = getSecureStore();
    if (secureStore) {
      await secureStore.setItemAsync(APP_PATTERN_KEY, serialized);
      return;
    }

    await AsyncStorage.setItem(APP_PATTERN_KEY, serialized);
  },

  async deletePattern() {
    const secureStore = getSecureStore();
    if (secureStore) {
      await secureStore.deleteItemAsync(APP_PATTERN_KEY);
      return;
    }

    await AsyncStorage.removeItem(APP_PATTERN_KEY);
  },

  async getPattern() {
    const secureStore = getSecureStore();
    if (secureStore) {
      return secureStore.getItemAsync(APP_PATTERN_KEY);
    }

    return AsyncStorage.getItem(APP_PATTERN_KEY);
  },
};
