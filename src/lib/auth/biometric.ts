// ============================================================
// SahakariSIP — Biometric unlock (banking-style)
// ============================================================
// The fingerprint never reaches a server. When the app is locked, the
// reusable session (Supabase tokens / local profile id) is stored in the
// phone's encrypted Keystore-backed storage (SecureStore); the OS
// biometric prompt is only the lock on that box. Unlocking reads the
// entry back and silently restores the session.
// ============================================================

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BIOMETRIC_KEY = "sahakarisip.biometric";
const ENABLED_FLAG = "sahakarisip.biometric.enabled";
const DECLINED_PREFIX = "sahakarisip.biometric.declined";

export interface BiometricEntry {
  mode: "cloud" | "local";
  email: string;
  name?: string;
  savedAt: string;
  /** Cloud accounts: the Supabase session to restore on unlock. */
  session?: {
    access_token: string;
    refresh_token: string;
  };
  /** Device-local profiles: the on-device profile id to restore. */
  localProfileId?: string;
}

/** Device can prompt for biometrics and the user has at least one enrolled. */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function readBiometricEntry(): Promise<BiometricEntry | null> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_KEY);
    return raw ? (JSON.parse(raw) as BiometricEntry) : null;
  } catch {
    return null;
  }
}

export async function saveBiometricEntry(entry: BiometricEntry): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, JSON.stringify(entry));
  await AsyncStorage.setItem(ENABLED_FLAG, "true");
}

export async function clearBiometricEntry(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
  } catch {
    // Key already absent — nothing to clean up.
  }
  await AsyncStorage.removeItem(ENABLED_FLAG);
}

/** Cheap bootstrap check — AsyncStorage only, no biometric prompt. */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_FLAG)) === "true";
  } catch {
    return false;
  }
}

/** The user answered "Not now" to the post-login offer — remember per account. */
export async function markBiometricDeclined(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${DECLINED_PREFIX}.${userId}`,
      new Date().toISOString()
    );
  } catch {
    // Best-effort — worst case we offer again next login.
  }
}

export async function hasDeclinedBiometric(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${DECLINED_PREFIX}.${userId}`)) !== null;
  } catch {
    return false;
  }
}

/**
 * Run the OS biometric prompt. True only on a successful biometric MATCH —
 * the device PIN/pattern/password must NOT satisfy this gate, because it
 * releases the stored session and the lock screen promises fingerprint-only.
 */
export async function promptBiometric(reason: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Cancel",
      disableDeviceFallback: true,
    });
    return res.success;
  } catch {
    return false;
  }
}
