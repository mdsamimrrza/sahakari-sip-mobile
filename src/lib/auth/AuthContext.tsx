// ============================================================
// SahakariSIP — Auth Provider
// ============================================================
// The web app authenticates with NextAuth v5 (credentials + Google)
// backed by bcrypt hashes stored server-side. A mobile bundle can't run
// that server code, so the mobile app offers the two equivalent routes:
//
//   1. CLOUD  — Supabase Auth email + password. Same Supabase project and
//               the same fund_config/entries/nav_history tables as the web
//               app, with Row Level Security isolating each account.
//   2. DEVICE — an on-device profile (salted SHA-256 hash, never leaves the
//               phone). Everything works offline; the portfolio lives in
//               local storage only.
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
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { getSupabase, isSupabaseConfigured, SUPABASE_AUTH_STORAGE_KEY } from "../supabase";
import { createStore } from "../data";
import { CloudStore } from "../data/cloud";
import { cacheInvalidate } from "../data/cache";
import { removeProfilePhoto } from "../profilePhoto";
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
  completePasswordReset: (newPassword: string, mode: DataMode) => Promise<AuthResult>;
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
  const mounted = useRef(true);

  const cloudAvailable = isSupabaseConfigured;

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
          const { data } = await getSupabase().auth.getSession();
          const s = data.session;
          if (!s) return { success: false, error: "No active session." };
          await saveBiometricEntry({
            mode: "cloud",
            email: user.email,
            name: user.name,
            savedAt: new Date().toISOString(),
            session: {
              access_token: s.access_token,
              refresh_token: s.refresh_token,
            },
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
    [cloudAvailable, user]
  );

  const disableBiometric = useCallback(async () => {
    await clearBiometricEntry();
    biometricEnabledRef.current = false;
    setBiometricEnabled(false);
  }, []);

  // ---------- Web profile (NextAuth `users.image`) ----------
  //
  // Google logins on the WEB app store the photo in next_auth.users.image,
  // which Supabase Auth metadata doesn't have. This pulls it via the
  // app_get_profile() RPC (see supabase-profile-image.sql) and patches the
  // session WITHOUT resetting the session clock. Missing RPC / offline /
  // signed-out → silently keeps whatever avatar we already have.
  const refreshDbProfile = useCallback(async () => {
    if (!cloudAvailable) return;
    try {
      const { data, error } = await getSupabase().rpc("app_get_profile");
      if (error) {
        if (__DEV__) console.warn("[profile] app_get_profile RPC failed:", error.message);
        return;
      }
      if (!data) {
        if (__DEV__) console.warn("[profile] app_get_profile returned no rows — photo stays as-is.");
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { name?: unknown; image?: unknown }
        | undefined;
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
      } else if (__DEV__) {
        console.warn("[profile] app_get_profile returned nothing usable — photo stays as-is.");
      }
    } catch {
      // RPC missing, RLS denial, or offline — avatar stays as-is.
      if (__DEV__) console.warn("[profile] app_get_profile threw — photo stays as-is.");
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
      try {
        if (entry.mode === "cloud" && entry.session) {
          // Mint a fresh session from the stored refresh token. If it was
          // revoked (password change, token expiry) this throws and we fall
          // back to the login screen below — the honest path.
          const { data, error } = await getSupabase().auth.refreshSession({
            refresh_token: entry.session.refresh_token,
          });
          if (error || !data.session) {
            throw new Error(error?.message ?? "Session expired");
          }
          const supaUser = data.session.user;
          // Defense in depth: the stored entry must never release a session
          // for a different account than the one that armed the lock.
          if (
            supaUser.email &&
            entry.email &&
            supaUser.email.toLowerCase() !== entry.email.toLowerCase()
          ) {
            throw new Error("Locked session belongs to a different account.");
          }
          const next: AppUser = {
            id: supaUser.id,
            email: supaUser.email ?? entry.email,
            name:
              (supaUser.user_metadata?.name as string) || entry.name || undefined,
            avatarUrl: avatarFromMetadata(supaUser.user_metadata),
            mode: "cloud",
          };
          await persistSession(next);
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
          const { data } = await getSupabase().auth.getSession();
          const supaUser = data.session?.user;
          if (supaUser?.email) {
            const next: AppUser = {
              id: supaUser.id,
              email: supaUser.email,
              name: (supaUser.user_metadata?.name as string) || undefined,
              avatarUrl: avatarFromMetadata(supaUser.user_metadata),
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
              setStatus("authenticated");
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
              setStatus("authenticated");
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
        const { data, error } = await getSupabase().auth.signInWithPassword({
          email: normalized,
          password,
        });
        if (error) {
          const msg = /confirm/i.test(error.message)
            ? "Please confirm your email address before signing in."
            : "Invalid email or password. Please try again.";
          return { success: false, error: msg };
        }
        if (!data.user?.email) {
          return { success: false, error: "Sign in failed. Please try again." };
        }
        const nextUser: AppUser = {
          id: data.user.id,
          email: data.user.email,
          name: (data.user.user_metadata?.name as string) || undefined,
          avatarUrl: avatarFromMetadata(data.user.user_metadata),
          mode: "cloud",
        };
        await persistSession(nextUser);
        void refreshDbProfile();
        void maybeOfferBiometric(nextUser);
        return { success: true };
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
        const { data, error } = await getSupabase().auth.signUp({
          email: normalized,
          password,
        });
        if (error) return { success: false, error: error.message };

        // When email confirmation is enabled Supabase returns a user but no
        // session — surface that instead of pretending we're signed in.
        if (!data.session) {
          return { success: true, needsEmailConfirmation: true };
        }
        if (data.user?.email) {
          const nextUser: AppUser = {
            id: data.user.id,
            email: data.user.email,
            avatarUrl: avatarFromMetadata(data.user.user_metadata),
            mode: "cloud",
          };
          await persistSession(nextUser);
          void refreshDbProfile();
          // No biometric offer on registration — only after a sign-in.
        }
        return { success: true };
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

    // ---------- Google sign-in ----------

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
        // PKCE browser flow: Supabase hands us the consent URL, the OS
        // browser session opens it, and the redirect lands back in the app.
        const redirectTo = Linking.createURL("/auth/callback");
        const { data, error } = await getSupabase().auth.signInWithOAuth({
          provider: "google",
          options: { skipBrowserRedirect: true, redirectTo },
        });
        if (error) return { success: false, error: error.message };
        if (!data?.url) {
          return { success: false, error: "Could not start Google sign-in. Please try again." };
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== "success" || !("url" in result) || !result.url) {
          return {
            success: false,
            error: "Google sign-in was cancelled or failed. Please try again.",
          };
        }

        // Exchange the PKCE code from the redirect for a session — but only
        // from OUR OWN callback redirect. A foreign URL that happens to
        // carry a code parameter must never feed the exchange, and a
        // redirect without a code (provider error/decline) must fail rather
        // than silently succeed with whatever ambient session exists.
        const redirectBase = redirectTo.split("?")[0];
        const fromOwnRedirect = result.url.startsWith(redirectBase);
        const code = fromOwnRedirect
          ? result.url.match(/[?&]code=([^&]+)/)?.[1]
          : undefined;
        if (!code) {
          return {
            success: false,
            error: "Google sign-in failed. Please try again.",
          };
        }
        {
          const { error: exchangeError } =
            await getSupabase().auth.exchangeCodeForSession(code);
          if (exchangeError) {
            return { success: false, error: exchangeError.message };
          }
        }

        const { data: sess } = await getSupabase().auth.getSession();
        const supaUser = sess.session?.user;
        if (!supaUser?.email) {
          return {
            success: false,
            error: "Google sign-in was cancelled or failed. Please try again.",
          };
        }

        const nextUser: AppUser = {
          id: supaUser.id,
          email: supaUser.email,
          name: (supaUser.user_metadata?.name as string) || undefined,
          avatarUrl: avatarFromMetadata(supaUser.user_metadata),
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
            e instanceof Error
              ? e.message
              : "Google sign-in was cancelled or failed. Please try again.",
        };
      }
    },
    [cloudAvailable, persistSession, refreshDbProfile, maybeOfferBiometric]
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
            const { data } = await getSupabase().auth.getSession();
            const s = data.session;
            if (s) {
              await saveBiometricEntry({
                mode: "cloud",
                email: user.email,
                name: user.name,
                savedAt: new Date().toISOString(),
                session: {
                  access_token: s.access_token,
                  refresh_token: s.refresh_token,
                },
              });
            }
            await AsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
          } else {
            await saveBiometricEntry({
              mode: "local",
              email: user.email,
              name: user.name,
              savedAt: new Date().toISOString(),
              localProfileId: user.id,
            });
          }
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
        await getSupabase().auth.signOut();
      }
    } catch {
      // ignore — clearing the local session below is what matters
    }
    await clearBiometricEntry();
    setBiometricEnabled(false);
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

    // Terminal action: revoke the Supabase session server-side and purge its
    // persisted credential, so a cold start cannot silently re-authenticate
    // as the "deleted" account (matching what full signOut does).
    if (user.mode === "cloud" && cloudAvailable) {
      try {
        await getSupabase().auth.signOut();
      } catch {
        // The local key removal below still prevents silent re-auth.
      }
      await AsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
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
        const { error } = await getSupabase().auth.resetPasswordForEmail(
          normalized
        );
        if (error) return { success: false, error: error.message };
        return { success: true };
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
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        const { data, error } = await getSupabase().auth.verifyOtp({
          email: email.toLowerCase().trim(),
          token: code,
          type: "recovery",
        });
        if (error) {
          const msg = /expire/i.test(error.message)
            ? "OTP code expired or invalid. Please request a new one."
            : "Incorrect OTP code. Please try again.";
          return { success: false, error: msg };
        }
        if (!data.session) {
          return {
            success: false,
            error: "Invalid or expired reset session. Please start over.",
          };
        }
        return { success: true };
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
    async (newPassword: string, mode: DataMode): Promise<AuthResult> => {
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        if (newPassword.length < 8) {
          return { success: false, error: "Password must be at least 8 characters." };
        }
        const { data, error } = await getSupabase().auth.updateUser({
          password: newPassword,
        });
        if (error) {
          return {
            success: false,
            error: /session/i.test(error.message)
              ? "Invalid or expired reset session. Please start over."
              : error.message,
          };
        }
        if (data.user?.email) {
          const nextUser: AppUser = {
            id: data.user.id,
            email: data.user.email,
            name: (data.user.user_metadata?.name as string) || undefined,
            avatarUrl: avatarFromMetadata(data.user.user_metadata),
            mode: "cloud",
          };
          await persistSession(nextUser);
          void refreshDbProfile();
          void maybeOfferBiometric(nextUser);
        }
        return { success: true };
      }

      return {
        success: false,
        error: "On-device profiles can't be recovered by email. Create a new profile instead.",
      };
    },
    [cloudAvailable, persistSession, refreshDbProfile, maybeOfferBiometric]
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
