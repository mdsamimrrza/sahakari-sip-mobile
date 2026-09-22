// ============================================================
// SahakariSIP — Auth Provider
// ============================================================
// The web app (NextAuth v5: Google + bcrypt credentials, OTP emails)
// owns ALL cloud authentication. The APK delegates to it through the
// /api/mobile/* routes (src/lib/auth/mobileApi.ts): Google runs as a
// browser handoff, passwords against the shared credential store, and
// a finished sign-in yields a long-lived Supabase RLS JWT that rides
// as the Bearer token on every data request (src/lib/supabase.ts).
// Same account, same user id, same portfolio on phone and browser.
//
//   1. CLOUD  — via the web's NextAuth backend (requires the web URL
//               configured: EXPO_PUBLIC_WEB_URL).
//   2. DEVICE — an on-device profile (salted SHA-256 hash, never leaves
//               the phone). Everything works offline; the portfolio
//               lives in local storage only.
//
// Both routes expose an identical `DataStore`, so every screen behaves
// the same way regardless of which one the user picked.
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import { createStore } from "../data";
import { CloudStore } from "../data/cloud";
import { cacheInvalidate } from "../data/cache";
import { removeProfilePhoto } from "../profilePhoto";
import {
  clearMobileSession,
  loadMobileSession,
  saveMobileSession,
  type MobileSession,
  type MobileUser,
} from "./mobileSession";
import {
  MobileApiError,
  completeReset,
  deleteAccount as apiDeleteAccount,
  fetchProfile,
  googleExchange,
  googleStart,
  isWebConfigured,
  passwordLogin,
  requestPasswordReset as apiRequestReset,
  signup as apiSignup,
  signupVerify,
  verifyResetOtp,
} from "./mobileApi";
import {
  backupCloudToLocal,
  inspectMergeCandidate,
  mergeLocalIntoCloud,
  purgeMergeArtifacts,
  hasUnmergedLocalData as scanUnmergedLocalData,
  type MergeCounts,
  type MergeResult,
} from "../data/merge";
import {
  clearBiometricEntry,
  hasDeclinedBiometric,
  isBiometricEnabled,
  isBiometricSupported,
  markBiometricDeclined,
  promptBiometric,
  readBiometricEntry,
  saveBiometricEntry,
} from "./biometric";
import type { DataMode, DataStore } from "../data/store";
import { uuid } from "../utils";

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  mode: DataMode;
  /** Remote avatar (e.g. Google profile photo) when the provider supplies one. */
  avatarUrl?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  /** Set when signup succeeded but the account still needs email confirmation. */
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  /** "locked" = biometric unlock armed, waiting for the fingerprint. */
  status: "loading" | "authenticated" | "unauthenticated" | "locked";
  user: AppUser | null;
  store: DataStore | null;
  dataMode: DataMode;
  cloudAvailable: boolean;
  sessionStartedAt: string | null;
  signIn: (email: string, password: string, mode: DataMode) => Promise<AuthResult>;
  signInWithGoogle: (mode: DataMode) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    confirmPassword: string,
    mode: DataMode
  ) => Promise<AuthResult>;
  /** Cloud signup step 2: confirm the emailed 6-digit code, then sign in. */
  confirmSignup: (email: string, code: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<AuthResult>;
  /**
   * Biometric unlock (banking-style): with it enabled, signOut() locks the
   * app and the fingerprint restores the session without a password.
   */
  biometricSupported: boolean;
  biometricEnabled: boolean;
  lockInfo: { email: string; name?: string } | null;
  unlockWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  enableBiometric: () => Promise<{ success: boolean; error?: string }>;
  disableBiometric: () => Promise<void>;
  /** Post-login offer state — the root-mounted BiometricPromptDialog. */
  offerBiometric: boolean;
  dismissBiometricOffer: (declined: boolean) => void;
  /**
   * One-time local→cloud merge offer, set when the user asks to merge from
   * Settings (GoCloudCard). The root-mounted MergePromptDialog renders it.
   * Nothing is merged unless the user confirms there. Null once confirmed,
   * dismissed, or when there's nothing to merge.
   */
  pendingMerge: MergeCounts | null;
  confirmMerge: () => Promise<{ success: boolean; error?: string; counts?: MergeResult }>;
  dismissMerge: () => void;
  /**
   * Whether this device holds data not yet merged into the cloud account.
   * null = still checking (cloud sessions only). Drives the Settings
   * "Go Cloud / Move phone data to cloud" row and the dashboard's
   * onboarding-redirect hold.
   */
  hasUnmergedLocalData: boolean | null;
  /** Shows the merge-confirm dialog (no-op when there's nothing to merge). */
  offerMerge: () => Promise<void>;
  /** Re-scan device storage for unmerged data (Settings focus, post-merge). */
  refreshLocalDataCheck: () => void;
  /** Re-pulls the web profile (name + image) into the session. Never throws. */
  refreshProfile: () => Promise<void>;
  requestPasswordReset: (email: string, mode: DataMode) => Promise<AuthResult>;
  verifyPasswordResetOtp: (
    email: string,
    code: string,
    mode: DataMode
  ) => Promise<AuthResult>;
  completePasswordReset: (email: string, newPassword: string, mode: DataMode) => Promise<AuthResult>;
}

const SESSION_KEY = "sahakarisip.v1.session";
const PROFILES_KEY = "sahakarisip.v1.profiles";
const SESSION_STARTED_KEY = "sahakarisip.v1.session_started_at";

interface LocalProfile {
  id: string;
  email: string;
  name?: string;
  salt: string;
  hash: string;
  created_at: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------- Local profile helpers ----------

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}::${password}`
  );
}

async function readProfiles(): Promise<LocalProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    return raw ? (JSON.parse(raw) as LocalProfile[]) : [];
  } catch {
    return [];
  }
}

async function writeProfiles(profiles: LocalProfile[]): Promise<void> {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

/** Google / OAuth providers expose the profile photo as metadata. */
function avatarFromMetadata(metadata: unknown): string | undefined {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const url = m.avatar_url ?? m.picture;
  return typeof url === "string" && url.startsWith("http") ? url : undefined;
}

/** Returning from a shorter-than-grace background stay (app switch, share
 *  sheet, notification shade) does not re-lock; anything longer does. */
const BACKGROUND_LOCK_GRACE_MS = 30_000;

// Google handoff waiters. On Android the sahakarisip:// redirect can be
// delivered by the Custom Tab's openAuthSessionAsync result OR by
// expo-router launching /auth/callback with the token — whichever wins
// resolves these waiters, and completeGoogleHandoff dedupes the exchange
// (the token is single-use server-side too).
let googleHandoffResolvers: Array<(token: string | null) => void> = [];

/** Called by the /auth/callback screen or the browser-session result. */
export function resolveGoogleHandoff(token: string | null) {
  const resolvers = googleHandoffResolvers;
  googleHandoffResolvers = [];
  for (const resolve of resolvers) resolve(token);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<AppUser | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<MergeCounts | null>(null);
  const [hasUnmergedLocalData, setHasUnmergedLocalData] = useState<boolean | null>(
    null
  );
  const [localDataCheckNonce, setLocalDataCheckNonce] = useState(0);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [lockInfo, setLockInfo] = useState<{ email: string; name?: string } | null>(
    null
  );
  const [offerBiometric, setOfferBiometric] = useState(false);
  // Ref mirror so lock-aware signOut / the post-login offer never read a
  // stale closure value.
  const biometricEnabledRef = useRef(false);
  // Ref mirrors for the background-lock listener (a plain effect closure
  // would go stale between renders).
  const userRef = useRef<AppUser | null>(null);
  const backgroundedAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const mounted = useRef(true);
  // Holds the reset token and email between verify OTP and set password steps.
  const resetTokenRef = useRef<{ token: string | null; email: string | null }>({ token: null, email: null });

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const cloudAvailable = isSupabaseConfigured && isWebConfigured;

  // Detect device capability + whether biometric unlock is armed.
  useEffect(() => {
    (async () => {
      const [supported, enabled] = await Promise.all([
        isBiometricSupported(),
        isBiometricEnabled(),
      ]);
      biometricEnabledRef.current = enabled;
      if (mounted.current) {
        setBiometricSupported(supported);
        setBiometricEnabled(enabled);
      }
    })();
  }, []);

  useEffect(() => {
    biometricEnabledRef.current = biometricEnabled;
  }, [biometricEnabled]);

  // ---------- Background → foreground lock ----------
  // Banking-style: with biometrics armed and a session in memory, coming
  // back after a longer-than-grace background stay drops the app on the
  // lock screen. The session itself stays live — the fingerprint reveals
  // it, no re-authentication needed.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === "active") {
        if (
          prev !== "active" &&
          biometricEnabledRef.current &&
          userRef.current &&
          Date.now() - backgroundedAtRef.current > BACKGROUND_LOCK_GRACE_MS
        ) {
          setLockInfo({
            email: userRef.current.email,
            name: userRef.current.name,
          });
          setStatus("locked");
        }
      } else {
        backgroundedAtRef.current = Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  const persistSession = useCallback(async (next: AppUser | null) => {
    if (next) {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
      const startedAt = new Date().toISOString();
      await AsyncStorage.setItem(SESSION_STARTED_KEY, startedAt);
      setSessionStartedAt(startedAt);
    } else {
      await AsyncStorage.removeItem(SESSION_KEY);
      await AsyncStorage.removeItem(SESSION_STARTED_KEY);
      setSessionStartedAt(null);
      setPendingMerge(null);
    }
    setUser(next);
    setStatus(next ? "authenticated" : "unauthenticated");
  }, []);

  // ---------- One-time local → cloud merge (Settings-gated) ----------
  //
  // Nothing merges on its own. The only entry point is Settings →
  // "Go Cloud" / "Move phone data to cloud" (GoCloudCard), which calls
  // offerMerge() to raise the confirm dialog; the merge runs only when
  // the user confirms there.
  //
  // Re-scan device storage whenever the session changes or Settings asks.
  useEffect(() => {
    if (!user || user.mode !== "cloud" || !cloudAvailable) {
      setHasUnmergedLocalData(false);
      return;
    }
    let cancelled = false;
    setHasUnmergedLocalData(null);
    (async () => {
      try {
        const has = await scanUnmergedLocalData(new CloudStore());
        if (!cancelled && mounted.current) setHasUnmergedLocalData(has);
      } catch {
        // Offline / RPC missing — treat as "nothing to merge".
        if (!cancelled && mounted.current) setHasUnmergedLocalData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, cloudAvailable, localDataCheckNonce]);

  /**
   * Raise the merge-confirm dialog. Race-free: gates on the live Supabase
   * session rather than React state, so it's safe to call right after
   * signIn()/signUp() resolve inside the Go Cloud sheet.
   */
  const offerMerge = useCallback(async () => {
    try {
      const counts = await inspectMergeCandidate(new CloudStore());
      if (counts && mounted.current) setPendingMerge(counts);
    } catch {
      // No cloud session / offline — nothing to offer.
    }
  }, []);

  const refreshLocalDataCheck = useCallback(() => {
    setLocalDataCheckNonce((n) => n + 1);
  }, []);

  const confirmMerge = useCallback(
    async (): Promise<{ success: boolean; error?: string; counts?: MergeResult }> => {
      setPendingMerge(null);
      try {
        const cloud = new CloudStore();
        if (!(await cloud.getUserId())) {
          return { success: false, error: "Not signed in to a cloud account." };
        }
        // Snapshot the cloud side before the first write. Local keys are
        // never touched, so the phone keeps its own backup for free.
        await backupCloudToLocal(cloud);
        const counts = await mergeLocalIntoCloud(cloud);
        cacheInvalidate();
        setLocalDataCheckNonce((n) => n + 1);
        return { success: true, counts };
      } catch (e) {
        // Dialog clears; dedupe rules make a retry (from Settings) safe,
        // and both sides are intact (cloud snapshot + untouched local keys).
        setLocalDataCheckNonce((n) => n + 1);
        return {
          success: false,
          error:
            e instanceof Error
              ? e.message
              : "Merge failed. Your data is safe on this phone.",
        };
      }
    },
    []
  );

  const dismissMerge = useCallback(() => setPendingMerge(null), []);

  // ---------- Biometric unlock (banking-style) ----------

  /**
   * After an explicit sign-in (not cold-start restore), offer to arm the
   * fingerprint. Skipped when already enabled, the device can't do it, or
   * the user previously said "Not now" for this account.
   */
  const maybeOfferBiometric = useCallback(async (next: AppUser) => {
    if (biometricEnabledRef.current) return;
    if (!(await isBiometricSupported())) return;
    if (await hasDeclinedBiometric(next.id)) return;
    if (mounted.current) setOfferBiometric(true);
  }, []);

  const dismissBiometricOffer = useCallback(
    async (declined: boolean) => {
      setOfferBiometric(false);
      if (declined && user) await markBiometricDeclined(user.id);
    },
    [user]
  );

  const enableBiometric = useCallback(
    async (): Promise<{ success: boolean; error?: string }> => {
      if (!user) return { success: false, error: "Not signed in." };
      if (!(await isBiometricSupported())) {
        return { success: false, error: "Biometrics are not set up on this device." };
      }
      const verified = await promptBiometric("Enable biometric unlock");
      if (!verified) return { success: false, error: "Not verified." };
      try {
        if (user.mode === "cloud" && cloudAvailable) {
          const mobileSession = await loadMobileSession();
          if (!mobileSession) {
            return { success: false, error: "No mobile session to save." };
          }
          await saveBiometricEntry({
            mode: "cloud",
            email: user.email,
            name: user.name,
            savedAt: new Date().toISOString(),
            mobileSession,
          });
        } else {
          await saveBiometricEntry({
            mode: "local",
            email: user.email,
            name: user.name,
            savedAt: new Date().toISOString(),
            localProfileId: user.id,
          });
        }
        biometricEnabledRef.current = true;
        setBiometricEnabled(true);
        return { success: true };
      } catch {
        return { success: false, error: "Could not save securely on this device." };
      }
    },
    [cloudAvailable]
  );

  const disableBiometric = useCallback(async () => {
    await clearBiometricEntry();
    biometricEnabledRef.current = false;
    setBiometricEnabled(false);
  }, []);

  // ---------- Web profile (next_auth.users name/image) ----------
  //
  // Google logins on the WEB app store the photo in next_auth.users.image.
  // This pulls name/image from the web's /api/mobile/account endpoint
  // (authorized by the stored RLS JWT) and patches the session WITHOUT
  // resetting the session clock. Offline / expired token / no row →
  // silently keeps whatever avatar we already have.
  const refreshDbProfile = useCallback(async () => {
    if (!cloudAvailable) return;
    try {
      const mobileSession = await loadMobileSession();
      if (!mobileSession) return;
      const row = await fetchProfile(mobileSession.accessToken);
      if (!row) return;
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as AppUser;
      if (saved.mode !== "cloud") return;
      let changed = false;
      if (typeof row.image === "string" && row.image.startsWith("http") && !saved.avatarUrl) {
        saved.avatarUrl = row.image;
        changed = true;
      }
      if (typeof row.name === "string" && row.name.trim() && !saved.name) {
        saved.name = row.name.trim();
        changed = true;
      }
      if (changed) {
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(saved));
        if (mounted.current) setUser(saved);
      }
    } catch {
      // Offline or token rejected — avatar stays as-is.
      if (__DEV__) console.warn("[profile] refreshDbProfile threw — photo stays as-is.");
    }
  }, [cloudAvailable]);

  // ---------- Biometric unlock ----------

  const unlockWithBiometric = useCallback(
    async (): Promise<{ success: boolean; error?: string }> => {
      const entry = await readBiometricEntry();
      if (!entry) {
        setBiometricEnabled(false);
        setLockInfo(null);
        setStatus("unauthenticated");
        return { success: false, error: "Biometric unlock is not set up." };
      }
      const verified = await promptBiometric("Unlock SahakariSIP");
      if (!verified) return { success: false, error: "Not verified." };
      // A live session is already in memory (cold-start or background lock
      // with the session intact): the fingerprint only needs to reveal it.
      if (userRef.current) {
        setLockInfo(null);
        setStatus("authenticated");
        return { success: true };
      }
      try {
        if (entry.mode === "cloud" && entry.mobileSession) {
          // Validate the stored session hasn't expired; if it has, fall back to login.
          const now = Date.now();
          if (entry.mobileSession.expiresAt <= now) {
            await clearMobileSession();
            throw new Error("Stored session expired");
          }
          // Restore the mobile session (bearer token) into Supabase client.
          await saveMobileSession(entry.mobileSession);
          void refreshDbProfile();
        } else if (entry.mode === "local" && entry.localProfileId) {
          await persistSession({
            id: entry.localProfileId,
            email: entry.email,
            name: entry.name,
            mode: "local",
          });
        } else {
          throw new Error("No stored session for this entry.");
        }
        setLockInfo(null);
        setStatus("authenticated");
        return { success: true };
      } catch {
        await clearBiometricEntry();
        setBiometricEnabled(false);
        setLockInfo(null);
        setStatus("unauthenticated");
        return { success: false, error: "Your session expired. Please sign in again." };
      }
    },
    [persistSession, refreshDbProfile]
  );

  // ---------- Bootstrap ----------

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        // 1. Restore a cloud session if Supabase has one persisted
        if (cloudAvailable) {
          const mobileSession = await loadMobileSession();
          if (mobileSession && mobileSession.expiresAt > Date.now()) {
            await saveMobileSession(mobileSession); // ensure token in Supabase client
const next: AppUser = {
                id: mobileSession.user.id,
                email: mobileSession.user.email ?? '',
                name: mobileSession.user.name ?? undefined,
                avatarUrl: mobileSession.user.image ?? undefined,
                mode: "cloud",
              };
            const startedAt = await AsyncStorage.getItem(SESSION_STARTED_KEY);
            await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
            if (!startedAt) {
              const now = new Date().toISOString();
              await AsyncStorage.setItem(SESSION_STARTED_KEY, now);
              setSessionStartedAt(now);
            } else {
              setSessionStartedAt(startedAt);
            }
            if (mounted.current) {
              setUser(next);
              // Biometric armed for THIS account? The app opens on the lock
              // screen even though the session is live — the fingerprint
              // just reveals it (no token minting needed).
              const entry = await readBiometricEntry();
              if (
                (await isBiometricEnabled()) &&
                entry &&
                entry.mode === "cloud" &&
                entry.mobileSession &&
                entry.email?.toLowerCase() === next.email.toLowerCase()
              ) {
                setLockInfo({ email: next.email, name: next.name });
                setStatus("locked");
              } else {
                setStatus("authenticated");
              }
            }
            void refreshDbProfile();
            return;
          }
        }

        // 2. Otherwise restore a device-local session
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as AppUser;
          if (saved.mode === "local") {
            const startedAt = await AsyncStorage.getItem(SESSION_STARTED_KEY);
            if (mounted.current) {
              setUser(saved);
              setSessionStartedAt(startedAt);
              const entry = await readBiometricEntry();
              if (
                (await isBiometricEnabled()) &&
                entry &&
                entry.mode === "local" &&
                entry.localProfileId === saved.id
              ) {
                setLockInfo({ email: saved.email, name: saved.name });
                setStatus("locked");
              } else {
                setStatus("authenticated");
              }
            }
            return;
          }
        }

        // 3. No active session — but biometric unlock may be armed from a
        // previous lock. Hand the decision to the lock screen.
        if (await isBiometricEnabled()) {
          const entry = await readBiometricEntry();
          if (entry) {
            setLockInfo({ email: entry.email, name: entry.name });
            if (mounted.current) setStatus("locked");
            return;
          }
        }

        if (mounted.current) setStatus("unauthenticated");
      } catch {
        if (mounted.current) setStatus("unauthenticated");
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [cloudAvailable, refreshDbProfile]);

  // ---------- Sign in ----------

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      mode: DataMode
    ): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();

      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        // Delegate to web's shared credential store (bcrypt + OTP rate limit)
        try {
          const session = await passwordLogin(normalized, password);
          await saveMobileSession(session);
          const nextUser: AppUser = {
            id: session.user.id,
            email: session.user.email ?? normalized,
            name: session.user.name ?? undefined,
            avatarUrl: session.user.image ?? undefined,
            mode: "cloud",
          };
          await persistSession(nextUser);
          void refreshDbProfile();
          void maybeOfferBiometric(nextUser);
          return { success: true };
        } catch (err) {
          if (err instanceof MobileApiError) {
            if (err.status === 401) {
              return {
                success: false,
                error:
                  err.message.includes("confirm")
                    ? "Please confirm your email address before signing in."
                    : "Invalid email or password. Please try again.",
              };
            }
            return { success: false, error: err.message };
          }
          return { success: false, error: "Sign in failed. Please try again." };
        }
      }

      // ---- Device-local mode ----
      const profiles = await readProfiles();
      const profile = profiles.find((p) => p.email === normalized);
      if (!profile) {
        return { success: false, error: "No on-device profile found for this email. Create one first." };
      }
      const hash = await hashPassword(password, profile.salt);
      if (hash !== profile.hash) {
        return { success: false, error: "Invalid email or password. Please try again." };
      }
      const localUser: AppUser = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        mode: "local",
      };
      await persistSession(localUser);
      void maybeOfferBiometric(localUser);
      return { success: true };
    },
    [cloudAvailable, persistSession, refreshDbProfile, maybeOfferBiometric]
  );

  // ---------- Sign up ----------

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      confirmPassword: string,
      mode: DataMode
    ): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();

      if (password.length < 8) {
        return { success: false, error: "Password must be at least 8 characters." };
      }
      if (password !== confirmPassword) {
        return { success: false, error: "Passwords do not match." };
      }

      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        try {
          await apiSignup(normalized, password, confirmPassword);
          // Signup succeeded but email confirmation required.
          return { success: true, needsEmailConfirmation: true };
        } catch (err) {
          if (err instanceof MobileApiError) {
            return { success: false, error: err.message };
          }
          return { success: false, error: "Sign up failed. Please try again." };
        }
      }

      // ---- Device-local mode ----
      const profiles = await readProfiles();
      if (profiles.some((p) => p.email === normalized)) {
        return {
          success: false,
          error: "An on-device profile with this email already exists. Please sign in.",
        };
      }
      const salt = uuid();
      const hash = await hashPassword(password, salt);
      const profile: LocalProfile = {
        id: uuid(),
        email: normalized,
        salt,
        hash,
        created_at: new Date().toISOString(),
      };
      await writeProfiles([...profiles, profile]);
      await persistSession({
        id: profile.id,
        email: profile.email,
        mode: "local",
      });
      return { success: true };
    },
    [cloudAvailable, persistSession, refreshDbProfile]
  );

  /**
   * Cloud signup step 2: the emailed 6-digit code confirms the account
   * (web OTP) and mints the mobile session. After this the user is signed
   * in — mirrors the web's (auth)/signup + verify flow.
   */
  const confirmSignup = useCallback(
    async (email: string, code: string): Promise<AuthResult> => {
      if (!cloudAvailable) {
        return { success: false, error: "Cloud mode is not configured." };
      }
      try {
        const session = await signupVerify(email, code);
        if (session) {
          await saveMobileSession(session);
          const nextUser: AppUser = {
            id: session.user.id,
            email: session.user.email ?? email.toLowerCase().trim(),
            name: session.user.name ?? undefined,
            avatarUrl: session.user.image ?? undefined,
            mode: "cloud",
          };
          await persistSession(nextUser);
          void refreshDbProfile();
        }
        return { success: true };
      } catch (err) {
        if (err instanceof MobileApiError) {
          return { success: false, error: err.message };
        }
        return { success: false, error: "Verification failed. Please try again." };
      }
    },
    [cloudAvailable, persistSession, refreshDbProfile]
  );

  // ---------- Google sign-in ----------

  /** Turn a captured handoff token into a live session (single-use). */
  const completeGoogleHandoff = useCallback(
    async (token: string): Promise<AuthResult> => {
      try {
        const session = await googleExchange(token);
        await saveMobileSession(session);
        const nextUser: AppUser = {
          id: session.user.id,
          email: session.user.email ?? "",
          name: session.user.name ?? undefined,
          avatarUrl: session.user.image ?? undefined,
          mode: "cloud",
        };
        await persistSession(nextUser);
        void refreshDbProfile();
        void maybeOfferBiometric(nextUser);
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error:
            e instanceof MobileApiError
              ? e.message
              : "Google sign-in failed. Please try again.",
        };
      }
    },
    [persistSession, refreshDbProfile, maybeOfferBiometric]
  );
  const googleHandoffRef = useRef(completeGoogleHandoff);
  useEffect(() => {
    googleHandoffRef.current = completeGoogleHandoff;
  }, [completeGoogleHandoff]);

  // Path B capture: expo-router delivering /auth/callback?token=... while
  // the app is running. The screen itself resolves in-flight sign-ins (it
  // has access to the same resolver pool via resolveGoogleHandoff); this
  // listener covers the cold-start case where the browser launched the
  // app fresh with the token.
  useEffect(() => {
    const exchangeFromUrl = (url: string | null) => {
      if (!url) return;
      const match = url.match(/[?&]token=([0-9a-f]{32})/i);
      if (!match) return;
      // Hand off to the waiting sign-in if there is one; the callback
      // screen resolves that path with the resolver. Cold start (no
      // waiter): run the exchange directly here.
      if (googleHandoffResolvers.length > 0) return;
      void googleHandoffRef.current(match[1]);
    };
    const sub = Linking.addEventListener("url", (event) =>
      exchangeFromUrl(event.url)
    );
    // Cold start: the launch URL may carry the token.
    Linking.getInitialURL().then(exchangeFromUrl).catch(() => {});
    return () => sub.remove();
  }, []);

  const signInWithGoogle = useCallback(
    async (mode: DataMode): Promise<AuthResult> => {
      if (!cloudAvailable) {
        return {
          success: false,
          error: "Google sign-in requires cloud mode. Configure Supabase or use email + password.",
        };
      }
      if (mode !== "cloud") {
        return {
          success: false,
          error: "Google sign-in is only available in cloud mode. Switch the toggle above.",
        };
      }

      try {
        // Kickoff: ask the web where to start Google auth (nonce minted
        // locally). The browser completes NextAuth's Google flow and the
        // web's relay page bounces back to our scheme URL with the token.
        const { url } = await googleStart();
        const redirectTo = Linking.createURL("/auth/callback");

        // Path A: the Custom Tab's openAuthSessionAsync result.
        // Path B: expo-router / LaunchEvents delivering /auth/callback?token=…
        // Whichever the OS picked resolves first; on Android the tab may
        // close as "cancel" right as the scheme launches — give Path B a
        // grace period before declaring a real cancellation.
        const tokenFromSession = WebBrowser.openAuthSessionAsync(
          url,
          redirectTo
        ).then(async (result) => {
          const redirectBase = redirectTo.split("?")[0];
          const candidate =
            result.type === "success" && "url" in result && result.url?.startsWith(redirectBase)
              ? result.url
              : undefined;
          const t = candidate?.match(/[?&]token=([0-9a-f]{32})/i)?.[1] ?? null;
          if (!t) await new Promise((r) => setTimeout(r, 2500));
          return t;
        });
        const tokenFromResolver = new Promise<string | null>((resolve) => {
          googleHandoffResolvers.push(resolve);
        });
        const token = await Promise.race([tokenFromSession, tokenFromResolver]);
        // Best-effort cleanup of the other path.
        WebBrowser.dismissBrowser();
        if (!token) {
          return {
            success: false,
            error: "Google sign-in was cancelled or failed. Please try again.",
          };
        }
        return await googleHandoffRef.current(token);
      } catch (e) {
        return {
          success: false,
          error:
            e instanceof Error
              ? e.message
              : "Google sign-in was cancelled or failed. Please try again.",
        };
      }
    },
    [cloudAvailable]
  );

  // ---------- Sign out ----------

  const signOut = useCallback(async () => {
    // With biometric armed, "log out" means LOCK: keep a reusable session in
    // SecureStore so the fingerprint can restore it later. Crucially the
    // Supabase session is cleared locally WITHOUT server-side revocation
    // (signOut() would kill the refresh token the fingerprint needs).
    if (biometricEnabledRef.current && user) {
      try {
        // Only the account that armed the lock may leave its session in the
        // biometric entry — never capture another principal's tokens, and
        // never capture for an account that declined the offer.
        const armed = await readBiometricEntry();
        const isArmingAccount =
          !!armed && armed.email === user.email && armed.mode === user.mode;
        if (isArmingAccount && !(await hasDeclinedBiometric(user.id))) {
          if (user.mode === "cloud" && cloudAvailable) {
            // Save the current mobile session for biometric unlock.
            const session = await loadMobileSession();
            if (session) {
              await saveBiometricEntry({
                mode: "cloud",
                email: user.email,
                name: user.name,
                savedAt: new Date().toISOString(),
                mobileSession: session,
              });
            }
          } else {
            await saveBiometricEntry({
              mode: "local",
              email: user.email,
              name: user.name,
              savedAt: new Date().toISOString(),
              localProfileId: user.id,
            });
          }
          await clearMobileSession();
          await AsyncStorage.removeItem(SESSION_KEY);
          await AsyncStorage.removeItem(SESSION_STARTED_KEY);
          setSessionStartedAt(null);
          setPendingMerge(null);
          setHasUnmergedLocalData(false);
          setLockInfo({ email: user.email, name: user.name });
          setUser(null);
          setStatus("locked");
          return;
        }
        // A different account signed out (or this one declined biometrics):
        // disarm the lock and fall through to the full logout below.
        await clearBiometricEntry();
        biometricEnabledRef.current = false;
        setBiometricEnabled(false);
      } catch {
        // Lock bookkeeping failed — fall through to the full logout so we
        // never leave the session in a half-cleared state.
      }
    }
    try {
      if (cloudAvailable) {
        // The NextAuth JWT is stateless — nothing to revoke server-side
        // beyond deleting it locally below.
      }
    } catch {
      // ignore
    }
    await clearBiometricEntry();
    setBiometricEnabled(false);
    await clearMobileSession();
    await persistSession(null);
  }, [cloudAvailable, persistSession, user]);

  // ---------- Delete account ----------

  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    if (!user) return { success: false, error: "Not authenticated" };
    const activeStore = createStore(user.mode, user.id);
    const res = await activeStore.deleteAllUserData();
    if (!res.success) return { success: false, error: res.error };

    if (user.mode === "local") {
      const profiles = await readProfiles();
      await writeProfiles(profiles.filter((p) => p.id !== user.id));
    }

    // The account is gone — the biometric key must not survive it.
    await clearBiometricEntry();
    setBiometricEnabled(false);

    // Terminal action: delete the identity row server-side (web's
    // /api/mobile/account — removes next_auth.users + password/OTP rows)
    // and purge the local session so a cold start cannot silently
    // re-authenticate as the "deleted" account.
    if (user.mode === "cloud" && cloudAvailable) {
      try {
        const mobileSession = await loadMobileSession();
        if (mobileSession) {
          await apiDeleteAccount(mobileSession.accessToken);
        }
      } catch {
        // The local session removal below still prevents silent re-auth;
        // the user can retry from Settings while signed in.
      }
      await clearMobileSession();
    }

    // Sweep derived copies the stores' purge lists don't cover: the merge
    // recovery snapshot, merge-done markers, and the profile photo.
    try {
      await purgeMergeArtifacts();
      await removeProfilePhoto(user.id);
    } catch {
      // Best-effort — the primary data is already purged.
    }

    await persistSession(null);
    return { success: true };
  }, [cloudAvailable, persistSession, user]);

  // ---------- Password reset ----------

  const requestPasswordReset = useCallback(
    async (email: string, mode: DataMode): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        try {
          await apiRequestReset(normalized);
          return { success: true };
        } catch (err) {
          if (err instanceof MobileApiError) {
            return { success: false, error: err.message };
          }
          return { success: false, error: "Password reset request failed. Please try again." };
        }
      }

      // Device-local profiles have no email channel — the honest answer is
      // that the password cannot be recovered, so we say so.
      const profiles = await readProfiles();
      const exists = profiles.some((p) => p.email === normalized);
      return {
        success: false,
        error: exists
          ? "On-device profiles can't be recovered by email. Create a new profile instead."
          : "No on-device profile found for this email.",
      };
    },
    [cloudAvailable]
  );

  /** Step 2 of the web's 3-step reset flow: verify the 6-digit code. */
  const verifyPasswordResetOtp = useCallback(
    async (email: string, code: string, mode: DataMode): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        try {
          const result = await verifyResetOtp(normalized, code);
          if (result.resetToken && result.email) {
            resetTokenRef.current = { token: result.resetToken, email: result.email };
            return { success: true };
          }
          return { success: false, error: "Invalid or expired OTP code. Please try again." };
        } catch (err) {
          if (err instanceof MobileApiError) {
            return { success: false, error: err.message };
          }
          return { success: false, error: "Invalid or expired OTP code. Please try again." };
        }
      }

      return {
        success: false,
        error: "On-device profiles can't be recovered by email. Create a new profile instead.",
      };
    },
    [cloudAvailable]
  );

  /** Step 3 of the web's 3-step reset flow: set the new password. */
  const completePasswordReset = useCallback(
    async (email: string, newPassword: string, mode: DataMode): Promise<AuthResult> => {
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        if (newPassword.length < 8) {
          return { success: false, error: "Password must be at least 8 characters." };
        }
        const { token, email: storedEmail } = resetTokenRef.current;
        if (!token) {
          return { success: false, error: "No active reset session. Please start over." };
        }
        // Use the email from the reset token for security
        const normalized = (storedEmail ?? email).toLowerCase().trim();
        try {
          await completeReset(normalized, token, newPassword, newPassword);
          resetTokenRef.current = { token: null, email: null };
          // After password reset, all existing sessions are invalidated.
          await clearMobileSession();
          return { success: true };
        } catch (err) {
          if (err instanceof MobileApiError) {
            return { success: false, error: err.message };
          }
          return { success: false, error: "Password reset failed. Please try again." };
        }
      }

      return {
        success: false,
        error: "On-device profiles can't be recovered by email. Create a new profile instead.",
      };
    },
    [cloudAvailable]
  );

  const store = useMemo(
    () => (user ? createStore(user.mode, user.id) : null),
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      store,
      dataMode: user?.mode ?? "local",
      cloudAvailable,
      sessionStartedAt,
      signIn,
      signInWithGoogle,
      signUp,
      confirmSignup,
      signOut,
      deleteAccount,
      pendingMerge,
      confirmMerge,
      dismissMerge,
      hasUnmergedLocalData,
      offerMerge,
      refreshLocalDataCheck,
      biometricSupported,
      biometricEnabled,
      lockInfo,
      unlockWithBiometric,
      enableBiometric,
      disableBiometric,
      offerBiometric,
      dismissBiometricOffer,
      refreshProfile: refreshDbProfile,
      requestPasswordReset,
      verifyPasswordResetOtp,
      completePasswordReset,
    }),
    [
      status,
      user,
      store,
      cloudAvailable,
      sessionStartedAt,
      pendingMerge,
      confirmMerge,
      dismissMerge,
      hasUnmergedLocalData,
      offerMerge,
      refreshLocalDataCheck,
      biometricSupported,
      biometricEnabled,
      lockInfo,
      unlockWithBiometric,
      enableBiometric,
      disableBiometric,
      offerBiometric,
      dismissBiometricOffer,
      signIn,
      signInWithGoogle,
      signUp,
      confirmSignup,
      signOut,
      deleteAccount,
      refreshDbProfile,
      requestPasswordReset,
      verifyPasswordResetOtp,
      completePasswordReset,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}